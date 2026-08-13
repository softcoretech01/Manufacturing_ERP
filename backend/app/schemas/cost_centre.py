from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

class CostCentreSchema(BaseModel):
    id: int | None = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=250)
    type: str = Field(..., max_length=50)
    parentId: int | None = None
    owner: str | None = Field(None, max_length=100)
    budget: float | None = 0
    actual: float | None = 0
    validFrom: date | None = None
    validTo: date | None = None
    isPostable: bool | None = True
    status: str | None = Field('ACTIVE', max_length=20)
    isDeleted: bool | None = False
    createdBy: str | None = None
    createdDate: datetime | None = None
    modifiedBy: str | None = None
    modifiedDate: datetime | None = None
