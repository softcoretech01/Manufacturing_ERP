"""Capacity endpoints.

The grid answers "which centres are overloaded"; the detail answers "because of
what". A percentage a planner cannot trace back to specific operations is a
number they learn to ignore.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.planning.application.capacity_service import CapacityService
from app.modules.planning.domain import mrp_engine as eng

router = APIRouter(prefix="/planning", tags=["Planning · Capacity"])


@router.get("/capacity")
async def capacity_plan(
    session: SessionDep,
    horizon: int = Query(eng.DEFAULT_HORIZON, ge=1, le=52),
    include_planned: bool = Query(
        True,
        description="Include hours from MRP proposals nobody has converted yet. "
        "Turn off to see only work that is already committed.",
    ),
    today: date | None = None,
    demand_doc_no: str | None = Query(
        None,
        max_length=40,
        description="Mark the share of each work centre's load that belongs to "
        "this demand. The grid still shows the full factory load — filtering it "
        "would make a full plant look empty.",
    ),
    ctx: TenantContext = Depends(require("PLANNING.CAPACITY.VIEW")),
) -> dict[str, Any]:
    result = await CapacityService(session, ctx).plan(
        horizon=horizon, include_planned=include_planned, today=today,
        demand_doc_no=demand_doc_no,
    )
    # `_detail` backs the per-centre drill-down; it would bloat the grid payload.
    result.pop("_detail", None)
    return result


@router.get("/capacity/{work_centre_code}")
async def capacity_detail(
    work_centre_code: str,
    session: SessionDep,
    horizon: int = Query(eng.DEFAULT_HORIZON, ge=1, le=52),
    bucket: int | None = Query(None, ge=0),
    today: date | None = None,
    ctx: TenantContext = Depends(require("PLANNING.CAPACITY.VIEW")),
) -> dict[str, Any]:
    """The operations that make up one work centre's load."""
    return await CapacityService(session, ctx).load_detail(
        work_centre_code, horizon=horizon, bucket=bucket, today=today
    )
