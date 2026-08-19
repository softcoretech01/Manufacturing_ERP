from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.camel import CamelModel

class PackingOrderBase(CamelModel):
    status: str = Field(..., max_length=50)
    source_type: str = Field(..., max_length=50)
    source_no: str = Field(..., max_length=50)
    customer: str = Field(..., max_length=255)
    customer_code: str = Field(..., max_length=50)
    sales_order_no: Optional[str] = Field(None, max_length=50)
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=255)
    batch_no: Optional[str] = Field(None, max_length=50)
    quantity: int
    packed_quantity: int = 0
    uom: str = Field(..., max_length=20)
    warehouse: str = Field(..., max_length=100)
    packing_date: datetime
    supervisor: str = Field(..., max_length=100)
    carton_spec: str = Field(..., max_length=255)
    cartons_planned: int
    cartons_packed: int = 0
    material_ready: bool = False
    qc_released: bool = False
    weight_verified: bool = False
    priority: str = Field(..., max_length=20)
    is_export: bool = False
    is_oem: bool = False
    remarks: Optional[str] = Field(None, max_length=1000)

class PackingOrderCreate(PackingOrderBase):
    pass

class PackingOrderUpdate(CamelModel):
    status: Optional[str] = Field(None, max_length=50)
    packed_quantity: Optional[int] = None
    cartons_packed: Optional[int] = None
    material_ready: Optional[bool] = None
    qc_released: Optional[bool] = None
    weight_verified: Optional[bool] = None
    priority: Optional[str] = Field(None, max_length=20)
    remarks: Optional[str] = Field(None, max_length=1000)

class PackingOrderResponse(PackingOrderBase):
    id: int
    doc_no: str
    doc_date: datetime
    created_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_by: Optional[str] = None
    modified_date: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
