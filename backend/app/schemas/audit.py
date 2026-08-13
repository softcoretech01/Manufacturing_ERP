from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class AuditChangeSchema(BaseModel):
    field: str
    old: Optional[str] = None
    new: Optional[str] = None

class AuditEntrySchema(BaseModel):
    uid: Optional[str] = None
    entityType: str = Field(..., max_length=100)
    entityLabel: str = Field(..., max_length=255)
    documentNo: Optional[str] = Field(None, max_length=100)
    action: str = Field(..., max_length=50)
    changes: Optional[Any] = None
    reasonCode: Optional[str] = Field(None, max_length=100)
    comments: Optional[str] = None
    userName: str = Field(..., max_length=100)
    roleCode: str = Field(..., max_length=50)
    ipAddress: str = Field(..., max_length=100)
    userAgent: str = Field(..., max_length=255)
    channel: str = Field(..., max_length=100)
    correlationId: str = Field(..., max_length=100)
    at: Optional[datetime] = None
