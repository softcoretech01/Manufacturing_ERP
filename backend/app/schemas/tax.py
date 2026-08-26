from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class TaxSchema(BaseModel):
    id: Optional[int] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=250)
    taxType: str = Field(..., max_length=20)
    rate: float
    appliesTo: Optional[str] = Field(None, max_length=20)
    isReverseCharge: Optional[bool] = False
    glAccount: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field('ACTIVE', max_length=20)
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    revision: Optional[int] = 1
    usageCount: Optional[int] = 0
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
