"""Request-scoped tenant and user context.

Tenancy in MySQL has no row-level security, so `company_id` scoping is an
application-level control that MUST be applied on every read and write
(V0-DR-008). This module is the single source of truth for "who is asking,
and what may they see".
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Self

from app.core.enums import Channel, RowRule

_ctx: ContextVar[TenantContext | None] = ContextVar("tenant_context", default=None)


@dataclass(slots=True)
class TenantContext:
    """Everything the persistence and permission layers need about the caller."""

    user_id: int
    user_uid: str
    user_name: str
    login_id: str
    company_id: int
    company_uid: str

    branch_id: int | None = None
    plant_id: int | None = None
    warehouse_id: int | None = None
    financial_year_id: int | None = None

    session_id: str | None = None
    correlation_id: str = "-"
    channel: Channel = Channel.WEB
    ip_address: str | None = None
    user_agent: str | None = None

    # Effective authorisation snapshot, resolved server-side per request.
    permissions: frozenset[str] = field(default_factory=frozenset)
    denied_permissions: frozenset[str] = field(default_factory=frozenset)
    role_codes: frozenset[str] = field(default_factory=frozenset)
    role_ids: frozenset[int] = field(default_factory=frozenset)

    # Data scope (V0-BR-008)
    company_ids: frozenset[int] = field(default_factory=frozenset)
    branch_ids: frozenset[int] = field(default_factory=frozenset)
    plant_ids: frozenset[int] = field(default_factory=frozenset)
    warehouse_ids: frozenset[int] = field(default_factory=frozenset)
    cost_centre_ids: frozenset[int] = field(default_factory=frozenset)
    department_ids: frozenset[int] = field(default_factory=frozenset)
    row_rule: RowRule = RowRule.ALL

    # Portal hard restriction (V1-IAM-BR-009)
    supplier_id: int | None = None
    customer_id: int | None = None
    employee_id: int | None = None

    # Support impersonation (V1-IAM-FR-019)
    impersonated_by_user_id: int | None = None
    impersonated_by_name: str | None = None

    is_system: bool = False

    # ─── Authorisation helpers ──────────────────────────────────────────────
    def has(self, permission: str) -> bool:
        """Deny always wins over allow (V1-IAM-BR-003)."""
        if self.is_system:
            return True
        if permission in self.denied_permissions:
            return False
        return permission in self.permissions

    def has_any(self, *permissions: str) -> bool:
        return any(self.has(p) for p in permissions)

    def has_all(self, *permissions: str) -> bool:
        return all(self.has(p) for p in permissions)

    def in_company_scope(self, company_id: int) -> bool:
        return self.is_system or company_id in self.company_ids

    def in_branch_scope(self, branch_id: int | None) -> bool:
        if branch_id is None or self.is_system or not self.branch_ids:
            return True
        return branch_id in self.branch_ids

    def in_plant_scope(self, plant_id: int | None) -> bool:
        if plant_id is None or self.is_system or not self.plant_ids:
            return True
        return plant_id in self.plant_ids

    def in_warehouse_scope(self, warehouse_id: int | None) -> bool:
        if warehouse_id is None or self.is_system or not self.warehouse_ids:
            return True
        return warehouse_id in self.warehouse_ids

    @property
    def is_portal(self) -> bool:
        return self.supplier_id is not None or self.customer_id is not None

    @property
    def is_impersonated(self) -> bool:
        return self.impersonated_by_user_id is not None

    # ─── Context management ─────────────────────────────────────────────────
    def bind(self) -> None:
        _ctx.set(self)

    @classmethod
    def system(cls, company_id: int = 0, *, correlation_id: str = "-") -> Self:
        """Context for background jobs, migrations and seeding."""
        return cls(
            user_id=0,
            user_uid="00000000000000000000000000",
            user_name="SYSTEM",
            login_id="system",
            company_id=company_id,
            company_uid="",
            correlation_id=correlation_id,
            channel=Channel.SYSTEM,
            is_system=True,
        )


def get_context() -> TenantContext | None:
    return _ctx.get()


def require_context() -> TenantContext:
    ctx = _ctx.get()
    if ctx is None:
        raise RuntimeError(
            "No TenantContext bound. Every DB operation must run inside a request "
            "or an explicit system context."
        )
    return ctx


def set_context(ctx: TenantContext | None) -> None:
    _ctx.set(ctx)
