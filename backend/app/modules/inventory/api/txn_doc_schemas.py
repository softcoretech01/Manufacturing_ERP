from __future__ import annotations

from datetime import date, datetime
from pydantic import Field
from app.core.schema import ApiModel, InModel

class StockTxnLineIn(InModel):
    item_id: int = Field(..., description="Legacy Item master ID")
    batch_no: str = Field(default="", max_length=60)
    expiry_date: date | None = None
    mfg_date: date | None = None
    quantity: float = Field(..., gt=0)
    rejected_quantity: float = Field(default=0, ge=0)
    unit_price: float = Field(default=0, ge=0)
    tax_rate: float = Field(default=0, ge=0)
    remarks: str | None = Field(default=None, max_length=300)

class StockTxnIn(InModel):
    txn_type: str = Field(..., description="STOCK_IN | STOCK_OUT | STOCK_RETURN | STOCK_TRANSFER | ADJUSTMENT")
    txn_date: date
    src_warehouse_uid: str | None = Field(default=None, max_length=26)
    dst_warehouse_uid: str | None = Field(default=None, max_length=26)
    department_id: int | None = None
    issued_to: str | None = Field(default=None, max_length=200)
    reference_type: str | None = Field(default=None, max_length=50)
    reference_no: str | None = Field(default=None, max_length=100)
    remarks: str | None = None
    lines: list[StockTxnLineIn]

class StockTxnLineOut(ApiModel):
    uid: str
    item_id: int
    item_code: str
    item_name: str
    item_type: str
    category: str
    uom: str
    batch_no: str
    expiry_date: date | None = None
    mfg_date: date | None = None
    quantity: float
    unit_price: float
    tax_rate: float
    tax_amount: float
    line_total: float
    remarks: str | None = None

class StockTxnOut(ApiModel):
    uid: str
    txn_type: str
    document_no: str | None = None
    txn_date: date
    src_warehouse_uid: str | None = None
    src_warehouse_code: str | None = None
    src_warehouse_name: str | None = None
    dst_warehouse_uid: str | None = None
    dst_warehouse_code: str | None = None
    dst_warehouse_name: str | None = None
    department_id: int | None = None
    department_code: str | None = None
    department_name: str | None = None
    issued_to: str | None = None
    reference_type: str | None = None
    reference_no: str | None = None
    remarks: str | None = None
    status: str
    posted_at: datetime | None = None
    posted_by_name: str | None = None
    subtotal: float
    tax_total: float
    grand_total: float
    lines: list[StockTxnLineOut]
    created_at: datetime
    updated_at: datetime
