from pydantic import BaseModel, constr, Field
from typing import Optional
from datetime import datetime

class ShiftSchema(BaseModel):
    id: Optional[str] = None
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    startTime: str = Field(..., max_length=50)
    endTime: str = Field(..., max_length=50)
    breakMinutes: Optional[int] = None
    netHours: Optional[float] = None
    crossesMidnight: Optional[bool] = False
    nightAllowance: Optional[bool] = False
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    usageCount: Optional[int] = 0
    isActive: Optional[bool] = True
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None

    class Config:
        from_attributes = True
