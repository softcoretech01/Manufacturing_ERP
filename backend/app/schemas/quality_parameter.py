from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class QualityParameterSchema(BaseModel):
    id: Optional[str] = None
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    paramType: str = Field(..., max_length=20)
    stage: str = Field(..., max_length=20)
    nominal: Optional[str] = Field(None, max_length=100)
    tolerance: Optional[str] = Field(None, max_length=50)
    uom: Optional[str] = Field(None, max_length=20)
    instrument: Optional[str] = Field(None, max_length=100)
    isCritical: Optional[bool] = False
    method: Optional[str] = Field(None, max_length=500)
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    usageCount: Optional[int] = 0
    isActive: Optional[bool] = True
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
