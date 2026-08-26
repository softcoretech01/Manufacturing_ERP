from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class LidTypeCreateSchema(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    closureType: str = Field(..., max_length=50)
    material: str = Field(..., max_length=50)
    threadSpec: Optional[str] = Field(None, max_length=100)
    sealMaterial: Optional[str] = Field(None, max_length=50)
    leakTestBar: Optional[float] = Field(None)
    foodGradeCert: Optional[str] = Field(None, max_length=100)
    
    status: str = Field('PENDING_APPROVAL', max_length=30)
    effectiveFrom: Optional[date] = Field(None)
    effectiveTo: Optional[date] = Field(None)
    revision: int = Field(1)


class LidTypePatchSchema(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    closureType: Optional[str] = None
    material: Optional[str] = None
    threadSpec: Optional[str] = None
    sealMaterial: Optional[str] = None
    leakTestBar: Optional[float] = None
    foodGradeCert: Optional[str] = None
    
    status: Optional[str] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    revision: Optional[int] = None


class LidTypeResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    closureType: str
    material: str
    threadSpec: Optional[str] = None
    sealMaterial: Optional[str] = None
    leakTestBar: Optional[float] = None
    foodGradeCert: Optional[str] = None
    
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
