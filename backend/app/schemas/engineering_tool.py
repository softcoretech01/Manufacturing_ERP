from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

class EngToolSchema(BaseModel):
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    toolType: str = Field(..., max_length=50)
    machineCode: Optional[str] = Field(None, max_length=50)
    lifeStrokes: int = 0
    usedStrokes: int = 0
    lastMaintenanceOn: Optional[str] = None
    nextCalibrationOn: Optional[str] = None
    replacementCost: float = 0.0
    location: Optional[str] = Field(None, max_length=200)
    status: str = Field(default="AVAILABLE", max_length=50)
    isActive: bool = True
