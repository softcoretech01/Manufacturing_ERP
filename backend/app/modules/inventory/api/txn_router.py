"""Inventory movement-transaction endpoints (issue, return, adjust, transfer,
scrap) + a movements list. All post through the stock engine. Every endpoint
declares its permission (CLAUDE.md §5.4); `get_session` commits."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.inventory.api import txn_schemas as s
from app.modules.inventory.application.transaction_service import TransactionService

router = APIRouter(tags=["Inventory · Transactions"])


@router.get("/inventory/movements", response_model=list[s.MovementRow])
async def list_movements(
    session: SessionDep,
    movement_type: str | None = None,
    item: str | None = None,
    warehouse: str | None = None,
    limit: int = 200,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
):
    return await TransactionService(session, ctx).movements(
        movement_type=movement_type, item_uid=item, warehouse_uid=warehouse, limit=limit
    )


@router.post("/inventory/issues", response_model=s.MovementResult, status_code=201)
async def post_issue(
    body: s.IssueRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ISSUE.POST")),
) -> Any:
    return await TransactionService(session, ctx).issue(
        item_uid=body.item_uid, warehouse_uid=body.warehouse_uid,
        quantity=Decimal(str(body.quantity)), bin_uid=body.bin_uid,
        batch_no=body.batch_no, remarks=body.remarks, business_date=body.business_date,
    )


@router.post("/inventory/returns", response_model=s.MovementResult, status_code=201)
async def post_return(
    body: s.ReturnRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.RETURN.POST")),
) -> Any:
    return await TransactionService(session, ctx).return_material(
        item_uid=body.item_uid, warehouse_uid=body.warehouse_uid,
        quantity=Decimal(str(body.quantity)),
        rate=Decimal(str(body.rate)) if body.rate is not None else None,
        bin_uid=body.bin_uid, batch_no=body.batch_no, remarks=body.remarks,
        business_date=body.business_date,
    )


@router.post("/inventory/adjustments", response_model=s.MovementResult, status_code=201)
async def post_adjustment(
    body: s.AdjustRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ADJUSTMENT.POST")),
) -> Any:
    return await TransactionService(session, ctx).adjust(
        item_uid=body.item_uid, warehouse_uid=body.warehouse_uid, direction=body.direction,
        quantity=Decimal(str(body.quantity)), reason=body.reason,
        rate=Decimal(str(body.rate)) if body.rate is not None else None,
        bin_uid=body.bin_uid, batch_no=body.batch_no, business_date=body.business_date,
    )


@router.post("/inventory/transfers", response_model=s.TransferResult, status_code=201)
async def post_transfer(
    body: s.TransferRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.TRANSFER.POST")),
) -> Any:
    return await TransactionService(session, ctx).transfer(
        item_uid=body.item_uid, from_warehouse_uid=body.from_warehouse_uid,
        to_warehouse_uid=body.to_warehouse_uid, quantity=Decimal(str(body.quantity)),
        bin_uid=body.bin_uid, to_bin_uid=body.to_bin_uid, batch_no=body.batch_no,
        remarks=body.remarks, business_date=body.business_date,
    )


@router.post("/inventory/putaway", status_code=201)
async def post_putaway(
    body: s.PutawayRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.PUTAWAY.POST")),
) -> Any:
    return await TransactionService(session, ctx).putaway(
        item_uid=body.item_uid, warehouse_uid=body.warehouse_uid,
        to_bin_uid=body.to_bin_uid, quantity=Decimal(str(body.quantity)),
        from_bin_uid=body.from_bin_uid, batch_no=body.batch_no,
        remarks=body.remarks, business_date=body.business_date,
    )


@router.post("/inventory/scrap", response_model=s.MovementResult, status_code=201)
async def post_scrap(
    body: s.ScrapRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.SCRAP.POST")),
) -> Any:
    return await TransactionService(session, ctx).scrap(
        item_uid=body.item_uid, warehouse_uid=body.warehouse_uid,
        quantity=Decimal(str(body.quantity)), reason=body.reason,
        bin_uid=body.bin_uid, batch_no=body.batch_no, business_date=body.business_date,
    )
