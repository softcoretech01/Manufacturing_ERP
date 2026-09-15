"""Shop-floor execution endpoints.

Every state change on the floor is a POST to a named action rather than a PUT of
a status field, so the server decides what may happen next. Each one declares its
permission, and each one commits once — the services raise the typed errors in
`app.core.errors`, which the global handler renders as problem+json.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import require
from app.modules.production.api import schemas as s
from app.modules.production.application.execution_service import ProductionExecutionService
from app.modules.production.application.release_service import ProductionReleaseService
from app.modules.production.application.shopfloor_query_service import ShopFloorQueryService

router = APIRouter(tags=["Shop Floor Execution"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _execution(session: AsyncSession, ctx: TenantContext) -> ProductionExecutionService:
    return ProductionExecutionService(session, ctx)


# ── Release ─────────────────────────────────────────────────────────────────


@router.post("/production/orders/{uid}/release")
async def release_order(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.ORDER.RELEASE")),
) -> Any:
    """Hand a planned order to the floor, generating its work orders.

    One transaction: either the order is released and every operation exists as a
    work order, or nothing changed.
    """
    result = await ProductionReleaseService(session, ctx).release(uid)
    await session.commit()
    return result


# ── The queue ───────────────────────────────────────────────────────────────


@router.get("/production/work-orders")
async def work_order_queue(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.WORKORDER.VIEW")),
    work_centre: str = Query(default="", alias="workCentre", max_length=30),
    status: str = Query(default="", max_length=20),
) -> Any:
    """Released work in sequence, with why anything cannot be started yet."""
    return await _execution(session, ctx).queue(work_centre=work_centre, status=status)


# ── Operation lifecycle ─────────────────────────────────────────────────────


@router.post("/production/work-orders/{uid}/start")
async def start_operation(
    uid: str,
    body: s.StartRequest | None = None,
    session: SessionDep = None,  # type: ignore[assignment]
    ctx: TenantContext = Depends(require("PRODUCTION.OPERATION.START")),
) -> Any:
    body = body or s.StartRequest()
    result = await _execution(session, ctx).start(
        uid, machine_code=body.machine_code, shift_code=body.shift_code
    )
    await session.commit()
    return result


@router.post("/production/work-orders/{uid}/pause")
async def pause_operation(
    uid: str,
    body: s.ReasonRequest | None = None,
    session: SessionDep = None,  # type: ignore[assignment]
    ctx: TenantContext = Depends(require("PRODUCTION.OPERATION.START")),
) -> Any:
    result = await _execution(session, ctx).pause(uid, reason=(body.reason if body else ""))
    await session.commit()
    return result


@router.post("/production/work-orders/{uid}/resume")
async def resume_operation(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.OPERATION.START")),
) -> Any:
    result = await _execution(session, ctx).resume(uid)
    await session.commit()
    return result


@router.post("/production/work-orders/{uid}/hold")
async def hold_operation(
    uid: str,
    body: s.ReasonRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.OPERATION.HOLD")),
) -> Any:
    result = await _execution(session, ctx).hold(uid, reason=body.reason)
    await session.commit()
    return result


@router.post("/production/work-orders/{uid}/cancel")
async def cancel_operation(
    uid: str,
    body: s.ReasonRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.OPERATION.HOLD")),
) -> Any:
    result = await _execution(session, ctx).cancel(uid, reason=body.reason)
    await session.commit()
    return result


@router.post("/production/work-orders/{uid}/complete")
async def complete_operation(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.OPERATION.COMPLETE")),
) -> Any:
    """Finish an operation, passing its good quantity to the next one.

    An operation carrying a QC checkpoint stops at QC_HOLD instead: quality
    decides whether the quantity moves on.
    """
    result = await _execution(session, ctx).complete(uid)
    await session.commit()
    return result


# ── Production entry ────────────────────────────────────────────────────────


@router.post("/production/work-orders/{uid}/entries")
async def record_production(
    uid: str,
    body: s.ProductionEntryRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.ENTRY.POST")),
) -> Any:
    """Book good, scrap and rework against an operation."""
    result = await _execution(session, ctx).record_production(
        uid,
        good_qty=Decimal(str(body.good_qty)),
        scrap_qty=Decimal(str(body.scrap_qty)),
        rework_qty=Decimal(str(body.rework_qty)),
        started_at=body.started_at,
        ended_at=body.ended_at,
        business_date=body.business_date,
        machine_code=body.machine_code,
        shift_code=body.shift_code,
        scrap_reason=body.scrap_reason,
        defect_code=body.defect_code,
        remarks=body.remarks,
    )
    await session.commit()
    return result


# ── Quality ─────────────────────────────────────────────────────────────────


@router.post("/production/work-orders/{uid}/qc")
async def record_qc(
    uid: str,
    body: s.QcDecisionRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.QC.EXECUTE")),
) -> Any:
    """Record the quality decision on a checkpoint operation and release or hold it."""
    result = await _execution(session, ctx).record_qc(
        uid, result=body.result, inspection_doc_no=body.inspection_doc_no, note=body.note
    )
    await session.commit()
    return result


# ── Material ────────────────────────────────────────────────────────────────


@router.post("/production/orders/{uid}/issue-material")
async def issue_material(
    uid: str,
    body: s.MaterialIssueRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.MATERIAL.ISSUE")),
) -> Any:
    """Consume the order's components from stock, through the inventory engine."""
    result = await _execution(session, ctx).issue_material(
        uid, warehouse_uid=body.warehouse, work_order_uid=body.work_order_uid, remarks=body.remarks
    )
    await session.commit()
    return result


# ── Closing the order ───────────────────────────────────────────────────────


@router.post("/production/orders/{uid}/complete")
async def complete_order(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.ORDER.COMPLETE")),
) -> Any:
    """Close a production order once every operation and inspection is finished."""
    result = await _execution(session, ctx).complete_order(uid)
    await session.commit()
    return result


# ── Assignment ──────────────────────────────────────────────────────────────


@router.post("/production/work-orders/{uid}/assign")
async def assign_operation(
    uid: str,
    body: s.StartRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.WORKORDER.ASSIGN")),
) -> Any:
    """Put an operation on a machine and a shift before it runs."""
    result = await _execution(session, ctx).assign(
        uid, machine_code=body.machine_code, shift_code=body.shift_code
    )
    await session.commit()
    return result


# ── Reading the floor ───────────────────────────────────────────────────────
#
# Everything below is read-only. It projects rows the floor has already written
# and never invents a figure: where a number would need a model this system does
# not keep, the payload carries an explicit gap instead.


def _query(session: AsyncSession, ctx: TenantContext) -> ShopFloorQueryService:
    return ShopFloorQueryService(session, ctx)


@router.get("/production/entries")
async def production_entries(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.ENTRY.VIEW")),
    order_doc_no: str = Query(default="", alias="orderDocNo", max_length=40),
    work_order_doc_no: str = Query(default="", alias="workOrderDocNo", max_length=40),
    work_centre: str = Query(default="", alias="workCentre", max_length=30),
    shift: str = Query(default="", max_length=20),
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> Any:
    """Bookings, newest first, each with the defects recorded against it."""
    return await _query(session, ctx).entries(
        order_doc_no=order_doc_no,
        work_order_doc_no=work_order_doc_no,
        work_centre=work_centre,
        shift=shift,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
    )


@router.get("/production/scrap")
async def scrap_records(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.SCRAP.VIEW")),
    order_doc_no: str = Query(default="", alias="orderDocNo", max_length=40),
    work_centre: str = Query(default="", alias="workCentre", max_length=30),
    disposition: str = Query(default="", max_length=20),
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> Any:
    """Scrap documents with their totals and a breakdown by reason."""
    return await _query(session, ctx).scrap(
        order_doc_no=order_doc_no,
        work_centre=work_centre,
        disposition=disposition,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
    )


@router.get("/production/wip")
async def work_in_progress(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.FLOOR.VIEW")),
    work_centre: str = Query(default="", alias="workCentre", max_length=30),
) -> Any:
    """What each open operation is still holding, derived from its work order."""
    return await _query(session, ctx).wip(work_centre=work_centre)


@router.get("/production/traveller/{order_doc_no:path}")
async def order_traveller(
    order_doc_no: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.FLOOR.VIEW")),
) -> Any:
    """One order's route card: every operation, its entries and its components."""
    return await _query(session, ctx).traveller(order_doc_no)


@router.get("/production/dashboard")
async def shop_floor_dashboard(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.FLOOR.VIEW")),
    on: date | None = Query(default=None),
) -> Any:
    """The floor at a glance, with the metrics this system cannot source named."""
    return await _query(session, ctx).dashboard(on=on)


@router.get("/production/orders")
async def production_orders(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.ORDER.VIEW")),
    status: str = Query(default="", max_length=30),
) -> Any:
    """Production orders with how far the floor has actually got with each."""
    return await _query(session, ctx).orders(status=status)


@router.get("/production/orders/{uid}/readiness")
async def order_readiness(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.ORDER.VIEW")),
) -> Any:
    """Material coverage for a release decision, and the checks nothing can answer."""
    return await _query(session, ctx).readiness(uid)


@router.get("/production/effectiveness")
async def production_effectiveness(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.FLOOR.VIEW")),
    from_date: date | None = Query(default=None, alias="fromDate"),
) -> Any:
    """Quality and performance per work centre, and why availability is absent."""
    return await _query(session, ctx).effectiveness(from_date=from_date)


@router.get("/production/output-by/{dimension}")
async def output_by(
    dimension: Literal["shift", "operator"],
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.FLOOR.VIEW")),
    from_date: date | None = Query(default=None, alias="fromDate"),
) -> Any:
    """Booked output grouped by shift or by operator, with the gaps named."""
    return await _query(session, ctx).output_by(dimension=dimension, from_date=from_date)


@router.get("/production/integrity")
async def production_integrity(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PRODUCTION.FLOOR.VIEW")),
) -> Any:
    """Where the floor's own figures disagree with the entries behind them."""
    return await _query(session, ctx).integrity()
