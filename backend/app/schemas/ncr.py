from datetime import datetime
from typing import Optional, List
from pydantic import Field
from app.schemas.camel import CamelModel

class NcrStepBase(CamelModel):
    level: int
    question: Optional[str] = Field(None, max_length=1000)
    answer: Optional[str] = Field(None, max_length=1000)

class NcrStepCreate(NcrStepBase):
    pass

class NcrStepResponse(NcrStepBase):
    id: int
    ncr_id: int
    created_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_by: Optional[str] = None
    modified_date: Optional[datetime] = None

class NcrBase(CamelModel):
    source: str = Field(..., max_length=50)
    severity: str = Field(..., max_length=20)
    title: str = Field(..., max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    item_code: Optional[str] = Field(None, max_length=50)
    item_name: Optional[str] = Field(None, max_length=255)
    batch_no: Optional[str] = Field(None, max_length=50)
    origin_doc_no: Optional[str] = Field(None, max_length=50)
    supplier_code: Optional[str] = Field(None, max_length=50)
    quantity_affected: Optional[float] = 0
    quantity_scrapped: Optional[float] = 0
    quantity_reworked: Optional[float] = 0
    uom: Optional[str] = Field(None, max_length=20)
    containment: Optional[str] = Field(None, max_length=2000)
    contained_at: Optional[datetime] = None
    root_cause: Optional[str] = Field(None, max_length=2000)
    cause_category: Optional[str] = Field(None, max_length=50)
    status: str = Field('OPEN', max_length=50)
    owner: Optional[str] = Field(None, max_length=100)
    due_on: Optional[datetime] = None
    closed_on: Optional[datetime] = None
    capa_doc_no: Optional[str] = Field(None, max_length=50)
    cost_impact: Optional[float] = 0
    remarks: Optional[str] = Field(None, max_length=2000)

class NcrCreate(NcrBase):
    five_whys: Optional[List[NcrStepCreate]] = []

class NcrUpdate(NcrBase):
    five_whys: Optional[List[NcrStepCreate]] = []

class NcrResponse(NcrBase):
    id: int
    doc_no: str
    raised_by: Optional[str] = None
    raised_on: Optional[datetime] = None
    version: int
    deleted_at: Optional[datetime] = None
    five_whys: Optional[List[NcrStepResponse]] = []
