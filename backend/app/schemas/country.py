from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

class CountrySchema(BaseModel):
    id: int | None = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=250)
    iso3: str | None = Field(None, max_length=10)
    currency: str | None = Field(None, max_length=10)
    dialCode: str | None = Field(None, max_length=20)
    region: str | None = Field(None, max_length=50)
    isExportMarket: bool | None = False
    status: str | None = Field('ACTIVE', max_length=20)
    effectiveFrom: date | None = None
    effectiveTo: date | None = None
    revision: int | None = 1
    usageCount: int | None = 0
    isDeleted: bool | None = False
    createdBy: str | None = None
    createdDate: datetime | None = None
    modifiedBy: str | None = None
    modifiedDate: datetime | None = None
