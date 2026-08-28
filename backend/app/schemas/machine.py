"""Machine master contracts.

Field limits mirror the `Machine` table and the `SpMachine` signature exactly, so
an over-long or out-of-range value is rejected as a 422 with a field path rather
than reaching MariaDB and surfacing as a 500 (data too long) or a 409.
"""

from datetime import date, datetime
from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

CRITICALITIES = ("A", "B", "C")
MACHINE_STATES = ("RUNNING", "IDLE", "MAINTENANCE", "BREAKDOWN", "DECOMMISSIONED")
MACHINE_STATUSES = ("ACTIVE", "INACTIVE")

# Machine.CapacityPerHour / PowerKw are DECIMAL(10,2); OeePct is DECIMAL(5,2).
_DECIMAL_10_2_MAX = 99_999_999.99
_CURRENT_YEAR = datetime.now().year

Code = Annotated[str, Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9][A-Za-z0-9/_-]*$")]
Name = Annotated[str, Field(min_length=2, max_length=150)]
Fk = Annotated[int, Field(ge=1)]


class _MachineBase(BaseModel):
    """Validation shared by create and patch; each re-declares its own optionality."""

    @field_validator("name", "manufacturer", "modelNumber", "serialNumber",
                     "assetCode", "capacityUom", "code", mode="before", check_fields=False)
    @classmethod
    def _strip(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("criticality", "currentState", "status", "capacityUom",
                     mode="before", check_fields=False)
    @classmethod
    def _upper(cls, v: object) -> object:
        return v.strip().upper() if isinstance(v, str) else v

    @field_validator("operations", mode="before", check_fields=False)
    @classmethod
    def _clean_operations(cls, v: object) -> object:
        if v is None:
            return v
        if isinstance(v, str):
            v = v.split(",")
        if not isinstance(v, list):
            raise ValueError("operations must be a list of operation names")
        cleaned = [str(op).strip() for op in v if str(op).strip()]
        if len(cleaned) > 30:
            raise ValueError("at most 30 operations may be listed")
        for op in cleaned:
            if len(op) > 60:
                raise ValueError("operation name too long (max 60 characters)")
        return cleaned

    @model_validator(mode="after")
    def _check_dates(self):
        installed = getattr(self, "installedOn", None)
        warranty = getattr(self, "warrantyUntil", None)
        last_pm = getattr(self, "lastPmOn", None)
        next_pm = getattr(self, "nextPmOn", None)
        if installed and warranty and warranty < installed:
            raise ValueError("warrantyUntil cannot be before installedOn")
        if installed and last_pm and last_pm < installed:
            raise ValueError("lastPmOn cannot be before installedOn")
        if last_pm and next_pm and next_pm < last_pm:
            raise ValueError("nextPmOn cannot be before lastPmOn")
        return self


class MachineCreateSchema(_MachineBase):
    code: Optional[Code] = None  # blank -> the service allocates the next code
    name: Name
    machineGroupId: Fk
    plantId: Fk
    lineId: Fk
    workCentreId: Fk
    manufacturer: Annotated[str, Field(min_length=2, max_length=150)]
    modelNumber: Optional[Annotated[str, Field(max_length=100)]] = None
    serialNumber: Optional[Annotated[str, Field(max_length=100)]] = None
    yearOfManufacture: Optional[Annotated[int, Field(ge=1900, le=_CURRENT_YEAR + 1)]] = None
    assetCode: Optional[Annotated[str, Field(max_length=100)]] = None
    capacityPerHour: Annotated[float, Field(gt=0, le=_DECIMAL_10_2_MAX)]
    capacityUom: Annotated[str, Field(min_length=1, max_length=20)]
    powerKw: Optional[Annotated[float, Field(ge=0, le=_DECIMAL_10_2_MAX)]] = None
    operatorsRequired: Annotated[int, Field(ge=0, le=100)] = 1
    installedOn: Optional[date] = None
    warrantyUntil: Optional[date] = None
    pmFrequencyDays: Annotated[int, Field(ge=1, le=3650)]
    lastPmOn: Optional[date] = None
    nextPmOn: Optional[date] = None
    criticality: Annotated[str, Field(pattern=r"^[ABC]$")] = "C"
    currentState: str = "IDLE"
    oeePct: Annotated[float, Field(ge=0, le=100)] = 0.0
    operations: Optional[List[str]] = None
    status: str = "ACTIVE"

    @field_validator("currentState")
    @classmethod
    def _known_state(cls, v: str) -> str:
        if v not in MACHINE_STATES:
            raise ValueError("currentState must be one of " + ", ".join(MACHINE_STATES))
        return v

    @field_validator("status")
    @classmethod
    def _known_status(cls, v: str) -> str:
        if v not in MACHINE_STATUSES:
            raise ValueError("status must be one of " + ", ".join(MACHINE_STATUSES))
        return v


class MachinePatchSchema(_MachineBase):
    """Partial update - only the fields actually sent are applied."""

    name: Optional[Name] = None
    machineGroupId: Optional[Fk] = None
    plantId: Optional[Fk] = None
    lineId: Optional[Fk] = None
    workCentreId: Optional[Fk] = None
    manufacturer: Optional[Annotated[str, Field(min_length=2, max_length=150)]] = None
    modelNumber: Optional[Annotated[str, Field(max_length=100)]] = None
    serialNumber: Optional[Annotated[str, Field(max_length=100)]] = None
    yearOfManufacture: Optional[Annotated[int, Field(ge=1900, le=_CURRENT_YEAR + 1)]] = None
    assetCode: Optional[Annotated[str, Field(max_length=100)]] = None
    capacityPerHour: Optional[Annotated[float, Field(gt=0, le=_DECIMAL_10_2_MAX)]] = None
    capacityUom: Optional[Annotated[str, Field(min_length=1, max_length=20)]] = None
    powerKw: Optional[Annotated[float, Field(ge=0, le=_DECIMAL_10_2_MAX)]] = None
    operatorsRequired: Optional[Annotated[int, Field(ge=0, le=100)]] = None
    installedOn: Optional[date] = None
    warrantyUntil: Optional[date] = None
    pmFrequencyDays: Optional[Annotated[int, Field(ge=1, le=3650)]] = None
    lastPmOn: Optional[date] = None
    nextPmOn: Optional[date] = None
    criticality: Optional[Annotated[str, Field(pattern=r"^[ABC]$")]] = None
    currentState: Optional[str] = None
    oeePct: Optional[Annotated[float, Field(ge=0, le=100)]] = None
    operations: Optional[List[str]] = None
    status: Optional[str] = None

    @field_validator("currentState")
    @classmethod
    def _known_state(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in MACHINE_STATES:
            raise ValueError("currentState must be one of " + ", ".join(MACHINE_STATES))
        return v

    @field_validator("status")
    @classmethod
    def _known_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in MACHINE_STATUSES:
            raise ValueError("status must be one of " + ", ".join(MACHINE_STATUSES))
        return v


class MachineResponseSchema(BaseModel):
    id: int
    code: str
    name: str
    machineGroupId: Optional[int] = None
    machineGroupCode: Optional[str] = None
    machineGroup: Optional[str] = None
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
