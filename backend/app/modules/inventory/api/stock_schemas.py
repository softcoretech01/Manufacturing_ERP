from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.schema import ApiModel, InModel


class StockRow(ApiModel):
    item_uid: str
    item_code: str
    item_name: str
    uom: str
    item_type: str
    on_hand: float
    available: float
    quarantine: float
    blocked: float
    reorder_level: float | None
    value: float | None
    below_reorder: bool


class StockBalanceRow(ApiModel):
    item_uid: str
    item_code: str
    item_name: str
    category: str
    uom: str
    warehouse_uid: str | None
    warehouse_name: str | None
    batch_no: str
    available_qty: float
    reserved_qty: float
    total_qty: float
    unit_cost: float | None
    stock_value: float | None
    last_movement_date: datetime | None


class BatchRow(ApiModel):
    item_uid: str
    item_code: str
    item_name: str
    batch_no: str
    total_inward: float
    total_outward: float
    current_stock: float
    status: str
    last_movement_date: datetime | None


class LedgerRow(ApiModel):
    uid: str
    posted_at: datetime
    business_date: date
    movement_type: str
    direction: str
    quantity: float
    rate: float
    value: float
    balance_qty_after: float
    balance_rate_after: float
    balance_value_after: float
    document_type: str | None
    document_no: str | None
    batch_no: str
    stock_status: str
    posted_by_name: str | None


class LedgerItem(ApiModel):
    uid: str
    code: str
    name: str
    uom: str
    valuation_method: str


class LedgerResponse(ApiModel):
    item: LedgerItem
    rows: list[LedgerRow]
    totals: dict


class ReceiptRequest(InModel):
    item_uid: str = Field(..., min_length=1, max_length=26)
    warehouse_uid: str = Field(..., min_length=1, max_length=26)
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., ge=0)
    bin_uid: str | None = Field(default=None, max_length=26)
    batch_no: str = Field(default="", max_length=60)
    business_date: date | None = None
    remarks: str | None = Field(default=None, max_length=300)
    supplier_label: str | None = Field(default=None, max_length=200)


class ReceiptResult(ApiModel):
    document_no: str
    item_code: str
    warehouse_code: str
    quantity: float
    rate: float
    value: float
    stock_status: str
    balance_qty_after: float
    balance_rate_after: float
