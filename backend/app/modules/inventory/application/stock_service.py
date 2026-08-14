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

    # ── read: bin card / ledger (S-STK-03) ───────────────────────────────────
    async def ledger(
        self, *, item_uid: str, warehouse_id: int | None = None, limit: int = 500
    ) -> dict[str, Any]:
        item = await self._item(item_uid)
        stmt = select(InvStockLedger).where(
            InvStockLedger.company_id == self.ctx.company_id,
            InvStockLedger.item_id == item.id,
        )
        if warehouse_id:
            stmt = stmt.where(InvStockLedger.warehouse_id == warehouse_id)
        stmt = stmt.order_by(InvStockLedger.posted_at.desc(), InvStockLedger.id.desc()).limit(limit)
        rows = list((await self.session.execute(stmt)).scalars().all())
        received = sum(Decimal(str(r.quantity)) for r in rows if r.direction == "IN")
        issued = sum(Decimal(str(r.quantity)) for r in rows if r.direction == "OUT")
        return {
            "item": {
                "uid": item.uid, "code": item.code, "name": item.name, "uom": item.base_uom,
                "valuation_method": item.valuation_method,
            },
            "rows": rows,
            "totals": {
                "received": float(received), "issued": float(issued),
                "closing_qty": float(rows[0].balance_qty_after) if rows else 0.0,
                "closing_rate": float(rows[0].balance_rate_after) if rows else 0.0,
                "closing_value": float(rows[0].balance_value_after) if rows else 0.0,
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
