"""Security-policy use cases: read (creating a default on first access), update
with optimistic locking, and a password validator used by the IAM module to
enforce the policy at user-create and password-reset time."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.errors import ConcurrentModificationError, ValidationFailedError
from app.core.ids import new_uid
from app.core.time import utcnow
from app.modules.security.models import SysSecurityPolicy

_DEFAULTS: dict[str, Any] = {
    "password_min_length": 8,
    "password_require_upper": False,
    "password_require_lower": True,
    "password_require_number": True,
    "password_require_symbol": False,
    "password_expiry_days": 90,
    "password_history_count": 3,
    "block_identifiers_in_password": True,
    "session_idle_minutes": 30,
    "session_max_concurrent": 3,
    "ip_allow_list": [],
    "ip_deny_list": [],
    "mfa_required_for": ["INTERNAL", "SYSTEM"],
}

# Fields a client may change via PUT.
_EDITABLE = set(_DEFAULTS)


class SecurityPolicyService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def get_or_create(self) -> SysSecurityPolicy:
        row = (
            await self.session.execute(
                select(SysSecurityPolicy).where(
                    SysSecurityPolicy.company_id == self.ctx.company_id,
                    SysSecurityPolicy.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if row is not None:
            return row
        now = utcnow()
        row = SysSecurityPolicy(
            uid=new_uid(),
            company_id=self.ctx.company_id,
            version=1,
            created_at=now,
            created_by=self.ctx.user_id,
            updated_at=now,
            updated_by=self.ctx.user_id,
            **_DEFAULTS,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def update(self, data: dict[str, Any], expected_version: int) -> SysSecurityPolicy:
        row = await self.get_or_create()
        if row.version != expected_version:
            raise ConcurrentModificationError(
                "Security policy was modified by another user.",
                extra={"current_version": row.version, "your_version": expected_version},
            )
        for key, value in data.items():
            if key in _EDITABLE and value is not None:
                setattr(row, key, value)
        row.version += 1
        row.updated_at = utcnow()
        row.updated_by = self.ctx.user_id
        await self.session.flush()
        return row

    # ── Enforcement ──────────────────────────────────────────────────────────
    async def validate_password(
        self, password: str, *, login_id: str | None = None, full_name: str | None = None
    ) -> None:
        """Raise ValidationFailedError if the password fails the company policy."""
        p = await self.get_or_create()
        errors: list[str] = []
        if len(password) < p.password_min_length:
            errors.append(f"at least {p.password_min_length} characters")
        if p.password_require_upper and not re.search(r"[A-Z]", password):
            errors.append("an uppercase letter")
        if p.password_require_lower and not re.search(r"[a-z]", password):
            errors.append("a lowercase letter")
        if p.password_require_number and not re.search(r"\d", password):
            errors.append("a number")
        if p.password_require_symbol and not re.search(r"[^A-Za-z0-9]", password):
            errors.append("a symbol")
        if p.block_identifiers_in_password:
            low = password.lower()
            for ident in (login_id, full_name):
                if ident and len(ident) >= 3 and ident.lower() in low:
                    errors.append("no part of the login id or name")
                    break
        if errors:
            raise ValidationFailedError(
                "Password does not meet the security policy.",
                errors=[
                    {
                        "field": "password",
                        "code": "policy",
                        "message": "Must contain " + ", ".join(errors) + ".",
                    }
                ],
                rule_code="V1-SEC-BR-001",
            )
