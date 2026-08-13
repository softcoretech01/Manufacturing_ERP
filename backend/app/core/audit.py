"""Append-only audit log (CLAUDE.md §5.3).

Records who/when/where/what for every create, update, deactivate, restore and
relationship change. Rows are never updated or deleted. Only the JSON diff of
changed fields is stored; secrets are never written here (the logging redactor
and the caller's field selection keep them out).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import String, Text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, JSON
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.context import TenantContext
from app.core.enums import AuditAction
from app.core.ids import new_uid
from app.core.time import utcnow

_NEVER_LOG = {
    "password",
    "password_hash",
    "new_password",
    "current_password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "key_hash",
    "mfa_secret",
    "pin",
    "shopfloor_pin_hash",
}


class CoreAuditLog(Base):
    __tablename__ = "core_audit_log"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)
    company_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True, index=True)

    occurred_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    actor_user_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(150), nullable=False)

    entity_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    entity_uid: Mapped[str | None] = mapped_column(String(26), nullable=True, index=True)
    document_no: Mapped[str | None] = mapped_column(String(60), nullable=True)

    action: Mapped[str] = mapped_column(String(30), nullable=False)
    old_values: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    new_values: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="WEB")
    correlation_id: Mapped[str] = mapped_column(String(50), nullable=False, default="-")


def _clean(values: dict[str, Any] | None) -> dict[str, Any] | None:
    if not values:
        return values
    return {k: ("***" if k.lower() in _NEVER_LOG else v) for k, v in values.items()}


def diff(before: dict[str, Any], after: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Only the fields that actually changed (CLAUDE.md §5.3)."""
    old: dict[str, Any] = {}
    new: dict[str, Any] = {}
    for key in after:
        if before.get(key) != after.get(key):
            old[key] = before.get(key)
            new[key] = after.get(key)
    return old, new


async def record_audit(
    session: AsyncSession,
    ctx: TenantContext,
    *,
    action: AuditAction,
    entity_type: str,
    entity_id: int | None = None,
    entity_uid: str | None = None,
    document_no: str | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    reason: str | None = None,
) -> None:
    session.add(
        CoreAuditLog(
            company_id=ctx.company_id or None,
            occurred_at=utcnow(),
            actor_user_id=ctx.user_id,
            actor_name=ctx.user_name,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_uid=entity_uid,
            document_no=document_no,
            action=action.value,
            old_values=_clean(old_values),
            new_values=_clean(new_values),
            reason=reason,
            ip_address=ctx.ip_address,
            user_agent=(ctx.user_agent or "")[:300] or None,
            channel=ctx.channel.value,
            correlation_id=ctx.correlation_id,
        )
    )
