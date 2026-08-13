from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class EngBomLineSchema(BaseModel):
    uid: Optional[str] = None
    seq: int
    itemCode: str = Field(..., max_length=50)
    itemName: Optional[str] = Field(None, max_length=150)
    uom: Optional[str] = Field(None, max_length=20)
    qtyPer: float
    scrapPct: float = 0.0
    isPhantom: bool = False
    operationSeq: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=1000)

class EngBomSchema(BaseModel):
    uid: Optional[str] = None
    docNo: Optional[str] = Field(None, max_length=50)
    productCode: str = Field(..., max_length=50)
    productName: Optional[str] = Field(None, max_length=150)
    bomType: str = Field(..., max_length=50)
    revision: int = 1
    status: str = Field(..., max_length=50)
    baseQty: float
    uom: str = Field(..., max_length=20)
    effectiveFrom: datetime
    effectiveTo: Optional[datetime] = None
    isDefault: bool = False
    alternateFor: Optional[str] = Field(None, max_length=150)
    lines: List[EngBomLineSchema] = []
    createdBy: Optional[str] = Field(None, max_length=100)
    createdAt: Optional[datetime] = None
    approvedBy: Optional[str] = Field(None, max_length=100)
    approvedAt: Optional[datetime] = None
    sourceEcn: Optional[str] = Field(None, max_length=50)
    changeReason: Optional[str] = Field(None, max_length=1000)
    version: int = 1
    deletedAt: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
