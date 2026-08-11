"""Minimal IAM persistence: just enough to authenticate a user, resolve their
company data-scope, and compute their effective permissions so Organisation
endpoints can be genuinely secured and tested (CLAUDE.md §5.4).

The full Identity & Access module (Volume 1 Ch 1 — MFA, delegations, SoD,
password policy, portal users, impersonation) is owned by another phase; this
slice deliberately implements only the authentication + RBAC + data-scope core
that Organisation depends on, and exposes it through a stable service contract.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, INTEGER
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, Entity
from app.core.enums import PermissionEffect, RoleType, UserStatus, UserType
from app.core.ids import new_uid


class SysUser(Entity):
    __tablename__ = "sys_user"

    login_id: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(150), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    user_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=UserType.INTERNAL.value
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=UserStatus.ACTIVE.value)

    default_company_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    failed_attempts: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)

    __table_args__ = ()


class SysPermission(Base):
    """Catalogue of `<MODULE>.<ENTITY>.<ACTION>` codes (global, no soft-delete)."""

    __tablename__ = "sys_permission"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)
    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    module: Mapped[str] = mapped_column(String(30), nullable=False)
    entity: Mapped[str] = mapped_column(String(40), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    label: Mapped[str] = mapped_column(String(150), nullable=False)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SysRole(Entity):
    __tablename__ = "sys_role"

    company_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    role_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=RoleType.INTERNAL.value
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SysRolePermission(Base):
    __tablename__ = "sys_role_permission"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    role_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    permission_code: Mapped[str] = mapped_column(String(100), nullable=False)
    effect: Mapped[str] = mapped_column(
        String(10), nullable=False, default=PermissionEffect.ALLOW.value
    )


class SysUserRole(Base):
    __tablename__ = "sys_user_role"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    role_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    # Optional restriction: a role that only applies inside one company.
    company_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)


class SysUserCompany(Base):
    """Which companies a user may act in — the data-scope allow-list (V0-BR-008)."""

    __tablename__ = "sys_user_company"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    company_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SysSession(Base):
    """Server-side session backing a rotating refresh token (CLAUDE.md §2)."""

    __tablename__ = "sys_session"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)
    user_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    company_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    issued_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
