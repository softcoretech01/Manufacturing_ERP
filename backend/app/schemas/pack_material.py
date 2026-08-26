from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.camel import CamelModel

class PackMaterialLineBase(CamelModel):
    packing_order_no: str = Field(..., max_length=50)
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=255)
    category: str = Field(..., max_length=50)
    standard_qty: float = Field(0.0)
    issued_qty: float = Field(0.0)
    consumed_qty: float = Field(0.0)
    uom: str = Field(..., max_length=20)
    unit_cost: float = Field(0.0)
    warehouse: str = Field(..., max_length=100)
    issued_on: Optional[datetime] = None
    issued_by: Optional[str] = Field(None, max_length=100)
    status: str = Field(..., max_length=20)

class PackMaterialLineCreate(PackMaterialLineBase):
    pass

class PackMaterialLineUpdate(CamelModel):
    packing_order_no: Optional[str] = Field(None, max_length=50)
    item_code: Optional[str] = Field(None, max_length=50)
    item_name: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = Field(None, max_length=50)
    standard_qty: Optional[float] = None
    issued_qty: Optional[float] = None
    consumed_qty: Optional[float] = None
    uom: Optional[str] = Field(None, max_length=20)
    unit_cost: Optional[float] = None
    warehouse: Optional[str] = Field(None, max_length=100)
    issued_on: Optional[datetime] = None
    issued_by: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field(None, max_length=20)

class PackMaterialLineResponse(PackMaterialLineBase):
    id: int
    doc_no: str
    created_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_by: Optional[str] = None
    modified_date: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
