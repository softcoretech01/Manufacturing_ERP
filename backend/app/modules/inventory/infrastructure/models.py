"""Inventory storage-structure models (SRS Vol 4 Ch 1 — Warehouse, Zone & Bin).

Warehouses are owned by the Organisation module (Vol 1); this module adds the two
levels below them — **zones** (grouping for pick sequencing / access) and **bins**
(the scannable storage addresses that actually hold stock). Stock, movements and
valuation are later slices; here we model only where material *can* live.

`warehouse_id` is a soft reference to `sys_warehouse.id` (no cross-module FK, per
CLAUDE.md §3.3); the service validates it belongs to the caller's company.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, DECIMAL, INTEGER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base, CompanyEntity
from app.core.enums import BinStatus, BinType, CountStatus, CountType, StockStatus
from app.core.ids import new_uid


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


# ─────────────────────────── Stock balance ──────────────────────────────────
class InvStockBalance(CompanyEntity):
    """On-hand quantity + moving-average value at one exact location key
    (SRS V4-STK-FR-001). Updated in the same transaction as the ledger row that
    caused it (FR-004). Sentinel keys avoid NULLs in the unique index:
    `bin_id = 0` is the implicit bin, `batch_no`/`serial_no = ''` means none."""

    __tablename__ = "inv_stock_balance"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "warehouse_id", "bin_id", "item_id",
            "batch_no", "serial_no", "stock_status",
            name="uk_stock_balance",
        ),
        Index("ix_balance_item", "company_id", "item_id"),
        Index("ix_balance_wh", "company_id", "warehouse_id"),
    )

    item_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    bin_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, default=0)
    batch_no: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    serial_no: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    stock_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=StockStatus.AVAILABLE.value
    )

    quantity: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    avg_rate: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    value: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)


# ─────────────────────────── Stock ledger ───────────────────────────────────
class InvStockLedger(Base):
    """Append-only movement ledger (SRS V4-STK-FR-006/007). Never updated or
    deleted — a correction is an opposite entry. The running balance stored here
    is the balance AFTER this movement at that location, computed under the lock
    that produced it (BR-002)."""

    __tablename__ = "inv_stock_ledger"
    __table_args__ = (
        Index("ix_ledger_item_loc", "company_id", "item_id", "warehouse_id", "posted_at"),
        Index("ix_ledger_doc", "company_id", "document_type", "document_no"),
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)
    company_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)

    item_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    bin_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, default=0)
    batch_no: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    serial_no: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    stock_status: Mapped[str] = mapped_column(String(20), nullable=False)

    movement_type: Mapped[str] = mapped_column(String(30), nullable=False)
    direction: Mapped[str] = mapped_column(String(3), nullable=False)  # IN | OUT
    quantity: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    rate: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    value: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)

    balance_qty_after: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    balance_rate_after: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    balance_value_after: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)

    document_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    document_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    line_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    posted_by: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    posted_by_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    posted_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(50), nullable=False, default="-")


# ─────────────────────────── Physical inventory (count) ─────────────────────
class InvStockCount(CompanyEntity):
    """A cycle count or full physical verification (SRS Vol 4 Ch 8). Its lines
    snapshot the system quantity at creation; approving it posts reconciling
    movements. Blind: the system quantity is not exposed until the count is
    submitted (COUNTED)."""

    __tablename__ = "inv_stock_count"

    document_no: Mapped[str] = mapped_column(String(100), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    warehouse_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    count_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default=CountType.CYCLE.value
    )
    status: Mapped[str] = mapped_column(
        String(15), nullable=False, default=CountStatus.COUNTING.value
    )
    count_date: Mapped[date] = mapped_column(Date, nullable=False)
    remarks: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # SoD (V4-CNT-FR-013): the approver must differ from the counter.
    counted_by: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    counted_by_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    approved_by: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)


class InvStockCountLine(CompanyEntity):
    __tablename__ = "inv_stock_count_line"
    __table_args__ = (Index("ix_countline_count", "count_id"),)

    count_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    item_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    item_code: Mapped[str] = mapped_column(String(40), nullable=False)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    uom: Mapped[str] = mapped_column(String(10), nullable=False, default="NOS")
    bin_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, default=0)
    batch_no: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    stock_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=StockStatus.AVAILABLE.value
    )

    system_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    counted_qty: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)
    variance: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    root_cause: Mapped[str | None] = mapped_column(String(40), nullable=True)
    remarks: Mapped[str | None] = mapped_column(String(300), nullable=True)


INVENTORY_MODELS = [
    InvZone, InvBin, InvStockBalance, InvStockLedger, InvStockCount, InvStockCountLine
]
