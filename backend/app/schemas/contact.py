from pydantic import BaseModel, Field, field_validator, EmailStr
from datetime import datetime
import re

class ContactBaseSchema(BaseModel):
    code: str = Field(..., min_length=1, max_length=20, description="Contact code")
    name: str = Field(..., min_length=1, max_length=150, description="Contact name")
    status: str = Field(..., max_length=20, description="Status (ACTIVE/INACTIVE)")
    partner: str = Field(..., max_length=150, description="Partner name")
    partnerType: str = Field(..., max_length=20, description="Partner type")
    designation: str | None = Field(None, max_length=100, description="Designation")
    purpose: str = Field(..., max_length=50, description="Purpose")
    email: EmailStr = Field(..., max_length=150, description="Email address")
    mobile: str = Field(..., description="10-digit mobile number")
    hasPortalAccess: bool = Field(False)

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        if not re.match(r"^[0-9]{10}$", v):
            raise ValueError('Mobile number must be exactly 10 digits')
        return v

    @field_validator('partnerType')
    @classmethod
    def validate_partner_type(cls, v: str) -> str:
        valid_types = ['CUSTOMER', 'SUPPLIER', 'TRANSPORTER']
        v_upper = v.upper()
        if v_upper not in valid_types:
            raise ValueError(f'Invalid partner type. Must be one of {valid_types}')
        return v_upper
        
    @field_validator('purpose')
    @classmethod
    def validate_purpose(cls, v: str) -> str:
        valid_purposes = ['COMMERCIAL', 'TECHNICAL', 'QUALITY', 'ACCOUNTS', 'LOGISTICS']
        v_upper = v.upper()
        if v_upper not in valid_purposes:
            raise ValueError(f'Invalid purpose. Must be one of {valid_purposes}')
        return v_upper

class ContactCreateSchema(ContactBaseSchema):
    pass

class ContactUpdateSchema(ContactBaseSchema):
    pass

class ContactResponseSchema(ContactBaseSchema):
    id: int
    createdBy: str | None = None
    createdDate: datetime
    modifiedBy: str | None = None
    modifiedDate: datetime

    class Config:
        from_attributes = True
        populate_by_name = True
