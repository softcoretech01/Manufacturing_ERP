from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

class ItemUomConversionSchema(BaseModel):
    uom: str = Field(..., min_length=1, max_length=20)
    factor: float = Field(...)
    purpose: str = Field(..., min_length=1, max_length=20)

class ItemBaseSchema(BaseModel):
    code: str = Field(..., description="Auto or Code")
    name: str = Field(..., min_length=1, max_length=150)
    shortName: str = Field(..., min_length=1, max_length=50)
    itemType: str = Field(..., min_length=1, max_length=30)
    category: str = Field(..., min_length=1, max_length=100)
    family: Optional[str] = Field(None, max_length=100)
    series: Optional[str] = Field(None, max_length=100)
    baseUom: str = Field(..., min_length=1, max_length=20)
    purchaseUom: str = Field(..., min_length=1, max_length=20)
    salesUom: str = Field(..., min_length=1, max_length=20)
    hsnCode: Optional[str] = Field(None, max_length=20)
    gstRate: float = Field(0)
    
    capacityMl: Optional[int] = Field(None)
    bottleModel: Optional[str] = Field(None, max_length=100)
    colour: Optional[str] = Field(None, max_length=50)
    finishType: Optional[str] = Field(None, max_length=50)
    lidType: Optional[str] = Field(None, max_length=50)
    steelGrade: Optional[str] = Field(None, max_length=50)
    thicknessMm: Optional[float] = Field(None)
    isVacuumInsulated: bool = Field(False)
    netWeightG: Optional[float] = Field(None)
    
    isBatchTracked: bool = Field(False)
    isSerialTracked: bool = Field(False)
    shelfLifeDays: Optional[int] = Field(None)
    valuationMethod: str = Field(..., min_length=1, max_length=20)
    
    standardCost: float = Field(0)
    lastPurchaseRate: float = Field(0)
    sellingPrice: float = Field(0)
    reorderLevel: float = Field(0)
    reorderQty: float = Field(0)
    minStock: float = Field(0)
    maxStock: float = Field(0)
    leadTimeDays: int = Field(0)
    
    requiresIncomingInspection: bool = Field(False)
    inspectionPlanCode: Optional[str] = Field(None, max_length=50)
    drawingNo: Optional[str] = Field(None, max_length=100)
    specification: Optional[str] = Field(None)
    isPurchased: bool = Field(False)
    isManufactured: bool = Field(False)
    isSold: bool = Field(False)
    preferredSupplier: Optional[str] = Field(None, max_length=150)
    
    status: str = Field('ACTIVE', max_length=20)
    effectiveFrom: Optional[date] = Field(None)
    effectiveTo: Optional[date] = Field(None)

class ItemCreateSchema(ItemBaseSchema):
    uomConversions: List[ItemUomConversionSchema] = Field(default_factory=list)

class ItemUpdateSchema(ItemBaseSchema):
    uomConversions: List[ItemUomConversionSchema] = Field(default_factory=list)

class ItemPatchSchema(BaseModel):
    """For partial updates like status toggle — all fields optional."""
    code: Optional[str] = None
    name: Optional[str] = None
    shortName: Optional[str] = None
    itemType: Optional[str] = None
    category: Optional[str] = None
    family: Optional[str] = None
    series: Optional[str] = None
    baseUom: Optional[str] = None
    purchaseUom: Optional[str] = None
    salesUom: Optional[str] = None
    hsnCode: Optional[str] = None
    gstRate: Optional[float] = None
    capacityMl: Optional[int] = None
    bottleModel: Optional[str] = None
    colour: Optional[str] = None
    finishType: Optional[str] = None
    lidType: Optional[str] = None
    steelGrade: Optional[str] = None
    thicknessMm: Optional[float] = None
    isVacuumInsulated: Optional[bool] = None
    netWeightG: Optional[float] = None
    isBatchTracked: Optional[bool] = None
    isSerialTracked: Optional[bool] = None
    shelfLifeDays: Optional[int] = None
    valuationMethod: Optional[str] = None
    standardCost: Optional[float] = None
    lastPurchaseRate: Optional[float] = None
    sellingPrice: Optional[float] = None
    reorderLevel: Optional[float] = None
    reorderQty: Optional[float] = None
    minStock: Optional[float] = None
    maxStock: Optional[float] = None
    leadTimeDays: Optional[int] = None
    requiresIncomingInspection: Optional[bool] = None
    inspectionPlanCode: Optional[str] = None
    drawingNo: Optional[str] = None
    specification: Optional[str] = None
    isPurchased: Optional[bool] = None
    isManufactured: Optional[bool] = None
    isSold: Optional[bool] = None
    preferredSupplier: Optional[str] = None
    status: Optional[str] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    uomConversions: Optional[List[ItemUomConversionSchema]] = None

class ItemResponseSchema(ItemBaseSchema):
    id: int
    uomConversions: List[ItemUomConversionSchema] = Field(default_factory=list)
    revisions: list = Field(default_factory=list)
    whereUsed: list = Field(default_factory=list)
    
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime

    class Config:
        from_attributes = True
