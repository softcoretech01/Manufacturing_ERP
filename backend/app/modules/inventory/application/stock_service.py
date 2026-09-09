"""The stock engine (SRS V4-STK §2.3, §2.9).

`post_movement` is the single door every quantity/value change goes through. It:
  - locks the exact balance row (`SELECT … FOR UPDATE`) after validation,
  - refuses to drive a balance negative (BR-004) — always, for now (per-warehouse
    negative-stock is a later flag),
  - keeps a **moving-average** rate and updates balance + ledger in one
    transaction (FR-004), storing the running balance ON the ledger row (BR-002).

Scope of this slice: receipts (IN) and generic OUT movements at moving-average
valuation, valued per balance-row. The item-by-warehouse valuation level (FR-003)
and per-warehouse negative-stock are refinements for when transfers/issues land —
flagged, not silently skipped.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import MovementDirection, StockStatus
from app.core.errors import BusinessRuleViolationError, NotFoundError, ValidationFailedError
from app.core.time import utcnow
from app.modules.inventory.infrastructure.models import (
    InvBin,
    InvStockBalance,
    InvStockLedger,
)
from app.modules.masters.infrastructure.models import MstItem

Q6 = Decimal("0.000001")
Q2 = Decimal("0.01")


def _r6(v: Decimal) -> Decimal:
    return v.quantize(Q6, rounding=ROUND_HALF_UP)


def _r2(v: Decimal) -> Decimal:
    return v.quantize(Q2, rounding=ROUND_HALF_UP)


class StockService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def _item(self, uid: str) -> MstItem:
        row = (
            await self.session.execute(
                select(MstItem).where(
                    MstItem.uid == uid,
                    MstItem.company_id == self.ctx.company_id,
                    MstItem.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Item '{uid}' not found")
        return row

    async def post_movement(
        self,
        *,
        item: MstItem,
        warehouse_id: int,
        direction: str,
        quantity: Decimal,
        rate: Decimal = Decimal("0"),
        movement_type: str,
        stock_status: str = StockStatus.AVAILABLE.value,
        bin_id: int = 0,
        batch_no: str = "",
        serial_no: str = "",
        document_type: str | None = None,
        document_no: str | None = None,
        line_ref: str | None = None,
        business_date: date | None = None,
        remarks: str | None = None,
    ) -> InvStockLedger:
        business_date = business_date or utcnow().date()

        # ── validations (V4-STK §2.8) ────────────────────────────────────────
        if quantity <= 0:
            raise ValidationFailedError(
                "Quantity must be greater than zero.",
                errors=[{"field": "quantity", "code": "positive", "message": "Must be > 0"}],
            )
        if not item.is_active or item.is_blocked_for_movement:
            raise BusinessRuleViolationError(
                f"Item '{item.code}' is inactive or blocked for movement.", rule_code="V4-STK-VAL-5"
            )
        if item.is_batch_tracked and not batch_no:
            raise ValidationFailedError(
                f"Item '{item.code}' is batch-managed — a batch is required.",
                errors=[{"field": "batch_no", "code": "required", "message": "Batch required"}],
            )
        if item.is_serial_tracked and not serial_no:
            raise ValidationFailedError(
                f"Item '{item.code}' is serial-managed — a serial is required.",
                errors=[{"field": "serial_no", "code": "required", "message": "Serial required"}],
            )

        qty = _r6(quantity)
        rate = _r6(rate)

        # ── lock/find the balance row ────────────────────────────────────────
        stmt = (
            select(InvStockBalance)
            .where(
                InvStockBalance.company_id == self.ctx.company_id,
                InvStockBalance.item_id == item.id,
                InvStockBalance.warehouse_id == warehouse_id,
                InvStockBalance.bin_id == bin_id,
                InvStockBalance.batch_no == batch_no,
                InvStockBalance.serial_no == serial_no,
                InvStockBalance.stock_status == stock_status,
            )
            .with_for_update()
        )
        bal = (await self.session.execute(stmt)).scalar_one_or_none()

        cur_qty = Decimal(str(bal.quantity)) if bal else Decimal("0")
        cur_val = Decimal(str(bal.value)) if bal else Decimal("0")
        cur_rate = Decimal(str(bal.avg_rate)) if bal else Decimal("0")

        if direction == MovementDirection.IN.value:
            new_qty = _r6(cur_qty + qty)
            move_value = _r2(qty * rate)
            new_val = _r2(cur_val + move_value)
            new_rate = _r6(new_val / new_qty) if new_qty > 0 else Decimal("0")
        elif direction == MovementDirection.OUT.value:
            # Negative-stock refusal (BR-004) — always, in this slice.
            if qty > cur_qty:
                raise BusinessRuleViolationError(
                    f"Insufficient stock of '{item.code}': need {qty}, have {cur_qty} "
                    f"(short {qty - cur_qty}).",
                    rule_code="V4-STK-BR-004",
                )
            issue_rate = cur_rate  # issue at current moving average
            move_value = _r2(qty * issue_rate)
            new_qty = _r6(cur_qty - qty)
            new_rate = cur_rate if new_qty > 0 else Decimal("0")
            new_val = _r2(new_qty * new_rate)
            rate = issue_rate
        else:
            raise ValidationFailedError(f"Unknown direction '{direction}'.")

        # ── write balance ────────────────────────────────────────────────────
        now = utcnow()
        if bal is None:
            bal = InvStockBalance(
                company_id=self.ctx.company_id, item_id=item.id, warehouse_id=warehouse_id,
                bin_id=bin_id, batch_no=batch_no, serial_no=serial_no, stock_status=stock_status,
                created_at=now, updated_at=now, created_by=self.ctx.user_id,
                updated_by=self.ctx.user_id, version=1,
            )
            self.session.add(bal)
        bal.quantity = float(new_qty)
        bal.avg_rate = float(new_rate)
        bal.value = float(new_val)
        bal.updated_at = now
        bal.updated_by = self.ctx.user_id

        # ── write ledger (running balance stored here — BR-002) ──────────────
        led = InvStockLedger(
            company_id=self.ctx.company_id, item_id=item.id, warehouse_id=warehouse_id,
            bin_id=bin_id, batch_no=batch_no, serial_no=serial_no, stock_status=stock_status,
            movement_type=movement_type, direction=direction,
            quantity=float(qty), rate=float(rate), value=float(move_value),
            balance_qty_after=float(new_qty), balance_rate_after=float(new_rate),
            balance_value_after=float(new_val),
            document_type=document_type, document_no=document_no, line_ref=line_ref,
            remarks=remarks,
            posted_by=self.ctx.user_id, posted_by_name=self.ctx.user_name,
            posted_at=now, business_date=business_date,
            correlation_id=self.ctx.correlation_id,
        )
        self.session.add(led)
        await self.session.flush()
        return led

    # ── read: enquiry (S-STK-01) ─────────────────────────────────────────────
    async def enquiry(
        self, *, warehouse_id: int | None = None, item_type: str | None = None,
        search: str | None = None, hide_zero: bool = True,
    ) -> list[dict[str, Any]]:
        def _bucket(status: str):
            qty = InvStockBalance.quantity
            return func.coalesce(
                func.sum(case((InvStockBalance.stock_status == status, qty), else_=0)),
                0,
            )

        stmt = (
            select(
                MstItem,
                func.coalesce(func.sum(InvStockBalance.quantity), 0).label("on_hand"),
                _bucket(StockStatus.AVAILABLE.value).label("available"),
                _bucket(StockStatus.QUARANTINE.value).label("quarantine"),
                _bucket(StockStatus.BLOCKED.value).label("blocked"),
                func.coalesce(func.sum(InvStockBalance.value), 0).label("value"),
            )
            .join(InvStockBalance, InvStockBalance.item_id == MstItem.id, isouter=True)
            .where(MstItem.company_id == self.ctx.company_id, MstItem.deleted_at.is_(None))
        )
        if warehouse_id:
            stmt = stmt.where(
                (InvStockBalance.warehouse_id == warehouse_id) | (InvStockBalance.id.is_(None))
            )
        if item_type:
            stmt = stmt.where(MstItem.item_type == item_type)
        if search:
            like = f"%{search}%"
            stmt = stmt.where((MstItem.code.ilike(like)) | (MstItem.name.ilike(like)))
        stmt = stmt.group_by(MstItem.id).order_by(MstItem.code)
        rows = (await self.session.execute(stmt)).all()
        out = []
        for it, on_hand, available, quarantine, blocked, value in rows:
            oh = float(on_hand)
            if hide_zero and oh == 0:
                continue
            out.append(
                {
                    "item_uid": it.uid, "item_code": it.code, "item_name": it.name,
                    "uom": it.base_uom, "item_type": it.item_type,
                    "on_hand": oh, "available": float(available),
                    "quarantine": float(quarantine), "blocked": float(blocked),
                    "reorder_level": float(it.reorder_level) if it.reorder_level else None,
                    "value": float(value),
                    "below_reorder": bool(
                        it.reorder_level and float(available) < float(it.reorder_level)
                    ),
                }
            )
        return out

    # ── read: detailed balance (S-STK-02) ────────────────────────────────────
    async def balance_enquiry(
        self, *, warehouse_id: int | None = None, item_type: str | None = None,
        search: str | None = None, hide_zero: bool = True,
    ) -> list[dict[str, Any]]:
        from app.modules.organisation.infrastructure.models import SysWarehouse
        
        stmt = (
            select(
                MstItem,
                SysWarehouse,
                InvStockBalance.batch_no,
                func.sum(case((InvStockBalance.stock_status == StockStatus.AVAILABLE.value, InvStockBalance.quantity), else_=0)).label("available"),
                # Reserved is stock committed to a production order — a real
                # column now. It used to be `sum(qty where status != AVAILABLE)`,
                # which is quarantined and blocked material: a different concept
                # shown under the wrong heading.
                func.sum(InvStockBalance.reserved_qty).label("reserved"),
                func.sum(
                    case(
                        (
                            InvStockBalance.stock_status != StockStatus.AVAILABLE.value,
                            InvStockBalance.quantity,
                        ),
                        else_=0,
                    )
                ).label("held"),
                func.sum(InvStockBalance.quantity).label("total"),
                func.sum(InvStockBalance.value).label("value"),
                func.max(InvStockBalance.updated_at).label("last_movement")
            )
            .join(InvStockBalance, InvStockBalance.item_id == MstItem.id)
            .join(SysWarehouse, SysWarehouse.id == InvStockBalance.warehouse_id, isouter=True)
            .where(MstItem.company_id == self.ctx.company_id, MstItem.deleted_at.is_(None))
        )
        if warehouse_id:
            stmt = stmt.where(InvStockBalance.warehouse_id == warehouse_id)
        if item_type:
            stmt = stmt.where(MstItem.item_type == item_type)
        if search:
            like = f"%{search}%"
            stmt = stmt.where((MstItem.code.ilike(like)) | (MstItem.name.ilike(like)))
            
        stmt = stmt.group_by(MstItem.id, SysWarehouse.id, InvStockBalance.batch_no)
        stmt = stmt.order_by(MstItem.code, SysWarehouse.code, InvStockBalance.batch_no)
        
        rows = (await self.session.execute(stmt)).all()
        out = []
        for it, wh, batch_no, available, reserved, held, total, value, last_movement in rows:
            tot = float(total or 0)
            # SUM() over a DECIMAL column comes back as Decimal (or None when the
            # group is empty). Narrow it to float once, here: dividing Decimal by
            # the float `tot` below raises TypeError, and an unhandled error on
            # this endpoint surfaces in the browser as a CORS failure, because the
            # 500 is produced outside CORSMiddleware and carries no CORS headers.
            val = float(value or 0)
            if hide_zero and tot == 0:
                continue
            out.append(
                {
                    "item_uid": it.uid, "item_code": it.code, "item_name": it.name,
                    "item_type": it.item_type,
                    "category": it.item_type.replace('_', ' ').title(),
                    "uom": it.base_uom,
                    "warehouse_uid": wh.uid if wh else None,
                    "warehouse_name": f"{wh.code} - {wh.name}" if wh else None,
                    "batch_no": batch_no or "-",
                    "available_qty": float(available or 0),
                    "reserved_qty": float(reserved or 0),
                    # Quarantined or blocked — physically here, not usable.
                    "held_qty": float(held or 0),
                    # What a planner may actually commit: on hand less what is
                    # already spoken for.
                    "free_qty": max(0.0, float(available or 0) - float(reserved or 0)),
                    "total_qty": tot,
                    "unit_cost": val / tot if tot > 0 else 0.0,
                    "stock_value": val,
                    "last_movement_date": last_movement,
                }
            )
        return out
        
    # ── read: batch & expiry (S-STK-05) ─────────────────────────────────────
    async def batch_enquiry(
        self, *, item_type: str | None = None, search: str | None = None,
        warehouse_id: int | None = None, batch_no: str | None = None,
        expiry_from: date | None = None, expiry_to: date | None = None,
        expiry_status: str | None = None, hide_zero: bool = True,
        expiring_days: int = 30,
    ) -> list[dict[str, Any]]:
        """One row per batch actually holding stock, at its warehouse.

        Driven by ``inv_stock_balance`` rather than by summing the ledger. The
        balance row is the authority on what is on hand — it is what Current
        Stock reads and what the engine locks — so a batch view derived from it
        can never disagree with Current Stock. It also carries the moving-average
        rate and value, which a ledger sum cannot give without replaying it.

        Manufacturing and expiry dates live in ``inv_batch_master``, keyed on
        (item, warehouse, batch). A batch received before that table existed
        simply has no dates, and reports its expiry state as UNKNOWN rather than
        pretending to be valid.
        """
        from app.modules.inventory.infrastructure.txn_models import InvBatchMaster
        from app.modules.organisation.infrastructure.models import SysWarehouse

        stmt = (
            select(
                MstItem,
                SysWarehouse,
                InvStockBalance.batch_no,
                func.sum(InvStockBalance.quantity).label("available"),
                func.sum(InvStockBalance.value).label("value"),
                func.max(InvStockBalance.updated_at).label("last_movement"),
                InvBatchMaster.mfg_date,
                InvBatchMaster.expiry_date,
            )
            .join(InvStockBalance, InvStockBalance.item_id == MstItem.id)
            .join(
                SysWarehouse,
                SysWarehouse.id == InvStockBalance.warehouse_id,
                isouter=True,
            )
            .join(
                InvBatchMaster,
                (InvBatchMaster.company_id == InvStockBalance.company_id)
                & (InvBatchMaster.mst_item_id == InvStockBalance.item_id)
                & (InvBatchMaster.warehouse_id == InvStockBalance.warehouse_id)
                & (InvBatchMaster.batch_no == InvStockBalance.batch_no)
                & (InvBatchMaster.deleted_at.is_(None)),
                isouter=True,
            )
            .where(
                MstItem.company_id == self.ctx.company_id,
                MstItem.deleted_at.is_(None),
                InvStockBalance.company_id == self.ctx.company_id,
                InvStockBalance.batch_no != "",
            )
        )
        if item_type:
            stmt = stmt.where(MstItem.item_type == item_type)
        if warehouse_id:
            stmt = stmt.where(InvStockBalance.warehouse_id == warehouse_id)
        if batch_no:
            stmt = stmt.where(InvStockBalance.batch_no.ilike(f"%{batch_no}%"))
        if expiry_from:
            stmt = stmt.where(InvBatchMaster.expiry_date >= expiry_from)
        if expiry_to:
            stmt = stmt.where(InvBatchMaster.expiry_date <= expiry_to)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                (MstItem.code.ilike(like))
                | (MstItem.name.ilike(like))
                | (InvStockBalance.batch_no.ilike(like))
            )

        stmt = stmt.group_by(
            MstItem.id, SysWarehouse.id, InvStockBalance.batch_no,
            InvBatchMaster.mfg_date, InvBatchMaster.expiry_date,
        ).order_by(MstItem.code, InvStockBalance.batch_no)

        rows = (await self.session.execute(stmt)).all()
        today = utcnow().date()
        out: list[dict[str, Any]] = []

        for it, wh, batch, available, value, last_movement, mfg_date, expiry_date in rows:
            qty = float(available or 0)
            if hide_zero and qty <= 0:
                continue
            val = float(value or 0)

            if expiry_date is None:
                days_to_expiry = None
                status = "UNKNOWN"
            else:
                days_to_expiry = (expiry_date - today).days
                if days_to_expiry < 0:
                    status = "EXPIRED"
                elif days_to_expiry <= expiring_days:
                    status = "EXPIRING_SOON"
                else:
                    status = "VALID"

            if expiry_status and status != expiry_status:
                continue

            out.append(
                {
                    "item_uid": it.uid,
                    "item_code": it.code,
                    "item_name": it.name,
                    "item_type": it.item_type,
                    "batch_no": batch,
                    "warehouse_uid": wh.uid if wh else None,
                    "warehouse_code": wh.code if wh else None,
                    "warehouse_name": f"{wh.code} — {wh.name}" if wh else None,
                    "uom": it.base_uom,
                    "available_qty": qty,
                    # Unit cost is derived from the balance the same way Current
                    # Stock derives it, so the two screens always agree.
                    "unit_cost": val / qty if qty > 0 else 0.0,
                    "stock_value": val,
                    "mfg_date": mfg_date,
                    "expiry_date": expiry_date,
                    "days_to_expiry": days_to_expiry,
                    "status": status,
                    "last_movement_date": last_movement,
                }
            )
        return out

    # ── read: bin card / ledger (S-STK-03) ───────────────────────────────────
    async def ledger(
        self, *, item_uid: str, warehouse_id: int | None = None,
        batch_no: str | None = None, date_from: date | None = None,
        date_to: date | None = None, movement_type: str | None = None,
        document_no: str | None = None, limit: int = 500,
    ) -> dict[str, Any]:
        """Bin card for one item: every movement, with the balance after each.

        Totals are computed with their own aggregate query over the full filtered
        set, not by summing the page of rows returned. Summing the page made the
        header disagree with the ledger as soon as there were more movements than
        the limit, and reported zero whenever the page was empty.
        """
        from app.modules.organisation.infrastructure.models import SysWarehouse

        item = await self._item(item_uid)

        def _filtered(stmt):
            stmt = stmt.where(
                InvStockLedger.company_id == self.ctx.company_id,
                InvStockLedger.item_id == item.id,
            )
            if warehouse_id:
                stmt = stmt.where(InvStockLedger.warehouse_id == warehouse_id)
            if batch_no:
                stmt = stmt.where(InvStockLedger.batch_no == batch_no)
            if date_from:
                stmt = stmt.where(InvStockLedger.business_date >= date_from)
            if date_to:
                stmt = stmt.where(InvStockLedger.business_date <= date_to)
            if movement_type:
                stmt = stmt.where(
                    InvStockLedger.movement_type.in_(movement_type.split(","))
                )
            if document_no:
                stmt = stmt.where(InvStockLedger.document_no.ilike(f"%{document_no}%"))
            return stmt

        rows_stmt = _filtered(
            select(InvStockLedger, SysWarehouse.code, SysWarehouse.name).join(
                SysWarehouse,
                SysWarehouse.id == InvStockLedger.warehouse_id,
                isouter=True,
            )
        ).order_by(
            InvStockLedger.posted_at.desc(), InvStockLedger.id.desc()
        ).limit(limit)

        results = (await self.session.execute(rows_stmt)).all()

        rows: list[dict[str, Any]] = []
        for led, wh_code, wh_name in results:
            rows.append(
                {
                    "uid": led.uid,
                    "posted_at": led.posted_at,
                    "business_date": led.business_date,
                    "movement_type": led.movement_type,
                    "direction": led.direction,
                    "quantity": float(led.quantity),
                    "rate": float(led.rate),
                    "value": float(led.value),
                    "balance_qty_after": float(led.balance_qty_after),
                    "balance_rate_after": float(led.balance_rate_after),
                    "balance_value_after": float(led.balance_value_after),
                    "document_type": led.document_type,
                    "document_no": led.document_no,
                    "batch_no": led.batch_no,
                    "stock_status": led.stock_status,
                    "posted_by_name": led.posted_by_name,
                    "warehouse_code": wh_code,
                    "warehouse_name": f"{wh_code} — {wh_name}" if wh_code else None,
                    "uom": item.base_uom,
                    "item_code": item.code,
                    "item_name": item.name,
                }
            )

        agg = (
            await self.session.execute(
                _filtered(
                    select(
                        func.coalesce(
                            func.sum(
                                case(
                                    (
                                        InvStockLedger.direction
                                        == MovementDirection.IN.value,
                                        InvStockLedger.quantity,
                                    ),
                                    else_=0,
                                )
                            ),
                            0,
                        ),
                        func.coalesce(
                            func.sum(
                                case(
                                    (
                                        InvStockLedger.direction
                                        == MovementDirection.OUT.value,
                                        InvStockLedger.quantity,
                                    ),
                                    else_=0,
                                )
                            ),
                            0,
                        ),
                        func.count(),
                    )
                )
            )
        ).one()
        received, issued, total = float(agg[0]), float(agg[1]), int(agg[2])

        return {
            "item": {
                "uid": item.uid, "code": item.code, "name": item.name,
                "uom": item.base_uom, "valuation_method": item.valuation_method,
            },
            "rows": rows,
            "totals": {
                "received": received,
                "issued": issued,
                "movements": total,
                "closing_qty": rows[0]["balance_qty_after"] if rows else 0.0,
                "closing_rate": rows[0]["balance_rate_after"] if rows else 0.0,
                "closing_value": rows[0]["balance_value_after"] if rows else 0.0,
            },
        }

    # ── read: bin occupancy (S-STK-04) ───────────────────────────────────────
    async def bin_occupancy(self, *, warehouse_id: int) -> dict[str, Any]:
        """What each bin in a warehouse holds, from the balances. `bin_id = 0` is
        the implicit bin — stock received but not yet put away."""
        rows = (
            await self.session.execute(
                select(InvStockBalance, MstItem)
                .join(MstItem, MstItem.id == InvStockBalance.item_id)
                .where(
                    InvStockBalance.company_id == self.ctx.company_id,
                    InvStockBalance.warehouse_id == warehouse_id,
                    InvStockBalance.quantity != 0,
                )
            )
        ).all()
        # bin_id → uid/code
        bins = {
            b.id: b
            for b in (
                await self.session.execute(
                    select(InvBin).where(
                        InvBin.company_id == self.ctx.company_id,
                        InvBin.warehouse_id == warehouse_id,
                        InvBin.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
        }
        agg: dict[int, dict[str, Any]] = {}
        implicit: dict[str, Any] = {"total_qty": 0.0, "value": 0.0, "contents": []}
        for bal, item in rows:
            entry = {
                "item_code": item.code, "item_name": item.name, "uom": item.base_uom,
                "batch_no": bal.batch_no, "stock_status": bal.stock_status,
                "quantity": float(bal.quantity), "value": float(bal.value),
            }
            if bal.bin_id == 0:
                implicit["total_qty"] += float(bal.quantity)
                implicit["value"] += float(bal.value)
                implicit["contents"].append(entry)
                continue
            a = agg.setdefault(
                bal.bin_id, {"total_qty": 0.0, "value": 0.0, "contents": []}
            )
            a["total_qty"] += float(bal.quantity)
            a["value"] += float(bal.value)
            a["contents"].append(entry)
        occ = []
        for bin_id, a in agg.items():
            b = bins.get(bin_id)
            if b is None:
                continue
            items = a["contents"]
            occ.append({
                "bin_uid": b.uid, "bin_code": b.code,
                "total_qty": round(a["total_qty"], 3), "value": round(a["value"], 2),
                "distinct_items": len({c["item_code"] for c in items}),
                "top_item_code": items[0]["item_code"] if items else None,
                "contents": items,
            })
        return {"bins": occ, "implicit": implicit}
