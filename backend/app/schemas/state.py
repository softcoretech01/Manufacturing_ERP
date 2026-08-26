from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

class StateSchema(BaseModel):
    id: int | None = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=250)
    gstCode: str = Field(..., max_length=10)
    country: str | None = Field(None, max_length=50)
    stateType: str | None = Field(None, max_length=50)
    zone: str | None = Field(None, max_length=50)
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
