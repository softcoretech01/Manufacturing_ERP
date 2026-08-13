"""Transactional outbox (CLAUDE.md §3.3 / §5.5).

Domain events are written to `core_outbox` in the same transaction as the state
change. A separate dispatcher (not in this phase) relays them to subscribers and
webhooks. Emitting here means "record the intent"; delivery is asynchronous and
at-least-once. Event names are `<module>.<entity>.<past-tense-verb>`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import String, Text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, INTEGER, JSON
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.context import TenantContext
from app.core.enums import OutboxStatus
from app.core.ids import new_uid
from app.core.time import utcnow


class CoreOutbox(Base):
    __tablename__ = "core_outbox"

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)
    company_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True, index=True)

    aggregate_type: Mapped[str] = mapped_column(String(60), nullable=False)
    aggregate_uid: Mapped[str] = mapped_column(String(26), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    version: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=1)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=OutboxStatus.PENDING.value
    )
    attempts: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    dispatched_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(50), nullable=False, default="-")


def emit_event(
    session: AsyncSession,
    ctx: TenantContext,
    *,
    aggregate_type: str,
    aggregate_uid: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    session.add(
        CoreOutbox(
            company_id=ctx.company_id or None,
            aggregate_type=aggregate_type,
            aggregate_uid=aggregate_uid,
            event_type=event_type,
            payload=payload,
            created_at=utcnow(),
            correlation_id=ctx.correlation_id,
        )
    )
