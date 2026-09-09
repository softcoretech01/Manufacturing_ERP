"""Gathers every MRP input from the portal that owns it, runs the engine, and
persists the result as an auditable run.

The gathering is the part worth reading. Planning owns demand, MPS, policies and
production orders; it owns nothing else. Items come from the Masters item master,
BOMs from Product Engineering, on-hand from Inventory's stock balances, and open
purchase orders from Procurement. Nothing is cached in a planning table — a run
reads live and stores only its own output.

Two cross-database notes, both learned the hard way:

* `Item` exists in both `admin_erp` (stale test rows) and `ERP_Master` (the real
  master), so every reference is schema-qualified.
* `ERP_Master.Item.Code` is `utf8mb4_general_ci` while `admin_erp.mst_item.code`
  is `utf8mb4_uca1400_ai_ci`, so joining them raises MySQL error 1267. The two
  are queried separately and matched on the code in Python.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import StockStatus
from app.core.errors import AppError, NotFoundError
from app.core.time import utcnow
from app.modules.planning.domain import mrp_engine as eng
from app.modules.planning.infrastructure.models import (
    PpDemand,
    PpMps,
    PpPlanningPolicy,
    PpProductionOrder,
)
from app.modules.planning.infrastructure.mrp_models import (
    PpMrpException,
    PpMrpPlanLine,
    PpMrpPlannedOrder,
    PpMrpRun,
)


def _d(v: Any) -> Decimal:
    if v is None or v == "":
        return Decimal("0")
    return Decimal(str(v))


class MrpService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    # ─────────────────────────── Input gathering ───────────────────────────
    async def _boms(self) -> list[eng.Bom]:
        """Live bills of material from Product Engineering, with their lines."""
        heads = (
            await self.session.execute(
                text(
                    "SELECT Id, DocNo, ProductCode, BaseQty, Status, Revision, "
                    "       IFNULL(IsDefault, 0) "
                    "  FROM ERP_Product.EngineeringBom "
                    " WHERE DeletedAt IS NULL"
                )
            )
        ).fetchall()
        if not heads:
            return []

        lines = (
            await self.session.execute(
                text(
                    "SELECT BomId, ItemCode, QtyPer, IFNULL(ScrapPct, 0) "
                    "  FROM ERP_Product.EngineeringBomLine"
                )
            )
        ).fetchall()
        by_bom: dict[int, list[eng.BomLine]] = {}
        for bom_id, item_code, qty_per, scrap in lines:
            by_bom.setdefault(bom_id, []).append(
                eng.BomLine(item_code=item_code, qty_per=_d(qty_per), scrap_pct=_d(scrap))
            )

        return [
            eng.Bom(
                doc_no=h[1], product_code=h[2], base_qty=_d(h[3]),
                status=(h[4] or "").upper(), revision=int(h[5] or 0),
                is_default=bool(h[6]), lines=by_bom.get(h[0], []),
            )
            for h in heads
        ]

    async def _items(self, policies: dict[str, eng.Policy]) -> dict[str, eng.ItemInfo]:
        """Item planning facts: the Masters item master, overlaid with live
        on-hand from Inventory, overlaid with the item's planning policy."""
        master = (
            await self.session.execute(
                text(
                    "SELECT Code, Name, BaseUom, LeadTimeDays, MinStock, MaxStock, "
                    "       StandardCost, LastPurchaseRate, IsManufactured "
                    "  FROM ERP_Master.Item "
                    " WHERE IFNULL(IsDeleted, 0) = 0"
                )
            )
        ).fetchall()

        items: dict[str, eng.ItemInfo] = {}
        for code, name, uom, lead, min_s, max_s, std, last, made in master:
            rate = _d(std) or _d(last)
            items[code] = eng.ItemInfo(
                code=code, name=name or code, uom=uom or "NOS",
                safety_stock=_d(min_s), lead_time_days=int(lead or 7),
                rate=rate, max_level=_d(max_s), is_manufactured=bool(made),
            )

        # On-hand: aggregate AVAILABLE balances per item, matched on code.
        # Queried separately from ERP_Master.Item — see the collation note above.
        # Free stock, not gross on hand: material already reserved against a
        # production order is not available to plan something else against, and
        # counting it twice is how a plan proposes to use the same coil twice.
        on_hand = (
            await self.session.execute(
                text(
                    "SELECT i.code, "
                    "       GREATEST(COALESCE(SUM(b.quantity - b.reserved_qty), 0), 0) "
                    "  FROM mst_item i "
                    "  LEFT JOIN inv_stock_balance b "
                    "    ON b.item_id = i.id AND b.company_id = :cid "
                    "   AND b.stock_status = :st "
                    " WHERE i.company_id = :cid AND i.deleted_at IS NULL "
                    " GROUP BY i.code"
                ),
                {"cid": self.ctx.company_id, "st": StockStatus.AVAILABLE.value},
            )
        ).fetchall()
        for code, qty in on_hand:
            info = items.get(code)
            if info is None:
                # Stocked but not in the Masters item master — still plannable.
                info = eng.ItemInfo(code=code, name=code)
                items[code] = info
            info.available = _d(qty)

        # The policy is the final word on safety stock and lead time.
        for code, pol in policies.items():
            info = items.setdefault(code, eng.ItemInfo(code=code, name=code))
            info.policy = pol
            if pol.safety_stock_override is not None:
                info.safety_stock = pol.safety_stock_override
            if pol.lead_time_override is not None:
                info.lead_time_days = pol.lead_time_override

        return items

    async def _policies(self) -> dict[str, eng.Policy]:
        rows = (
            await self.session.execute(
                select(PpPlanningPolicy).where(
                    PpPlanningPolicy.company_id == self.ctx.company_id,
                    PpPlanningPolicy.deleted_at.is_(None),
                    PpPlanningPolicy.is_active.is_(True),
                )
            )
        ).scalars().all()
        return {
            p.item_code: eng.Policy(
                item_code=p.item_code,
                lot_size_rule=p.lot_size_rule,
                min_order_qty=_d(p.min_order_qty),
                order_multiple=_d(p.order_multiple),
                safety_stock_override=(
                    _d(p.safety_stock_override) if p.safety_stock_override is not None else None
                ),
                lead_time_override=p.lead_time_override,
                frozen_days=int(p.frozen_days or 0),
            )
            for p in rows
        }

    async def _scheduled_receipts(self) -> list[eng.ScheduledReceipt]:
        """Supply already on the books: open purchase order lines from
        Procurement, and production orders not yet finished."""
        out: list[eng.ScheduledReceipt] = []

        po_rows = (
            await self.session.execute(
                text(
                    "SELECT l.ItemCode, l.Qty, IFNULL(l.ReceivedQty, 0), l.DueDate "
                    "  FROM ERP_Procurement.PurchaseOrderLine l "
                    "  JOIN ERP_Procurement.PurchaseOrder p ON p.Id = l.PurchaseOrderId "
                    " WHERE IFNULL(p.IsDeleted, 0) = 0 "
                    "   AND p.Status IN ('APPROVED', 'IN_PROGRESS', 'PARTIALLY_EXECUTED')"
                )
            )
        ).fetchall()
        for item_code, qty, received, due in po_rows:
            open_qty = max(Decimal("0"), _d(qty) - _d(received))
            if open_qty > 0:
                out.append(eng.ScheduledReceipt(item_code=item_code, qty=open_qty, due_date=due))

        wos = (
            await self.session.execute(
                select(PpProductionOrder).where(
                    PpProductionOrder.company_id == self.ctx.company_id,
                    PpProductionOrder.deleted_at.is_(None),
                    PpProductionOrder.status.notin_(list(eng.CLOSED_WO_STATUSES)),
                )
            )
        ).scalars().all()
        for wo in wos:
            open_qty = max(Decimal("0"), _d(wo.qty) - _d(wo.produced_qty))
            if open_qty > 0:
                out.append(
                    eng.ScheduledReceipt(
                        item_code=wo.product_code, qty=open_qty, due_date=wo.planned_finish
                    )
                )
        return out

    async def _demand(self) -> list[eng.DemandLine]:
        rows = (
            await self.session.execute(
                select(PpDemand).where(
                    PpDemand.company_id == self.ctx.company_id,
                    PpDemand.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        return [
            eng.DemandLine(
                doc_no=d.doc_no, product_code=d.product_code, product_name=d.product_name,
                uom=d.uom, qty=_d(d.qty), qty_planned=_d(d.qty_planned),
                required_on=d.required_on, status=d.status,
                source=d.source or "SALES_ORDER", is_firm=bool(d.is_firm),
            )
            for d in rows
        ]

    async def _mps(self) -> list[eng.MpsLine]:
        rows = (
            await self.session.execute(
                select(PpMps).where(
                    PpMps.company_id == self.ctx.company_id,
                    PpMps.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        return [
            eng.MpsLine(
                doc_no=m.doc_no, product_code=m.product_code, bucket=int(m.bucket),
                planned_qty=_d(m.planned_qty), status=m.status,
                bucket_start=m.bucket_start, demand_qty=_d(m.demand_qty),
                is_firm=bool(m.is_firm), demand_doc_no=m.demand_doc_no,
            )
            for m in rows
        ]

    # ─────────────────────────── Run + persist ───────────────────────────
    async def _require_demand(self, doc_no: str) -> PpDemand:
        """The demand must exist and still be open.

        An empty MRP result is indistinguishable from "everything is covered",
        so a mistyped or already-closed document has to fail loudly rather than
        produce a clean run with nothing in it.
        """
        row = (
            await self.session.execute(
                select(PpDemand).where(
                    PpDemand.company_id == self.ctx.company_id,
                    PpDemand.doc_no == doc_no,
                    PpDemand.deleted_at.is_(None),
                )
            )
        ).scalars().first()
        if row is None:
            raise AppError(f"Demand {doc_no} does not exist.")
        if row.status in eng.CLOSED_DEMAND_STATUSES:
            raise AppError(
                f"Demand {doc_no} is {row.status.lower()}, so there is nothing left "
                "to plan against it."
            )
        return row

    async def run(
        self, *, horizon: int = eng.DEFAULT_HORIZON, use_mps: bool = True,
        consume_forecast: bool = True, today: date | None = None,
        demand_doc_no: str | None = None,
    ) -> PpMrpRun:
        """Execute a run and store it. One transaction: either the whole run is
        readable or none of it is.

        `demand_doc_no` plans one demand document instead of the whole order
        book — make-to-order. Stock and open purchase orders still net off, so
        the proposals are what must actually be bought and made *in addition to*
        what the plant already has.
        """
        today = today or utcnow().date()
        if demand_doc_no:
            await self._require_demand(demand_doc_no)

        policies = await self._policies()
        result = eng.run_mrp(
            demand=await self._demand(),
            mps=await self._mps(),
            scheduled_receipts=await self._scheduled_receipts(),
            boms=await self._boms(),
            items=await self._items(policies),
            today=today,
            horizon=horizon,
            demand_doc_no=demand_doc_no,
            use_mps=use_mps,
            consume_forecast=consume_forecast,
        )

        now = utcnow()
        stats = result.stats
        seq = (
            await self.session.execute(
                text(
                    "SELECT COUNT(*) FROM pp_mrp_run "
                    " WHERE company_id = :cid AND DATE(run_at) = :d"
                ),
                {"cid": self.ctx.company_id, "d": today},
            )
        ).scalar_one()

        run = PpMrpRun(
            company_id=self.ctx.company_id,
            run_no=f"MRP/{today:%Y%m%d}/{int(seq) + 1:03d}",
            run_at=now,
            run_by_name=self.ctx.user_name,
            horizon=horizon,
            bucket_days=eng.BUCKET_DAYS,
            use_mps=use_mps,
            demand_doc_no=demand_doc_no,
            first_bucket_start=result.first_bucket_start,
            status="COMPLETED",
            items_planned=stats["items_planned"],
            purchase_orders=stats["purchase_orders"],
            production_orders=stats["production_orders"],
            purchase_value=float(stats["purchase_value"]),
            late_orders=stats["late_orders"],
            exception_count=stats["exception_count"],
            created_at=now, created_by=self.ctx.user_id,
            updated_at=now, updated_by=self.ctx.user_id,
            version=1,
        )
        self.session.add(run)
        await self.session.flush()

        def audit(obj: Any) -> Any:
            obj.company_id = self.ctx.company_id
            obj.created_at = now
            obj.created_by = self.ctx.user_id
            obj.updated_at = now
            obj.updated_by = self.ctx.user_id
            obj.version = 1
            return obj

        for plan in result.plans:
            for cell in plan.cells:
                self.session.add(
                    audit(
                        PpMrpPlanLine(
                            run_id=run.id,
                            item_code=plan.item_code, item_name=plan.item_name, uom=plan.uom,
                            llc=plan.llc, is_manufactured=plan.is_manufactured,
                            opening_stock=float(plan.opening_stock),
                            safety_stock=float(plan.safety_stock),
                            lead_time_days=plan.lead_time_days,
                            unit_rate=float(plan.rate),
                            bucket=cell.bucket, bucket_start=cell.start,
                            gross_requirement=float(cell.gross_requirement),
                            scheduled_receipts=float(cell.scheduled_receipts),
                            projected_on_hand=float(cell.projected_on_hand),
                            net_requirement=float(cell.net_requirement),
                            planned_receipt=float(cell.planned_receipt),
                            release_bucket=cell.release_bucket,
                            release_date=cell.release_date,
                        )
                    )
                )

        for o in result.planned_orders:
            self.session.add(
                audit(
                    PpMrpPlannedOrder(
                        run_id=run.id,
                        item_code=o.item_code, item_name=o.item_name, uom=o.uom, llc=o.llc,
                        order_type=o.order_type,
                        quantity=float(o.quantity),
                        net_requirement=float(o.net_requirement),
                        unit_rate=float(o.unit_rate), value=float(o.value),
                        bucket=o.bucket, due_date=o.due_date,
                        release_bucket=o.release_bucket, release_date=o.release_date,
                        is_late=o.is_late, days_late=o.days_late,
                        pegged_to=o.pegged_to, lead_time_days=o.lead_time_days,
                        demand_doc_no=o.demand_doc_no,
                    )
                )
            )

        for x in result.exceptions:
            self.session.add(
                audit(
                    PpMrpException(
                        run_id=run.id,
                        severity=x.severity, exception_type=x.exception_type,
                        item_code=x.item_code, item_name=x.item_name,
                        message=x.message, suggested_action=x.suggested_action,
                    )
                )
            )

        await self.session.flush()
        return run

    # ─────────────────────────── Reads ───────────────────────────
    async def latest_run(self) -> PpMrpRun | None:
        return (
            await self.session.execute(
                select(PpMrpRun)
                .where(
                    PpMrpRun.company_id == self.ctx.company_id,
                    PpMrpRun.deleted_at.is_(None),
                )
                .order_by(PpMrpRun.run_at.desc(), PpMrpRun.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    async def list_runs(self, limit: int = 25) -> list[PpMrpRun]:
        return list(
            (
                await self.session.execute(
                    select(PpMrpRun)
                    .where(
                        PpMrpRun.company_id == self.ctx.company_id,
                        PpMrpRun.deleted_at.is_(None),
                    )
                    .order_by(PpMrpRun.run_at.desc(), PpMrpRun.id.desc())
                    .limit(limit)
                )
            ).scalars().all()
        )

    async def _run_by_uid(self, uid: str) -> PpMrpRun:
        run = (
            await self.session.execute(
                select(PpMrpRun).where(
                    PpMrpRun.uid == uid,
                    PpMrpRun.company_id == self.ctx.company_id,
                    PpMrpRun.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if run is None:
            raise NotFoundError(f"MRP run '{uid}' not found")
        return run

    async def run_detail(self, uid: str) -> dict[str, Any]:
        """The whole run: header, the time-phased grid, orders and exceptions."""
        run = await self._run_by_uid(uid)

        cells = (
            await self.session.execute(
                select(PpMrpPlanLine)
                .where(PpMrpPlanLine.run_id == run.id)
                .order_by(PpMrpPlanLine.llc, PpMrpPlanLine.item_code, PpMrpPlanLine.bucket)
            )
        ).scalars().all()

        # Regroup the flat cells back into one row per item with its buckets.
        plans: list[dict[str, Any]] = []
        index: dict[str, dict[str, Any]] = {}
        for c in cells:
            plan = index.get(c.item_code)
            if plan is None:
                plan = {
                    "item_code": c.item_code, "item_name": c.item_name, "uom": c.uom,
                    "llc": c.llc, "is_manufactured": c.is_manufactured,
                    "opening_stock": float(c.opening_stock),
                    "safety_stock": float(c.safety_stock),
                    "lead_time_days": c.lead_time_days,
                    "unit_rate": float(c.unit_rate),
                    "buckets": [],
                    "total_gross": 0.0,
                    "total_planned": 0.0,
                    "first_late_bucket": None,
                }
                index[c.item_code] = plan
                plans.append(plan)
            plan["buckets"].append(
                {
                    "bucket": c.bucket, "start": c.bucket_start,
                    "gross_requirement": float(c.gross_requirement),
                    "scheduled_receipts": float(c.scheduled_receipts),
                    "projected_on_hand": float(c.projected_on_hand),
                    "net_requirement": float(c.net_requirement),
                    "planned_receipt": float(c.planned_receipt),
                    "release_bucket": c.release_bucket,
                    "release_date": c.release_date,
                }
            )
            plan["total_gross"] += float(c.gross_requirement)
            plan["total_planned"] += float(c.planned_receipt)
            if (
                c.release_bucket is not None
                and c.release_bucket < 0
                and plan["first_late_bucket"] is None
            ):
                plan["first_late_bucket"] = c.bucket

        orders = (
            await self.session.execute(
                select(PpMrpPlannedOrder)
                .where(PpMrpPlannedOrder.run_id == run.id)
                .order_by(PpMrpPlannedOrder.release_date, PpMrpPlannedOrder.item_code)
            )
        ).scalars().all()

        exceptions = (
            await self.session.execute(
                select(PpMrpException)
                .where(PpMrpException.run_id == run.id)
                .order_by(PpMrpException.severity, PpMrpException.item_code)
            )
        ).scalars().all()

        starts = [
            run.first_bucket_start.fromordinal(
                run.first_bucket_start.toordinal() + run.bucket_days * i
            )
            for i in range(run.horizon)
        ]

        return {
            "run": run,
            "starts": starts,
            "plans": plans,
            "planned_orders": orders,
            "exceptions": exceptions,
            # A shortage is a planned order that had to be released before
            # today. Derived rather than stored twice.
            "shortages": [
                {
                    "item_code": o.item_code, "item_name": o.item_name, "uom": o.uom,
                    "required_on": o.due_date,
                    "short_qty": float(o.net_requirement),
                    "value": float(o.net_requirement) * float(o.unit_rate),
                    "lead_time_days": o.lead_time_days,
                    "days_late": o.days_late,
                }
                for o in orders
                if o.is_late
            ],
        }
