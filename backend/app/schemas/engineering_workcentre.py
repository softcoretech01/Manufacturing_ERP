from pydantic import BaseModel, Field
from typing import Optional, List

class EngWorkCentreSchema(BaseModel):
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    plant: str = Field(..., max_length=150)
    machineRatePerHour: float = 0
    labourRatePerHour: float = 0
    overheadPct: float = 0
    shiftPattern: str = Field(..., max_length=50)
    hoursPerDay: int = 0
    oeeTargetPct: float = 0
    machineCodes: List[str] = []
    isActive: bool = True
