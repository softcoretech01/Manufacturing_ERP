from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.schema import ApiModel, InModel
from app.core.validators import EmailStr, LoginIdStr


class SessionOut(ApiModel):
    uid: str
    user_login: str
    user_name: str
    ip_address: str | None
    issued_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    status: str
    is_current: bool


class LoginEventOut(ApiModel):
    uid: str
    action: str
    actor_name: str
    ip_address: str | None
    occurred_at: datetime


class AuditEntryOut(ApiModel):
    uid: str
    occurred_at: datetime
    actor_name: str
    action: str
    entity_type: str
    entity_uid: str | None
    document_no: str | None
    old_values: dict | None
    new_values: dict | None
    reason: str | None
    channel: str
    ip_address: str | None
    user_agent: str | None
    correlation_id: str


class ApiKeyCreate(InModel):
    name: str = Field(..., min_length=1, max_length=150)
    role_uid: str | None = Field(default=None, max_length=26)
    expires_at: datetime | None = None


class ApiKeyOut(ApiModel):
    uid: str
    name: str
    prefix: str
    role_code: str | None
    status: str
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime


class ApiKeyCreated(ApiKeyOut):
    secret: str  # the plaintext key — returned exactly once


class SodRuleCreate(InModel):
    name: str = Field(..., min_length=1, max_length=150)
    permission_a: str = Field(..., min_length=1, max_length=80)
    permission_b: str = Field(..., min_length=1, max_length=80)
    severity: str = Field(default="BLOCK")
    description: str | None = Field(default=None, max_length=500)


class SodRuleOut(ApiModel):
    uid: str
    name: str
    permission_a: str
    permission_b: str
    severity: str
    description: str | None
    is_active: bool
    version: int
    violation_count: int
    violators: list[str]


class DelegationCreate(InModel):
    from_user_uid: str = Field(..., min_length=1, max_length=26)
    to_user_uid: str = Field(..., min_length=1, max_length=26)
    valid_from: date
    valid_to: date
    reason: str | None = Field(default=None, max_length=500)


class DelegationOut(ApiModel):
    uid: str
    from_name: str
    to_name: str
    valid_from: date
    valid_to: date
    reason: str | None
    status: str
    is_active: bool
    version: int


class LoginRequest(InModel):
    login_id: str
    password: str
    company_uid: str | None = None


class RefreshRequest(InModel):
    refresh_token: str


class LogoutRequest(InModel):
    refresh_token: str


class TokenResponse(ApiModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user_uid: str
    user_name: str
    company_uid: str


class MeResponse(ApiModel):
    user_uid: str
    user_name: str
    login_id: str
    company_uid: str
    company_ids_count: int
    permissions: list[str]
    roles: list[int]


# ─────────────────────────── Versioned / deactivate ─────────────────────────
class VersionedUpdate(InModel):
    version: int = Field(..., ge=1)


class DeactivateRequest(InModel):
    version: int = Field(..., ge=1)
    reason: str | None = Field(default=None, max_length=500)


# ─────────────────────────── Permissions ────────────────────────────────────
class PermissionOut(ApiModel):
    uid: str
    code: str
    module: str
    entity: str
    action: str
    label: str
    is_sensitive: bool


# ─────────────────────────── Roles ──────────────────────────────────────────
class RoleCreate(InModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    role_type: str | None = None


class RoleUpdate(VersionedUpdate):
    name: str | None = Field(default=None, max_length=150)
    role_type: str | None = None


class RoleOut(ApiModel):
    uid: str
    code: str
    name: str
    role_type: str
    is_active: bool
    version: int
    permission_count: int = 0


class RolePermissionsBody(InModel):
    codes: list[str] = Field(default_factory=list)


# ─────────────────────────── Users ──────────────────────────────────────────
class UserCreate(InModel):
    login_id: LoginIdStr = Field(..., min_length=3, max_length=80)
    email: EmailStr = Field(..., min_length=3, max_length=150)
    full_name: str = Field(..., min_length=1, max_length=150)
    password: str = Field(..., min_length=8, max_length=200)
    user_type: str | None = None
    role_uids: list[str] = Field(default_factory=list)


class UserUpdate(VersionedUpdate):
    full_name: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = Field(default=None, max_length=150)
    user_type: str | None = None


class UserOut(ApiModel):
    uid: str
    login_id: str
    email: str
    full_name: str
    user_type: str
    status: str
    version: int
    roles: list[str] = Field(default_factory=list)
    mfa_enabled: bool = False
    last_login_at: datetime | None = None


class UserRolesBody(InModel):
    role_uids: list[str] = Field(default_factory=list)


class ResetPasswordBody(InModel):
    password: str = Field(..., min_length=8, max_length=200)
