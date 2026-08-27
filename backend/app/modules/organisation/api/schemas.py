"""Request/response contracts for Organisation (CLAUDE.md §6). `uid` is the only
identifier ever exposed; internal `id` is never serialised."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.enums import (
    BranchType,
    CostCentreType,
    DepartmentType,
    FinancialYearStatus,
    RateType,
    ValuationMethod,
    WarehouseType,
)
from app.core.schema import ApiModel, InModel
from app.core.validators import EmailStr, PhoneStr, PincodeStr


class VersionedUpdate(InModel):
    """Base for PATCH bodies — carries the row version for optimistic locking."""

    version: int = Field(..., ge=1, description="Row version the client last saw (CLAUDE.md §4.5)")


class DeactivateRequest(InModel):
    version: int = Field(..., ge=1)
    reason: str | None = Field(default=None, max_length=500)


# ─────────────────────────── Company ─────────────────────────────────────────
class CompanyCreate(InModel):
    code: str | None = Field(default=None, max_length=20)
    legal_name: str = Field(..., min_length=1, max_length=200)
    trade_name: str | None = Field(default=None, max_length=200)
    entity_type: str | None = Field(default=None, max_length=30)
    cin: str | None = Field(default=None, max_length=30)
    pan: str | None = Field(default=None, max_length=10)
    tan: str | None = Field(default=None, max_length=15)
    base_currency_code: str = Field(default="INR", min_length=3, max_length=3)
    fy_start_month: int = Field(default=4, ge=1, le=12)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    locale: str = Field(default="en-IN", max_length=10)
    gst_state_code: str | None = Field(default=None, min_length=2, max_length=2)
    address_line1: str | None = Field(default=None, max_length=200)
    city_id: int | None = None
    state_id: int | None = None
    country_id: int | None = None
    pincode: PincodeStr | None = Field(default=None, max_length=10)
    phone: PhoneStr | None = Field(default=None, max_length=30)
    email: EmailStr | None = Field(default=None, max_length=150)
    website: str | None = Field(default=None, max_length=150)


class CompanyUpdate(VersionedUpdate):
    code: str | None = Field(default=None, max_length=20)
    legal_name: str | None = Field(default=None, max_length=200)
    trade_name: str | None = Field(default=None, max_length=200)
    cin: str | None = Field(default=None, max_length=30)
    pan: str | None = Field(default=None, max_length=10)
    tan: str | None = Field(default=None, max_length=15)
    gst_state_code: str | None = Field(default=None, min_length=2, max_length=2)
    address_line1: str | None = Field(default=None, max_length=200)
    pincode: PincodeStr | None = Field(default=None, max_length=10)
    phone: PhoneStr | None = Field(default=None, max_length=30)
    email: EmailStr | None = Field(default=None, max_length=150)
    website: str | None = Field(default=None, max_length=150)


class CompanyOut(ApiModel):
    uid: str
    code: str
    legal_name: str
    trade_name: str | None
    entity_type: str | None
    pan: str | None
    base_currency_code: str
    fy_start_month: int
    timezone: str
    locale: str
    gst_state_code: str | None
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime


# ─────────────────────────── Registration ────────────────────────────────────
class RegistrationCreate(InModel):
    registration_type: str = Field(..., max_length=40)
    registration_no: str = Field(..., max_length=50)
    issuing_authority: str | None = Field(default=None, max_length=200)
    gst_state_code: str | None = Field(default=None, min_length=2, max_length=2)
    valid_from: date | None = None
    valid_to: date | None = None


class RegistrationOut(ApiModel):
    uid: str
    registration_type: str
    registration_no: str
    issuing_authority: str | None
    valid_from: date | None
    valid_to: date | None
    is_active: bool
    version: int


# ─────────────────────────── Branch ──────────────────────────────────────────
class BranchCreate(InModel):
    # Auto-generated (read-only in the UI) when omitted — see codegen.next_code.
    code: str | None = Field(default=None, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    branch_type: BranchType = BranchType.FACTORY
    gstin: str | None = Field(default=None, max_length=15)
    has_separate_gstin: bool = False
    gst_state_code: str | None = Field(default=None, min_length=2, max_length=2)
    address_line1: str | None = Field(default=None, max_length=200)
    city_id: int | None = None
    state_id: int | None = None
    pincode: PincodeStr | None = Field(default=None, max_length=10)
    phone: PhoneStr | None = Field(default=None, max_length=30)
    email: EmailStr | None = Field(default=None, max_length=150)
    contact_person: str | None = Field(default=None, max_length=150)


class BranchUpdate(VersionedUpdate):
    code: str | None = Field(default=None, max_length=20)
    name: str | None = Field(default=None, max_length=150)
    branch_type: BranchType | None = None
    gstin: str | None = Field(default=None, max_length=15)
    has_separate_gstin: bool | None = None
    gst_state_code: str | None = Field(default=None, min_length=2, max_length=2)
    address_line1: str | None = Field(default=None, max_length=200)
    pincode: PincodeStr | None = Field(default=None, max_length=10)
    phone: PhoneStr | None = Field(default=None, max_length=30)
    email: EmailStr | None = Field(default=None, max_length=150)
    contact_person: str | None = Field(default=None, max_length=150)


class BranchOut(ApiModel):
    uid: str
    company_id: int = Field(exclude=True)  # used internally only; not serialised
    code: str
    name: str
    branch_type: str
    gstin: str | None
    has_separate_gstin: bool
    gst_state_code: str | None
    address_line1: str | None
    pincode: str | None
    phone: str | None
    email: str | None
    contact_person: str | None
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime


# ─────────────────────────── Plant ───────────────────────────────────────────
class PlantCreate(InModel):
    branch_uid: str
    code: str | None = Field(default=None, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    factory_licence_no: str | None = Field(default=None, max_length=50)
    factory_licence_valid_to: date | None = None
    pollution_consent_no: str | None = Field(default=None, max_length=50)
    installed_capacity_per_day: float | None = Field(default=None, ge=0)


class PlantUpdate(VersionedUpdate):
    name: str | None = Field(default=None, max_length=150)
    factory_licence_no: str | None = Field(default=None, max_length=50)
    factory_licence_valid_to: date | None = None
    pollution_consent_no: str | None = Field(default=None, max_length=50)
    installed_capacity_per_day: float | None = Field(default=None, ge=0)


class PlantOut(ApiModel):
    uid: str
    code: str
    name: str
    branch_id: int | None = Field(exclude=True)
    branch_uid: str | None
    branch_code: str | None
    branch_name: str | None
    factory_licence_no: str | None
    factory_licence_valid_to: date | None
    pollution_consent_no: str | None
    installed_capacity_per_day: float | None
    is_active: bool
    version: int


# ─────────────────────────── Warehouse ───────────────────────────────────────
class WarehouseCreate(InModel):
    code: str | None = Field(default=None, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    branch_uid: str
    plant_uid: str | None = None
    warehouse_type: WarehouseType = WarehouseType.RAW_MATERIAL
    is_bin_managed: bool = False
    is_batch_mandatory: bool = False
    allow_negative_stock: bool = False
    valuation_method: ValuationMethod = ValuationMethod.WEIGHTED_AVG


class WarehouseUpdate(VersionedUpdate):
    name: str | None = Field(default=None, max_length=150)
    warehouse_type: WarehouseType | None = None
    is_bin_managed: bool | None = None
    is_batch_mandatory: bool | None = None
    allow_negative_stock: bool | None = None
    valuation_method: ValuationMethod | None = None


class WarehouseOut(ApiModel):
    uid: str
    code: str
    name: str
    branch_uid: str | None
    branch_code: str | None
    branch_name: str | None
    plant_uid: str | None
    plant_code: str | None
    plant_name: str | None
    warehouse_type: str
    is_bin_managed: bool
    is_batch_mandatory: bool
    allow_negative_stock: bool
    valuation_method: str
    is_active: bool
    version: int


# ─────────────────────────── Department ──────────────────────────────────────
class DepartmentCreate(InModel):
    code: str | None = Field(default=None, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    department_type: DepartmentType = DepartmentType.PRODUCTION
    parent_uid: str | None = None
    plant_uid: str | None = None


class DepartmentUpdate(VersionedUpdate):
    name: str | None = Field(default=None, max_length=150)
    department_type: DepartmentType | None = None
    parent_uid: str | None = None


class DepartmentOut(ApiModel):
    uid: str
    code: str
    name: str
    department_type: str
    parent_id: int | None = Field(exclude=True)
    parent_uid: str | None
    parent_code: str | None
    parent_name: str | None
    level: int
    is_active: bool
    version: int


# ─────────────────────────── Cost centre ─────────────────────────────────────
class CostCentreCreate(InModel):
    code: str | None = Field(default=None, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    cost_centre_type: CostCentreType = CostCentreType.PRODUCTION
    parent_uid: str | None = None
    is_postable: bool = True
    valid_from: date | None = None
    valid_to: date | None = None


class CostCentreUpdate(VersionedUpdate):
    name: str | None = Field(default=None, max_length=150)
    cost_centre_type: CostCentreType | None = None
    parent_uid: str | None = None
    is_postable: bool | None = None


class CostCentreOut(ApiModel):
    uid: str
    code: str
    name: str
    cost_centre_type: str
    parent_id: int | None = Field(exclude=True)
    parent_uid: str | None
    parent_code: str | None
    parent_name: str | None
    level: int
    is_postable: bool
    is_active: bool
    version: int


# ─────────────────────────── Financial year ──────────────────────────────────
class FinancialYearCreate(InModel):
    code: str = Field(..., min_length=1, max_length=20)  # user-defined, e.g. FY25-26
    start_date: date
    end_date: date
    is_current: bool = False


class FinancialYearOut(ApiModel):
    uid: str
    code: str
    start_date: date
    end_date: date
    status: FinancialYearStatus
    is_current: bool
    version: int


class AccountingPeriodOut(ApiModel):
    uid: str
    period_no: int
    name: str
    start_date: date
    end_date: date


# ─────────────────────────── Currency + exchange rate ────────────────────────
class CurrencyOut(ApiModel):
    uid: str
    code: str
    name: str
    symbol: str | None
    decimal_places: int
    use_indian_format: bool
    is_active: bool


class ExchangeRateCreate(InModel):
    from_currency_code: str = Field(..., min_length=3, max_length=3)
    to_currency_code: str = Field(..., min_length=3, max_length=3)
    rate_type: RateType = RateType.AVERAGE
    rate: float = Field(..., gt=0)
    effective_date: date
    source: str | None = None


class ExchangeRateOut(ApiModel):
    uid: str
    from_currency_code: str
    to_currency_code: str
    rate_type: str
    rate: float
    effective_date: date
    source: str | None
    version: int


# ─────────────────────────── Organisation structure (read model) ─────────────
class StructureWarehouse(ApiModel):
    uid: str
    code: str
    name: str
    warehouse_type: str
    is_active: bool


class StructurePlant(ApiModel):
    uid: str
    code: str
    name: str
    is_active: bool
    installed_capacity_per_day: float | None = None
    warehouses: list[StructureWarehouse] = Field(default_factory=list)


class StructureBranch(ApiModel):
    uid: str
    code: str
    name: str
    branch_type: str
    is_active: bool
    plants: list[StructurePlant] = Field(default_factory=list)
    warehouses: list[StructureWarehouse] = Field(default_factory=list)


class StructureUnit(ApiModel):
    """A department or cost centre — flat with a parent reference for the tree."""

    uid: str
    code: str
    name: str
    type: str
    level: int
    is_active: bool
    parent_uid: str | None = None


class StructureCompany(ApiModel):
    uid: str
    code: str
    legal_name: str
    trade_name: str | None = None
    gst_state_code: str | None = None


class OrgStructureOut(ApiModel):
    company: StructureCompany | None = None
    branches: list[StructureBranch] = Field(default_factory=list)
    departments: list[StructureUnit] = Field(default_factory=list)
    cost_centres: list[StructureUnit] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)
