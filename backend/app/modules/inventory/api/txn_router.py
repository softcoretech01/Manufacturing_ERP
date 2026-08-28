"""Inventory movement-transaction endpoints (issue, return, adjust, transfer,
scrap) + a movements list. All post through the stock engine. Every endpoint
declares its permission (CLAUDE.md §5.4); `get_session` commits."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.inventory.api import txn_schemas as s
from app.modules.inventory.application.transaction_service import TransactionService

router = APIRouter(tags=["Inventory · Transactions"])


async def _resolve_dept_remarks(session: Any, company_id: int, department_uid: str | None, base_remarks: str | None) -> str | None:
    if not department_uid:
        return base_remarks
    from app.modules.organisation.infrastructure.models import SysDepartment
    stmt = select(SysDepartment.code, SysDepartment.name).where(SysDepartment.uid == department_uid, SysDepartment.company_id == company_id)
    res = (await session.execute(stmt)).first()
    if res:
        code, name = res
        return f"{code} - {name}"
    return base_remarks


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
    remarks = await _resolve_dept_remarks(session, ctx.company_id, body.department_uid, body.remarks)
    return await TransactionService(session, ctx).issue(
        item_uid=body.item_uid, warehouse_uid=body.warehouse_uid,
        quantity=Decimal(str(body.quantity)), bin_uid=body.bin_uid,
        batch_no=body.batch_no, remarks=remarks, business_date=body.business_date,
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


@router.post("/inventory/issues/bulk", response_model=list[s.MovementResult], status_code=201)
async def post_issue_bulk(
    body: list[s.IssueRequest],
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ISSUE.POST")),
) -> Any:
    svc = TransactionService(session, ctx)
    results = []
    dept_uid = body[0].department_uid if body else None
    remarks = await _resolve_dept_remarks(session, ctx.company_id, dept_uid, None)
    for row in body:
        row_remarks = remarks or row.remarks
        res = await svc.issue(
            item_uid=row.item_uid, warehouse_uid=row.warehouse_uid,
            quantity=Decimal(str(row.quantity)), bin_uid=row.bin_uid,
            batch_no=row.batch_no, remarks=row_remarks, business_date=row.business_date,
        )
        results.append(res)
    return results

@router.post("/inventory/returns/bulk", response_model=list[s.MovementResult], status_code=201)
async def post_return_bulk(
    body: list[s.ReturnRequest],
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.RETURN.POST")),
) -> Any:
    svc = TransactionService(session, ctx)
    results = []
    for row in body:
        res = await svc.return_material(
            item_uid=row.item_uid, warehouse_uid=row.warehouse_uid,
            quantity=Decimal(str(row.quantity)),
            rate=Decimal(str(row.rate)) if row.rate is not None else None,
            bin_uid=row.bin_uid, batch_no=row.batch_no, remarks=row.remarks,
            business_date=row.business_date,
        )
        results.append(res)
    return results

@router.post("/inventory/adjustments/bulk", response_model=list[s.MovementResult], status_code=201)
async def post_adjustment_bulk(
    body: list[s.AdjustRequest],
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ADJUST.POST")),
) -> Any:
    svc = TransactionService(session, ctx)
    results = []
    for row in body:
        res = await svc.adjust(
            item_uid=row.item_uid, warehouse_uid=row.warehouse_uid,
            direction=row.direction, quantity=Decimal(str(row.quantity)),
            reason=row.reason, bin_uid=row.bin_uid, batch_no=row.batch_no,
            business_date=row.business_date,
        )
        results.append(res)
    return results

@router.post("/inventory/transfers/bulk", response_model=list[s.TransferResult], status_code=201)
async def post_transfer_bulk(
    body: list[s.TransferRequest],
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.TRANSFER.POST")),
) -> Any:
    svc = TransactionService(session, ctx)
    results = []
    for row in body:
        res = await svc.transfer(
            item_uid=row.item_uid, from_warehouse_uid=row.from_warehouse_uid,
            to_warehouse_uid=row.to_warehouse_uid, quantity=Decimal(str(row.quantity)),
            from_bin_uid=row.from_bin_uid, to_bin_uid=row.to_bin_uid, batch_no=row.batch_no,
            remarks=row.remarks, business_date=row.business_date,
        )
        results.append(res)
    return results


@router.post("/inventory/documents/{document_no:path}/reverse", status_code=200)
async def post_reverse_document(
    document_no: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require(
        "INVENTORY.ISSUE.POST",
        "INVENTORY.RECEIPT.POST",
        "INVENTORY.TRANSFER.POST",
        "INVENTORY.ADJUSTMENT.POST",
        "INVENTORY.RETURN.POST"
    )),
) -> Any:
    return await TransactionService(session, ctx).reverse_document(document_no)
