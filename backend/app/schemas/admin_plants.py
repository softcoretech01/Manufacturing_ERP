from pydantic import BaseModel, Field, constr
from typing import Optional, List
from datetime import datetime, date


class BranchSchema(BaseModel):
    uid: str
    companyUid: Optional[str] = None
    code: str
    name: str
    branchType: Optional[str] = None
    gstin: Optional[constr(pattern=r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', max_length=15)] = None
    hasSeparateGstin: bool = False
    city: Optional[str] = None
    state: Optional[str] = None
    stateCode: Optional[str] = Field(None, max_length=2)
    pincode: Optional[str] = Field(None, max_length=10)
    contactPerson: Optional[str] = None
    phone: Optional[constr(pattern=r'^\d{10}$', max_length=10)] = None
    isActive: bool = True
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime


class PlantCreateSchema(BaseModel):
    companyUid: Optional[str] = None
    branchUid: str = Field(..., min_length=1)
    code: str = Field(..., max_length=10)
    name: str = Field(..., max_length=100)
    plantHead: Optional[str] = Field(None, max_length=100)
    factoryLicence: Optional[str] = Field(None, max_length=50)
    factoryLicenceValidTo: Optional[date] = None
    city: Optional[str] = Field(None, max_length=50)
    state: Optional[str] = Field(None, max_length=50)
    installedCapacityPerDay: Optional[int] = None
    capacityUom: Optional[str] = Field(None, max_length=20)
    shiftPattern: Optional[str] = Field(None, max_length=20)
    isActive: bool = True


class PlantPatchSchema(BaseModel):
    companyUid: Optional[str] = None
    branchUid: Optional[str] = None
    code: Optional[str] = None
    name: Optional[str] = None
    plantHead: Optional[str] = None
    factoryLicence: Optional[str] = None
    factoryLicenceValidTo: Optional[date] = None
    city: Optional[str] = None
    state: Optional[str] = None
    installedCapacityPerDay: Optional[int] = None
    capacityUom: Optional[str] = None
    shiftPattern: Optional[str] = None
    isActive: Optional[bool] = None


class PlantSchema(BaseModel):
    uid: str
    companyUid: Optional[str] = None
    branchUid: str
    code: str
    name: str
    plantHead: Optional[str] = None
    factoryLicence: Optional[str] = None
    factoryLicenceValidTo: Optional[date] = None
    city: Optional[str] = None
    state: Optional[str] = None
    installedCapacityPerDay: Optional[int] = None
    capacityUom: Optional[str] = None
    shiftPattern: Optional[str] = None
    linesCount: int = 0
    workCentresCount: int = 0
    isActive: bool = True
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime


class ProductionLineSchema(BaseModel):
    uid: str
    plantUid: str
    code: str
    name: str
    lineType: Optional[str] = None
    minCapacityMl: Optional[int] = None
    maxCapacityMl: Optional[int] = None
    cycleTimeSec: Optional[float] = None
    ratedOutputPerHour: Optional[int] = None
    status: str
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime


class WorkCentreSchema(BaseModel):
    uid: str
    plantUid: str
    lineUid: Optional[str] = None
    code: str
    name: str
    type: Optional[str] = None
    capacityPerHour: Optional[int] = None
    efficiencyPct: Optional[float] = None
    machineHourRate: Optional[float] = None
    isBottleneck: bool
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime


class WarehouseSchema(BaseModel):
    uid: str
    companyUid: Optional[str] = None
    branchUid: Optional[str] = None
    plantUid: Optional[str] = None
    code: str
    name: str
    warehouseType: Optional[str] = None
    isBinManaged: bool
    isBatchMandatory: bool
    allowNegativeStock: bool
    isSystemManaged: bool
    storekeeper: Optional[str] = None
    valuationMethod: Optional[str] = None
    binCount: int = 0
    stockValue: float = 0.0
    isActive: bool
    createdBy: Optional[str] = None
    createdDate: datetime
    modifiedBy: Optional[str] = None
    modifiedDate: datetime
