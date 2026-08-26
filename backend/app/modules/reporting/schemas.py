from __future__ import annotations

from pydantic import Field

from app.core.schema import ApiModel


class NameCount(ApiModel):
    label: str
    count: int


class OrgCount(ApiModel):
    total: int
    active: int


class UsersReport(ApiModel):
    total: int
    active: int
    inactive: int
    by_type: list[NameCount] = Field(default_factory=list)


class RoleRow(ApiModel):
    code: str
    name: str
    permission_count: int
    user_count: int


class OrgReport(ApiModel):
    branches: OrgCount
    plants: OrgCount
    warehouses: OrgCount
    departments: OrgCount
    cost_centres: OrgCount


class AuditReport(ApiModel):
    total: int
    last_7_days: int
    actors: int
    by_action: list[NameCount] = Field(default_factory=list)


class AdminReportsOut(ApiModel):
    users: UsersReport
    roles_total: int
    roles: list[RoleRow] = Field(default_factory=list)
    organisation: OrgReport
    audit: AuditReport
