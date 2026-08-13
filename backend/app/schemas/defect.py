from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class DefectSchema(BaseModel):
    id: Optional[str] = None
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    category: str = Field(..., max_length=50)
    stage: str = Field(..., max_length=50)
    severity: str = Field(..., max_length=20)
    disposition: Optional[str] = Field(None, max_length=50)
    reworkable: Optional[bool] = False
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    usageCount: Optional[int] = 0
    isActive: Optional[bool] = True
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
