from typing import Optional
from datetime import datetime
from pydantic import Field
from .camel import CamelModel

class DefectTypeBase(CamelModel):
    code: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., max_length=150)
    severity: str = Field(..., max_length=20)
    category: str = Field(..., max_length=100)
    default_cause: str = Field(..., max_length=50)
    scrap_cost_per_unit: float = 0
    rework_cost_per_unit: float = 0
    is_active: bool = True

class DefectTypeCreate(DefectTypeBase):
    pass

class DefectTypeUpdate(CamelModel):
    code: Optional[str] = Field(None, max_length=50)
    name: Optional[str] = Field(None, max_length=150)
    severity: Optional[str] = Field(None, max_length=20)
    category: Optional[str] = Field(None, max_length=100)
    default_cause: Optional[str] = Field(None, max_length=50)
    scrap_cost_per_unit: Optional[float] = None
    rework_cost_per_unit: Optional[float] = None
    is_active: Optional[bool] = None

class DefectTypeResponse(DefectTypeBase):
    id: int
    version: int
    deleted_at: Optional[datetime] = None
