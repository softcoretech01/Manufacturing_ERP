"""Item master (SRS Vol 1 Ch 7 / Vol 4 prerequisite).

The stock model is meaningless without an item to hold stock *of*. This is a
minimal but real item master: enough to drive stock balances, the ledger and
valuation. UOM is a plain code here (a full UOM master with conversion factors is
a later slice); base_uom is the authority for stored quantities (V4-STK-FR-002).
"""

from __future__ import annotations

from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.dialects.mysql import DECIMAL, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import CompanyEntity
from app.core.enums import ItemType, StockStatus, ValuationMethod


class MstItem(CompanyEntity):
    __tablename__ = "mst_item"
    __table_args__ = (UniqueConstraint("company_id", "code", "deleted_key", name="uk_item_code"),)

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    item_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ItemType.RAW_MATERIAL.value
    )
    base_uom: Mapped[str] = mapped_column(String(10), nullable=False, default="NOS")
    hsn_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    is_batch_tracked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_serial_tracked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    valuation_method: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ValuationMethod.WEIGHTED_AVG.value
    )
    qty_precision: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=3)

    reorder_level: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)
    min_level: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)
    max_level: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)
    standard_rate: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # A movement can be blocked at the item level (recall, phase-out) — checked at
    # posting time (V4-STK validation 5).
    is_blocked_for_movement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Default stock status new receipts land in (AVAILABLE, or QUARANTINE if the
    # item is inspection-gated). Real QC gating is Vol 7; this is the seed of it.
    default_receipt_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=StockStatus.AVAILABLE.value
    )
