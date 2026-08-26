"""Inventory analysis endpoints (valuation, ageing, ABC/XYZ, movement, reorder).
All read-only over the stock engine. Value is sensitive — masked unless the caller
holds INVENTORY.STOCK.VALUE (V4-STK §2.11). `get_session` commits (no writes here)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.inventory.application.analysis_service import AnalysisService
from app.modules.organisation.infrastructure.models import SysWarehouse

router = APIRouter(tags=["Inventory · Analysis"])


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


def _mask(data: Any, ctx: TenantContext) -> None:
    """Null out value fields in place unless the caller may see stock value."""
    if ctx.has("INVENTORY.STOCK.VALUE"):
        return
    if isinstance(data, dict):
        for k in list(data.keys()):
            if "value" in k:
                data[k] = None
            else:
                _mask(data[k], ctx)
    elif isinstance(data, list):
        for x in data:
            _mask(x, ctx)


@router.get("/inventory/analysis/valuation")
async def valuation(
    session: SessionDep,
    warehouse: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> dict[str, Any]:
    wid = await _wh_id(session, ctx, warehouse)
    result = await AnalysisService(session, ctx).valuation(warehouse_id=wid)
    _mask(result, ctx)
    return result


@router.get("/inventory/analysis/reorder")
async def reorder(
    session: SessionDep,
    warehouse: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> list[dict[str, Any]]:
    wid = await _wh_id(session, ctx, warehouse)
    return await AnalysisService(session, ctx).reorder(warehouse_id=wid)


@router.get("/inventory/analysis/ageing")
async def ageing(
    session: SessionDep,
    warehouse: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> dict[str, Any]:
    wid = await _wh_id(session, ctx, warehouse)
    result = await AnalysisService(session, ctx).ageing(warehouse_id=wid)
    _mask(result, ctx)
    return result


@router.get("/inventory/analysis/abc-xyz")
async def abc_xyz(
    session: SessionDep,
    warehouse: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> dict[str, Any]:
    wid = await _wh_id(session, ctx, warehouse)
    result = await AnalysisService(session, ctx).abc_xyz(warehouse_id=wid)
    _mask(result, ctx)
    return result


@router.get("/inventory/analysis/movement")
async def movement(
    session: SessionDep,
    warehouse: str | None = None,
    dead_days: int = 180,
    slow_days: int = 60,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> dict[str, Any]:
    wid = await _wh_id(session, ctx, warehouse)
    result = await AnalysisService(session, ctx).movement(
        warehouse_id=wid, dead_days=dead_days, slow_days=slow_days
    )
    _mask(result, ctx)
    return result
