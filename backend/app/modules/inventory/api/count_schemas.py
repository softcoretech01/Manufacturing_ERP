from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.schema import ApiModel, InModel


class CountCreate(InModel):
    warehouse_uid: str = Field(..., min_length=1, max_length=26)
    count_type: str = Field(default="CYCLE", pattern="^(CYCLE|FULL)$")
    item_uid: str | None = Field(default=None, max_length=26)
    remarks: str | None = Field(default=None, max_length=300)


class CountEntry(InModel):
    line_uid: str = Field(..., min_length=1, max_length=26)
    counted_qty: float | None = Field(default=None, ge=0)
    reason_code: str | None = Field(default=None, max_length=40)
    root_cause: str | None = Field(default=None, max_length=40)
    remarks: str | None = Field(default=None, max_length=300)


class RecordCounts(InModel):
    entries: list[CountEntry] = Field(default_factory=list)


class CountOut(ApiModel):
    uid: str
    document_no: str
    warehouse_code: str | None
    count_type: str
    status: str
    count_date: date
    remarks: str | None
    counted_by_name: str | None
    submitted_at: datetime | None
    approved_at: datetime | None
    version: int
    line_count: int = 0
    variance_lines: int = 0
    counted: int = 0


class CountLineOut(ApiModel):
    uid: str
    item_code: str
    item_name: str
    uom: str
    batch_no: str
    stock_status: str
    system_qty: float | None
    counted_qty: float | None
    variance: float | None
    reason_code: str | None
    root_cause: str | None
    remarks: str | None


class CountDetail(ApiModel):
    count: CountOut
    blind: bool
    lines: list[CountLineOut]


class ApproveResult(ApiModel):
    document_no: str
    movements_posted: int
    net_value: float
    status: str
