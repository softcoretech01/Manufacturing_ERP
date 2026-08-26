from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class PackagingCreateSchema(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    packType: str = Field(..., max_length=50)
    unitsPerPack: int
    lengthMm: Optional[int] = None
    widthMm: Optional[int] = None
    heightMm: Optional[int] = None
    tareWeightG: Optional[int] = None
    isExportGrade: bool = Field(False)
    
    status: str = Field('ACTIVE', max_length=30)
    effectiveFrom: Optional[date] = Field(None)
    effectiveTo: Optional[date] = Field(None)
    revision: int = Field(1)


class PackagingPatchSchema(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    packType: Optional[str] = None
    unitsPerPack: Optional[int] = None
    lengthMm: Optional[int] = None
    widthMm: Optional[int] = None
    heightMm: Optional[int] = None
    tareWeightG: Optional[int] = None
    isExportGrade: Optional[bool] = None
    
    status: Optional[str] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    revision: Optional[int] = None


class PackagingResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    packType: str
    unitsPerPack: int
    lengthMm: Optional[int] = None
    widthMm: Optional[int] = None
    heightMm: Optional[int] = None
    tareWeightG: Optional[int] = None
    isExportGrade: bool
    
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
