from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class EngDocumentSchema(BaseModel):
    uid: Optional[str] = None
    code: Optional[str] = Field(None, max_length=50) # Auto-generated on insert
    title: str = Field(..., max_length=150)
    docType: str = Field(..., max_length=50)
    productCode: str = Field(..., max_length=25)
    revision: int = 1
    fileName: str = Field(..., max_length=255)
    sizeKb: int = 0
    status: str = Field(..., max_length=50)
    uploadedBy: Optional[str] = Field(None, max_length=100) # frontend expects this
    uploadedOn: Optional[datetime] = None # frontend expects this
    approvedBy: Optional[str] = Field(None, max_length=100)
    approvedOn: Optional[datetime] = None
    remarks: Optional[str] = Field(None, max_length=1000)
    version: int = 1
    
    # Audit fields explicitly requested by user
    createdBy: Optional[str] = Field(None, max_length=100)
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = Field(None, max_length=100)
    modifiedDate: Optional[datetime] = None
    deletedAt: Optional[datetime] = None
