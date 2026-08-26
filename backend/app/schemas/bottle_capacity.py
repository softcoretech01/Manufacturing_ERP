from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class BottleCapacityCreateSchema(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    nominalMl: int = Field(...)
    brimfulMl: Optional[int] = Field(None)
    ozLabel: Optional[str] = Field(None, max_length=50)
    segment: Optional[str] = Field(None, max_length=50)
    
    status: str = Field('ACTIVE', max_length=30)
    effectiveFrom: Optional[date] = Field(None)
    effectiveTo: Optional[date] = Field(None)
    revision: int = Field(1)


class BottleCapacityPatchSchema(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    nominalMl: Optional[int] = None
    brimfulMl: Optional[int] = None
    ozLabel: Optional[str] = None
    segment: Optional[str] = None
    
    status: Optional[str] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    revision: Optional[int] = None


class BottleCapacityResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    nominalMl: int
    brimfulMl: Optional[int] = None
    ozLabel: Optional[str] = None
    segment: Optional[str] = None
    
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
