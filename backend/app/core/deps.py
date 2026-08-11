"""FastAPI dependencies: authentication, tenant-context resolution, permission gates.

Every protected endpoint depends on :func:`get_context` (who is asking, resolved
server-side) and declares its permission via :func:`require`. An endpoint with no
declared permission is a CI failure (CLAUDE.md §5.4) — enforced in tests.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

import jwt
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.enums import Channel
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.core.security import decode_access_token

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _bearer(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        raise UnauthenticatedError("Missing or malformed Authorization header.")
    return header[7:].strip()


async def get_context(request: Request, session: SessionDep) -> TenantContext:
    """Decode the access token and resolve the full authorisation snapshot.

    Resolution (permissions, company scope) happens server-side against the DB;
    nothing authorisation-bearing is trusted from the token beyond identity.
    """
    from app.modules.iam.application.auth_service import resolve_context

    token = _bearer(request)
    try:
        claims = decode_access_token(token)
    except jwt.ExpiredSignatureError as exc:
        raise UnauthenticatedError("Access token has expired.") from exc
    except jwt.PyJWTError as exc:
        raise UnauthenticatedError("Invalid access token.") from exc

    if claims.get("type") != "access":
        raise UnauthenticatedError("Wrong token type.")

    ctx = await resolve_context(
        session,
        user_uid=str(claims.get("sub", "")),
        company_uid=str(claims.get("company", "")),
        session_id=str(claims.get("sid", "")),
    )
    ctx.correlation_id = getattr(request.state, "correlation_id", "-")
    ctx.channel = Channel.WEB
    ctx.ip_address = request.client.host if request.client else None
    ctx.user_agent = request.headers.get("User-Agent")
    ctx.bind()
    return ctx


ContextDep = Annotated[TenantContext, Depends(get_context)]

_PermDep = Callable[[TenantContext], Coroutine[Any, Any, TenantContext]]


def require(*permissions: str) -> _PermDep:
    """Dependency factory: caller must hold at least one of the given permissions.

    Usage:
        @router.post(..., dependencies=[Depends(require("SYSTEM.BRANCH.CREATE"))])
    or, to use the context in the handler:
        ctx: TenantContext = Depends(require("SYSTEM.BRANCH.VIEW"))
    """

    async def _dep(ctx: ContextDep) -> TenantContext:
        if not ctx.has_any(*permissions):
            raise ForbiddenError(
                f"Requires one of: {', '.join(permissions)}",
                rule_code="V1-IAM-BR-001",
                extra={"required_permissions": list(permissions)},
            )
        return ctx

    return _dep
