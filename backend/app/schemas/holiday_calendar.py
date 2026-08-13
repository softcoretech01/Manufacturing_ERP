from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class HolidayCalendarSchema(BaseModel):
    id: Optional[str] = None
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    financialYear: str = Field(..., max_length=10)
    plant: str = Field(..., max_length=10)
    holidayCount: Optional[int] = 0
    nationalCount: Optional[int] = 0
    workingDays: Optional[int] = 0
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    usageCount: Optional[int] = 0
    isActive: Optional[bool] = True
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
