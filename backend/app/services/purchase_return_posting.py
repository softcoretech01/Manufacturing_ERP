"""Purchase-return posting — the counterpart to GRN posting.

Approving a purchase return moves rejected/damaged material out of the plant. Two
kinds of line, handled differently on purpose:

* **Rejected-at-GRN material** (``fromStock`` false) never entered the stock
  ledger — GRN posting books only accepted quantity — so returning it is
  paper-only: no ledger movement. It is validated against the GRN line's
  ``RejectedQty`` less whatever earlier returns already sent back.
* **Accepted, stocked material** (``fromStock`` true) is really on hand, so the
  return posts an ``OUT`` movement through the one inventory engine
  (``StockService``), which refuses to drive stock negative (BR-004).

Either way the returned quantity is rolled onto the GRN line and the PO line so
open-quantity math stays honest. Everything runs in the caller's transaction, so
a failure to post leaves the return unapproved and no stock moved.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import MovementDirection
from app.core.errors import NotFoundError, ValidationFailedError
from app.modules.inventory.application.stock_service import StockService
from app.modules.masters.infrastructure.models import MstItem


def _d(value: Any) -> Decimal:
    if value in (None, "", "null"):
        return Decimal("0")
    return Decimal(str(value))


class PurchaseReturnPostingService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.stock = StockService(session, ctx)

    async def _item_by_code(self, code: str) -> MstItem:
        row = (
            await self.session.execute(
                text(
                    "SELECT uid FROM mst_item "
                    "WHERE company_id = :cid AND code = :code AND deleted_at IS NULL LIMIT 1"
                ),
                {"cid": self.ctx.company_id, "code": (code or "").strip().upper()},
            )
        ).fetchone()
        if row is None:
            raise ValidationFailedError(
                f"Item '{code}' is not in stock and cannot be returned from inventory. "
                f"If this is material rejected at the GRN, mark the line as not from stock."
            )
        return await self.stock._item(row[0])

    async def _warehouse_id(self, warehouse: str) -> int:
        key = (warehouse or "").strip()
        if not key:
            raise ValidationFailedError("This return has no store/warehouse to draw stock from.")
        row = (
            await self.session.execute(
                text(
                    "SELECT id FROM sys_warehouse "
                    " WHERE company_id = :cid AND deleted_at IS NULL "
                    "   AND (code = :key OR name = :key) LIMIT 1"
                ),
                {"cid": self.ctx.company_id, "key": key},
            )
        ).fetchone()
        if row is None:
            raise NotFoundError(f"Store '{key}' is not a known warehouse.")
        return row[0]

    async def _already_returned(self, grn_line_ref: int, exclude_return_id: int) -> Decimal:
        """Quantity already returned against a GRN line by other live returns."""
        if not grn_line_ref:
            return Decimal("0")
        row = (
            await self.session.execute(
                text(
                    "SELECT IFNULL(SUM(l.ReturnQty),0) "
                    "  FROM ERP_Procurement.PurchaseReturnLine l "
                    "  JOIN ERP_Procurement.PurchaseReturn r ON r.Id = l.ReturnId "
                    " WHERE l.GrnLineRef = :ref AND r.Id <> :self AND r.Status <> 'CANCELLED'"
                ),
                {"ref": grn_line_ref, "self": exclude_return_id},
            )
        ).fetchone()
        return _d(row[0])

    async def _grn_line_rejected(self, grn_line_ref: int) -> Decimal:
        if not grn_line_ref:
            return Decimal("0")
        row = (
            await self.session.execute(
                text("SELECT IFNULL(RejectedQty,0) FROM ERP_Procurement.GrnLine WHERE Id = :id"),
                {"id": grn_line_ref},
            )
        ).fetchone()
        return _d(row[0]) if row else Decimal("0")

    async def post(self, ret: dict[str, Any]) -> dict[str, Any]:
        """Validate and post an approved purchase return."""
        return_id = ret.get("uid")
        doc_no = ret.get("docNo") or ""
        warehouse = str(ret.get("warehouse") or "")
        lines = ret.get("lines") or []
        if not lines:
            raise ValidationFailedError("This return has no lines.")

        # ── validate before moving anything ─────────────────────────────────
        errors: list[dict[str, str]] = []
        for idx, ln in enumerate(lines, start=1):
            qty = _d(ln.get("returnQty"))
            label = ln.get("itemName") or ln.get("itemCode") or f"line {idx}"
            if qty <= 0:
                errors.append({"field": f"lines.{idx}", "code": "zero",
                               "message": f"{label}: return quantity must be greater than zero."})
                continue
            if not ln.get("fromStock"):
                # rejected-at-GRN material: bounded by the GRN's rejected quantity
                grn_ref = ln.get("grnLineRef")
                if grn_ref:
                    rejected = await self._grn_line_rejected(grn_ref)
                    already = await self._already_returned(grn_ref, return_id)
                    available = rejected - already
                    if qty > available + Decimal("0.0001"):
                        errors.append({"field": f"lines.{idx}", "code": "over_return",
                                       "message": (f"{label}: returning {qty} but only {available} rejected "
                                                   f"quantity remains on the GRN line.")})
        if errors:
            raise ValidationFailedError("This return cannot be approved.", errors=errors)

        # ── post ────────────────────────────────────────────────────────────
        warehouse_id = None
        movements: list[dict[str, Any]] = []
        for ln in lines:
            qty = _d(ln.get("returnQty"))
            grn_ref = ln.get("grnLineRef")
            po_ref = ln.get("poLineRef")

            if ln.get("fromStock"):
                if warehouse_id is None:
                    warehouse_id = await self._warehouse_id(warehouse)
                item = await self._item_by_code(str(ln.get("itemCode") or ""))
                led = await self.stock.post_movement(
                    item=item,
                    warehouse_id=warehouse_id,
                    direction=MovementDirection.OUT.value,
                    quantity=qty,
                    rate=_d(ln.get("rate")),
                    movement_type="PURCHASE_RETURN",
                    stock_status=str(ln.get("stockStatus") or "AVAILABLE"),
                    batch_no=str(ln.get("batchNo") or "").strip(),
                    document_type="PURCHASE_RETURN",
                    document_no=doc_no,
                    line_ref=str(ln.get("itemCode") or ""),
                    remarks=f"Purchase return {doc_no} to {ret.get('supplierName') or ''}".strip(),
                )
                movements.append({
                    "itemCode": item.code, "quantity": float(led.quantity),
                    "balanceAfter": float(led.balance_qty_after),
                })

            # roll returned quantity onto the GRN and PO lines (open-qty tracking)
            if grn_ref:
                await self.session.execute(
                    text("UPDATE ERP_Procurement.GrnLine SET ReturnedQty = IFNULL(ReturnedQty,0) + :q WHERE Id = :id"),
                    {"q": float(qty), "id": grn_ref},
                )
            if po_ref:
                await self.session.execute(
                    text(
                        "UPDATE ERP_Procurement.PurchaseOrderLine "
                        "SET ReturnedQty = IFNULL(ReturnedQty,0) + :q, "
                        "    ModifiedBy = :by, ModifiedDate = CURRENT_TIMESTAMP WHERE Id = :id"
                    ),
                    {"q": float(qty), "by": self.ctx.user_name or "System", "id": po_ref},
                )

        return {"returnNo": doc_no, "movements": movements,
                "stockLines": len(movements), "paperLines": len(lines) - len(movements)}
