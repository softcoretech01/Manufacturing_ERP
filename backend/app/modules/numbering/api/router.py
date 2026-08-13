"""Document-numbering endpoints (SRS V1-NUM §3.7). Every endpoint declares its
permission (CLAUDE.md §5.4). `get_session` commits on success — routers don't."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.numbering.api import schemas as s
from app.modules.numbering.application.service import NumberingService
from app.modules.numbering.infrastructure.models import CoreNumberSeries

router = APIRouter(tags=["Numbering"])


def _series_out(svc: NumberingService, series: CoreNumberSeries) -> s.SeriesOut:
    return s.SeriesOut(
        uid=series.uid,
        document_type=series.document_type,
        document_label=series.document_label,
        sub_type=series.sub_type,
        branch_code=series.branch_code,
        plant_code=series.plant_code,
        fy_code=series.fy_code,
        format_string=series.format_string,
        prefix=series.prefix,
        padding_width=series.padding_width,
        allow_widen=series.allow_widen,
        start_number=series.start_number,
        increment_by=series.increment_by,
        current_number=series.current_number,
        reset_frequency=series.reset_frequency,
        allocate_on=series.allocate_on,
        is_statutory=series.is_statutory,
        is_gapless=series.is_gapless,
        is_default=series.is_default,
        is_active=series.is_active,
        issued_count=series.issued_count,
        last_issued_at=series.last_issued_at,
        version=series.version,
        next_number=svc.next_number(series),
    )


@router.get("/number-series", response_model=list[s.SeriesOut])
async def list_series(
    session: SessionDep,
    document_type: str | None = None,
    active_only: bool = False,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.VIEW")),
):
    svc = NumberingService(session, ctx)
    rows = await svc.list_series(document_type=document_type, active_only=active_only)
    return [_series_out(svc, r) for r in rows]


@router.post("/number-series", response_model=s.SeriesOut, status_code=201)
async def create_series(
    body: s.SeriesCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.EDIT")),
):
    svc = NumberingService(session, ctx)
    series = await svc.create(body.model_dump())
    return _series_out(svc, series)


@router.post("/number-series/preview")
async def preview_series(
    body: s.PreviewRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.VIEW")),
) -> dict[str, Any]:
    return await NumberingService(session, ctx).preview(body.model_dump())


@router.post("/number-series/simulate")
async def simulate_series(
    body: s.SimulateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.VIEW")),
) -> dict[str, Any]:
    return await NumberingService(session, ctx).simulate(
        document_type=body.document_type, sub_type=body.sub_type,
        branch_code=body.branch_code, plant_code=body.plant_code, on_date=body.on_date,
    )


@router.get("/number-series/exhaustion-warnings")
async def exhaustion_warnings(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.VIEW")),
) -> list[dict[str, Any]]:
    return await NumberingService(session, ctx).exhaustion_warnings()


@router.get("/number-series/{uid}", response_model=s.SeriesOut)
async def get_series(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.VIEW")),
):
    svc = NumberingService(session, ctx)
    return _series_out(svc, await svc.get_or_404(uid))


@router.patch("/number-series/{uid}", response_model=s.SeriesOut)
async def update_series(
    uid: str,
    body: s.SeriesUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.EDIT")),
):
    svc = NumberingService(session, ctx)
    data = body.model_dump()
    version = data.pop("version")
    series = await svc.update(uid, data, expected_version=version)
    return _series_out(svc, series)


@router.post("/number-series/{uid}/deactivate", response_model=s.SeriesOut)
async def deactivate_series(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.EDIT")),
):
    svc = NumberingService(session, ctx)
    return _series_out(svc, await svc.set_active(uid, False))


@router.post("/number-series/{uid}/restore", response_model=s.SeriesOut)
async def restore_series(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.EDIT")),
):
    svc = NumberingService(session, ctx)
    return _series_out(svc, await svc.set_active(uid, True))


@router.get("/number-series/{uid}/allocations", response_model=list[s.AllocationOut])
async def series_allocations(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.VIEW")),
):
    return await NumberingService(session, ctx).allocations(uid)


@router.get("/number-series/{uid}/gap-analysis")
async def series_gap_analysis(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.VIEW")),
) -> dict[str, Any]:
    return await NumberingService(session, ctx).gap_analysis(uid)


@router.post("/number-series/void")
async def void_number(
    body: s.VoidRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.NUMBERING.EDIT")),
) -> dict[str, str]:
    await NumberingService(session, ctx).void(
        formatted_number=body.formatted_number, reason=body.reason
    )
    return {"status": "voided"}
