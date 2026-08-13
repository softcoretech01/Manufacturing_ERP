from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class BottleModelCreateSchema(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    series: Optional[str] = Field(None, max_length=50)
    shellShape: Optional[str] = Field(None, max_length=50)
    dieSet: Optional[str] = Field(None, max_length=100)
    odMm: Optional[float] = Field(None)
    heightMm: Optional[float] = Field(None)
    isVacuum: bool = Field(False)
    launchYear: Optional[int] = Field(None)
    status: str = Field('ACTIVE', max_length=30)
    effectiveFrom: Optional[date] = Field(None)
    effectiveTo: Optional[date] = Field(None)
    revision: int = Field(1)


class BottleModelPatchSchema(BaseModel):
    """All optional — used for partial updates like status toggle."""
    code: Optional[str] = None
    name: Optional[str] = None
    series: Optional[str] = None
    shellShape: Optional[str] = None
    dieSet: Optional[str] = None
    odMm: Optional[float] = None
    heightMm: Optional[float] = None
    isVacuum: Optional[bool] = None
    launchYear: Optional[int] = None
    status: Optional[str] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    revision: Optional[int] = None


class BottleModelResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    series: Optional[str] = None
    shellShape: Optional[str] = None
    dieSet: Optional[str] = None
    odMm: Optional[float] = None
    heightMm: Optional[float] = None
    isVacuum: bool = False
    launchYear: Optional[int] = None
    status: str = 'ACTIVE'
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    revision: int = 1
    usageCount: int = 0
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime

    class Config:
        from_attributes = True
