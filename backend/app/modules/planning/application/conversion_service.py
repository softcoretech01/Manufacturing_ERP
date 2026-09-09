"""Turning a planned order into a real document.

This is the only place Planning writes to another portal, and the only place a
proposal becomes a commitment. A planned order is a suggestion that disappears on
the next run; a purchase requisition or a production order is a document somebody
else now owns.

Two rules the whole design hangs on:

**Snapshot, never reference.** The components and operations copied onto a
production order are frozen at conversion. A BOM revised next week must not
silently rewrite an order already on the shop floor — which is exactly what
reading the BOM live at issue time would do.

**Convert once.** Each planned order carries `converted_to_doc_no`. It is stamped
inside the same transaction that creates the document, so a double-click cannot
raise the same requisition twice, and the next MRP run can tell what it has
already caused.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.errors import BusinessRuleViolationError, NotFoundError, ValidationFailedError
from app.core.time import utcnow
from app.modules.planning.domain import mrp_engine as eng
from app.modules.planning.infrastructure.models import (
    PpProdOrderComponent,
    PpProdOrderOperation,
    PpProductionOrder,
)
from app.modules.planning.infrastructure.mrp_models import PpMrpPlannedOrder, PpMrpRun


def _d(v: Any) -> Decimal:
    return Decimal("0") if v in (None, "") else Decimal(str(v))


class ConversionService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    # ─────────────────────────── helpers ───────────────────────────
    def _audit(self, obj: Any, now: Any) -> Any:
        obj.company_id = self.ctx.company_id
        obj.created_at = now
        obj.created_by = self.ctx.user_id
        obj.updated_at = now
        obj.updated_by = self.ctx.user_id
        obj.version = 1
        return obj

    async def _planned_orders(self, uids: list[str]) -> list[PpMrpPlannedOrder]:
        if not uids:
            raise ValidationFailedError("Select at least one planned order to convert.")
        rows = list(
            (
                await self.session.execute(
                    select(PpMrpPlannedOrder).where(
                        PpMrpPlannedOrder.uid.in_(uids),
                        PpMrpPlannedOrder.company_id == self.ctx.company_id,
                        PpMrpPlannedOrder.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
        )
        missing = set(uids) - {r.uid for r in rows}
        if missing:
            raise NotFoundError(f"Planned order(s) not found: {', '.join(sorted(missing))}")

        already = [r for r in rows if r.converted_to_doc_no]
        if already:
            raise BusinessRuleViolationError(
                "Already converted: "
                + ", ".join(f"{r.item_code} → {r.converted_to_doc_no}" for r in already[:5])
                + ". A planned order becomes a document once.",
                rule_code="V5-MRP-BR-001",
            )
        return rows

    async def _next_doc_no(self, table: str, col: str, prefix: str, schema: str = "") -> str:
        qualified = f"{schema}.{table}" if schema else table
        n = (
            await self.session.execute(
                text(f"SELECT COUNT(*) FROM {qualified} WHERE {col} LIKE :pat"),
                {"pat": f"{prefix}%"},
            )
        ).scalar_one()
        return f"{prefix}{int(n) + 1:05d}"

    # ─────────────────── planned purchase → requisition ───────────────────
    async def to_purchase_requisition(
        self, uids: list[str], *, plant: str = "", department: str = "",
        justification: str = "",
    ) -> dict[str, Any]:
        """One requisition covering the selected planned purchases.

        Grouped into a single document rather than one per line: a buyer works a
        requisition, not a spreadsheet row, and the lines share a source (this
        MRP run) and a justification.
        """
        orders = await self._planned_orders(uids)
        wrong = [o for o in orders if o.order_type != "PURCHASE"]
        if wrong:
            raise ValidationFailedError(
                f"{wrong[0].item_code} is a production order, not a purchase. "
                "Convert it to a production order instead."
            )

        now = utcnow()
        today = now.date()
        doc_no = await self._next_doc_no(
            "PurchaseRequisition", "DocNo", f"PR/MRP/{today:%y%m}/", schema="ERP_Procurement"
        )
        required_by = min(o.due_date for o in orders)
        est_value = sum((_d(o.value) for o in orders), Decimal("0"))
        run_no = (
            await self.session.execute(
                select(PpMrpRun.run_no).where(PpMrpRun.id == orders[0].run_id)
            )
        ).scalar_one_or_none() or "MRP"

        res = await self.session.execute(
            text(
                "INSERT INTO ERP_Procurement.PurchaseRequisition "
                "  (DocNo, DocDate, Status, Plant, Source, Department, RequestedBy, "
                "   Priority, RequiredBy, Justification, EstimatedValue, Remarks, "
                "   Version, IsDeleted, CreatedBy, CreatedDate) "
                "VALUES (:doc, :dt, 'DRAFT', :plant, 'MRP', :dept, :by, :pri, :req, "
                "        :just, :val, :rem, 1, 0, :by, NOW())"
            ),
            {
                "doc": doc_no, "dt": today, "plant": plant or "",
                # Every one of these is NOT NULL with no default on the
                # procurement table, so none may be left to the database.
                "dept": department or "Production Planning",
                "by": self.ctx.user_name or self.ctx.login_id,
                # Anything MRP wants released before today is already behind.
                "pri": "HIGH" if any(o.is_late for o in orders) else "NORMAL",
                "req": required_by,
                "just": justification or f"Raised from MRP run {run_no}.",
                "val": float(est_value),
                "rem": f"Auto-raised from {run_no}. {len(orders)} line(s).",
            },
        )
        pr_id = res.lastrowid

        for o in orders:
            await self.session.execute(
                text(
                    "INSERT INTO ERP_Procurement.PrLine "
                    "  (PurchaseRequisitionId, ItemCode, ItemName, Uom, Qty, QtyOrdered, "
                    "   RequiredBy, EstimatedRate, Specification, CreatedBy, CreatedDate) "
                    "VALUES (:pr, :code, :name, :uom, :qty, 0, :req, :rate, :spec, :by, NOW())"
                ),
                {
                    "pr": pr_id, "code": o.item_code, "name": o.item_name,
                    "uom": o.uom, "qty": float(o.quantity), "req": o.due_date,
                    "rate": float(o.unit_rate),
                    # The pegging travels with the line, so a buyer asking
                    # "why am I buying this?" has the answer on the document.
                    "spec": f"Covers: {o.pegged_to}"[:500],
                    "by": self.ctx.user_name or self.ctx.login_id,
                },
            )
            o.converted_to_doc_no = doc_no
            o.converted_at = now
            o.updated_at = now
            o.updated_by = self.ctx.user_id

        await self.session.flush()
        return {
            "document_no": doc_no,
            "document_type": "PURCHASE_REQUISITION",
            "lines": len(orders),
            "estimated_value": float(est_value),
            "required_by": required_by,
        }

    # ─────────────────── planned production → order ───────────────────
    async def to_production_order(
        self, uid: str, *, plant: str = "", warehouse: str = ""
    ) -> dict[str, Any]:
        """One production order, with its BOM and routing snapshotted onto it."""
        orders = await self._planned_orders([uid])
        o = orders[0]
        if o.order_type != "PRODUCTION":
            raise ValidationFailedError(
                f"{o.item_code} is a purchase, not a production order. "
                "Raise a purchase requisition instead."
            )

        now = utcnow()
        today = now.date()

        # ── BOM, at the revision live right now ──────────────────────────
        bom = (
            await self.session.execute(
                text(
                    "SELECT Id, DocNo, Revision, BaseQty FROM ERP_Product.EngineeringBom "
                    " WHERE ProductCode = :code AND DeletedAt IS NULL "
                    "   AND Status IN ('ACTIVE','APPROVED') "
                    " ORDER BY IFNULL(IsDefault,0) DESC, Revision DESC LIMIT 1"
                ),
                {"code": o.item_code},
            )
        ).fetchone()
        if bom is None:
            raise BusinessRuleViolationError(
                f"{o.item_code} has no live bill of material, so a production order "
                "cannot be raised for it. Approve a BOM in Product Engineering first.",
                rule_code="V5-MRP-BR-002",
            )
        bom_id, bom_doc, bom_rev, base_qty = bom[0], bom[1], int(bom[2] or 0), _d(bom[3]) or Decimal("1")

        bom_lines = (
            await self.session.execute(
                text(
                    "SELECT ItemCode, ItemName, Uom, QtyPer, IFNULL(ScrapPct,0) "
                    "  FROM ERP_Product.EngineeringBomLine WHERE BomId = :id ORDER BY Seq"
                ),
                {"id": bom_id},
            )
        ).fetchall()

        # ── Routing, if one exists ───────────────────────────────────────
        routing = (
            await self.session.execute(
                text(
                    "SELECT Id, RouteCode, Revision FROM ERP_Product.EngineeringRouting "
                    " WHERE ProductCode = :code AND DeletedAt IS NULL "
                    "   AND Status IN ('ACTIVE','APPROVED') "
                    " ORDER BY IFNULL(IsDefault,0) DESC, Revision DESC LIMIT 1"
                ),
                {"code": o.item_code},
            )
        ).fetchone()
        ops = []
        if routing is not None:
            ops = (
                await self.session.execute(
                    text(
                        "SELECT Seq, OperationCode, OperationName, WorkCentreCode, "
                        "       MachineCode, IFNULL(SetupMinutes,0), IFNULL(CycleSeconds,0), "
                        "       IFNULL(Operators,1), Skill, ToolCode, IFNULL(QcCheckpoint,0) "
                        "  FROM ERP_Product.EngineeringRoutingOperation "
                        " WHERE RoutingId = :id ORDER BY Seq"
                    ),
                    {"id": routing[0]},
                )
            ).fetchall()

        doc_no = await self._next_doc_no(
            "pp_production_order", "doc_no", f"PO/{today:%y%m}/"
        )
        qty = _d(o.quantity)

        order = self._audit(
            PpProductionOrder(
                doc_no=doc_no,
                order_type="STANDARD",
                product_code=o.item_code,
                product_name=o.item_name,
                uom=o.uom,
                qty=float(qty),
                produced_qty=0,
                rejected_qty=0,
                plant=plant or "",
                warehouse=warehouse or "",
                priority="HIGH" if o.is_late else "NORMAL",
                planned_start=o.release_date,
                planned_finish=o.due_date,
                status="PLANNED",
                bom_doc_no=bom_doc,
                bom_revision=bom_rev,
                routing_doc_no=routing[1] if routing is not None else "",
                routing_revision=int(routing[2] or 0) if routing is not None else 0,
                # The customer demand this order serves. `pegged_to` was used here
                # before, but on anything below the top level it holds the parent
                # *item code* — so a sub-assembly order was stamped
                # "FG-SS-750-BLK order wk 3" as its demand reference and Capacity
                # could never attribute its hours to an order. `demand_doc_no`
                # carries the root demand down every BOM level; `pegged_to`
                # remains the fallback for runs made before that existed.
                demand_refs=[
                    d.strip()
                    for d in ((o.demand_doc_no or o.pegged_to or "").split(","))
                    if d.strip()
                ],
                estimated_unit_cost=float(o.unit_rate),
                remarks=f"Raised from planned order {o.uid}.",
            ),
            now,
        )
        self.session.add(order)
        await self.session.flush()

        # ── Components, snapshotted at this BOM revision ─────────────────
        for code, name, uom, qty_per, scrap in bom_lines:
            required = (_d(qty_per) / base_qty) * (Decimal("1") + _d(scrap) / Decimal("100")) * qty
            available = await self._on_hand(code)
            self.session.add(
                self._audit(
                    PpProdOrderComponent(
                        order_id=order.id,
                        item_code=code,
                        item_name=name or code,
                        uom=uom or "NOS",
                        required_qty=float(eng.r6(required)),
                        # Reservation is a separate, deliberate act — raising the
                        # order does not take the stock.
                        reserved_qty=0,
                        issued_qty=0,
                        # What was on hand when the order was cut, so a later
                        # shortage can be told apart from a planning miss.
                        available_at_planning=float(available),
                    ),
                    now,
                )
            )

        # ── Operations, snapshotted at this routing revision ─────────────
        for (seq, op_code, op_name, wc, machine, setup, cycle_s, operators,
             skill, tool, qc) in ops:
            run_minutes = (_d(cycle_s) * qty) / Decimal("60")
            self.session.add(
                self._audit(
                    PpProdOrderOperation(
                        order_id=order.id,
                        seq=int(seq or 0),
                        operation_code=op_code or "",
                        operation_name=op_name or "",
                        work_centre_code=wc or "",
                        machine_code=machine or "",
                        operators=int(operators or 1),
                        skill=skill or "",
                        tool_code=tool or "",
                        qc_checkpoint=bool(qc),
                        setup_minutes=float(_d(setup)),
                        run_minutes=float(eng.r6(run_minutes)),
                        planned_start=o.release_date,
                        planned_finish=o.due_date,
                        status="PLANNED",
                    ),
                    now,
                )
            )

        o.converted_to_doc_no = doc_no
        o.converted_at = now
        o.updated_at = now
        o.updated_by = self.ctx.user_id
        await self.session.flush()

        return {
            "document_no": doc_no,
            "document_type": "PRODUCTION_ORDER",
            "product_code": o.item_code,
            "quantity": float(qty),
            "bom": f"{bom_doc} rev {bom_rev}",
            "routing": f"{routing[1]} rev {routing[2]}" if routing is not None else None,
            "components": len(bom_lines),
            "operations": len(ops),
            "planned_start": o.release_date,
            "planned_finish": o.due_date,
        }

    async def _on_hand(self, item_code: str) -> Decimal:
        """Available stock for a component. Queried on the code, never joined —
        `mst_item.code` and `ERP_Master.Item.Code` carry different collations."""
        v = (
            await self.session.execute(
                text(
                    "SELECT COALESCE(SUM(b.quantity), 0) "
                    "  FROM mst_item i "
                    "  JOIN inv_stock_balance b ON b.item_id = i.id "
                    " WHERE i.company_id = :cid AND i.deleted_at IS NULL "
                    "   AND i.code = :code AND b.stock_status = 'AVAILABLE'"
                ),
                {"cid": self.ctx.company_id, "code": item_code},
            )
        ).scalar_one()
        return _d(v)

    async def _free_stock(self, item_code: str) -> Decimal:
        """On hand less what is already reserved for anything else."""
        v = (
            await self.session.execute(
                text(
                    "SELECT GREATEST(COALESCE(SUM(b.quantity - b.reserved_qty), 0), 0) "
                    "  FROM mst_item i "
                    "  JOIN inv_stock_balance b ON b.item_id = i.id "
                    " WHERE i.company_id = :cid AND i.deleted_at IS NULL "
                    "   AND i.code = :code AND b.stock_status = 'AVAILABLE'"
                ),
                {"cid": self.ctx.company_id, "code": item_code},
            )
        ).scalar_one()
        return _d(v)

    async def _reserve_in_inventory(self, item_code: str, qty: Decimal) -> None:
        """Spread a reservation across the item's balance rows, largest free
        first, so a batch that cannot cover it is not over-reserved."""
        rows = (
            await self.session.execute(
                text(
                    "SELECT b.id, b.quantity - b.reserved_qty AS free "
                    "  FROM mst_item i "
                    "  JOIN inv_stock_balance b ON b.item_id = i.id "
                    " WHERE i.company_id = :cid AND i.deleted_at IS NULL "
                    "   AND i.code = :code AND b.stock_status = 'AVAILABLE' "
                    "   AND b.quantity > b.reserved_qty "
                    " ORDER BY free DESC "
                    "   FOR UPDATE"
                ),
                {"cid": self.ctx.company_id, "code": item_code},
            )
        ).fetchall()

        remaining = qty
        for row_id, free in rows:
            if remaining <= 0:
                break
            take = min(remaining, _d(free))
            if take <= 0:
                continue
            await self.session.execute(
                text(
                    "UPDATE inv_stock_balance "
                    "   SET reserved_qty = reserved_qty + :q, updated_at = :now, "
                    "       updated_by = :uid "
                    " WHERE id = :id"
                ),
                {"q": float(eng.r6(take)), "id": row_id,
                 "now": utcnow(), "uid": self.ctx.user_id},
            )
            remaining -= take

    async def _release_in_inventory(self, item_code: str, qty: Decimal) -> None:
        """Give a reservation back, most-reserved first. Clamped at zero so a
        double release can never drive the column negative."""
        rows = (
            await self.session.execute(
                text(
                    "SELECT b.id, b.reserved_qty "
                    "  FROM mst_item i "
                    "  JOIN inv_stock_balance b ON b.item_id = i.id "
                    " WHERE i.company_id = :cid AND i.deleted_at IS NULL "
                    "   AND i.code = :code AND b.reserved_qty > 0 "
                    " ORDER BY b.reserved_qty DESC "
                    "   FOR UPDATE"
                ),
                {"cid": self.ctx.company_id, "code": item_code},
            )
        ).fetchall()

        remaining = qty
        for row_id, held in rows:
            if remaining <= 0:
                break
            give = min(remaining, _d(held))
            await self.session.execute(
                text(
                    "UPDATE inv_stock_balance "
                    "   SET reserved_qty = GREATEST(reserved_qty - :q, 0), "
                    "       updated_at = :now, updated_by = :uid "
                    " WHERE id = :id"
                ),
                {"q": float(eng.r6(give)), "id": row_id,
                 "now": utcnow(), "uid": self.ctx.user_id},
            )
            remaining -= give

    async def release_components(self, order_uid: str) -> dict[str, Any]:
        """Give back everything an order holds — when it is cancelled, or once
        the material has actually been issued and the reservation is spent."""
        order = (
            await self.session.execute(
                select(PpProductionOrder).where(
                    PpProductionOrder.uid == order_uid,
                    PpProductionOrder.company_id == self.ctx.company_id,
                    PpProductionOrder.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if order is None:
            raise NotFoundError(f"Production order '{order_uid}' not found")

        components = list(
            (
                await self.session.execute(
                    select(PpProdOrderComponent).where(
                        PpProdOrderComponent.order_id == order.id,
                        PpProdOrderComponent.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
        )
        now = utcnow()
        released = Decimal("0")
        for comp in components:
            held = _d(comp.reserved_qty)
            if held <= 0:
                continue
            await self._release_in_inventory(comp.item_code, held)
            released += held
            comp.reserved_qty = 0
            comp.updated_at = now
            comp.updated_by = self.ctx.user_id

        await self.session.flush()
        return {
            "document_no": order.doc_no,
            "released_qty": float(eng.r6(released)),
            "components": len(components),
        }

    # ─────────────────────────── reservation ───────────────────────────
    async def reserve_components(self, order_uid: str) -> dict[str, Any]:
        """Reserve free stock against a production order's components.

        Writes both sides: `pp_prod_order_component.reserved_qty`, which the shop
        floor reads, and `inv_stock_balance.reserved_qty`, so Inventory knows its
        stock is spoken for and MRP stops planning against it.

        Reservation is **soft**. `post_movement` still issues against `quantity`,
        so an urgent issue is never blocked by a reservation held for another
        order — the reservation informs the plan, it does not lock the shelf.
        Making it hard is a policy decision, not a schema one.

        Re-reserving an order is safe: the previous reservation is released
        first, so the balance carries one reservation per order, not a running
        total that grows on every click.
        """
        order = (
            await self.session.execute(
                select(PpProductionOrder).where(
                    PpProductionOrder.uid == order_uid,
                    PpProductionOrder.company_id == self.ctx.company_id,
                    PpProductionOrder.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if order is None:
            raise NotFoundError(f"Production order '{order_uid}' not found")
        if order.status not in ("PLANNED", "RELEASED"):
            raise BusinessRuleViolationError(
                f"This order is {order.status}; components can only be reserved "
                "while it is planned or released.",
                rule_code="V5-PO-BR-001",
            )

        components = list(
            (
                await self.session.execute(
                    select(PpProdOrderComponent).where(
                        PpProdOrderComponent.order_id == order.id,
                        PpProdOrderComponent.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
        )

        now = utcnow()
        reserved, short = 0, []
        for comp in components:
            # Give back whatever this order already holds before taking again,
            # so a second call does not stack a second reservation on top.
            previous = _d(comp.reserved_qty)
            if previous > 0:
                await self._release_in_inventory(comp.item_code, previous)

            need = _d(comp.required_qty) - _d(comp.issued_qty)
            if need <= 0:
                comp.reserved_qty = 0
                comp.updated_at = now
                comp.updated_by = self.ctx.user_id
                continue

            free = await self._free_stock(comp.item_code)
            take = min(need, free)
            if take > 0:
                await self._reserve_in_inventory(comp.item_code, take)
                reserved += 1

            comp.reserved_qty = float(eng.r6(take))
            comp.updated_at = now
            comp.updated_by = self.ctx.user_id

            if take < need:
                short.append(
                    {
                        "item_code": comp.item_code,
                        "required": float(need),
                        "reserved": float(take),
                        "short_by": float(eng.r6(need - take)),
                        "uom": comp.uom,
                    }
                )

        await self.session.flush()
        return {
            "document_no": order.doc_no,
            "components": len(components),
            "reserved": reserved,
            "shortages": short,
            "fully_covered": not short,
        }
