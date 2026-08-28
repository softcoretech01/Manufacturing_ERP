from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.schema import ApiModel, InModel


class _Loc(InModel):
    item_uid: str = Field(..., min_length=1, max_length=26)
    warehouse_uid: str = Field(..., min_length=1, max_length=26)
    quantity: float = Field(..., gt=0)
    bin_uid: str | None = Field(default=None, max_length=26)
    batch_no: str = Field(default="", max_length=60)
    business_date: date | None = None
    remarks: str | None = Field(default=None, max_length=300)


class IssueRequest(_Loc):
    department_uid: str | None = None


class ReturnRequest(_Loc):
    rate: float | None = Field(default=None, ge=0)


class AdjustRequest(_Loc):
    direction: str = Field(..., pattern="^(IN|OUT)$")
    reason: str = Field(..., min_length=1, max_length=300)
    rate: float | None = Field(default=None, ge=0)


class ScrapRequest(_Loc):
    reason: str = Field(..., min_length=1, max_length=300)


class PutawayRequest(InModel):
    item_uid: str = Field(..., min_length=1, max_length=26)
    warehouse_uid: str = Field(..., min_length=1, max_length=26)
    to_bin_uid: str = Field(..., min_length=1, max_length=26)
    quantity: float = Field(..., gt=0)
    from_bin_uid: str | None = Field(default=None, max_length=26)
    batch_no: str = Field(default="", max_length=60)
    business_date: date | None = None
    remarks: str | None = Field(default=None, max_length=300)


class TransferRequest(InModel):
    item_uid: str = Field(..., min_length=1, max_length=26)
    from_warehouse_uid: str = Field(..., min_length=1, max_length=26)
    to_warehouse_uid: str = Field(..., min_length=1, max_length=26)
    quantity: float = Field(..., gt=0)
    bin_uid: str | None = Field(default=None, max_length=26)
    to_bin_uid: str | None = Field(default=None, max_length=26)
    batch_no: str = Field(default="", max_length=60)
    business_date: date | None = None
    remarks: str | None = Field(default=None, max_length=300)


class MovementResult(ApiModel):
    document_no: str
    movement_type: str
    direction: str
    quantity: float
    rate: float
    value: float
    balance_qty_after: float
    balance_rate_after: float


class TransferResult(ApiModel):
    document_no: str
    item_code: str
    from_warehouse: str
    to_warehouse: str
    quantity: float
    rate: float
    source_balance_after: float
    dest_balance_after: float


class MovementRow(ApiModel):
    uid: str
    posted_at: datetime
    business_date: date
    movement_type: str
    direction: str
    quantity: float
    rate: float
    value: float
    balance_qty_after: float
    document_no: str | None
    batch_no: str
    stock_status: str
    remarks: str | None
    posted_by_name: str | None
    item_code: str
    item_name: str
    warehouse_code: str | None
