from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.deps import ContextDep, SessionDep
from app.modules.iam.api.schemas import (
    LoginRequest,
    LogoutRequest,
    MeResponse,
    RefreshRequest,
    TokenResponse,
)
from app.modules.iam.application import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, session: SessionDep) -> TokenResponse:
    ip = request.client.host if request.client else None
    bundle = await auth_service.authenticate(
        session,
        login_id=body.login_id,
        password=body.password,
        company_uid=body.company_uid,
        ip=ip,
    )
    return TokenResponse.model_validate(bundle)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, request: Request, session: SessionDep) -> TokenResponse:
    ip = request.client.host if request.client else None
    bundle = await auth_service.rotate_refresh(session, refresh_token=body.refresh_token, ip=ip)
    return TokenResponse.model_validate(bundle)


@router.post("/logout", status_code=204)
async def logout(body: LogoutRequest, session: SessionDep) -> None:
    await auth_service.logout(session, refresh_token=body.refresh_token)


@router.get("/me", response_model=MeResponse)
async def me(ctx: ContextDep) -> MeResponse:
    return MeResponse(
        user_uid=ctx.user_uid,
        user_name=ctx.user_name,
        login_id=ctx.login_id,
        company_uid=ctx.company_uid,
        company_ids_count=len(ctx.company_ids),
        permissions=sorted(ctx.permissions - ctx.denied_permissions),
        roles=sorted(ctx.role_ids),
    )
