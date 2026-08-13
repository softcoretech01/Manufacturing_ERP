from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class EngRoutingOperationSchema(BaseModel):
    seq: int
    operationCode: str = Field(max_length=50)
    operationName: Optional[str] = Field(None, max_length=150)
    workCentreCode: str = Field(max_length=50)
    machineCode: Optional[str] = Field(None, max_length=50)
    setupMinutes: float
    cycleSeconds: float
    operators: int
    skill: Optional[str] = Field(None, max_length=50)
    toolCode: Optional[str] = Field(None, max_length=50)
    qcCheckpoint: bool
    instructions: Optional[str] = Field(None, max_length=1000)

class EngRoutingSchema(BaseModel):
    uid: Optional[str] = None
    productCode: str = Field(max_length=50)
    productName: Optional[str] = Field(None, max_length=150)
    revision: Optional[int] = 1
    status: Optional[str] = "DRAFT"
    effectiveFrom: datetime
    effectiveTo: Optional[datetime] = None
    isDefault: Optional[bool] = False
    costingLotSize: Optional[int] = 1
    sourceEcn: Optional[str] = Field(None, max_length=50)
    changeReason: Optional[str] = Field(None, max_length=1000)
    operations: Optional[List[EngRoutingOperationSchema]] = []
