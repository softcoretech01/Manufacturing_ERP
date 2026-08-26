"""System-parameter use cases: read (seeding a default set on first access) and
bulk value update with type validation."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.errors import NotFoundError, ValidationFailedError
from app.core.ids import new_uid
from app.core.time import utcnow
from app.modules.parameters.models import SysParameter

# key, name, group, type, default, description, scope, options
_SEED: list[tuple[str, str, str, str, str, str, str, list[str] | None]] = [
    ("ALLOW_SELF_APPROVAL", "Allow self-approval", "Workflow", "BOOLEAN", "false",
     "When off, a document's creator can never approve their own document.", "COMPANY", None),
    ("COLLAPSE_DUPLICATE_APPROVERS", "Collapse duplicate approvers", "Workflow", "BOOLEAN", "false",
     "If the same user resolves to two levels, auto-satisfy the later one.", "COMPANY", None),
    ("WORKFLOW_RESTART_ON_CHANGE", "Restart workflow on change", "Workflow", "BOOLEAN", "true",
     "Editing a material field after submission restarts approval from level 1.", "COMPANY", None),
    ("ALLOW_NEGATIVE_STOCK", "Allow negative stock", "Inventory", "BOOLEAN", "false",
     "Global default. Can be overridden per warehouse.", "COMPANY", None),
    ("DEFAULT_VALUATION_METHOD", "Default valuation method", "Inventory", "STRING", "WEIGHTED_AVG",
     "Applied to new warehouses.", "COMPANY", ["WEIGHTED_AVG", "FIFO", "STANDARD"]),
    ("BACKDATE_TOLERANCE_DAYS", "Back-dating tolerance (days)", "Finance", "NUMBER", "7",
     "How far back a document may be dated without POST_BACKDATED.", "COMPANY", None),
    ("FUTURE_DATE_TOLERANCE_DAYS", "Future-dating tolerance (days)", "Finance", "NUMBER", "0",
     "Financial documents. Planning documents use 7.", "COMPANY", None),
    ("DEFAULT_PAGE_SIZE", "Default page size", "General", "NUMBER", "50",
     "Rows per page on list screens.", "COMPANY", None),
    ("EXPORT_SYNC_ROW_LIMIT", "Synchronous export row limit", "General", "NUMBER", "5000",
     "Exports above this run as a background job.", "INSTALLATION", None),
    ("DATE_FORMAT", "Date format", "General", "STRING", "dd-MMM-yyyy",
     "Display format for dates.", "COMPANY", ["dd-MMM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]),
    ("NUMBER_FORMAT", "Number format", "General", "STRING", "IN",
     "IN = Indian grouping (12,34,567); INTL = 1,234,567.", "COMPANY", ["IN", "INTL"]),
    ("QUIET_HOURS", "Notification quiet hours", "Notification", "STRING", "22:00-06:00",
     "SMS/WhatsApp/push suppressed except CRITICAL categories.", "COMPANY", None),
    ("NOTIFICATION_RETRY_MAX", "Notification retry attempts", "Notification", "NUMBER", "5",
     "Backoff 1m, 5m, 15m, 1h, 4h.", "INSTALLATION", None),
    ("AUDIT_ONLINE_MONTHS", "Audit log online window (months)", "Compliance", "NUMBER", "24",
     "Older rows move to cold archive but stay queryable.", "INSTALLATION", None),
]


def _validate(value: str, value_type: str, options: list[str] | None) -> str:
    v = value.strip()
    if value_type == "NUMBER":
        try:
            float(v)
        except ValueError as exc:
            raise ValidationFailedError(
                "Value must be a number.",
                errors=[{"field": "value", "code": "type", "message": f"'{v}' is not a number."}],
            ) from exc
    elif value_type == "BOOLEAN":
        if v.lower() not in ("true", "false"):
            raise ValidationFailedError(
                "Value must be true or false.",
                errors=[{"field": "value", "code": "type", "message": f"'{v}' is not a boolean."}],
            )
        v = v.lower()
    elif value_type == "JSON":
        try:
            json.loads(v)
        except ValueError as exc:
            raise ValidationFailedError(
                "Value must be valid JSON.",
                errors=[{"field": "value", "code": "type", "message": "Invalid JSON."}],
            ) from exc
    if options and v not in options:
        raise ValidationFailedError(
            "Value is not an allowed option.",
            errors=[
                {
                    "field": "value",
                    "code": "choice",
                    "message": f"Choose one of: {', '.join(options)}.",
                }
            ],
        )
    return v


class ParameterService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def _all(self) -> list[SysParameter]:
        rows = await self.session.execute(
            select(SysParameter)
            .where(
                SysParameter.company_id == self.ctx.company_id,
                SysParameter.deleted_at.is_(None),
            )
            .order_by(SysParameter.param_group, SysParameter.name)
        )
        return list(rows.scalars().all())

    async def list_or_seed(self) -> list[SysParameter]:
        rows = await self._all()
        if rows:
            return rows
        now = utcnow()
        for key, name, group, vtype, default, desc, scope, options in _SEED:
            self.session.add(
                SysParameter(
                    uid=new_uid(), company_id=self.ctx.company_id, version=1,
                    created_at=now, created_by=self.ctx.user_id,
                    updated_at=now, updated_by=self.ctx.user_id,
                    param_key=key, name=name, param_group=group, value_type=vtype,
                    value=default, default_value=default, description=desc, scope=scope,
                    is_sensitive=False, options=options,
                )
            )
        await self.session.flush()
        return await self._all()

    async def update(self, changes: list[dict[str, Any]]) -> list[SysParameter]:
        await self.list_or_seed()  # ensure rows exist
        by_key = {p.param_key: p for p in await self._all()}
        now = utcnow()
        for ch in changes:
            key = str(ch.get("param_key") or "")
            param = by_key.get(key)
            if param is None:
                raise NotFoundError(f"Parameter '{key}' not found.")
            param.value = _validate(str(ch.get("value", "")), param.value_type, param.options)
            param.version += 1
            param.updated_at = now
            param.updated_by = self.ctx.user_id
        await self.session.flush()
        return await self._all()
