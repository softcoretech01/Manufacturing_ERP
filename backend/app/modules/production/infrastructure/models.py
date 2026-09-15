"""Shop-floor execution models, mapping the existing `admin_erp.prd_*` tables.

These tables already existed and already held real rows before this module was
written — ten work orders raised from the two live production orders, eight
production entries and their scrap. Nothing here creates a second work-order
concept: the column names are the ones already on disk.

Where the responsibility of each table sits:

  prd_work_order              one routing operation of one production order,
                              carrying the snapshot taken at release
  prd_production_entry        what an operator actually booked at an operation
  prd_production_entry_scrap  the defect breakdown of one entry's scrap
  prd_scrap                   the scrap document, costed and dispositioned
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, Index, String, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, DECIMAL, INTEGER
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import CompanyEntity


class PrdWorkOrder(CompanyEntity):
    """One operation of a released production order, as the floor sees it."""

    __tablename__ = "prd_work_order"
    __table_args__ = (
        UniqueConstraint("company_id", "doc_no", "deleted_key", name="uk_prd_work_order_doc"),
        Index("ix_prd_work_order_order", "order_id"),
        Index("ix_prd_work_order_status", "status"),
        Index("ix_prd_work_order_work_centre", "work_centre_code"),
        {"extend_existing": True},
    )

    doc_no: Mapped[str] = mapped_column(String(40), nullable=False)

    # The production order this belongs to, by id and by number.
    order_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    order_doc_no: Mapped[str] = mapped_column(String(40), nullable=False)

    product_code: Mapped[str] = mapped_column(String(40), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    uom: Mapped[str] = mapped_column(String(10), nullable=False)

    # ── The routing snapshot, copied at release and never re-read ──────────
    seq: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    operation_code: Mapped[str] = mapped_column(String(30), nullable=False)
    operation_name: Mapped[str] = mapped_column(String(150), nullable=False)
    work_centre_code: Mapped[str] = mapped_column(String(30), nullable=False)
    machine_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    tool_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operators: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=1)
    skill: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    setup_minutes_std: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)
    run_minutes_std: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)
    qc_checkpoint: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── What actually happened ─────────────────────────────────────────────
    operator_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operator_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    shift_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="QUEUED")
    qc_result: Mapped[str] = mapped_column(String(20), nullable=False, default="NOT_REQUIRED")

    # input_qty is what reached this operation: the order quantity at the first
    # operation, and the previous operation's good quantity thereafter.
    input_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    planned_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    produced_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    scrap_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    rework_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    setup_minutes_act: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)
    run_minutes_act: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)

    planned_start: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    planned_finish: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    started_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)

    batch_no: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    cancel_reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    remarks: Mapped[str] = mapped_column(String(400), nullable=False, default="")


class PrdProductionEntry(CompanyEntity):
    """One booking by an operator: quantities, the window, who and on what."""

    __tablename__ = "prd_production_entry"
    __table_args__ = (
        UniqueConstraint("company_id", "doc_no", "deleted_key", name="uk_prd_prod_entry_doc"),
        Index("ix_prd_prod_entry_work_order", "work_order_id"),
        Index("ix_prd_prod_entry_order", "order_id"),
        {"extend_existing": True},
    )

    doc_no: Mapped[str] = mapped_column(String(40), nullable=False)

    work_order_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    work_order_doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    order_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    order_doc_no: Mapped[str] = mapped_column(String(40), nullable=False)

    product_code: Mapped[str] = mapped_column(String(40), nullable=False)
    seq: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    operation_code: Mapped[str] = mapped_column(String(30), nullable=False)
    operation_name: Mapped[str] = mapped_column(String(150), nullable=False)
    work_centre_code: Mapped[str] = mapped_column(String(30), nullable=False)
    machine_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operator_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operator_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    shift_code: Mapped[str | None] = mapped_column(String(20), nullable=True)

    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)

    good_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    scrap_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    rework_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    uom: Mapped[str] = mapped_column(String(10), nullable=False, default="NOS")
    setup_minutes: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)
    run_minutes: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)
    down_minutes: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)

    batch_no: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="POSTED")
    posted_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    # The user id, matching the audit columns; the readable name is operator_name.
    posted_by: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    # A posting is never edited or deleted; it is reversed by another posting.
    is_reversal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reversal_of_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    # NOT NULL on the table, with an empty string standing for "not a reversal".
    reversal_of_doc_no: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    reversal_reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    remarks: Mapped[str] = mapped_column(String(400), nullable=False, default="")


class PrdProductionEntryScrap(CompanyEntity):
    """The defect breakdown behind one entry's scrap quantity."""

    __tablename__ = "prd_production_entry_scrap"
    __table_args__ = (
        Index("ix_prd_prod_entry_scrap_entry", "entry_id"),
        {"extend_existing": True},
    )

    entry_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    defect_code: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    defect_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")


class PrdScrap(CompanyEntity):
    """A scrap document: what was lost, where, why, and what was done with it."""

    __tablename__ = "prd_scrap"
    __table_args__ = (
        UniqueConstraint("company_id", "doc_no", "deleted_key", name="uk_prd_scrap_doc"),
        Index("ix_prd_scrap_order", "order_id"),
        Index("ix_prd_scrap_work_order", "work_order_id"),
        {"extend_existing": True},
    )

    doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="PRODUCTION")
    business_date: Mapped[date] = mapped_column(Date, nullable=False)

    order_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    order_doc_no: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    work_order_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    work_order_doc_no: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    entry_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    entry_doc_no: Mapped[str] = mapped_column(String(40), nullable=False, default="")

    seq: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    operation_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    work_centre_code: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    machine_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operator_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    shift_code: Mapped[str | None] = mapped_column(String(20), nullable=True)

    item_code: Mapped[str] = mapped_column(String(40), nullable=False)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    uom: Mapped[str] = mapped_column(String(10), nullable=False, default="NOS")
    batch_no: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    unit_cost: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)

    defect_code: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    defect_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    disposition: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    decision_note: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")

    warehouse_code: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    inventory_doc_no: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    remarks: Mapped[str] = mapped_column(String(400), nullable=False, default="")
