"""Goods receipt — the entry point that puts stock in (SRS Vol 4 Ch 3).

This slice is a direct-post receipt: it allocates a GRN number from the Numbering
engine and posts an IN movement through the StockService. The full GRN *document*
(header + lines + workflow approval + put-away) wraps this same posting call — the
engine is the same; this is the minimal producer that proves the stock foundation.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import MovementDirection
from app.core.errors import NotFoundError, ValidationFailedError
from app.modules.inventory.application.stock_service import StockService
from app.modules.inventory.infrastructure.models import InvBin
from app.modules.numbering.application.service import NumberingService
from app.modules.organisation.infrastructure.models import SysWarehouse


class ReceiptService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.stock = StockService(session, ctx)
        self.numbering = NumberingService(session, ctx)

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
            return 0  # implicit bin
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

    async def receive(
        self,
        *,
        item_uid: str,
        warehouse_uid: str,
        quantity: Decimal,
        rate: Decimal,
        bin_uid: str | None = None,
        batch_no: str = "",
        business_date: date | None = None,
        remarks: str | None = None,
        supplier_label: str | None = None,
    ) -> dict[str, Any]:
        item = await self.stock._item(item_uid)
        wh = await self._warehouse(warehouse_uid)
        bin_id = await self._bin_id(wh.id, bin_uid)

        # Item's default receipt status (AVAILABLE, or QUARANTINE if inspection-gated).
        status = item.default_receipt_status

        # Allocate the GRN document number from the Numbering engine.
        alloc = await self.numbering.allocate(
            document_type="GRN",
            plant_code=None,
            entity_type="GRN",
            entity_label=supplier_label or f"Receipt of {item.code}",
        )
        doc_no = alloc["number"]

        led = await self.stock.post_movement(
            item=item,
            warehouse_id=wh.id,
            bin_id=bin_id,
            batch_no=batch_no,
            stock_status=status,
            direction=MovementDirection.IN.value,
            quantity=quantity,
            rate=rate,
            movement_type="GRN",
            document_type="GRN",
            document_no=doc_no,
            business_date=business_date,
            remarks=remarks,
        )
        return {
            "document_no": doc_no,
            "item_code": item.code,
            "warehouse_code": wh.code,
            "quantity": float(led.quantity),
            "rate": float(led.rate),
            "value": float(led.value),
            "stock_status": status,
            "balance_qty_after": float(led.balance_qty_after),
            "balance_rate_after": float(led.balance_rate_after),
        }
