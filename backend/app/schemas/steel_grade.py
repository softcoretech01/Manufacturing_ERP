from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class SteelGradeCreateSchema(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    standard: str = Field(..., max_length=150)
    chromiumPct: Optional[str] = Field(None, max_length=50)
    nickelPct: Optional[str] = Field(None, max_length=50)
    carbonMaxPct: Optional[float] = None
    foodContact: bool = Field(False)
    application: Optional[str] = Field(None, max_length=255)
    
    status: str = Field('PENDING_APPROVAL', max_length=30)
    effectiveFrom: Optional[date] = Field(None)
    effectiveTo: Optional[date] = Field(None)
    revision: int = Field(1)


class SteelGradePatchSchema(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    standard: Optional[str] = None
    chromiumPct: Optional[str] = None
    nickelPct: Optional[str] = None
    carbonMaxPct: Optional[float] = None
    foodContact: Optional[bool] = None
    application: Optional[str] = None
    
    status: Optional[str] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    revision: Optional[int] = None


class SteelGradeResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    standard: str
    chromiumPct: Optional[str] = None
    nickelPct: Optional[str] = None
    carbonMaxPct: Optional[float] = None
    foodContact: bool
    application: Optional[str] = None
    
    status: str
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    revision: int
    usageCount: int
    
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime

    class Config:
        from_attributes = True
