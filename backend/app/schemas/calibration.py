from datetime import date, datetime
from typing import Optional
from pydantic import Field
from app.schemas.camel import CamelModel

class InstrumentBase(CamelModel):
    name: str = Field(..., max_length=100)
    instrument_type: Optional[str] = Field(None, max_length=100)
    make: Optional[str] = Field(None, max_length=100)
    serial_no: Optional[str] = Field(None, max_length=100)
    range_val: Optional[str] = Field(None, max_length=100)
    least_count: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    custodian: Optional[str] = Field(None, max_length=100)
    calibration_frequency_days: int
    last_calibrated_on: date
    next_due_on: date
    agency: Optional[str] = Field(None, max_length=100)
    certificate_no: Optional[str] = Field(None, max_length=100)
    observed_error_pct: Optional[float] = None
    permitted_error_pct: Optional[float] = None
    status: str = Field('VALID', max_length=50)
    remarks: Optional[str] = None

class InstrumentCreate(InstrumentBase):
    pass

class InstrumentUpdate(InstrumentBase):
    name: Optional[str] = Field(None, max_length=100)
    calibration_frequency_days: Optional[int] = None
    last_calibrated_on: Optional[date] = None
    next_due_on: Optional[date] = None

class InstrumentResponse(InstrumentBase):
    id: int
    code: str
    version: int
    deleted_at: Optional[datetime] = None
