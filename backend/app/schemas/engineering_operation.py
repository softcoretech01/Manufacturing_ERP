from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class EngOperationSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    defaultWorkCentre: str = Field(..., max_length=50)
    setupMinutes: float
    cycleSeconds: float
    operators: int
    skill: str = Field(..., max_length=100)
    qcCheckpoint: bool
    instructions: Optional[str] = Field(None, max_length=2000)
    isActive: bool = True
