"""IAM management use cases: users, roles, permission catalogue, and grants.

Scope: roles and users are visible within the caller's active company. Users are
installation-level records linked to a company through `sys_user_company`; roles
carry a nullable `company_id` (a null company means a global/shared role).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import CoreAuditLog, record_audit
from app.core.context import TenantContext
from app.core.enums import AuditAction, PermissionEffect, RoleType, UserStatus, UserType
from app.core.errors import (
    ConcurrentModificationError,
    DuplicateError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.ids import new_uid
from app.core.security import hash_password
from app.core.time import utcnow
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import (
    SysApiKey,
    SysDelegation,
    SysPermission,
    SysRole,
    SysRolePermission,
    SysSession,
    SysSodRule,
    SysUser,
    SysUserCompany,
    SysUserRole,
)


def _check_version(entity: Any, expected: int | None) -> None:
    if expected is not None and entity.version != expected:
        raise ConcurrentModificationError(
            "Record was modified by another user.",
            extra={"current_version": entity.version, "your_version": expected},
        )


# ─────────────────────────── Permissions ────────────────────────────────────
class PermissionService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def list_page(self) -> list[SysPermission]:
        rows = await self.session.execute(
            select(SysPermission).order_by(
                SysPermission.module, SysPermission.entity, SysPermission.action
            )
        )
        return list(rows.scalars().all())


# ─────────────────────────── Roles ──────────────────────────────────────────
class RoleService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    def _scope(self):
        return or_(SysRole.company_id == self.ctx.company_id, SysRole.company_id.is_(None))

    async def list_page(self) -> list[dict[str, Any]]:
        rows = await self.session.execute(
            select(SysRole)
            .where(SysRole.deleted_at.is_(None), self._scope())
            .order_by(SysRole.code)
        )
        roles = list(rows.scalars().all())
        count_rows = await self.session.execute(
            select(SysRolePermission.role_id, func.count())
            .where(
                SysRolePermission.role_id.in_([r.id for r in roles] or [0]),
                SysRolePermission.effect == PermissionEffect.ALLOW.value,
            )
            .group_by(SysRolePermission.role_id)
        )
        counts: dict[int, int] = {}
        for rid, cnt in count_rows.all():
            counts[rid] = cnt
        return [{"role": r, "permission_count": int(counts.get(r.id, 0))} for r in roles]

    async def _get_or_404(self, uid: str) -> SysRole:
        row = await self.session.execute(
            select(SysRole).where(SysRole.uid == uid, SysRole.deleted_at.is_(None), self._scope())
        )
        role = row.scalar_one_or_none()
        if role is None:
            raise NotFoundError(f"Role '{uid}' not found")
        return role

    async def get(self, uid: str) -> SysRole:
        return await self._get_or_404(uid)

    async def create(self, data: Any) -> SysRole:
        code = data.code.strip().upper()
        exists = await self.session.execute(
            select(SysRole.id).where(
                func.lower(SysRole.code) == code.lower(),
                SysRole.company_id == self.ctx.company_id,
                SysRole.deleted_at.is_(None),
            )
        )
        if exists.first():
            raise DuplicateError(f"Role code '{code}' already exists.")
        now = utcnow()
        role = SysRole(
            uid=new_uid(),
            company_id=self.ctx.company_id,
            code=code,
            name=data.name.strip(),
            role_type=(data.role_type or RoleType.INTERNAL.value),
            is_active=True,
            version=1,
            created_at=now,
            created_by=self.ctx.user_id,
            updated_at=now,
            updated_by=self.ctx.user_id,
        )
        self.session.add(role)
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.CREATE, entity_type="sys_role",
            entity_id=role.id, entity_uid=role.uid,
            new_values={"code": role.code, "name": role.name},
        )
        return role

    async def update(self, uid: str, data: Any) -> SysRole:
        role = await self._get_or_404(uid)
        _check_version(role, data.version)
        if data.name is not None:
            role.name = data.name.strip()
        if data.role_type is not None:
            role.role_type = data.role_type
        role.version += 1
        role.updated_at = utcnow()
        role.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.UPDATE, entity_type="sys_role",
            entity_id=role.id, entity_uid=role.uid, new_values={"name": role.name},
        )
        return role

    async def set_active(self, uid: str, *, active: bool, version: int | None) -> SysRole:
        role = await self._get_or_404(uid)
        _check_version(role, version)
        if not active:
            # Where-used check (CLAUDE.md §5.1): don't strip access silently — a role
            # still held by active users cannot be deactivated.
            in_use = (
                await self.session.execute(
                    select(func.count())
                    .select_from(SysUserRole)
                    .join(SysUser, SysUser.id == SysUserRole.user_id)
                    .where(
                        SysUserRole.role_id == role.id,
                        SysUser.deleted_at.is_(None),
                        SysUser.status == UserStatus.ACTIVE.value,
                    )
                )
            ).scalar() or 0
            if in_use:
                from app.core.errors import BusinessRuleViolationError

                raise BusinessRuleViolationError(
                    f"Role '{role.code}' is still assigned to {in_use} active "
                    f"user(s). Reassign them before deactivating it.",
                    rule_code="V1-IAM-BR",
                )
        role.is_active = active
        role.version += 1
        role.updated_at = utcnow()
        role.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx,
            action=AuditAction.UPDATE, entity_type="sys_role",
            entity_id=role.id, entity_uid=role.uid,
            reason="deactivate" if not active else "restore",
        )
        return role

    async def permission_codes(self, uid: str) -> list[str]:
        role = await self._get_or_404(uid)
        rows = await self.session.execute(
            select(SysRolePermission.permission_code).where(
                SysRolePermission.role_id == role.id,
                SysRolePermission.effect == PermissionEffect.ALLOW.value,
            )
        )
        return sorted(rows.scalars().all())

    async def matrix(self) -> list[dict[str, Any]]:
        """Every in-scope role with its granted permission codes, in one round-trip
        (powers the Permission explorer). Avoids an N+1 of per-role code queries."""
        rows = await self.session.execute(
            select(SysRole)
            .where(SysRole.deleted_at.is_(None), self._scope())
            .order_by(SysRole.code)
        )
        roles = list(rows.scalars().all())
        ids = [r.id for r in roles] or [0]
        perm_rows = await self.session.execute(
            select(SysRolePermission.role_id, SysRolePermission.permission_code).where(
                SysRolePermission.role_id.in_(ids),
                SysRolePermission.effect == PermissionEffect.ALLOW.value,
            )
        )
        by_role: dict[int, list[str]] = {}
        for rid, code in perm_rows.all():
            by_role.setdefault(rid, []).append(code)
        return [
            {"uid": r.uid, "code": r.code, "name": r.name, "codes": sorted(by_role.get(r.id, []))}
            for r in roles
        ]

    async def set_permissions(self, uid: str, codes: list[str]) -> list[str]:
        """Replace the role's ALLOW grants with exactly `codes` (the matrix save)."""
        role = await self._get_or_404(uid)
        valid = perm_cat.ALL_CODES
        unknown = [c for c in codes if c not in valid]
        if unknown:
            raise ValidationFailedError(
                "Unknown permission codes.",
                errors=[{"field": "codes", "code": "unknown", "message": ", ".join(unknown[:5])}],
            )
        await self.session.execute(
            delete(SysRolePermission).where(SysRolePermission.role_id == role.id)
        )
        for code in sorted(set(codes)):
            self.session.add(
                SysRolePermission(
                    role_id=role.id, permission_code=code, effect=PermissionEffect.ALLOW.value
                )
            )
        role.version += 1
        role.updated_at = utcnow()
        role.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.PERMISSION_CHANGE, entity_type="sys_role",
            entity_id=role.id, entity_uid=role.uid, new_values={"granted": len(set(codes))},
        )
        return sorted(set(codes))


# ─────────────────────────── Users ──────────────────────────────────────────
class UserService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def _company_user_ids(self) -> list[int]:
        rows = await self.session.execute(
            select(SysUserCompany.user_id).where(SysUserCompany.company_id == self.ctx.company_id)
        )
        return list(rows.scalars().all())

    async def _roles_of(self, user_id: int) -> list[str]:
        rows = await self.session.execute(
            select(SysRole.code)
            .join(SysUserRole, SysUserRole.role_id == SysRole.id)
            .where(SysUserRole.user_id == user_id, SysRole.deleted_at.is_(None))
        )
        return sorted(rows.scalars().all())

    async def list_page(self) -> list[dict[str, Any]]:
        ids = await self._company_user_ids()
        if not ids:
            return []
        rows = await self.session.execute(
            select(SysUser)
            .where(SysUser.id.in_(ids), SysUser.deleted_at.is_(None))
            .order_by(SysUser.login_id)
        )
        users = list(rows.scalars().all())
        return [{"user": u, "roles": await self._roles_of(u.id)} for u in users]

    async def _get_or_404(self, uid: str) -> SysUser:
        ids = await self._company_user_ids()
        row = await self.session.execute(
            select(SysUser).where(
                SysUser.uid == uid, SysUser.deleted_at.is_(None), SysUser.id.in_(ids or [0])
            )
        )
        user = row.scalar_one_or_none()
        if user is None:
            raise NotFoundError(f"User '{uid}' not found")
        return user

    async def get(self, uid: str) -> dict[str, Any]:
        user = await self._get_or_404(uid)
        return {"user": user, "roles": await self._roles_of(user.id)}

    async def _resolve_role_ids(self, role_uids: list[str]) -> list[int]:
        if not role_uids:
            return []
        rows = await self.session.execute(
            select(SysRole.id).where(
                SysRole.uid.in_(role_uids),
                SysRole.deleted_at.is_(None),
                or_(SysRole.company_id == self.ctx.company_id, SysRole.company_id.is_(None)),
            )
        )
        return list(rows.scalars().all())

    async def create(self, data: Any) -> dict[str, Any]:
        login_id = data.login_id.strip()
        exists = await self.session.execute(
            select(SysUser.id).where(SysUser.login_id == login_id, SysUser.deleted_at.is_(None))
        )
        if exists.first():
            raise DuplicateError(f"Login id '{login_id}' already exists.")
        # Enforce the company's password policy (CLAUDE.md §5.3 security controls).
        from app.modules.security.service import SecurityPolicyService

        await SecurityPolicyService(self.session, self.ctx).validate_password(
            data.password, login_id=login_id, full_name=data.full_name
        )
        now = utcnow()
        user = SysUser(
            uid=new_uid(),
            login_id=login_id,
            email=data.email.strip(),
            full_name=data.full_name.strip(),
            password_hash=hash_password(data.password),
            user_type=(data.user_type or UserType.INTERNAL.value),
            status=UserStatus.ACTIVE.value,
            default_company_id=self.ctx.company_id,
            version=1,
            created_at=now,
            created_by=self.ctx.user_id,
            updated_at=now,
            updated_by=self.ctx.user_id,
        )
        self.session.add(user)
        await self.session.flush()
        self.session.add(
            SysUserCompany(user_id=user.id, company_id=self.ctx.company_id, is_default=True)
        )
        for role_id in await self._resolve_role_ids(data.role_uids or []):
            self.session.add(
                SysUserRole(user_id=user.id, role_id=role_id, company_id=self.ctx.company_id)
            )
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.CREATE, entity_type="sys_user",
            entity_id=user.id, entity_uid=user.uid, new_values={"login_id": user.login_id},
        )
        return {"user": user, "roles": await self._roles_of(user.id)}

    async def update(self, uid: str, data: Any) -> dict[str, Any]:
        user = await self._get_or_404(uid)
        _check_version(user, data.version)
        if data.full_name is not None:
            user.full_name = data.full_name.strip()
        if data.email is not None:
            user.email = data.email.strip()
        if data.user_type is not None:
            user.user_type = data.user_type
        user.version += 1
        user.updated_at = utcnow()
        user.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.UPDATE, entity_type="sys_user",
            entity_id=user.id, entity_uid=user.uid, new_values={"full_name": user.full_name},
        )
        return {"user": user, "roles": await self._roles_of(user.id)}

    async def set_status(self, uid: str, *, active: bool, version: int | None) -> dict[str, Any]:
        user = await self._get_or_404(uid)
        _check_version(user, version)
        if user.id == self.ctx.user_id and not active:
            from app.core.errors import BusinessRuleViolationError

            raise BusinessRuleViolationError("You cannot deactivate your own account.")
        user.status = UserStatus.ACTIVE.value if active else UserStatus.DEACTIVATED.value
        user.version += 1
        user.updated_at = utcnow()
        user.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.UPDATE, entity_type="sys_user",
            entity_id=user.id, entity_uid=user.uid,
            reason="deactivate" if not active else "restore",
        )
        return {"user": user, "roles": await self._roles_of(user.id)}

    async def set_roles(self, uid: str, role_uids: list[str]) -> dict[str, Any]:
        user = await self._get_or_404(uid)
        role_ids = await self._resolve_role_ids(role_uids)
        await self.session.execute(
            delete(SysUserRole).where(
                SysUserRole.user_id == user.id,
                or_(
                    SysUserRole.company_id == self.ctx.company_id, SysUserRole.company_id.is_(None)
                ),
            )
        )
        for role_id in role_ids:
            self.session.add(
                SysUserRole(user_id=user.id, role_id=role_id, company_id=self.ctx.company_id)
            )
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.PERMISSION_CHANGE, entity_type="sys_user",
            entity_id=user.id, entity_uid=user.uid, new_values={"roles": len(role_ids)},
        )
        return {"user": user, "roles": await self._roles_of(user.id)}

    async def reset_password(self, uid: str, new_password: str) -> None:
        user = await self._get_or_404(uid)
        from app.modules.security.service import SecurityPolicyService

        await SecurityPolicyService(self.session, self.ctx).validate_password(
            new_password, login_id=user.login_id, full_name=user.full_name
        )
        user.password_hash = hash_password(new_password)
        user.version += 1
        user.updated_at = utcnow()
        user.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.UPDATE, entity_type="sys_user",
            entity_id=user.id, entity_uid=user.uid, reason="password reset",
        )


# ─────────────────────────── Sessions ───────────────────────────────────────
class SessionService:
    """Live login sessions (the DB-backed refresh-token sessions). Admins can see
    every session in their company and force-revoke one."""

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def list_page(self) -> list[dict[str, Any]]:
        rows = await self.session.execute(
            select(SysSession, SysUser)
            .join(SysUser, SysUser.id == SysSession.user_id)
            .where(SysSession.company_id == self.ctx.company_id)
            .order_by(SysSession.issued_at.desc())
            .limit(200)
        )
        now = utcnow()
        current = getattr(self.ctx, "session_id", None)
        out: list[dict[str, Any]] = []
        for sess, user in rows.all():
            if sess.revoked_at is not None:
                status = "REVOKED"
            elif sess.expires_at <= now:
                status = "EXPIRED"
            else:
                status = "ACTIVE"
            out.append(
                {"sess": sess, "user": user, "status": status, "is_current": sess.uid == current}
            )
        return out

    async def revoke(self, uid: str) -> None:
        row = await self.session.execute(
            select(SysSession).where(
                SysSession.uid == uid, SysSession.company_id == self.ctx.company_id
            )
        )
        sess = row.scalar_one_or_none()
        if sess is None:
            raise NotFoundError(f"Session '{uid}' not found")
        if sess.revoked_at is None:
            sess.revoked_at = utcnow()
            await self.session.flush()
            await record_audit(
                self.session,
                self.ctx,
                action=AuditAction.UPDATE,
                entity_type="sys_session",
                entity_id=sess.id,
                entity_uid=sess.uid,
                reason="session revoked",
            )


# ─────────────────────────── Login activity ─────────────────────────────────
class LoginActivityService:
    """Read the login/logout/failed-login events from the append-only audit log."""

    _ACTIONS = ("LOGIN", "LOGOUT", "LOGIN_FAILED")

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def list_page(self) -> list[CoreAuditLog]:
        rows = await self.session.execute(
            select(CoreAuditLog)
            .where(
                CoreAuditLog.company_id == self.ctx.company_id,
                CoreAuditLog.action.in_(self._ACTIONS),
            )
            .order_by(CoreAuditLog.occurred_at.desc())
            .limit(200)
        )
        return list(rows.scalars().all())


class AuditService:
    """Read the append-only audit trail (`core_audit_log`). Read-only by design —
    the app DB user has no UPDATE/DELETE on this table (CLAUDE.md §5.3)."""

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def list_page(
        self,
        *,
        entity_type: str | None = None,
        action: str | None = None,
        actor: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        search: str | None = None,
        limit: int = 200,
    ) -> list[CoreAuditLog]:
        stmt = select(CoreAuditLog).where(CoreAuditLog.company_id == self.ctx.company_id)
        if entity_type:
            stmt = stmt.where(CoreAuditLog.entity_type == entity_type)
        if action:
            stmt = stmt.where(CoreAuditLog.action == action)
        if actor:
            stmt = stmt.where(CoreAuditLog.actor_name == actor)
        if from_date:
            stmt = stmt.where(CoreAuditLog.occurred_at >= datetime.combine(from_date, time.min))
        if to_date:
            stmt = stmt.where(CoreAuditLog.occurred_at <= datetime.combine(to_date, time.max))
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                or_(
                    CoreAuditLog.document_no.ilike(like),
                    CoreAuditLog.entity_uid.ilike(like),
                    CoreAuditLog.entity_type.ilike(like),
                    CoreAuditLog.correlation_id.ilike(like),
                    CoreAuditLog.actor_name.ilike(like),
                )
            )
        stmt = stmt.order_by(CoreAuditLog.occurred_at.desc()).limit(min(limit, 500))
        return list((await self.session.execute(stmt)).scalars().all())

    async def filter_options(self) -> dict[str, list[str]]:
        async def _distinct(col: Any) -> list[str]:
            rows = await self.session.execute(
                select(col)
                .where(CoreAuditLog.company_id == self.ctx.company_id, col.isnot(None))
                .distinct()
                .order_by(col)
            )
            return [r for r in rows.scalars().all() if r]

        return {
            "entities": await _distinct(CoreAuditLog.entity_type),
            "actions": await _distinct(CoreAuditLog.action),
            "actors": await _distinct(CoreAuditLog.actor_name),
        }


# ─────────────────────────── API keys ───────────────────────────────────────
class ApiKeyService:
    """Issue-once machine credentials. Only the SHA-256 hash of the secret is
    stored; the plaintext is returned exactly once at creation."""

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    @staticmethod
    def _hash(secret: str) -> str:
        return hashlib.sha256(secret.encode()).hexdigest()

    def _status(self, k: SysApiKey) -> str:
        if k.revoked_at is not None:
            return "REVOKED"
        if k.expires_at is not None and k.expires_at <= utcnow():
            return "EXPIRED"
        return "ACTIVE"

    async def list_page(self) -> list[dict[str, Any]]:
        rows = await self.session.execute(
            select(SysApiKey)
            .where(SysApiKey.company_id == self.ctx.company_id, SysApiKey.deleted_at.is_(None))
            .order_by(SysApiKey.created_at.desc())
        )
        keys = list(rows.scalars().all())
        role_ids = [k.role_id for k in keys if k.role_id]
        role_codes: dict[int, str] = {}
        if role_ids:
            rrows = await self.session.execute(
                select(SysRole.id, SysRole.code).where(SysRole.id.in_(role_ids))
            )
            for rid, code in rrows.all():
                role_codes[rid] = code
        return [
            {"key": k, "role_code": role_codes.get(k.role_id) if k.role_id else None,
             "status": self._status(k)}
            for k in keys
        ]

    async def issue(self, data: Any) -> tuple[SysApiKey, str]:
        role_id: int | None = None
        if data.role_uid:
            role = (
                await self.session.execute(
                    select(SysRole).where(
                        SysRole.uid == data.role_uid,
                        SysRole.deleted_at.is_(None),
                        or_(
                            SysRole.company_id == self.ctx.company_id, SysRole.company_id.is_(None)
                        ),
                    )
                )
            ).scalar_one_or_none()
            if role is None:
                raise ValidationFailedError(
                    "Role not found.",
                    errors=[{"field": "role_uid", "code": "not_found", "message": "Unknown role"}],
                )
            role_id = role.id

        name = data.name.strip()
        exists = await self.session.execute(
            select(SysApiKey.id).where(
                func.lower(SysApiKey.name) == name.lower(),
                SysApiKey.company_id == self.ctx.company_id,
                SysApiKey.deleted_at.is_(None),
            )
        )
        if exists.first():
            raise DuplicateError(f"An API key named '{name}' already exists.")

        secret = "ssb_" + secrets.token_urlsafe(32)
        now = utcnow()
        entity = SysApiKey(
            uid=new_uid(),
            company_id=self.ctx.company_id,
            name=name,
            prefix=secret[:12],
            key_hash=self._hash(secret),
            role_id=role_id,
            expires_at=data.expires_at,
            is_active=True,
            version=1,
            created_at=now,
            created_by=self.ctx.user_id,
            updated_at=now,
            updated_by=self.ctx.user_id,
        )
        self.session.add(entity)
        await self.session.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_api_key",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values={"name": name, "prefix": entity.prefix},
        )
        return entity, secret

    async def revoke(self, uid: str) -> None:
        key = (
            await self.session.execute(
                select(SysApiKey).where(
                    SysApiKey.uid == uid, SysApiKey.company_id == self.ctx.company_id
                )
            )
        ).scalar_one_or_none()
        if key is None:
            raise NotFoundError(f"API key '{uid}' not found")
        if key.revoked_at is None:
            key.revoked_at = utcnow()
            key.is_active = False
            key.updated_at = utcnow()
            key.updated_by = self.ctx.user_id
            await self.session.flush()
            await record_audit(
                self.session,
                self.ctx,
                action=AuditAction.UPDATE,
                entity_type="sys_api_key",
                entity_id=key.id,
                entity_uid=key.uid,
                reason="api key revoked",
            )


# ─────────────────────────── Segregation of duties ──────────────────────────
class SodService:
    """Segregation-of-duties rules and their live violations (users who effectively
    hold both permissions of a rule, via any of their roles)."""

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def _effective_by_user(self) -> dict[int, dict[str, Any]]:
        user_ids = list(
            (
                await self.session.execute(
                    select(SysUserCompany.user_id).where(
                        SysUserCompany.company_id == self.ctx.company_id
                    )
                )
            )
            .scalars()
            .all()
        )
        if not user_ids:
            return {}
        users = list(
            (
                await self.session.execute(
                    select(SysUser).where(SysUser.id.in_(user_ids), SysUser.deleted_at.is_(None))
                )
            )
            .scalars()
            .all()
        )
        roles_by_user: dict[int, list[int]] = {}
        role_ids: set[int] = set()
        for uid_, rid in (
            await self.session.execute(
                select(SysUserRole.user_id, SysUserRole.role_id).where(
                    SysUserRole.user_id.in_(user_ids)
                )
            )
        ).all():
            roles_by_user.setdefault(uid_, []).append(rid)
            role_ids.add(rid)
        perms_by_role: dict[int, set[str]] = {}
        if role_ids:
            for rid, code in (
                await self.session.execute(
                    select(SysRolePermission.role_id, SysRolePermission.permission_code).where(
                        SysRolePermission.role_id.in_(role_ids),
                        SysRolePermission.effect == PermissionEffect.ALLOW.value,
                    )
                )
            ).all():
                perms_by_role.setdefault(rid, set()).add(code)
        out: dict[int, dict[str, Any]] = {}
        for u in users:
            eff: set[str] = set()
            for rid in roles_by_user.get(u.id, []):
                eff |= perms_by_role.get(rid, set())
            out[u.id] = {"full_name": u.full_name, "login_id": u.login_id, "codes": eff}
        return out

    async def _rules(self) -> list[SysSodRule]:
        rows = await self.session.execute(
            select(SysSodRule)
            .where(SysSodRule.company_id == self.ctx.company_id, SysSodRule.deleted_at.is_(None))
            .order_by(SysSodRule.name)
        )
        return list(rows.scalars().all())

    async def list_rules(self) -> list[dict[str, Any]]:
        rules = await self._rules()
        eff = await self._effective_by_user()
        out: list[dict[str, Any]] = []
        for r in rules:
            violators = (
                [
                    d["full_name"]
                    for d in eff.values()
                    if r.permission_a in d["codes"] and r.permission_b in d["codes"]
                ]
                if r.is_active
                else []
            )
            out.append({"rule": r, "violators": violators})
        return out

    async def create(self, data: Any) -> SysSodRule:
        a, b = data.permission_a, data.permission_b
        if a == b:
            raise ValidationFailedError(
                "A rule must reference two different permissions.",
                errors=[{"field": "permission_b", "code": "same", "message": "Must differ from A"}],
            )
        unknown = [c for c in (a, b) if c not in perm_cat.ALL_CODES]
        if unknown:
            raise ValidationFailedError(
                "Unknown permission code(s).",
                errors=[
                    {"field": "permission_a", "code": "unknown", "message": ", ".join(unknown)}
                ],
            )
        name = data.name.strip()
        exists = await self.session.execute(
            select(SysSodRule.id).where(
                func.lower(SysSodRule.name) == name.lower(),
                SysSodRule.company_id == self.ctx.company_id,
                SysSodRule.deleted_at.is_(None),
            )
        )
        if exists.first():
            raise DuplicateError(f"An SoD rule named '{name}' already exists.")
        now = utcnow()
        rule = SysSodRule(
            uid=new_uid(),
            company_id=self.ctx.company_id,
            name=name,
            permission_a=a,
            permission_b=b,
            severity=(data.severity or "BLOCK"),
            description=(data.description or None),
            is_active=True,
            version=1,
            created_at=now,
            created_by=self.ctx.user_id,
            updated_at=now,
            updated_by=self.ctx.user_id,
        )
        self.session.add(rule)
        await self.session.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_sod_rule",
            entity_id=rule.id,
            entity_uid=rule.uid,
            new_values={"name": name, "pair": f"{a} + {b}", "severity": rule.severity},
        )
        return rule

    async def _get_or_404(self, uid: str) -> SysSodRule:
        rule = (
            await self.session.execute(
                select(SysSodRule).where(
                    SysSodRule.uid == uid,
                    SysSodRule.company_id == self.ctx.company_id,
                    SysSodRule.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if rule is None:
            raise NotFoundError(f"SoD rule '{uid}' not found")
        return rule

    async def set_active(self, uid: str, *, active: bool, version: int | None) -> SysSodRule:
        rule = await self._get_or_404(uid)
        if version is not None and rule.version != version:
            from app.core.errors import ConcurrentModificationError

            raise ConcurrentModificationError("Record was modified by another user.")
        rule.is_active = active
        rule.version += 1
        rule.updated_at = utcnow()
        rule.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_sod_rule",
            entity_id=rule.id,
            entity_uid=rule.uid,
            reason="deactivate" if not active else "restore",
        )
        return rule


# ─────────────────────────── Delegations ────────────────────────────────────
class DelegationService:
    """Delegation of approval authority between users. Stored here; the Workflow
    engine (a later module) is what will actually reroute approvals — until then a
    delegation is a recorded intent, not yet enforced."""

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def _company_user_ids(self) -> list[int]:
        rows = await self.session.execute(
            select(SysUserCompany.user_id).where(SysUserCompany.company_id == self.ctx.company_id)
        )
        return list(rows.scalars().all())

    def _status(self, d: SysDelegation) -> str:
        if not d.is_active:
            return "REVOKED"
        today = utcnow().date()
        if d.valid_from > today:
            return "SCHEDULED"
        if d.valid_to < today:
            return "EXPIRED"
        return "ACTIVE"

    async def list_page(self) -> list[dict[str, Any]]:
        rows = await self.session.execute(
            select(SysDelegation)
            .where(
                SysDelegation.company_id == self.ctx.company_id,
                SysDelegation.deleted_at.is_(None),
            )
            .order_by(SysDelegation.valid_from.desc())
        )
        dels = list(rows.scalars().all())
        ids = {d.from_user_id for d in dels} | {d.to_user_id for d in dels}
        names: dict[int, str] = {}
        if ids:
            for uid_, full_name in (
                await self.session.execute(
                    select(SysUser.id, SysUser.full_name).where(SysUser.id.in_(ids))
                )
            ).all():
                names[uid_] = full_name
        return [
            {
                "del": d,
                "from_name": names.get(d.from_user_id, "?"),
                "to_name": names.get(d.to_user_id, "?"),
                "status": self._status(d),
            }
            for d in dels
        ]

    async def _user_or_error(self, uid: str, field: str) -> SysUser:
        ids = await self._company_user_ids()
        user = (
            await self.session.execute(
                select(SysUser).where(
                    SysUser.uid == uid,
                    SysUser.deleted_at.is_(None),
                    SysUser.id.in_(ids or [0]),
                )
            )
        ).scalar_one_or_none()
        if user is None:
            raise ValidationFailedError(
                "User not found in this company.",
                errors=[{"field": field, "code": "not_found", "message": "Unknown user"}],
            )
        return user

    async def create(self, data: Any) -> SysDelegation:
        from_user = await self._user_or_error(data.from_user_uid, "from_user_uid")
        to_user = await self._user_or_error(data.to_user_uid, "to_user_uid")
        if from_user.id == to_user.id:
            raise ValidationFailedError(
                "A user cannot delegate to themselves.",
                errors=[
                    {"field": "to_user_uid", "code": "same", "message": "Pick a different user"}
                ],
            )
        if data.valid_to < data.valid_from:
            raise ValidationFailedError(
                "The end date must be on or after the start date.",
                errors=[{"field": "valid_to", "code": "range", "message": "End before start"}],
            )
        now = utcnow()
        entity = SysDelegation(
            uid=new_uid(),
            company_id=self.ctx.company_id,
            from_user_id=from_user.id,
            to_user_id=to_user.id,
            valid_from=data.valid_from,
            valid_to=data.valid_to,
            reason=(data.reason or None),
            is_active=True,
            version=1,
            created_at=now,
            created_by=self.ctx.user_id,
            updated_at=now,
            updated_by=self.ctx.user_id,
        )
        self.session.add(entity)
        await self.session.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_delegation",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values={"from": from_user.login_id, "to": to_user.login_id},
        )
        return entity

    async def _get_or_404(self, uid: str) -> SysDelegation:
        d = (
            await self.session.execute(
                select(SysDelegation).where(
                    SysDelegation.uid == uid,
                    SysDelegation.company_id == self.ctx.company_id,
                    SysDelegation.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if d is None:
            raise NotFoundError(f"Delegation '{uid}' not found")
        return d

    async def set_active(self, uid: str, *, active: bool, version: int | None) -> SysDelegation:
        d = await self._get_or_404(uid)
        if version is not None and d.version != version:
            from app.core.errors import ConcurrentModificationError

            raise ConcurrentModificationError("Record was modified by another user.")
        d.is_active = active
        d.version += 1
        d.updated_at = utcnow()
        d.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_delegation",
            entity_id=d.id,
            entity_uid=d.uid,
            reason="revoke" if not active else "restore",
        )
        return d
