"""Authentication and authorisation-context resolution.

This is the contract the rest of the backend depends on:

    authenticate(...)      -> issue access + refresh tokens
    rotate_refresh(...)    -> rotating refresh (old token invalidated)
    resolve_context(...)   -> the server-side TenantContext for a request

Effective permissions = union of the user's roles' ALLOW minus their DENY, with
deny always winning (V1-IAM-BR-003). Data scope = the user's company allow-list.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import CoreAuditLog
from app.core.config import settings
from app.core.context import TenantContext
from app.core.enums import AuditAction, PermissionEffect, RowRule, UserStatus
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.core.ids import new_uid
from app.core.security import (
    create_access_token,
    new_refresh_token,
    verify_password,
)
from app.core.time import utcnow
from app.modules.iam.infrastructure.models import (
    SysRolePermission,
    SysSession,
    SysUser,
    SysUserCompany,
    SysUserRole,
)


@dataclass(slots=True)
class TokenBundle:
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user_uid: str
    user_name: str
    company_uid: str
    company_id: int


def _audit_login(
    session: AsyncSession,
    *,
    company_id: int | None,
    user_id: int,
    user_name: str,
    action: AuditAction,
    ip: str | None,
) -> None:
    """Write a login/logout event to the audit log. Only ever called on paths that
    commit (successful login, logout) — failed-login auditing would need a separate
    commit because the request rolls back, so it is intentionally not done here."""
    session.add(
        CoreAuditLog(
            company_id=company_id,
            occurred_at=utcnow(),
            actor_user_id=user_id,
            actor_name=user_name,
            entity_type="sys_user",
            entity_id=user_id,
            action=action.value,
            ip_address=ip,
            channel="WEB",
            correlation_id="-",
        )
    )


def _hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ─────────────────────────── Scope + permissions ────────────────────────────
async def _company_scope(session: AsyncSession, user_id: int) -> frozenset[int]:
    rows = await session.execute(
        select(SysUserCompany.company_id).where(SysUserCompany.user_id == user_id)
    )
    return frozenset(rows.scalars().all())


async def _effective_permissions(
    session: AsyncSession, user_id: int, company_id: int
) -> tuple[frozenset[str], frozenset[str], frozenset[int]]:
    role_rows = await session.execute(
        select(SysUserRole.role_id, SysUserRole.company_id).where(SysUserRole.user_id == user_id)
    )
    role_ids: set[int] = set()
    for role_id, scoped_company in role_rows.all():
        if scoped_company is None or scoped_company == company_id:
            role_ids.add(role_id)

    if not role_ids:
        return frozenset(), frozenset(), frozenset()

    perm_rows = await session.execute(
        select(SysRolePermission.permission_code, SysRolePermission.effect).where(
            SysRolePermission.role_id.in_(role_ids)
        )
    )
    allowed: set[str] = set()
    denied: set[str] = set()
    for code, effect in perm_rows.all():
        (denied if effect == PermissionEffect.DENY.value else allowed).add(code)
    return frozenset(allowed), frozenset(denied), frozenset(role_ids)


async def _load_company(session: AsyncSession, company_uid: str):
    from app.modules.organisation.infrastructure.models import SysCompany

    row = await session.execute(
        select(SysCompany).where(SysCompany.uid == company_uid, SysCompany.deleted_at.is_(None))
    )
    return row.scalar_one_or_none()


# ─────────────────────────── Public API ─────────────────────────────────────
async def resolve_context(
    session: AsyncSession, *, user_uid: str, company_uid: str, session_id: str
) -> TenantContext:
    user = (
        await session.execute(
            select(SysUser).where(SysUser.uid == user_uid, SysUser.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if user is None or user.status != UserStatus.ACTIVE.value:
        raise UnauthenticatedError("User is not active.")

    company = await _load_company(session, company_uid)
    if company is None:
        raise UnauthenticatedError("Company context is invalid.")

    company_ids = await _company_scope(session, user.id)
    if company.id not in company_ids:
        raise ForbiddenError("User is not permitted to act in this company.", rule_code="V0-BR-008")

    allowed, denied, role_ids = await _effective_permissions(session, user.id, company.id)

    return TenantContext(
        user_id=user.id,
        user_uid=user.uid,
        user_name=user.full_name,
        login_id=user.login_id,
        company_id=company.id,
        company_uid=company.uid,
        session_id=session_id,
        permissions=allowed,
        denied_permissions=denied,
        role_ids=role_ids,
        company_ids=company_ids,
        row_rule=RowRule.ALL,
    )


async def _issue_tokens(
    session: AsyncSession, user: SysUser, company, *, ip: str | None
) -> TokenBundle:
    refresh = new_refresh_token()
    now = utcnow()
    sess = SysSession(
        uid=new_uid(),
        user_id=user.id,
        company_id=company.id,
        refresh_token_hash=_hash_refresh(refresh),
        issued_at=now,
        expires_at=now + timedelta(hours=settings.refresh_token_hours),
        ip_address=ip,
    )
    session.add(sess)
    await session.flush()

    access = create_access_token(user_uid=user.uid, company_uid=company.uid, session_id=sess.uid)
    return TokenBundle(
        access_token=access,
        refresh_token=refresh,
        token_type="Bearer",
        expires_in=settings.access_token_minutes * 60,
        user_uid=user.uid,
        user_name=user.full_name,
        company_uid=company.uid,
        company_id=company.id,
    )


async def authenticate(
    session: AsyncSession,
    *,
    login_id: str,
    password: str,
    company_uid: str | None,
    ip: str | None = None,
) -> TokenBundle:
    # Same response for unknown account and wrong password (no enumeration, V1-IAM-BR-006).
    generic = UnauthenticatedError("Incorrect login id or password.")

    user = (
        await session.execute(
            select(SysUser).where(
                SysUser.login_id == login_id.strip(), SysUser.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if user is None:
        raise generic
    if user.locked_until and user.locked_until > utcnow():
        raise UnauthenticatedError("Account is temporarily locked. Try again later.")
    if user.status != UserStatus.ACTIVE.value:
        raise generic
    if not verify_password(password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= settings.max_login_attempts:
            user.locked_until = utcnow() + timedelta(minutes=settings.lockout_minutes)
        raise generic

    company_ids = await _company_scope(session, user.id)
    if not company_ids:
        raise ForbiddenError("User has no company access configured.")

    if company_uid:
        company = await _load_company(session, company_uid)
        if company is None or company.id not in company_ids:
            raise ForbiddenError("User is not permitted to sign into this company.")
    else:
        default_id = (
            user.default_company_id
            if user.default_company_id in company_ids
            else next(iter(company_ids))
        )
        from app.modules.organisation.infrastructure.models import SysCompany

        company = (
            await session.execute(select(SysCompany).where(SysCompany.id == default_id))
        ).scalar_one()

    user.failed_attempts = 0
    user.locked_until = None
    user.last_login_at = utcnow()
    _audit_login(
        session,
        company_id=company.id,
        user_id=user.id,
        user_name=user.full_name,
        action=AuditAction.LOGIN,
        ip=ip,
    )
    return await _issue_tokens(session, user, company, ip=ip)


async def rotate_refresh(
    session: AsyncSession, *, refresh_token: str, ip: str | None = None
) -> TokenBundle:
    token_hash = _hash_refresh(refresh_token)
    sess = (
        await session.execute(select(SysSession).where(SysSession.refresh_token_hash == token_hash))
    ).scalar_one_or_none()
    if sess is None or sess.revoked_at is not None or sess.expires_at <= utcnow():
        raise UnauthenticatedError("Refresh token is invalid or expired.")

    sess.revoked_at = utcnow()  # rotation: the presented refresh token is now dead
    user = (await session.execute(select(SysUser).where(SysUser.id == sess.user_id))).scalar_one()
    if user.status != UserStatus.ACTIVE.value:
        raise UnauthenticatedError("User is not active.")
    from app.modules.organisation.infrastructure.models import SysCompany

    company = (
        await session.execute(select(SysCompany).where(SysCompany.id == sess.company_id))
    ).scalar_one()
    return await _issue_tokens(session, user, company, ip=ip)


async def logout(session: AsyncSession, *, refresh_token: str) -> None:
    token_hash = _hash_refresh(refresh_token)
    sess = (
        await session.execute(select(SysSession).where(SysSession.refresh_token_hash == token_hash))
    ).scalar_one_or_none()
    if sess is not None and sess.revoked_at is None:
        sess.revoked_at = utcnow()
        user = (
            await session.execute(select(SysUser).where(SysUser.id == sess.user_id))
        ).scalar_one_or_none()
        if user is not None:
            _audit_login(
                session,
                company_id=sess.company_id,
                user_id=sess.user_id,
                user_name=user.full_name,
                action=AuditAction.LOGOUT,
                ip=None,
            )
