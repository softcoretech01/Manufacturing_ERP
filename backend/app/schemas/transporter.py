
from pydantic import BaseModel, Field, field_validator
from datetime import date, datetime
import re

class TransporterBaseSchema(BaseModel):
    name: str = Field(..., max_length=150)
    status: str = Field(..., max_length=20)
    effectiveFrom: date
    effectiveTo: date | None = None
    
    transporterId: str = Field(
        ..., 
        min_length=1, 
        max_length=15, 
        description="Must be up to 15 alphanumeric characters"
    )
    mode: str = Field(..., max_length=20)
    isGta: bool = Field(False)
    fleetSize: int = Field(0, ge=0)
    serviceZones: str | None = Field(None, max_length=500)
    contactMobile: str | None = Field(
        None, 
        max_length=15, 
        description="Must be up to 15 characters"
    )

    @field_validator('transporterId')
    @classmethod
    def validate_transporter_id(cls, v: str) -> str:
        # Allow alphanumeric, hyphens and spaces
        if not re.match(r"^[A-Za-z0-9\-\s]+$", v):
            raise ValueError('Transporter ID must be alphanumeric, hyphens, or spaces')
        return v.upper()

class TransporterCreateSchema(TransporterBaseSchema):
    pass

class TransporterUpdateSchema(TransporterBaseSchema):
    pass

class TransporterResponseSchema(TransporterBaseSchema):
    id: int
    code: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
        populate_by_name = True
