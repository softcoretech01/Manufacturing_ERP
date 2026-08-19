from datetime import datetime
from typing import Optional
from pydantic import Field
from app.schemas.camel import CamelModel

class CapaBase(CamelModel):
    title: str = Field(..., max_length=255)
    ncr_doc_no: Optional[str] = Field(None, max_length=50)
    item_code: Optional[str] = Field(None, max_length=50)
    root_cause: Optional[str] = Field(None, max_length=2000)
    cause_category: Optional[str] = Field(None, max_length=50)
    corrective_action: Optional[str] = Field(None, max_length=2000)
    preventive_action: Optional[str] = Field(None, max_length=2000)
    owner: Optional[str] = Field(None, max_length=100)
    due_on: Optional[datetime] = None
    status: str = Field('DRAFT', max_length=50)
    verification_method: Optional[str] = Field(None, max_length=2000)
    verification_result: Optional[str] = Field(None, max_length=2000)
    verified_by: Optional[str] = Field(None, max_length=100)
    verified_on: Optional[datetime] = None
    closed_on: Optional[datetime] = None
    recurrence_checked: Optional[bool] = False
    effectiveness_pct: Optional[int] = None

class CapaCreate(CapaBase):
    pass

class CapaUpdate(CapaBase):
    title: Optional[str] = Field(None, max_length=255)
    status: Optional[str] = Field(None, max_length=50)

class CapaResponse(CapaBase):
    id: int
    doc_no: str
    raised_on: Optional[datetime] = None
    version: int
    deleted_at: Optional[datetime] = None
