from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class BottleColourCreateSchema(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    hex: str = Field(..., max_length=20)
    ralCode: str = Field(..., max_length=50)
    finish: str = Field(..., max_length=50)
    process: Optional[str] = Field(None, max_length=50)
    consumable: Optional[str] = Field(None, max_length=150)
    
    status: str = Field('ACTIVE', max_length=30)
    effectiveFrom: Optional[date] = Field(None)
    effectiveTo: Optional[date] = Field(None)
    revision: int = Field(1)


class BottleColourPatchSchema(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    hex: Optional[str] = None
    ralCode: Optional[str] = None
    finish: Optional[str] = None
    process: Optional[str] = None
    consumable: Optional[str] = None
    
    status: Optional[str] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    revision: Optional[int] = None


class BottleColourResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    hex: str
    ralCode: str
    finish: str
    process: Optional[str] = None
    consumable: Optional[str] = None
    
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
