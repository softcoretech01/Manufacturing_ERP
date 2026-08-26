from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import re

class EmployeeSchema(BaseModel):
    id: Optional[int] = None
    uid: Optional[str] = None
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    designation: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    grade: Optional[str] = Field(None, max_length=20)
    employmentType: Optional[str] = Field(None, max_length=50)
    dateOfJoining: Optional[datetime] = None
    dateOfBirth: Optional[datetime] = None
    gender: Optional[str] = Field(None, max_length=10)
    bloodGroup: Optional[str] = Field(None, max_length=10)
    mobile: Optional[str] = Field(None, pattern=r'^\d{10}$')
    email: Optional[str] = Field(None, max_length=150)
    reportsTo: Optional[str] = Field(None, max_length=100)
    plantUid: Optional[str] = Field(None, max_length=50)
    costCentre: Optional[str] = Field(None, max_length=50)
    shiftCode: Optional[str] = Field(None, max_length=50)
    skills: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    pfNumber: Optional[str] = Field(None, max_length=50)
    esiNumber: Optional[str] = Field(None, max_length=50)
    uanNumber: Optional[str] = Field(None, max_length=50)
    aadhaarMasked: Optional[str] = Field(None, max_length=20)
    panMasked: Optional[str] = Field(None, max_length=20)
    bankAccountMasked: Optional[str] = Field(None, max_length=50)
    isShopFloor: Optional[bool] = False
    status: Optional[str] = Field('ACTIVE', max_length=20)
    revisions: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    whereUsed: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    isActive: Optional[bool] = True
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
