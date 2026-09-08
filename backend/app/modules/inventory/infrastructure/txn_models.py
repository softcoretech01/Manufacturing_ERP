"""Inventory stock-transaction document models.

These three tables power the document lifecycle (DRAFT → POSTED → CANCELLED)
that the Stock Out, Return, and Transfer screens require.

Key design decisions:
- inv_stock_txn: the document header, one per business event (Stock Out, etc.)
- inv_stock_txn_line: one row per item line within a document
- inv_batch_master: stores expiry / manufacture dates alongside batch numbers
  (inv_stock_balance.batch_no is a bare string; this adds the date metadata)

item_id on inv_stock_txn_line is the INTEGER PK of the legacy `Item` table
(the procurement item master accessed via SpItem stored procedure). This keeps
the full itemType / category metadata available without duplicating it.

mst_item_id on inv_stock_txn_line is the INTEGER PK of mst_item, resolved at
post time by matching Item.Code to mst_item.code. This is what StockService
requires for balance/ledger writes.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import CompanyEntity


# ─────────────────────────── Stock Transaction Header ────────────────────────
class InvStockTxn(CompanyEntity):
    """One document header per stock event (Out / Return / Transfer / Adjustment).

    Statuses:
        DRAFT    – created but not yet committed to stock
        POSTED   – stock balances and ledger have been updated (immutable)
        CANCELLED – reversal applied; original document preserved for audit
    """

    __tablename__ = "inv_stock_txn"
    __table_args__ = (
        Index("ix_stxn_company_type_status", "company_id", "txn_type", "status"),
        Index("ix_stxn_date", "company_id", "txn_date"),
        Index("ix_stxn_doc_no", "company_id", "document_no"),
        Index("ix_stxn_src_wh", "company_id", "src_warehouse_id"),
    )

    txn_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # STOCK_OUT | STOCK_RETURN | STOCK_TRANSFER | ADJUSTMENT
    document_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    txn_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Warehouses (soft FK to sys_warehouse.id – no cross-module FK per CLAUDE.md §3.3)
    src_warehouse_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    dst_warehouse_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    # Business party
    department_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    issued_to: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Reference to source document (e.g. Stock Out number for a Return)
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_no: Mapped[str | None] = mapped_column(String(100), nullable=True)

    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    posted_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    posted_by: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    posted_by_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Financial totals – recomputed on every save, never trusted from client
    subtotal: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)
    tax_total: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)
    grand_total: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)


# ─────────────────────────── Stock Transaction Line ──────────────────────────
class InvStockTxnLine(CompanyEntity):
    """One item line within a stock transaction document."""

    __tablename__ = "inv_stock_txn_line"
    __table_args__ = (
        Index("ix_stxn_line_txn", "txn_id"),
        Index("ix_stxn_line_item", "company_id", "item_id"),
        Index("ix_stxn_line_mst_item", "company_id", "mst_item_id"),
    )

    txn_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)

    # Legacy Item master (integer PK from SpItem / Item table)
    # Used for display: item code, name, itemType, category, baseUom
    item_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)

    # mst_item PK – resolved at post time from Item.Code == mst_item.code
    # Required for StockService.post_movement (which operates on mst_item)
    mst_item_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    # Denormalized display fields (snapshot at save time – avoids joins on view)
    item_code: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    item_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    item_type: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    uom: Mapped[str] = mapped_column(String(10), nullable=False)

    batch_no: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    mfg_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    quantity: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    unit_price: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    tax_rate: Mapped[float] = mapped_column(DECIMAL(6, 3), nullable=False, default=0)
    tax_amount: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)
    line_total: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)

    remarks: Mapped[str | None] = mapped_column(String(300), nullable=True)


# ─────────────────────────── Batch Master ────────────────────────────────────
class InvBatchMaster(CompanyEntity):
    """Stores expiry / manufacture date alongside a batch number.

    inv_stock_balance.batch_no is a bare string; this record adds the date
    metadata needed for the Batch & Expiry screen without changing the stock
    engine's unique key.

    mst_item_id links to mst_item (the stock engine's item master).
    """

    __tablename__ = "inv_batch_master"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "mst_item_id", "warehouse_id", "batch_no", "deleted_key",
            name="uk_batch_master"
        ),
        Index("ix_batch_master_item", "company_id", "mst_item_id"),
        Index("ix_batch_master_wh", "company_id", "warehouse_id"),
        Index("ix_batch_master_expiry", "company_id", "expiry_date"),
    )

    mst_item_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    batch_no: Mapped[str] = mapped_column(String(60), nullable=False)
    mfg_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)


TXN_MODELS = [InvStockTxn, InvStockTxnLine, InvBatchMaster]
