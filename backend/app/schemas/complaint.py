from datetime import date, datetime
from typing import Optional
from pydantic import Field
from app.schemas.camel import CamelModel

class ComplaintBase(CamelModel):
    customer_name: str = Field(..., max_length=100)
    complaint_type: str = Field(..., max_length=100)
    severity: str = Field(..., max_length=50)
    item_code: str = Field(..., max_length=50)
    item_name: Optional[str] = Field(None, max_length=100)
    batch_no: Optional[str] = Field(None, max_length=50)
    production_order_no: Optional[str] = Field(None, max_length=50)
    invoice_no: Optional[str] = Field(None, max_length=50)
    qty_supplied: Optional[int] = None
    qty_complained: Optional[int] = None
    description: Optional[str] = None
    logged_on: Optional[date] = None
    logged_by: Optional[str] = Field(None, max_length=100)
    owner: Optional[str] = Field(None, max_length=100)
    due_on: Optional[date] = None
    status: str = Field('LOGGED', max_length=50)
    resolution: str = Field('PENDING', max_length=50)
    resolution_value: Optional[float] = None
    root_cause: Optional[str] = None
    cause_category: Optional[str] = Field(None, max_length=50)
    ncr_doc_no: Optional[str] = Field(None, max_length=50)
    capa_doc_no: Optional[str] = Field(None, max_length=50)
    closed_on: Optional[date] = None
    remarks: Optional[str] = None

class ComplaintCreate(ComplaintBase):
    pass

class ComplaintUpdate(ComplaintBase):
    customer_name: Optional[str] = Field(None, max_length=100)
    complaint_type: Optional[str] = Field(None, max_length=100)
    severity: Optional[str] = Field(None, max_length=50)
    item_code: Optional[str] = Field(None, max_length=50)

class ComplaintResponse(ComplaintBase):
    id: int
    doc_no: str
    version: int
    deleted_at: Optional[datetime] = None
