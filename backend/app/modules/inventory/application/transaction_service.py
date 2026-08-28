"""Inventory movement transactions (SRS Vol 4 Ch 4-6), all on the stock engine.

Every transaction here is one or two `StockService.post_movement` calls wrapped
with a document number from the Numbering engine. The engine already enforces the
hard rules (negative-stock refusal, moving-average, atomic balance+ledger); these
services add the document semantics on top:

  issue     → OUT   (MATERIAL_ISSUE)
  return    → IN    (MATERIAL_RETURN, at the current moving average)
  adjust    → IN/OUT (STOCK_ADJUSTMENT, reason mandatory)
  transfer  → OUT@source + IN@dest at the same rate (STOCK_TRANSFER) — value is
              preserved across warehouses (V4-STK-FR-003)
  scrap     → OUT   (SCRAP, reason mandatory)
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import MovementDirection, StockStatus
from app.core.errors import NotFoundError, ValidationFailedError
from app.modules.inventory.application.stock_service import StockService
from app.modules.inventory.infrastructure.models import (
    InvBin,
    InvStockBalance,
    InvStockLedger,
)
from app.modules.masters.infrastructure.models import MstItem
from app.modules.numbering.application.service import NumberingService
from app.modules.organisation.infrastructure.models import SysWarehouse


class TransactionService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.stock = StockService(session, ctx)
        self.numbering = NumberingService(session, ctx)

    # ── resolution ───────────────────────────────────────────────────────────
    async def _warehouse(self, uid: str) -> SysWarehouse:
        row = (
            await self.session.execute(
                select(SysWarehouse).where(
                    SysWarehouse.uid == uid,
                    SysWarehouse.company_id == self.ctx.company_id,
                    SysWarehouse.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Warehouse '{uid}' not found")
        if not row.is_active:
            raise ValidationFailedError(f"Warehouse '{row.code}' is inactive.")
        return row

    async def _bin_id(self, warehouse_id: int, bin_uid: str | None) -> int:
        if not bin_uid:
            return 0
        row = (
            await self.session.execute(
                select(InvBin).where(
                    InvBin.uid == bin_uid,
                    InvBin.company_id == self.ctx.company_id,
                    InvBin.warehouse_id == warehouse_id,
                    InvBin.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Bin '{bin_uid}' not found in this warehouse")
        return row.id

    async def _current_rate(
        self, item_id: int, warehouse_id: int, bin_id: int, batch_no: str, status: str
    ) -> Decimal:
        rate = (
            await self.session.execute(
                select(InvStockBalance.avg_rate).where(
                    InvStockBalance.company_id == self.ctx.company_id,
                    InvStockBalance.item_id == item_id,
                    InvStockBalance.warehouse_id == warehouse_id,
                    InvStockBalance.bin_id == bin_id,
                    InvStockBalance.batch_no == batch_no,
                    InvStockBalance.stock_status == status,
                )
            )
        ).scalar_one_or_none()
        return Decimal(str(rate)) if rate else Decimal("0")

    async def _doc_no(self, document_type: str, item_code: str) -> str:
        alloc = await self.numbering.allocate(
            document_type=document_type, entity_type=document_type,
            entity_label=f"{document_type} — {item_code}",
        )
        return str(alloc["number"])

    def _out(self, led: InvStockLedger, doc_no: str) -> dict[str, Any]:
        return {
            "document_no": doc_no,
            "movement_type": led.movement_type,
            "direction": led.direction,
            "quantity": float(led.quantity),
            "rate": float(led.rate),
            "value": float(led.value),
            "balance_qty_after": float(led.balance_qty_after),
            "balance_rate_after": float(led.balance_rate_after),
        }

    # ── issue (OUT) ──────────────────────────────────────────────────────────
    async def issue(
        self, *, item_uid: str, warehouse_uid: str, quantity: Decimal,
        bin_uid: str | None = None, batch_no: str = "", remarks: str | None = None,
        business_date: date | None = None,
    ) -> dict[str, Any]:
        item = await self.stock._item(item_uid)
        wh = await self._warehouse(warehouse_uid)
        bin_id = await self._bin_id(wh.id, bin_uid)
        doc = await self._doc_no("MATERIAL_ISSUE", item.code)
        led = await self.stock.post_movement(
            item=item, warehouse_id=wh.id, bin_id=bin_id, batch_no=batch_no,
            direction=MovementDirection.OUT.value, quantity=quantity, movement_type="ISSUE",
            document_type="MATERIAL_ISSUE", document_no=doc, remarks=remarks,
            business_date=business_date,
        )
        return self._out(led, doc)

    # ── return (IN, at current moving average) ───────────────────────────────
    async def return_material(
        self, *, item_uid: str, warehouse_uid: str, quantity: Decimal,
        rate: Decimal | None = None, bin_uid: str | None = None, batch_no: str = "",
        remarks: str | None = None, business_date: date | None = None,
    ) -> dict[str, Any]:
        item = await self.stock._item(item_uid)
        wh = await self._warehouse(warehouse_uid)
        bin_id = await self._bin_id(wh.id, bin_uid)
        status = StockStatus.AVAILABLE.value
        use_rate = rate if rate is not None else await self._current_rate(
            item.id, wh.id, bin_id, batch_no, status
        )
        doc = await self._doc_no("MATERIAL_RETURN", item.code)
        led = await self.stock.post_movement(
            item=item, warehouse_id=wh.id, bin_id=bin_id, batch_no=batch_no,
            direction=MovementDirection.IN.value, quantity=quantity, rate=use_rate,
            movement_type="RETURN", document_type="MATERIAL_RETURN", document_no=doc,
            remarks=remarks, business_date=business_date,
        )
        return self._out(led, doc)

    # ── adjust (IN/OUT, reason mandatory) ────────────────────────────────────
    async def adjust(
        self, *, item_uid: str, warehouse_uid: str, direction: str, quantity: Decimal,
        reason: str, rate: Decimal | None = None, bin_uid: str | None = None,
        batch_no: str = "", business_date: date | None = None,
    ) -> dict[str, Any]:
        if not reason or not reason.strip():
            raise ValidationFailedError(
                "A reason is required for a stock adjustment.",
                errors=[{"field": "reason", "code": "required", "message": "Give a reason"}],
            )
        item = await self.stock._item(item_uid)
        wh = await self._warehouse(warehouse_uid)
        bin_id = await self._bin_id(wh.id, bin_uid)
        status = StockStatus.AVAILABLE.value
        if direction == MovementDirection.IN.value:
            use_rate = rate if rate is not None else await self._current_rate(
                item.id, wh.id, bin_id, batch_no, status
            )
        else:
            use_rate = Decimal("0")  # OUT issues at current moving average
        doc = await self._doc_no("STOCK_ADJUSTMENT", item.code)
        led = await self.stock.post_movement(
            item=item, warehouse_id=wh.id, bin_id=bin_id, batch_no=batch_no,
            direction=direction, quantity=quantity, rate=use_rate,
            movement_type="ADJUST", document_type="STOCK_ADJUSTMENT", document_no=doc,
            remarks=reason, business_date=business_date,
        )
        return self._out(led, doc)

    # ── transfer (OUT@source + IN@dest, value preserved) ─────────────────────
    async def transfer(
        self, *, item_uid: str, from_warehouse_uid: str, to_warehouse_uid: str,
        quantity: Decimal, bin_uid: str | None = None, to_bin_uid: str | None = None,
        batch_no: str = "", remarks: str | None = None, business_date: date | None = None,
    ) -> dict[str, Any]:
        if from_warehouse_uid == to_warehouse_uid and (bin_uid or "") == (to_bin_uid or ""):
            raise ValidationFailedError(
                "Source and destination are the same.",
                errors=[{"field": "to_warehouse_uid", "code": "same",
                         "message": "Pick a different destination"}],
            )
        item = await self.stock._item(item_uid)
        src = await self._warehouse(from_warehouse_uid)
        dst = await self._warehouse(to_warehouse_uid)
        src_bin = await self._bin_id(src.id, bin_uid)
        dst_bin = await self._bin_id(dst.id, to_bin_uid)
        doc = await self._doc_no("STOCK_TRANSFER", item.code)

        out_led = await self.stock.post_movement(
            item=item, warehouse_id=src.id, bin_id=src_bin, batch_no=batch_no,
            direction=MovementDirection.OUT.value, quantity=quantity,
            movement_type="TRANSFER_OUT", document_type="STOCK_TRANSFER", document_no=doc,
            remarks=remarks, business_date=business_date,
        )
        transfer_rate = Decimal(str(out_led.rate))  # ship at the source moving average
        in_led = await self.stock.post_movement(
            item=item, warehouse_id=dst.id, bin_id=dst_bin, batch_no=batch_no,
            direction=MovementDirection.IN.value, quantity=quantity, rate=transfer_rate,
            movement_type="TRANSFER_IN", document_type="STOCK_TRANSFER", document_no=doc,
            remarks=remarks, business_date=business_date,
        )
        return {
            "document_no": doc,
            "item_code": item.code,
            "from_warehouse": src.code,
            "to_warehouse": dst.code,
            "quantity": float(quantity),
            "rate": float(transfer_rate),
            "source_balance_after": float(out_led.balance_qty_after),
            "dest_balance_after": float(in_led.balance_qty_after),
        }

    # ── put-away (bin → bin within a warehouse; value unchanged) ─────────────
    async def putaway(
        self, *, item_uid: str, warehouse_uid: str, to_bin_uid: str, quantity: Decimal,
        from_bin_uid: str | None = None, batch_no: str = "", remarks: str | None = None,
        business_date: date | None = None,
    ) -> dict[str, Any]:
        """Move received stock from the receiving/implicit bin into a storage bin.
        A bin-to-bin move at the same rate — the value never changes."""
        item = await self.stock._item(item_uid)
        wh = await self._warehouse(warehouse_uid)
        src_bin = await self._bin_id(wh.id, from_bin_uid)  # None → implicit bin 0
        dst_bin = await self._bin_id(wh.id, to_bin_uid)
        if src_bin == dst_bin:
            raise ValidationFailedError(
                "Source and destination bin are the same.",
                errors=[{"field": "to_bin_uid", "code": "same", "message": "Pick another bin"}],
            )
        doc = await self._doc_no("PUTAWAY", item.code)
        out_led = await self.stock.post_movement(
            item=item, warehouse_id=wh.id, bin_id=src_bin, batch_no=batch_no,
            direction=MovementDirection.OUT.value, quantity=quantity,
            movement_type="PUTAWAY_OUT", document_type="PUTAWAY", document_no=doc,
            remarks=remarks, business_date=business_date,
        )
        rate = Decimal(str(out_led.rate))
        in_led = await self.stock.post_movement(
            item=item, warehouse_id=wh.id, bin_id=dst_bin, batch_no=batch_no,
            direction=MovementDirection.IN.value, quantity=quantity, rate=rate,
            movement_type="PUTAWAY_IN", document_type="PUTAWAY", document_no=doc,
            remarks=remarks, business_date=business_date,
        )
        return {
            "document_no": doc, "item_code": item.code, "quantity": float(quantity),
            "rate": float(rate), "source_balance_after": float(out_led.balance_qty_after),
            "dest_balance_after": float(in_led.balance_qty_after),
        }

    # ── scrap / write-off (OUT, reason mandatory) ────────────────────────────
    async def scrap(
        self, *, item_uid: str, warehouse_uid: str, quantity: Decimal, reason: str,
        bin_uid: str | None = None, batch_no: str = "", business_date: date | None = None,
    ) -> dict[str, Any]:
        if not reason or not reason.strip():
            raise ValidationFailedError(
                "A reason is required to scrap stock.",
                errors=[{"field": "reason", "code": "required", "message": "Give a reason"}],
            )
        item = await self.stock._item(item_uid)
        wh = await self._warehouse(warehouse_uid)
        bin_id = await self._bin_id(wh.id, bin_uid)
        doc = await self._doc_no("SCRAP", item.code)
        led = await self.stock.post_movement(
            item=item, warehouse_id=wh.id, bin_id=bin_id, batch_no=batch_no,
            direction=MovementDirection.OUT.value, quantity=quantity, movement_type="SCRAP",
            document_type="SCRAP", document_no=doc, remarks=reason, business_date=business_date,
        )
        return self._out(led, doc)

    # ── recent movements (for the transaction list views) ────────────────────
    async def movements(
        self, *, movement_type: str | None = None, item_uid: str | None = None,
        warehouse_uid: str | None = None, limit: int = 200,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(InvStockLedger, MstItem.code, MstItem.name, SysWarehouse.code)
            .join(MstItem, MstItem.id == InvStockLedger.item_id)
            .join(SysWarehouse, SysWarehouse.id == InvStockLedger.warehouse_id, isouter=True)
            .where(InvStockLedger.company_id == self.ctx.company_id)
        )
        if movement_type:
            stmt = stmt.where(InvStockLedger.movement_type.in_(movement_type.split(",")))
        if item_uid:
            item = await self.stock._item(item_uid)
            stmt = stmt.where(InvStockLedger.item_id == item.id)
        if warehouse_uid:
            wh = await self._warehouse(warehouse_uid)
            stmt = stmt.where(InvStockLedger.warehouse_id == wh.id)
        stmt = stmt.order_by(InvStockLedger.posted_at.desc(), InvStockLedger.id.desc()).limit(limit)
        rows = (await self.session.execute(stmt)).all()
        return [
            {
                "uid": led.uid, "posted_at": led.posted_at, "business_date": led.business_date,
                "movement_type": led.movement_type, "direction": led.direction,
                "quantity": float(led.quantity), "rate": float(led.rate), "value": float(led.value),
                "balance_qty_after": float(led.balance_qty_after),
                "document_no": led.document_no, "batch_no": led.batch_no,
                "stock_status": led.stock_status, "remarks": led.remarks,
                "posted_by_name": led.posted_by_name,
                "item_code": item_code, "item_name": item_name, "warehouse_code": wh_code,
            }
            for led, item_code, item_name, wh_code in rows
        ]

    async def reverse_document(self, document_no: str, reason: str = "Reversal") -> dict[str, Any]:
        from app.core.time import utcnow
        
        stmt = select(InvStockLedger).where(
            InvStockLedger.document_no == document_no, 
            InvStockLedger.company_id == self.ctx.company_id
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        if not rows:
            raise NotFoundError(f"Document {document_no} not found")
        
        # Don't reverse a reversal!
        if any(r.movement_type.endswith("_REV") for r in rows):
            raise ValidationFailedError("Cannot reverse a reversal document")

        rev_doc = f"{document_no}-REV"
        biz_date = utcnow().date()
        results = []

        for led in rows:
            rev_dir = MovementDirection.IN.value if led.direction == MovementDirection.OUT.value else MovementDirection.OUT.value
            item = await self.session.get(MstItem, led.item_id)
            if not item: continue
            
            # Post equal opposite movement
            new_led = await self.stock.post_movement(
                item=item, warehouse_id=led.warehouse_id, bin_id=led.bin_id, batch_no=led.batch_no,
                direction=rev_dir, quantity=Decimal(str(led.quantity)), rate=Decimal(str(led.rate)),
                movement_type=f"{led.movement_type}_REV", document_type=f"{led.document_type}_REV", document_no=rev_doc,
                remarks=f"Reverses {document_no}: {reason}", business_date=biz_date,
            )
            results.append(new_led)
        
        return {"document_no": rev_doc, "reversed_lines": len(results)}
