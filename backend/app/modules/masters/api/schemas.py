from __future__ import annotations

from pydantic import Field

from app.core.schema import ApiModel, InModel


class ItemCreate(InModel):
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field(default="RAW_MATERIAL")
    base_uom: str = Field(default="NOS", max_length=10)
    hsn_code: str | None = Field(default=None, max_length=10)
    is_batch_tracked: bool = False
    is_serial_tracked: bool = False
    valuation_method: str = Field(default="WEIGHTED_AVG")
    qty_precision: int = Field(default=3, ge=0, le=6)
    reorder_level: float | None = Field(default=None, ge=0)
    min_level: float | None = Field(default=None, ge=0)
    max_level: float | None = Field(default=None, ge=0)
    standard_rate: float | None = Field(default=None, ge=0)
    default_receipt_status: str = Field(default="AVAILABLE")


class ItemUpdate(InModel):
    version: int = Field(..., ge=1)
    name: str | None = Field(default=None, max_length=200)
    item_type: str | None = None
    base_uom: str | None = Field(default=None, max_length=10)
    hsn_code: str | None = Field(default=None, max_length=10)
    is_batch_tracked: bool | None = None
    is_serial_tracked: bool | None = None
    valuation_method: str | None = None
    qty_precision: int | None = Field(default=None, ge=0, le=6)
    reorder_level: float | None = Field(default=None, ge=0)
    min_level: float | None = Field(default=None, ge=0)
    max_level: float | None = Field(default=None, ge=0)
    standard_rate: float | None = Field(default=None, ge=0)
    default_receipt_status: str | None = None
    is_blocked_for_movement: bool | None = None


class ItemOut(ApiModel):
    uid: str
    code: str
    name: str
    item_type: str
    base_uom: str
    hsn_code: str | None
    is_batch_tracked: bool
    is_serial_tracked: bool
    valuation_method: str
    qty_precision: int
    reorder_level: float | None
    min_level: float | None
    max_level: float | None
    standard_rate: float | None
    is_active: bool
    is_blocked_for_movement: bool
    default_receipt_status: str
    version: int
