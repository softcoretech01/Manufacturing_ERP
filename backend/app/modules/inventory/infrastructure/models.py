"""Inventory storage-structure models (SRS Vol 4 Ch 1 — Warehouse, Zone & Bin).

Warehouses are owned by the Organisation module (Vol 1); this module adds the two
levels below them — **zones** (grouping for pick sequencing / access) and **bins**
(the scannable storage addresses that actually hold stock). Stock, movements and
valuation are later slices; here we model only where material *can* live.

`warehouse_id` is a soft reference to `sys_warehouse.id` (no cross-module FK, per
CLAUDE.md §3.3); the service validates it belongs to the caller's company.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Index, String, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, DECIMAL, INTEGER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import CompanyEntity
from app.core.enums import BinStatus, BinType


# ─────────────────────────── Zone ────────────────────────────────────────────
class InvZone(CompanyEntity):
    __tablename__ = "inv_zone"
    __table_args__ = (
        UniqueConstraint("company_id", "warehouse_id", "code", "deleted_key", name="uk_zone_code"),
        Index("ix_zone_warehouse", "warehouse_id"),
    )

    warehouse_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    zone_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    pick_sequence: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# ─────────────────────────── Bin ─────────────────────────────────────────────
class InvBin(CompanyEntity):
    __tablename__ = "inv_bin"
    __table_args__ = (
        UniqueConstraint("company_id", "warehouse_id", "code", "deleted_key", name="uk_bin_code"),
        Index("ix_bin_warehouse", "warehouse_id"),
        Index("ix_bin_zone", "zone_id"),
    )

    warehouse_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    zone_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    bin_type: Mapped[str] = mapped_column(String(30), nullable=False, default=BinType.RACK.value)
    max_weight_kg: Mapped[float | None] = mapped_column(DECIMAL(18, 4), nullable=True)
    max_volume_m3: Mapped[float | None] = mapped_column(DECIMAL(12, 3), nullable=True)
    pick_sequence: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    fixed_item_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    mixing_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=BinStatus.AVAILABLE.value
    )
    block_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    hazard_class: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # `zone_id` has no DB foreign key (same soft-reference style as warehouse_id),
    # so the join condition must be spelled out: mark zone_id as the foreign side.
    # View-only — the zone is assigned by setting zone_id directly, never through
    # this relationship.
    zone: Mapped[InvZone | None] = relationship(
        "InvZone",
        primaryjoin="foreign(InvBin.zone_id) == InvZone.id",
        viewonly=True,
        lazy="select",
    )

    @property
    def zone_uid(self) -> str | None:
        return self.zone.uid if self.zone else None


INVENTORY_MODELS = [InvZone, InvBin]
