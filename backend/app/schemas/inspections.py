from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

class InspectionDefectBase(CamelModel):
    defectCode: str = Field(..., max_length=50)
    defectName: str = Field(..., max_length=150)
    severity: str = Field(..., max_length=20)
    qty: float
    source: str = Field(..., max_length=100)
    remarks: Optional[str] = Field(None, max_length=255)

class InspectionDefectResponse(InspectionDefectBase):
    id: int
    inspectionId: int
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None

class InspectionReadingBase(CamelModel):
    characteristicId: Optional[int] = None
    name: str = Field(..., max_length=150)
    type: str = Field(..., max_length=30)
    uom: Optional[str] = Field(None, max_length=20)
    target: Optional[float] = None
    lowerLimit: Optional[float] = None
    upperLimit: Optional[float] = None
    instrumentCode: Optional[str] = Field(None, max_length=50)
    severity: str = Field(..., max_length=20)
    isMandatory: bool = False
    requiresPhoto: bool = False
    actual: Optional[float] = None
    verdict: str = Field(..., max_length=20)
    photoAttached: bool = False
    remarks: Optional[str] = Field(None, max_length=255)

class InspectionReadingResponse(InspectionReadingBase):
    id: int
    inspectionId: int
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None

class InspectionBase(CamelModel):
    stage: str = Field(..., max_length=20)
    sourceType: str = Field(..., max_length=50)
    sourceDocNo: str = Field(..., max_length=50)
    itemCode: str = Field(..., max_length=50)
    itemName: str = Field(..., max_length=150)
    uom: Optional[str] = Field(None, max_length=20)
    batchNo: Optional[str] = Field(None, max_length=50)
    supplierCode: Optional[str] = Field(None, max_length=50)
    supplierName: Optional[str] = Field(None, max_length=150)
    operationCode: Optional[str] = Field(None, max_length=50)
    workCentreCode: Optional[str] = Field(None, max_length=50)
    machineCode: Optional[str] = Field(None, max_length=50)
    shift: Optional[str] = Field(None, max_length=10)
    planDocNo: str = Field(..., max_length=50)
    planRevision: int = 1
    lotSize: float
    sampleSize: float
    acceptNumber: int
    rejectNumber: int
    samplingMethod: str = Field(..., max_length=30)
    aql: float
    acceptedQty: float
    rejectedQty: float
    reworkQty: float
    status: str = Field(..., max_length=20)
    disposition: str = Field(..., max_length=30)
    dispositionReason: Optional[str] = Field(None, max_length=255)
    inspector: str = Field(..., max_length=100)
    inspectedAt: Optional[datetime] = None
    approvedBy: Optional[str] = Field(None, max_length=100)
    approvedAt: Optional[datetime] = None
    ncrDocNo: Optional[str] = Field(None, max_length=50)
    remarks: Optional[str] = None

class InspectionCreate(InspectionBase):
    readings: List[InspectionReadingBase] = []
    defects: List[InspectionDefectBase] = []

class InspectionUpdate(InspectionBase):
    readings: List[InspectionReadingBase] = []
    defects: List[InspectionDefectBase] = []

class InspectionResponse(InspectionBase):
    id: int
    docNo: str
    version: int
    deletedAt: Optional[datetime] = None
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
    readings: List[InspectionReadingResponse] = []
    defects: List[InspectionDefectResponse] = []
