"""Organisation persistence models (SRS V1-ORG §2.10).

Scope of this phase (core entities): company + statutory registrations, branch,
plant, warehouse, department, cost centre, financial year + accounting periods,
currency, exchange rate. Production line, work centre, warehouse zone/bin,
profit centre and period-close workflow are deferred to a follow-up slice.

`state_id`/`city_id`/`country_id` reference the geography masters owned by the
Masters module; they are stored here as nullable soft references (no FK) and are
NOT populated in this phase. `gst_state_code` (the 2-digit GST state code) is
stored directly so GSTIN validation (V1-ORG-BR-005/009) works without a
dependency on that module.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, DECIMAL, INTEGER, JSON, TINYINT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base, CompanyEntity, Entity
from app.core.enums import (
    BranchType,
    CostCentreType,
    DepartmentType,
    FinancialYearStatus,
    RateType,
    ValuationMethod,
    WarehouseType,
)
from app.core.ids import new_uid


# ─────────────────────────── Company ─────────────────────────────────────────
class SysCompany(Entity):
    __tablename__ = "sys_company"
    __table_args__ = (UniqueConstraint("code", "deleted_key", name="uk_company_code"),)

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    trade_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    cin: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tan: Mapped[str | None] = mapped_column(String(15), nullable=True)

    base_currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    fy_start_month: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=4)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Asia/Kolkata")
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="en-IN")
    qty_precision: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=3)
    rate_precision: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=2)
    amount_precision: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=2)

    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    letterhead_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    signature_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    address_line1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line3: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    state_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    country_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    gst_state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    website: Mapped[str | None] = mapped_column(String(150), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SysCompanyRegistration(CompanyEntity):
    __tablename__ = "sys_company_registration"
    __table_args__ = (
        UniqueConstraint("registration_type", "registration_no", "deleted_key", name="uk_reg"),
    )

    registration_type: Mapped[str] = mapped_column(String(40), nullable=False)
    registration_no: Mapped[str] = mapped_column(String(50), nullable=False)
    issuing_authority: Mapped[str | None] = mapped_column(String(200), nullable=True)
    state_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    gst_state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    attachment_uid: Mapped[str | None] = mapped_column(String(26), nullable=True)
    reminder_days: Mapped[list | None] = mapped_column(
        JSON, nullable=True, default=lambda: [90, 60, 30, 7]
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# ─────────────────────────── Branch ──────────────────────────────────────────
class SysBranch(CompanyEntity):
    __tablename__ = "sys_branch"
    __table_args__ = (
        UniqueConstraint("company_id", "code", "deleted_key", name="uk_branch_code"),
        UniqueConstraint("gstin", "deleted_key", name="uk_branch_gstin"),
    )

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    branch_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default=BranchType.FACTORY.value
    )
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    has_separate_gstin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    address_line1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line3: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    state_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    country_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    gst_state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(150), nullable=True)

    default_warehouse_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    default_cost_centre_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# ─────────────────────────── Plant ───────────────────────────────────────────
class SysPlant(CompanyEntity):
    __tablename__ = "sys_plant"
    __table_args__ = (UniqueConstraint("company_id", "code", "deleted_key", name="uk_plant_code"),)

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    plant_head_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    factory_licence_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    factory_licence_valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    pollution_consent_no: Mapped[str | None] = mapped_column(String(50), nullable=True)

    address_line1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    state_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)

    default_rm_warehouse_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True), nullable=True
    )
    default_wip_warehouse_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True), nullable=True
    )
    default_fg_warehouse_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True), nullable=True
    )
    default_scrap_warehouse_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True), nullable=True
    )
    installed_capacity_per_day: Mapped[float | None] = mapped_column(DECIMAL(18, 3), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Parent branch, resolved for display (no DB FK — soft reference within the
    # module). Eager-loaded so serialising a plant never triggers an async lazy load.
    branch = relationship(
        "SysBranch",
        primaryjoin="foreign(SysPlant.branch_id) == SysBranch.id",
        viewonly=True,
        lazy="selectin",
    )

    @property
    def branch_uid(self) -> str | None:
        return self.branch.uid if self.branch else None

    @property
    def branch_code(self) -> str | None:
        return self.branch.code if self.branch else None

    @property
    def branch_name(self) -> str | None:
        return self.branch.name if self.branch else None


# ─────────────────────────── Warehouse ───────────────────────────────────────
class SysWarehouse(CompanyEntity):
    __tablename__ = "sys_warehouse"
    __table_args__ = (UniqueConstraint("company_id", "code", "deleted_key", name="uk_wh_code"),)

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    plant_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    warehouse_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default=WarehouseType.RAW_MATERIAL.value
    )
    is_bin_managed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_batch_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_system_managed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    subcontractor_supplier_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True), nullable=True
    )
    storekeeper_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    valuation_method: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ValuationMethod.WEIGHTED_AVG.value
    )
    address_line1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Parent branch (always) and plant (optional), resolved for display. Eager so
    # serialising a warehouse never triggers an async lazy load.
    branch = relationship(
        "SysBranch",
        primaryjoin="foreign(SysWarehouse.branch_id) == SysBranch.id",
        viewonly=True,
        lazy="selectin",
    )
    plant = relationship(
        "SysPlant",
        primaryjoin="foreign(SysWarehouse.plant_id) == SysPlant.id",
        viewonly=True,
        lazy="selectin",
    )

    @property
    def branch_uid(self) -> str | None:
        return self.branch.uid if self.branch else None

    @property
    def branch_code(self) -> str | None:
        return self.branch.code if self.branch else None

    @property
    def branch_name(self) -> str | None:
        return self.branch.name if self.branch else None

    @property
    def plant_uid(self) -> str | None:
        return self.plant.uid if self.plant else None

    @property
    def plant_code(self) -> str | None:
        return self.plant.code if self.plant else None

    @property
    def plant_name(self) -> str | None:
        return self.plant.name if self.plant else None


# ─────────────────────────── Department ──────────────────────────────────────
class SysDepartment(CompanyEntity):
    __tablename__ = "sys_department"
    __table_args__ = (UniqueConstraint("company_id", "code", "deleted_key", name="uk_dept_code"),)

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    plant_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    department_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default=DepartmentType.PRODUCTION.value
    )
    head_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    cost_centre_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    level: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=0)
    path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Self-referential parent, resolved for display. `lazy="select"` (not selectin)
    # so it loads exactly one level — a selectin here would recurse up the tree and
    # blow up under async. The list query eager-loads it explicitly; create/update
    # load it with an awaited refresh.
    parent = relationship(
        "SysDepartment",
        primaryjoin="foreign(SysDepartment.parent_id) == remote(SysDepartment.id)",
        viewonly=True,
        lazy="select",
    )

    @property
    def parent_uid(self) -> str | None:
        return self.parent.uid if self.parent else None

    @property
    def parent_code(self) -> str | None:
        return self.parent.code if self.parent else None

    @property
    def parent_name(self) -> str | None:
        return self.parent.name if self.parent else None


# ─────────────────────────── Cost centre ─────────────────────────────────────
class SysCostCentre(CompanyEntity):
    __tablename__ = "sys_cost_centre"
    __table_args__ = (UniqueConstraint("company_id", "code", "deleted_key", name="uk_cc_code"),)

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    cost_centre_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default=CostCentreType.PRODUCTION.value
    )
    owner_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    plant_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    department_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    level: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=0)
    path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_postable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Self-referential parent for display — see SysDepartment.parent for why this
    # is lazy="select" (avoids async selectin recursion up the tree).
    parent = relationship(
        "SysCostCentre",
        primaryjoin="foreign(SysCostCentre.parent_id) == remote(SysCostCentre.id)",
        viewonly=True,
        lazy="select",
    )

    @property
    def parent_uid(self) -> str | None:
        return self.parent.uid if self.parent else None

    @property
    def parent_code(self) -> str | None:
        return self.parent.code if self.parent else None

    @property
    def parent_name(self) -> str | None:
        return self.parent.name if self.parent else None


# ─────────────────────────── Financial year + periods ────────────────────────
class SysFinancialYear(CompanyEntity):
    __tablename__ = "sys_financial_year"
    __table_args__ = (UniqueConstraint("company_id", "code", "deleted_key", name="uk_fy_code"),)

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=FinancialYearStatus.FUTURE.value
    )
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    closed_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    closed_by: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)


class SysAccountingPeriod(CompanyEntity):
    __tablename__ = "sys_accounting_period"
    __table_args__ = (
        UniqueConstraint("financial_year_id", "period_no", "deleted_key", name="uk_period"),
    )

    financial_year_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), nullable=False, index=True
    )
    period_no: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)


# ─────────────────────────── Currency + exchange rate ────────────────────────
class MstCurrency(Entity):
    """Global master — no company_id (CLAUDE.md §4.1 exception)."""

    __tablename__ = "mst_currency"
    __table_args__ = (UniqueConstraint("code", "deleted_key", name="uk_currency"),)

    code: Mapped[str] = mapped_column(String(3), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(10), nullable=True)
    decimal_places: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=2)
    use_indian_format: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class MstExchangeRate(CompanyEntity):
    __tablename__ = "mst_exchange_rate"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "from_currency_code",
            "to_currency_code",
            "rate_type",
            "effective_date",
            "deleted_key",
            name="uk_rate",
        ),
        Index(
            "ix_rate_lookup",
            "company_id",
            "from_currency_code",
            "to_currency_code",
            "rate_type",
            "effective_date",
        ),
    )

    from_currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    to_currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    rate_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=RateType.AVERAGE.value
    )
    rate: Mapped[float] = mapped_column(DECIMAL(18, 8), nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


# convenience export for metadata discovery
ORG_MODELS = [
    SysCompany,
    SysCompanyRegistration,
    SysBranch,
    SysPlant,
    SysWarehouse,
    SysDepartment,
    SysCostCentre,
    SysFinancialYear,
    SysAccountingPeriod,
    MstCurrency,
    MstExchangeRate,
]
_ = (INTEGER, new_uid, Base)  # keep imports referenced for clarity
