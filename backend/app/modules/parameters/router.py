"""System-parameter endpoints (CLAUDE.md §5.4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.parameters import schemas as s
from app.modules.parameters.service import ParameterService

router = APIRouter(tags=["System Parameters"])


@router.get("/parameters", response_model=list[s.ParameterOut])
async def list_parameters(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.VIEW")),
):
    return await ParameterService(session, ctx).list_or_seed()


@router.put("/parameters", response_model=list[s.ParameterOut])
async def update_parameters(
    body: s.ParametersUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.EDIT")),
):
    return await ParameterService(session, ctx).update([c.model_dump() for c in body.changes])
