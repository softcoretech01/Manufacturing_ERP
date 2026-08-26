from pydantic import BaseModel, Field
from typing import Optional, List

class ProcParameter(BaseModel):
    uid: str = Field(..., max_length=50)
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    value: str = Field(..., max_length=255)
    unit: Optional[str] = Field(None, max_length=20)
    group: str = Field(..., max_length=50)
    scope: str = Field(..., max_length=200)
    editable: bool

class ProcParameterUpdate(BaseModel):
    value: str = Field(..., max_length=255)

class EvalWeight(BaseModel):
    uid: str = Field(..., max_length=50)
    setCode: str = Field(..., max_length=50)
    setName: str = Field(..., max_length=100)
    category: str = Field(..., max_length=100)
    criterion: str = Field(..., max_length=100)
    weightPct: float
    direction: str = Field(..., max_length=20)
    active: Optional[bool] = True

class ProcReasonCode(BaseModel):
    uid: str = Field(..., max_length=50)
    code: str = Field(..., max_length=50)
    label: str = Field(..., max_length=200)
    documentType: str = Field(..., max_length=100)
    requiresComment: bool
    active: bool

class ProcReasonCodeUpdate(BaseModel):
    active: bool
