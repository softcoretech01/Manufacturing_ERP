"""Production planning models mapping to admin_erp.pp_* tables."""

from datetime import date

from sqlalchemy import Boolean, Date, Index, String, Text, UniqueConstraint, JSON
from sqlalchemy.dialects.mysql import BIGINT, DECIMAL, INTEGER
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey

from app.core.base import CompanyEntity


class PpForecast(CompanyEntity):
    __tablename__ = "pp_forecast"
    __table_args__ = (
        UniqueConstraint("company_id", "doc_no", "deleted_key", name="uk_pp_forecast_doc"),
        Index("ix_pp_forecast_company_id", "company_id"),
        Index("ix_pp_forecast_branch_id", "branch_id"),
        Index("ix_pp_forecast_product", "product_code"),
    )

    doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    product_code: Mapped[str] = mapped_column(String(40), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    uom: Mapped[str] = mapped_column(String(10), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    base_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    factor_pct: Mapped[float] = mapped_column(DECIMAL(9, 4), nullable=False)
    forecast_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    confidence_pct: Mapped[float] = mapped_column(DECIMAL(9, 4), nullable=False)
    actual_qty: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)
    market: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    remarks: Mapped[str] = mapped_column(String(400), nullable=False, default="")


class PpDemand(CompanyEntity):
    __tablename__ = "pp_demand"
    __table_args__ = (
        UniqueConstraint("company_id", "doc_no", "deleted_key", name="uk_pp_demand_doc"),
        Index("ix_pp_demand_company_id", "company_id"),
        Index("ix_pp_demand_branch_id", "branch_id"),
        Index("ix_pp_demand_product", "product_code"),
    )

    doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    product_code: Mapped[str] = mapped_column(String(40), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    uom: Mapped[str] = mapped_column(String(10), nullable=False)
    qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    qty_planned: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    required_on: Mapped[date] = mapped_column(Date, nullable=False)
    customer: Mapped[str] = mapped_column(String(150), nullable=False)
    market: Mapped[str] = mapped_column(String(20), nullable=False)
    is_firm: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    remarks: Mapped[str] = mapped_column(String(400), nullable=False, default="")


class PpMps(CompanyEntity):
    __tablename__ = "pp_mps"
    __table_args__ = (
        Index("ix_pp_mps_product", "product_code"),
        Index("ix_pp_mps_branch_id", "branch_id"),
        Index("ix_pp_mps_company_id", "company_id"),
    )

    doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    product_code: Mapped[str] = mapped_column(String(40), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    uom: Mapped[str] = mapped_column(String(10), nullable=False)
    bucket: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    bucket_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    demand_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    planned_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    is_firm: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    remarks: Mapped[str] = mapped_column(String(400), nullable=False, default="")


class PpPlanningPolicy(CompanyEntity):
    __tablename__ = "pp_planning_policy"
    __table_args__ = (
        UniqueConstraint("company_id", "item_code", "deleted_key", name="uk_pp_policy_item"),
        Index("ix_pp_planning_policy_branch_id", "branch_id"),
        Index("ix_pp_planning_policy_company_id", "company_id"),
    )

    item_code: Mapped[str] = mapped_column(String(40), nullable=False)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    lot_size_rule: Mapped[str] = mapped_column(String(20), nullable=False)
    min_order_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    order_multiple: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    safety_stock_override: Mapped[float | None] = mapped_column(DECIMAL(18, 6), nullable=True)
    lead_time_override: Mapped[int | None] = mapped_column(INTEGER(unsigned=True), nullable=True)
    frozen_days: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class PpProductionOrder(CompanyEntity):
    __tablename__ = "pp_production_order"
    __table_args__ = (
        UniqueConstraint("company_id", "doc_no", "deleted_key", name="uk_pp_prod_order_doc"),
        Index("ix_pp_production_order_company_id", "company_id"),
        Index("ix_pp_prod_order_status", "status"),
        Index("ix_pp_production_order_branch_id", "branch_id"),
        Index("ix_pp_prod_order_product", "product_code"),
    )

    doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)
    product_code: Mapped[str] = mapped_column(String(40), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    uom: Mapped[str] = mapped_column(String(10), nullable=False)
    qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    produced_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    rejected_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    plant: Mapped[str] = mapped_column(String(80), nullable=False)
    warehouse: Mapped[str] = mapped_column(String(80), nullable=False)
    priority: Mapped[str] = mapped_column(String(10), nullable=False)
    planned_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_finish: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    bom_doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    bom_revision: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    routing_doc_no: Mapped[str] = mapped_column(String(40), nullable=False)
    routing_revision: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    demand_refs: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    estimated_unit_cost: Mapped[float] = mapped_column(DECIMAL(18, 2), nullable=False, default=0)
    cancel_reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    remarks: Mapped[str] = mapped_column(String(400), nullable=False, default="")

    components: Mapped[list["PpProdOrderComponent"]] = relationship(
        "PpProdOrderComponent",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    operations: Mapped[list["PpProdOrderOperation"]] = relationship(
        "PpProdOrderOperation",
        back_populates="order",
        cascade="all, delete-orphan",
    )


class PpProdOrderComponent(CompanyEntity):
    __tablename__ = "pp_prod_order_component"
    __table_args__ = (
        Index("ix_pp_prod_order_component_branch_id", "branch_id"),
        Index("ix_pp_poc_order", "order_id"),
        Index("ix_pp_prod_order_component_company_id", "company_id"),
    )

    order_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), ForeignKey("pp_production_order.id", ondelete="CASCADE"), nullable=False)
    item_code: Mapped[str] = mapped_column(String(40), nullable=False)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    uom: Mapped[str] = mapped_column(String(10), nullable=False)
    required_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False)
    reserved_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    issued_qty: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)
    available_at_planning: Mapped[float] = mapped_column(DECIMAL(18, 6), nullable=False, default=0)

    order: Mapped["PpProductionOrder"] = relationship(
        "PpProductionOrder", back_populates="components"
    )


class PpProdOrderOperation(CompanyEntity):
    __tablename__ = "pp_prod_order_operation"
    __table_args__ = (
        Index("ix_pp_prod_order_operation_company_id", "company_id"),
        Index("ix_pp_prod_order_operation_branch_id", "branch_id"),
        Index("ix_pp_poo_order", "order_id"),
    )

    order_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), ForeignKey("pp_production_order.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    operation_code: Mapped[str] = mapped_column(String(30), nullable=False)
    operation_name: Mapped[str] = mapped_column(String(150), nullable=False)
    work_centre_code: Mapped[str] = mapped_column(String(30), nullable=False)
    machine_code: Mapped[str] = mapped_column(String(30), nullable=False)
    operators: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=1)
    skill: Mapped[str] = mapped_column(String(40), nullable=False)
    tool_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    qc_checkpoint: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    setup_minutes: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)
    run_minutes: Mapped[float] = mapped_column(DECIMAL(12, 3), nullable=False, default=0)
    planned_start: Mapped[str] = mapped_column(String(32), nullable=False)
    planned_finish: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)

    order: Mapped["PpProductionOrder"] = relationship(
        "PpProductionOrder", back_populates="operations"
    )


class PpCalendarDay(CompanyEntity):
    __tablename__ = "pp_calendar_day"
    __table_args__ = (
        UniqueConstraint("company_id", "cal_date", "plant", "deleted_key", name="uk_pp_cal_date"),
        Index("ix_pp_calendar_day_company_id", "company_id"),
        Index("ix_pp_calendar_day_branch_id", "branch_id"),
    )

    cal_date: Mapped[date] = mapped_column(Date, nullable=False)
    day_type: Mapped[str] = mapped_column(String(20), nullable=False)
    hours: Mapped[float] = mapped_column(DECIMAL(6, 2), nullable=False)
    shifts: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    plant: Mapped[str] = mapped_column(String(80), nullable=False)

PLANNING_MODELS = [
    PpDemand,
    PpMps,
    PpPlanningPolicy,
    PpProductionOrder,
    PpProdOrderComponent,
    PpProdOrderOperation,
    PpCalendarDay,
    PpForecast,
]
