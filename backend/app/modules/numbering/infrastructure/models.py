"""Document-numbering persistence (SRS V1-NUM §3, V0 §11).

Two tables: `core_number_series` (the configurable series) and
`core_number_allocation` (an append-oriented log of every number issued, so
gaplessness is *provable*, not assumed). One engine issues every document number
in the product — no module holds its own sequence (CLAUDE.md §5.2).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, INTEGER, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, CompanyEntity
from app.core.enums import AllocateOn, AllocationStatus, ResetFrequency
from app.core.ids import new_uid


class CoreNumberSeries(CompanyEntity):
    """A configurable number series for one (document type, optional sub-type,
    optional branch/plant, optional FY). The format is data, not code."""

    __tablename__ = "core_number_series"
    __table_args__ = (
        Index(
            "ix_series_lookup",
            "company_id",
            "document_type",
            "sub_type",
            "is_active",
        ),
    )

    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    document_label: Mapped[str] = mapped_column(String(120), nullable=False)
    sub_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    scope_branch_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    plant_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    financial_year_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    # Denormalised scope codes for rendering + display (no cross-module join in the write path).
    branch_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    plant_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fy_code: Mapped[str | None] = mapped_column(String(12), nullable=True)

    format_string: Mapped[str] = mapped_column(String(120), nullable=False)
    prefix: Mapped[str | None] = mapped_column(String(20), nullable=True)
    padding_width: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=5)
    allow_widen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    start_number: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=1)
    increment_by: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=1)
    current_number: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    reset_frequency: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ResetFrequency.FINANCIAL_YEARLY.value
    )
    last_reset_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    allocate_on: Mapped[str] = mapped_column(
        String(12), nullable=False, default=AllocateOn.DRAFT.value
    )
    is_statutory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_gapless: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    issued_count: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    last_issued_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)


class CoreNumberAllocation(Base):
    """One row per number issued. Retained forever — cancelling or voiding never
    deletes the row (V1-NUM-BR-006/009). This is the gapless-proof artefact a GST
    auditor asks for."""

    __tablename__ = "core_number_allocation"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "document_type", "formatted_number", name="uk_alloc_number"
        ),
        Index("ix_alloc_series", "series_id", "sequence"),
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)
    company_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    series_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)

    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    sequence: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    formatted_number: Mapped[str] = mapped_column(String(120), nullable=False)

    entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    entity_label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default=AllocationStatus.ALLOCATED.value
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    allocated_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    allocated_by: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    allocated_by_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
