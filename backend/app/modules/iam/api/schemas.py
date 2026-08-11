from __future__ import annotations

from app.core.schema import ApiModel, InModel


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
