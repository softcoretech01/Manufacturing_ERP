from typing import Optional, List, Any
from datetime import date, datetime
from pydantic import BaseModel, Field

class PlanCharacteristicBase(BaseModel):
    seq: int
    name: str
    type: str
    uom: Optional[str] = None
    target: Optional[float] = None
    lowerLimit: Optional[float] = None
    upperLimit: Optional[float] = None
    instrumentCode: Optional[str] = None
    severity: str
    isMandatory: bool = False
    requiresPhoto: bool = False
    method: Optional[str] = None

class PlanCharacteristicResponse(PlanCharacteristicBase):
    id: int
    planId: int
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None

    class Config:
        from_attributes = True

class InspectionPlanBase(BaseModel):
    name: str
    stage: str
    itemCode: str
    itemName: Optional[str] = None
    operationCode: Optional[str] = None
    samplingMethod: str
    aql: Optional[float] = None
    fixedSampleSize: Optional[int] = None
    randomPercent: Optional[float] = None
    revision: int = 1
    status: str
    effectiveFrom: Optional[date] = None
    inspectorRole: Optional[str] = None
    frequency: Optional[str] = None
    remarks: Optional[str] = None
    approvedBy: Optional[str] = None

class InspectionPlanCreate(InspectionPlanBase):
    characteristics: List[PlanCharacteristicBase] = []

class InspectionPlanUpdate(InspectionPlanBase):
    characteristics: List[PlanCharacteristicBase] = []

class InspectionPlanResponse(InspectionPlanBase):
    id: int
    planCode: str
    version: int
    deletedAt: Optional[datetime] = None
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
    characteristics: List[PlanCharacteristicResponse] = []

    class Config:
        from_attributes = True
