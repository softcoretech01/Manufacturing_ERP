from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


class ProductSpecSchema(BaseModel):
    id: Optional[str] = None
    materialGrade: Optional[str] = None
    thicknessMm: Optional[float] = None
    diameterMm: Optional[float] = None
    heightMm: Optional[float] = None
    neckDiameterMm: Optional[float] = None
    baseDiameterMm: Optional[float] = None
    capacityMl: Optional[float] = None
    wallThicknessMm: Optional[float] = None
    vacuumType: Optional[str] = None
    insulationType: Optional[str] = None
    coatingType: Optional[str] = None
    paintSpec: Optional[str] = None
    surfaceFinish: Optional[str] = None
    logoSpec: Optional[str] = None
    printingMethod: Optional[str] = None
    packagingStandard: Optional[str] = None


class EngProductSchema(BaseModel):
    uid: Optional[str] = None
    code: Optional[str] = None  # Optional on creation as DB generates it
    name: str
    productType: str
    family: Optional[str] = None
    brand: Optional[str] = None
    capacityMl: Optional[float] = None
    colour: Optional[str] = None
    netWeightG: Optional[float] = None
    baseUom: str
    lifecycle: str
    revision: int = 1
    effectiveFrom: Optional[date] = None
    standardCost: float = 0.00
    costRolledAt: Optional[datetime] = None
    remarks: Optional[str] = Field(None, max_length=500)
    version: int = 1
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedAt: Optional[datetime] = None
    spec: Optional[ProductSpecSchema] = None
