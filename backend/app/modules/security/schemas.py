from __future__ import annotations

from pydantic import Field

from app.core.schema import ApiModel, InModel


class IpRange(ApiModel):
    cidr: str
    label: str | None = None


class SecurityPolicyOut(ApiModel):
    uid: str
    version: int
    password_min_length: int
    password_require_upper: bool
    password_require_lower: bool
    password_require_number: bool
    password_require_symbol: bool
    password_expiry_days: int
    password_history_count: int
    block_identifiers_in_password: bool
    session_idle_minutes: int
    session_max_concurrent: int
    ip_allow_list: list[IpRange] = Field(default_factory=list)
    ip_deny_list: list[IpRange] = Field(default_factory=list)
    mfa_required_for: list[str] = Field(default_factory=list)


class IpRangeIn(InModel):
    cidr: str = Field(..., max_length=64)
    label: str | None = Field(default=None, max_length=100)


class SecurityPolicyUpdate(InModel):
    version: int = Field(..., ge=1)
    password_min_length: int | None = Field(default=None, ge=4, le=64)
    password_require_upper: bool | None = None
    password_require_lower: bool | None = None
    password_require_number: bool | None = None
    password_require_symbol: bool | None = None
    password_expiry_days: int | None = Field(default=None, ge=0, le=365)
    password_history_count: int | None = Field(default=None, ge=0, le=24)
    block_identifiers_in_password: bool | None = None
    session_idle_minutes: int | None = Field(default=None, ge=1, le=240)
    session_max_concurrent: int | None = Field(default=None, ge=1, le=50)
    ip_allow_list: list[IpRangeIn] | None = None
    ip_deny_list: list[IpRangeIn] | None = None
    mfa_required_for: list[str] | None = None
