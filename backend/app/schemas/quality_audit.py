from datetime import date, datetime
from typing import Optional, List
from pydantic import Field
from app.schemas.camel import CamelModel

class AuditFindingSchema(CamelModel):
    uid: str = Field(..., max_length=50)
    clause: Optional[str] = Field(None, max_length=100)
    area: Optional[str] = Field(None, max_length=100)
    grade: str = Field('MINOR_NC', max_length=50)
    description: Optional[str] = None
    action: Optional[str] = None
    owner: Optional[str] = Field(None, max_length=100)
    due_on: Optional[date] = None
    closed_on: Optional[date] = None

class QualityAuditBase(CamelModel):
    audit_type: str = Field('INTERNAL', max_length=50)
    title: str = Field(..., max_length=200)
    scope: Optional[str] = None
    auditee: Optional[str] = Field(None, max_length=100)
    auditor: Optional[str] = Field(None, max_length=100)
    planned_on: date
    conducted_on: Optional[date] = None
    status: str = Field('PLANNED', max_length=50)
    score_pct: Optional[float] = None
    report_ref: Optional[str] = Field(None, max_length=100)
    remarks: Optional[str] = None
    findings: List[AuditFindingSchema] = []

class QualityAuditCreate(QualityAuditBase):
    pass

class QualityAuditUpdate(QualityAuditBase):
    pass

class QualityAuditResponse(QualityAuditBase):
    id: int
    doc_no: str
    version: int
    deleted_at: Optional[datetime] = None
