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
    # The raw enum (RAW_MATERIAL, CONSUMABLE, …) for filtering and badges, and
    # the same value as a human label. The row carried only the label, so a grid
    # binding to `item_type` rendered an empty badge.
    item_type: str
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


class ItemOut(ApiModel):
    """An item as the stock screens need it.

    Deliberately the ``mst_item`` row and not the procurement ``Item`` master:
    stock is keyed on this table's ULID, so anything that will be posted as an
    ``item_uid`` must come from here. See ``GrnPostingService`` on why the two
    masters are bridged rather than merged.
    """

    uid: str
    code: str
    name: str
    item_type: str
    base_uom: str
    hsn_code: str | None = None
    is_batch_tracked: bool
    is_serial_tracked: bool
    valuation_method: str
    qty_precision: int
    reorder_level: float | None = None
    min_level: float | None = None
    max_level: float | None = None
    standard_rate: float | None = None
    is_active: bool
    is_blocked_for_movement: bool
    default_receipt_status: str
    version: int
