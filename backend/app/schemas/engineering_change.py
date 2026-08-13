from pydantic import BaseModel, Field
from typing import List, Optional

class ChangeLineSchema(BaseModel):
    uid: Optional[str] = None
    bomDocNo: str = Field(..., max_length=50)
    action: str = Field(..., max_length=20)
    itemCode: Optional[str] = Field(None, max_length=50)
    itemName: Optional[str] = Field(None, max_length=200)
    newItemCode: Optional[str] = Field(None, max_length=50)
    newItemName: Optional[str] = Field(None, max_length=200)
    newQtyPer: float = 0
    newScrapPct: float = 0
    note: Optional[str] = Field(None, max_length=255)

class ChangeApprovalSchema(BaseModel):
    level: int
    role: str = Field(..., max_length=100)
    approver: str = Field(..., max_length=100)
    status: str = Field(default="PENDING", max_length=20)
    actedAt: Optional[str] = None
    remarks: Optional[str] = None

class EngChangeSchema(BaseModel):
    uid: Optional[str] = None
    docNo: Optional[str] = Field(None, max_length=50)
    changeType: str = Field(..., max_length=10)
    title: str = Field(..., max_length=200)
    reason: str
    category: str = Field(..., max_length=50)
    priority: str = Field(..., max_length=20)
    requestedBy: str = Field(..., max_length=100)
    requestedOn: str
    productCode: str = Field(..., max_length=50)
    productName: Optional[str] = None
    changeLines: List[ChangeLineSchema] = []
    impactNote: Optional[str] = None
    effectiveFrom: str
    status: str = Field(..., max_length=50)
    sourceEcr: Optional[str] = Field(None, max_length=50)
    resultingBom: Optional[str] = Field(None, max_length=100)
    approvals: List[ChangeApprovalSchema] = []
    createdAt: Optional[str] = None
    version: Optional[int] = 1
