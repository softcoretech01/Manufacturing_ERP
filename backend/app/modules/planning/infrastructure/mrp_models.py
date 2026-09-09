"""MRP run storage (SRS Vol 5 — Material Requirements Planning).

An MRP run used to exist only in a browser tab: `frontend/src/lib/planFlow.ts`
computed it in React state, so the plan died on refresh, two planners could see
different plans from the same data, and nothing could be audited, scheduled or
compared. These four tables make a run a persisted document.

  pp_mrp_run            one row per run — who, when, what parameters, the stats
  pp_mrp_plan_line      the time-phased grid: one row per item per bucket
  pp_mrp_planned_order  what the run proposes to buy or make
  pp_mrp_exception      what the planner has to decide about

Results are immutable once written. Re-planning creates a new run rather than
mutating the last one, which is what makes "what changed since yesterday?" a
query instead of a guess.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, Index, String, Text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, DECIMAL, INTEGER, SMALLINT

from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import CompanyEntity


class PpMrpRun(CompanyEntity):
    """Header for one MRP run."""

    __tablename__ = "pp_mrp_run"
    __table_args__ = (
        Index("ix_mrp_run_company_at", "company_id", "run_at"),
        Index("ix_mrp_run_status", "company_id", "status"),
        Index("ix_mrp_run_demand", "company_id", "demand_doc_no"),
    )

    run_no: Mapped[str] = mapped_column(String(60), nullable=False)
    run_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    run_by_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Parameters, stored so a run can be reproduced and compared like for like.
    horizon: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False, default=12)
    bucket_days: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False, default=7)
    use_mps: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    first_bucket_start: Mapped[date] = mapped_column(Date, nullable=False)

    # Scope. Set when the planner ran the plan for one demand document rather
    # than for the whole order book, so the two kinds of run never get compared
    # as though they measured the same thing.
    demand_doc_no: Mapped[str | None] = mapped_column(String(40), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="COMPLETED")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Headline figures, denormalised so the run list needs no aggregate query.
    items_planned: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    purchase_orders: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    production_orders: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    purchase_value: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)
    late_orders: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    exception_count: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)


class PpMrpPlanLine(CompanyEntity):
    """One item, one bucket — the cell of the time-phased grid."""

    __tablename__ = "pp_mrp_plan_line"
    __table_args__ = (
        Index("ix_mrp_plan_run", "run_id"),
        Index("ix_mrp_plan_run_item", "run_id", "item_code"),
    )

    run_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)

    item_code: Mapped[str] = mapped_column(String(40), nullable=False)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    uom: Mapped[str] = mapped_column(String(20), nullable=False, default="NOS")
    llc: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False, default=0)
    is_manufactured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Item-level context, repeated on every bucket so one row renders standalone.
    opening_stock: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    safety_stock: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    lead_time_days: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    unit_rate: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)

    bucket: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False)
    bucket_start: Mapped[date] = mapped_column(Date, nullable=False)
    gross_requirement: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    scheduled_receipts: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    projected_on_hand: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    net_requirement: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    planned_receipt: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    # Negative when the order had to be released before today.
    release_bucket: Mapped[int | None] = mapped_column(
        SMALLINT(), nullable=True
    )
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class PpMrpPlannedOrder(CompanyEntity):
    """A proposal: buy this, or make this, released on this date.

    `converted_to_doc_no` is set when a planner turns the proposal into a real
    purchase requisition or production order, so a later run can tell what it
    already caused and does not propose it twice.
    """

    __tablename__ = "pp_mrp_planned_order"
    __table_args__ = (
        Index("ix_mrp_po_run", "run_id"),
        Index("ix_mrp_po_release", "run_id", "release_date"),
        Index("ix_mrp_po_type", "run_id", "order_type"),
        Index("ix_mrp_po_demand", "run_id", "demand_doc_no"),
    )

    run_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)

    item_code: Mapped[str] = mapped_column(String(40), nullable=False)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    uom: Mapped[str] = mapped_column(String(20), nullable=False, default="NOS")
    llc: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False, default=0)

    order_type: Mapped[str] = mapped_column(String(12), nullable=False)  # PURCHASE | PRODUCTION
    quantity: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    # The raw net before the lot rule rounded it — this is the shortage figure.
    net_requirement: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    unit_rate: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    value: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)

    bucket: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    release_bucket: Mapped[int] = mapped_column(SMALLINT(), nullable=False)
    release_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    days_late: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)

    # Why this order exists, one level up — the parent order that consumes it.
    pegged_to: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    # Why this order exists, at the root — the customer demand it ultimately
    # serves, carried down through every BOM level. `pegged_to` answers "who
    # consumes this"; this answers "who is it for", and only the second survives
    # a four-level explosion.
    demand_doc_no: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    lead_time_days: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)

    converted_to_doc_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    converted_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)


class PpMrpException(CompanyEntity):
    """Something the run needs a planner to decide about."""

    __tablename__ = "pp_mrp_exception"
    __table_args__ = (
        Index("ix_mrp_exc_run", "run_id"),
        Index("ix_mrp_exc_sev", "run_id", "severity"),
    )

    run_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)

    severity: Mapped[str] = mapped_column(String(10), nullable=False)  # ERROR | WARNING | INFO
    exception_type: Mapped[str] = mapped_column(String(40), nullable=False)
    item_code: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    item_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_action: Mapped[str] = mapped_column(Text, nullable=False, default="")

    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(String(300), nullable=True)


MRP_MODELS = [PpMrpRun, PpMrpPlanLine, PpMrpPlannedOrder, PpMrpException]
