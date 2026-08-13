from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.schema import ApiModel, InModel


class SeriesBase(InModel):
    document_type: str = Field(..., min_length=1, max_length=50)
    document_label: str = Field(..., min_length=1, max_length=120)
    sub_type: str | None = Field(default=None, max_length=50)
    branch_code: str | None = Field(default=None, max_length=20)
    plant_code: str | None = Field(default=None, max_length=20)
    fy_code: str | None = Field(default=None, max_length=12)
    scope_branch_id: int | None = None
    plant_id: int | None = None
    format_string: str = Field(..., min_length=1, max_length=120)
    prefix: str | None = Field(default=None, max_length=20)
    padding_width: int = Field(default=5, ge=1, le=12)
    allow_widen: bool = False
    start_number: int = Field(default=1, ge=0)
    increment_by: int = Field(default=1, ge=1, le=100)
    reset_frequency: str = Field(default="FINANCIAL_YEARLY")
    allocate_on: str = Field(default="DRAFT")
    is_statutory: bool = False
    is_gapless: bool = False
    is_default: bool = False
    is_active: bool = True
    valid_from: date | None = None
    valid_to: date | None = None


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(SeriesBase):
    version: int = Field(..., ge=1)


class SeriesOut(ApiModel):
    uid: str
    document_type: str
    document_label: str
    sub_type: str | None
    branch_code: str | None
    plant_code: str | None
    fy_code: str | None
    format_string: str
    prefix: str | None
    padding_width: int
    allow_widen: bool
    start_number: int
    increment_by: int
    current_number: int
    reset_frequency: str
    allocate_on: str
    is_statutory: bool
    is_gapless: bool
    is_default: bool
    is_active: bool
    issued_count: int
    last_issued_at: datetime | None
    version: int
    next_number: str


class PreviewRequest(InModel):
    format_string: str = Field(..., min_length=1, max_length=120)
    prefix: str | None = Field(default=None, max_length=20)
    padding_width: int = Field(default=5, ge=1, le=12)
    start_number: int = Field(default=1, ge=0)
    sub_type: str | None = None
    branch_code: str | None = None
    plant_code: str | None = None
    fy_code: str | None = None
    is_statutory: bool = False
    is_gapless: bool = False
    allocate_on: str = "DRAFT"


class SimulateRequest(InModel):
    document_type: str
    sub_type: str | None = None
    branch_code: str | None = None
    plant_code: str | None = None
    on_date: date | None = None


class AllocationOut(ApiModel):
    uid: str
    sequence: int
    formatted_number: str
    entity_label: str | None
    status: str
    reason: str | None
    allocated_by_name: str | None
    allocated_at: datetime


class VoidRequest(InModel):
    formatted_number: str = Field(..., min_length=1, max_length=120)
    reason: str = Field(..., min_length=1, max_length=500)
