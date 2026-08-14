"""Physical-inventory (stock count) endpoints. Every endpoint declares its
permission (CLAUDE.md §5.4); `get_session` commits."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.inventory.api import count_schemas as s
from app.modules.inventory.application.count_service import CountService

router = APIRouter(tags=["Inventory · Physical inventory"])


def _count_out(entry: dict[str, Any]) -> s.CountOut:
    c = entry["count"]
    return s.CountOut(
        uid=c.uid, document_no=c.document_no, warehouse_code=c.warehouse_code,
        count_type=c.count_type, status=c.status, count_date=c.count_date, remarks=c.remarks,
        counted_by_name=c.counted_by_name, submitted_at=c.submitted_at, approved_at=c.approved_at,
        version=c.version, line_count=entry.get("line_count", 0),
        variance_lines=entry.get("variance_lines", 0), counted=entry.get("counted", 0),
    )


@router.get("/inventory/counts", response_model=list[s.CountOut])
async def list_counts(
    session: SessionDep,
    status: str | None = None,
    count_type: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.CYCLE_COUNT.VIEW")),
):
    entries = await CountService(session, ctx).list_counts(status=status, count_type=count_type)
    return [_count_out(e) for e in entries]


@router.post("/inventory/counts", response_model=s.CountDetail, status_code=201)
async def create_count(
    body: s.CountCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.CYCLE_COUNT.CREATE")),
) -> Any:
    svc = CountService(session, ctx)
    count = await svc.create(
        warehouse_uid=body.warehouse_uid, count_type=body.count_type,
        item_uid=body.item_uid, remarks=body.remarks,
    )
    return await svc.get_detail(count.uid)


@router.get("/inventory/counts/{uid}", response_model=s.CountDetail)
async def get_count(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.CYCLE_COUNT.VIEW")),
):
    return await CountService(session, ctx).get_detail(uid)


@router.post("/inventory/counts/{uid}/record", response_model=s.CountDetail)
async def record_counts(
    uid: str,
    body: s.RecordCounts,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.CYCLE_COUNT.COUNT")),
):
    svc = CountService(session, ctx)
    await svc.record_counts(uid, [e.model_dump() for e in body.entries])
    return await svc.get_detail(uid)


@router.post("/inventory/counts/{uid}/submit", response_model=s.CountDetail)
async def submit_count(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.CYCLE_COUNT.COUNT")),
):
    svc = CountService(session, ctx)
    await svc.submit(uid)
    return await svc.get_detail(uid)


@router.post("/inventory/counts/{uid}/approve", response_model=s.ApproveResult)
async def approve_count(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.CYCLE_COUNT.APPROVE")),
) -> Any:
    return await CountService(session, ctx).approve(uid)


@router.post("/inventory/counts/{uid}/cancel", response_model=s.CountDetail)
async def cancel_count(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.CYCLE_COUNT.CREATE")),
):
    svc = CountService(session, ctx)
    await svc.cancel(uid)
    return await svc.get_detail(uid)
