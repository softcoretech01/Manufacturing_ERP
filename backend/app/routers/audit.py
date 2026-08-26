from typing import List, Dict, Any
import json
from fastapi import APIRouter, HTTPException
import pymysql
import pymysql.cursors

from app.core.config import settings
from app.schemas.quality_audit import QualityAuditCreate, QualityAuditUpdate, QualityAuditResponse

def get_db_connection():
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name
    )

def dict_to_camel(d: Dict[str, Any]) -> Dict[str, Any]:
    if not d: return d
    return {k[0].lower() + k[1:]: v for k, v in d.items()}

router = APIRouter(prefix="/api/v1/quality/audits", tags=["Quality Audits"])

@router.get("", response_model=List[QualityAuditResponse])
def get_audits():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            # Fetch all active audits
            cursor.execute("SELECT * FROM ERP_Quality.QualityAudit WHERE DeletedAt IS NULL ORDER BY Id DESC")
            audits = cursor.fetchall()
            
            # Fetch all findings for active audits
            cursor.execute("SELECT * FROM ERP_Quality.QualityAuditFinding WHERE AuditId IN (SELECT Id FROM ERP_Quality.QualityAudit WHERE DeletedAt IS NULL)")
            all_findings = cursor.fetchall()
            
            # Group findings by AuditId
            findings_by_audit = {}
            for f in all_findings:
                aid = f['AuditId']
                if aid not in findings_by_audit:
                    findings_by_audit[aid] = []
                # Remove redundant fields
                f.pop('Id', None)
                f.pop('AuditId', None)
                findings_by_audit[aid].append(dict_to_camel(f))
            
            result = []
            for a in audits:
                a_camel = dict_to_camel(a)
                a_camel['findings'] = findings_by_audit.get(a['Id'], [])
                result.append(a_camel)
                
            return result
    finally:
        conn.close()

def _prepare_findings_json(findings):
    if not findings:
        return None
    # We need to convert the findings into a json array of dicts with string dates
    out = []
    for f in findings:
        d = f.dict(exclude_none=False)
        # Convert date to string format for json
        if d.get('due_on'):
            d['due_on'] = d['due_on'].isoformat()
        if d.get('closed_on'):
            d['closed_on'] = d['closed_on'].isoformat()
        out.append(dict_to_camel(d))
    return json.dumps(out)

@router.post("", response_model=QualityAuditResponse)
def create_audit(audit: QualityAuditCreate, user: str = "System"):
    conn = get_db_connection()
    try:
        findings_json = _prepare_findings_json(audit.findings)
        
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageQualityAudit('CREATE', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    audit.audit_type, audit.title, audit.scope, audit.auditee, audit.auditor,
                    audit.planned_on, audit.conducted_on, audit.status, audit.score_pct,
                    audit.report_ref, audit.remarks, findings_json, user
                )
            )
            cursor.execute("SELECT LAST_INSERT_ID()")
            new_id = cursor.fetchone()[0]
            conn.commit()

        # Re-fetch logic can just use the GET by ID approach
        return get_audit_by_id_internal(new_id)
    finally:
        conn.close()

@router.put("/{audit_id}", response_model=QualityAuditResponse)
def update_audit(audit_id: int, audit: QualityAuditUpdate, user: str = "System"):
    conn = get_db_connection()
    try:
        findings_json = _prepare_findings_json(audit.findings)
        
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageQualityAudit('UPDATE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    audit_id, audit.audit_type, audit.title, audit.scope, audit.auditee, audit.auditor,
                    audit.planned_on, audit.conducted_on, audit.status, audit.score_pct,
                    audit.report_ref, audit.remarks, findings_json, user
                )
            )
            conn.commit()
            
        res = get_audit_by_id_internal(audit_id)
        if not res:
            raise HTTPException(status_code=404, detail="Audit not found")
        return res
    finally:
        conn.close()

@router.delete("/{audit_id}")
def delete_audit(audit_id: int, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageQualityAudit('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %s, @p_DocNo)",
                (audit_id, user)
            )
            conn.commit()
        return {"message": "Deleted successfully"}
    finally:
        conn.close()

def get_audit_by_id_internal(audit_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.QualityAudit WHERE Id = %s AND DeletedAt IS NULL", (audit_id,))
            a = cursor.fetchone()
            if not a: return None
            
            cursor.execute("SELECT * FROM ERP_Quality.QualityAuditFinding WHERE AuditId = %s", (audit_id,))
            findings = cursor.fetchall()
            
            a_camel = dict_to_camel(a)
            a_camel['findings'] = []
            for f in findings:
                f.pop('Id', None)
                f.pop('AuditId', None)
                a_camel['findings'].append(dict_to_camel(f))
                
            return a_camel
    finally:
        conn.close()
