"""Security policy — one company-scoped settings row holding the account-security
rules (password strength, session limits, network allow/deny, MFA requirements).
Part of the Core Framework / platform services (CLAUDE.md §5)."""

from __future__ import annotations

from sqlalchemy import Boolean, UniqueConstraint
from sqlalchemy.dialects.mysql import JSON, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import CompanyEntity


def _tiny(default: int) -> Mapped[int]:
    return mapped_column(TINYINT(unsigned=True), nullable=False, default=default)


def _flag(default: bool) -> Mapped[bool]:
    return mapped_column(Boolean, nullable=False, default=default)


class SysSecurityPolicy(CompanyEntity):
    __tablename__ = "sys_security_policy"
    __table_args__ = (
        # One live policy per company (soft-delete-aware, CLAUDE.md §4.2).
        UniqueConstraint("company_id", "deleted_key", name="uk_security_policy_company"),
    )

    # ── Password policy ──────────────────────────────────────────────────────
    password_min_length: Mapped[int] = _tiny(8)
    password_require_upper: Mapped[bool] = _flag(False)
    password_require_lower: Mapped[bool] = _flag(True)
    password_require_number: Mapped[bool] = _flag(True)
    password_require_symbol: Mapped[bool] = _flag(False)
    password_expiry_days: Mapped[int] = _tiny(90)
    password_history_count: Mapped[int] = _tiny(3)
    block_identifiers_in_password: Mapped[bool] = _flag(True)

    # ── Session policy ───────────────────────────────────────────────────────
    session_idle_minutes: Mapped[int] = _tiny(30)
    session_max_concurrent: Mapped[int] = _tiny(3)

    # ── Network + MFA (JSON lists) ───────────────────────────────────────────
    # ip_allow_list / ip_deny_list: [{"cidr": "10.0.0.0/16", "label": "HQ"}]
    ip_allow_list: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    ip_deny_list: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    # mfa_required_for: ["INTERNAL", "SYSTEM"]  (user_type values)
    mfa_required_for: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
