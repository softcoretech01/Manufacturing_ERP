"""Stock endpoints: enquiry, ledger/bin-card, goods receipt (SRS Vol 4 Ch 2-3).
Every endpoint declares its permission (CLAUDE.md §5.4). `get_session` commits."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.inventory.api import stock_schemas as s
from app.modules.inventory.application.receipt_service import ReceiptService
from app.modules.inventory.application.stock_service import StockService
from app.modules.organisation.infrastructure.models import SysWarehouse

router = APIRouter(tags=["Inventory · Stock"])


async def _wh_id(session: SessionDep, ctx: TenantContext, uid: str | None) -> int | None:
    if not uid:
        return None
    return (
        await session.execute(
            select(SysWarehouse.id).where(
                SysWarehouse.uid == uid, SysWarehouse.company_id == ctx.company_id
            )
        )
    ).scalar_one_or_none()


@router.get("/inventory/stock", response_model=list[s.StockRow])
async def stock_enquiry(
    session: SessionDep,
    warehouse: str | None = None,
    item_type: str | None = None,
    search: str | None = None,
    hide_zero: bool = True,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
):
    wid = await _wh_id(session, ctx, warehouse)
    rows = await StockService(session, ctx).enquiry(
        warehouse_id=wid, item_type=item_type, search=search, hide_zero=hide_zero
    )
    # Value is sensitive (V4-STK §2.11): mask unless the caller holds STOCK.VALUE.
    if not ctx.has("INVENTORY.STOCK.VALUE"):
        for r in rows:
            r["value"] = None
    return rows


@router.get("/inventory/stock/ledger", response_model=s.LedgerResponse)
async def stock_ledger(
    session: SessionDep,
    item: str,
    warehouse: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> Any:
    wid = await _wh_id(session, ctx, warehouse)
    return await StockService(session, ctx).ledger(item_uid=item, warehouse_id=wid)


@router.get("/inventory/bin-occupancy")
async def bin_occupancy(
    session: SessionDep,
    warehouse: str,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> Any:
    wid = await _wh_id(session, ctx, warehouse)
    if wid is None:
        return {"bins": [], "implicit": {"total_qty": 0.0, "value": 0.0, "contents": []}}
    result = await StockService(session, ctx).bin_occupancy(warehouse_id=wid)
    if not ctx.has("INVENTORY.STOCK.VALUE"):
        for b in result["bins"]:
            b["value"] = None
            for c in b["contents"]:
                c["value"] = None
        result["implicit"]["value"] = None
        for c in result["implicit"]["contents"]:
            c["value"] = None
    return result


@router.post("/inventory/receipts", response_model=s.ReceiptResult, status_code=201)
async def post_receipt(
    body: s.ReceiptRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.RECEIPT.POST")),
) -> Any:
    return await ReceiptService(session, ctx).receive(
        item_uid=body.item_uid,
        warehouse_uid=body.warehouse_uid,
        quantity=Decimal(str(body.quantity)),
        rate=Decimal(str(body.rate)),
        bin_uid=body.bin_uid,
        batch_no=body.batch_no,
        business_date=body.business_date,
        remarks=body.remarks,
        supplier_label=body.supplier_label,
    )
