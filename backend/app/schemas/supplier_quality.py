from datetime import datetime
from typing import Optional, List
from pydantic import Field
from app.schemas.camel import CamelModel

class SupplierQualityBase(CamelModel):
    supplier_code: str = Field(..., max_length=50)
    supplier_name: Optional[str] = Field(None, max_length=150)
    period: str = Field(..., max_length=50)
    lots_received: Optional[int] = 0
    lots_accepted: Optional[int] = 0
    lots_rejected: Optional[int] = 0
    qty_received: Optional[int] = 0
    qty_rejected: Optional[int] = 0
    lots_with_valid_docs: Optional[int] = 0
    ncrs_raised: Optional[int] = 0
    ncrs_closed_on_time: Optional[int] = 0
    capa_response_days: Optional[int] = 0

class SupplierQualityCreate(SupplierQualityBase):
    pass

class SupplierQualityUpdate(SupplierQualityBase):
    pass

class SupplierQualityResponse(SupplierQualityBase):
    id: Optional[int] = None
    uid: Optional[str] = None
    version: Optional[int] = 1
    deleted_at: Optional[datetime] = None
