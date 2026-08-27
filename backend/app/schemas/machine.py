import json
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date


class MachineCreateSchema(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    machineGroupId: int = Field(...)
    plantUid: str = Field(..., min_length=1, max_length=50)   # resolved to sys_plant.id
    lineId: int = Field(...)
    workCentreId: int = Field(...)
    manufacturer: str = Field(..., min_length=1, max_length=150)
    modelNumber: Optional[str] = Field(None, max_length=100)
    serialNumber: Optional[str] = Field(None, max_length=100)
    yearOfManufacture: Optional[int] = None
    assetCode: Optional[str] = Field(None, max_length=100)
    capacityPerHour: float
    capacityUom: str = Field(..., min_length=1, max_length=20)
    powerKw: Optional[float] = None
    operatorsRequired: int = Field(1)
    installedOn: Optional[date] = None
    warrantyUntil: Optional[date] = None
    pmFrequencyDays: int
    lastPmOn: Optional[date] = None
    nextPmOn: Optional[date] = None
    criticality: str = Field('C', max_length=10)
    currentState: str = Field('IDLE', max_length=30)
    oeePct: float = Field(0.0)
    operations: Optional[List[str]] = None
    status: str = Field('ACTIVE', max_length=30)


class MachinePatchSchema(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    machineGroupId: Optional[int] = None
    plantUid: Optional[str] = None
    lineId: Optional[int] = None
    workCentreId: Optional[int] = None
    manufacturer: Optional[str] = None
    modelNumber: Optional[str] = None
    serialNumber: Optional[str] = None
    yearOfManufacture: Optional[int] = None
    assetCode: Optional[str] = None
    capacityPerHour: Optional[float] = None
    capacityUom: Optional[str] = None
    powerKw: Optional[float] = None
    operatorsRequired: Optional[int] = None
    installedOn: Optional[date] = None
    warrantyUntil: Optional[date] = None
    pmFrequencyDays: Optional[int] = None
    lastPmOn: Optional[date] = None
    nextPmOn: Optional[date] = None
    criticality: Optional[str] = None
    currentState: Optional[str] = None
    oeePct: Optional[float] = None
    operations: Optional[List[str]] = None
    status: Optional[str] = None


class MachineResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    machineGroupId: Optional[int] = None
    machineGroup: Optional[str] = None          # group name (joined)
    machineGroupCode: Optional[str] = None
    plantId: Optional[int] = None
    plantCode: Optional[str] = None
    plantName: Optional[str] = None
    lineId: Optional[int] = None
    lineCode: Optional[str] = None
    lineName: Optional[str] = None
    workCentreId: Optional[int] = None
    workCentreCode: Optional[str] = None
    workCentreName: Optional[str] = None
    manufacturer: str
    modelNumber: Optional[str] = None
    serialNumber: Optional[str] = None
    yearOfManufacture: Optional[int] = None
    assetCode: Optional[str] = None
    capacityPerHour: float
    capacityUom: str
    powerKw: Optional[float] = None
    operatorsRequired: int
    installedOn: Optional[date] = None
    warrantyUntil: Optional[date] = None
    pmFrequencyDays: int
    lastPmOn: Optional[date] = None
    nextPmOn: Optional[date] = None
    criticality: str
    currentState: str
    oeePct: float
    operations: List[str]
    status: str
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime

    class Config:
        from_attributes = True
