"""Security-policy endpoints. One settings resource per company.
Every endpoint declares its permission (CLAUDE.md §5.4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.security import schemas as s
from app.modules.security.service import SecurityPolicyService

router = APIRouter(tags=["Security"])


@router.get("/security-policy", response_model=s.SecurityPolicyOut)
async def get_security_policy(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.VIEW")),
):
    return await SecurityPolicyService(session, ctx).get_or_create()


@router.put("/security-policy", response_model=s.SecurityPolicyOut)
async def update_security_policy(
    body: s.SecurityPolicyUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.EDIT")),
):
    data = body.model_dump(exclude_unset=True, exclude={"version"})
    return await SecurityPolicyService(session, ctx).update(data, body.version)
