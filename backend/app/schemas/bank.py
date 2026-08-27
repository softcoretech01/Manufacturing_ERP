from pydantic import BaseModel, Field, field_validator
from datetime import datetime
import re

class BankBaseSchema(BaseModel):
    code: str = Field(..., max_length=20, description="Bank code")
    name: str = Field(..., min_length=1, max_length=150, description="Bank name")
    status: str = Field(..., max_length=20, description="Status (ACTIVE/INACTIVE)")
    ifscPrefix: str | None = Field(None, max_length=4, description="Optional 4-letter IFSC prefix")
    bankType: str = Field(..., max_length=20, description="Type of Bank")
    swift: str | None = Field(None, max_length=15, description="Optional SWIFT/BIC code")
    supportsNeft: bool = Field(False)

    @field_validator('ifscPrefix')
    @classmethod
    def validate_ifsc(cls, v: str | None) -> str | None:
        if v:
            if not re.match(r"^[A-Za-z]{4}$", v):
                raise ValueError('IFSC prefix must be exactly 4 letters')
            return v.upper()
        return v

    @field_validator('swift')
    @classmethod
    def validate_swift(cls, v: str | None) -> str | None:
        if v:
            if not re.match(r"^[A-Za-z0-9]{8,11}$", v):
                raise ValueError('SWIFT code must be 8 to 11 alphanumeric characters')
            return v.upper()
        return v
        
    @field_validator('bankType')
    @classmethod
    def validate_type(cls, v: str) -> str:
        valid_types = ['PUBLIC', 'PRIVATE', 'FOREIGN', 'COOPERATIVE', 'PAYMENTS']
        v_upper = v.upper()
        if v_upper not in valid_types:
            raise ValueError(f'Invalid bank type. Must be one of {valid_types}')
        return v_upper

class BankCreateSchema(BankBaseSchema):
    pass

class BankUpdateSchema(BankBaseSchema):
    pass

class BankResponseSchema(BankBaseSchema):
    id: int
    createdBy: str | None = None
    createdDate: datetime
    modifiedBy: str | None = None
    modifiedDate: datetime

    class Config:
        from_attributes = True
        populate_by_name = True
