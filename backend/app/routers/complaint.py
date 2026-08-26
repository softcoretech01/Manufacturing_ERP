from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
import pymysql

from app.core.config import settings
from app.schemas.complaint import ComplaintCreate, ComplaintUpdate, ComplaintResponse

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

router = APIRouter(prefix="/api/v1/quality/complaints", tags=["Quality Complaints"])

@router.get("", response_model=List[ComplaintResponse])
def get_complaints():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Complaint WHERE DeletedAt IS NULL ORDER BY Id DESC")
            rows = cursor.fetchall()
            return [dict_to_camel(r) for r in rows]
    finally:
        conn.close()

@router.post("", response_model=ComplaintResponse)
def create_complaint(complaint: ComplaintCreate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageComplaint('CREATE', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    complaint.customer_name, complaint.complaint_type, complaint.severity, complaint.item_code,
                    complaint.item_name, complaint.batch_no, complaint.production_order_no, complaint.invoice_no,
                    complaint.qty_supplied, complaint.qty_complained, complaint.description, complaint.logged_on,
                    complaint.logged_by, complaint.owner, complaint.due_on, complaint.status, complaint.resolution,
                    complaint.resolution_value, complaint.root_cause, complaint.cause_category, complaint.ncr_doc_no,
                    complaint.capa_doc_no, complaint.closed_on, complaint.remarks, user
                )
            )
            cursor.execute("SELECT LAST_INSERT_ID()")
            new_id = cursor.fetchone()[0]
            conn.commit()

        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Complaint WHERE Id = %s", (new_id,))
            row = cursor.fetchone()
            return dict_to_camel(row)
    finally:
        conn.close()

@router.put("/{complaint_id}", response_model=ComplaintResponse)
def update_complaint(complaint_id: int, complaint: ComplaintUpdate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageComplaint('UPDATE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    complaint_id, complaint.customer_name, complaint.complaint_type, complaint.severity, complaint.item_code,
                    complaint.item_name, complaint.batch_no, complaint.production_order_no, complaint.invoice_no,
                    complaint.qty_supplied, complaint.qty_complained, complaint.description, complaint.logged_on,
                    complaint.logged_by, complaint.owner, complaint.due_on, complaint.status, complaint.resolution,
                    complaint.resolution_value, complaint.root_cause, complaint.cause_category, complaint.ncr_doc_no,
                    complaint.capa_doc_no, complaint.closed_on, complaint.remarks, user
                )
            )
            conn.commit()

        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Complaint WHERE Id = %s", (complaint_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Complaint not found")
            return dict_to_camel(row)
    finally:
        conn.close()

@router.delete("/{complaint_id}")
def delete_complaint(complaint_id: int, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageComplaint('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %s, @p_DocNo)",
                (complaint_id, user)
            )
            conn.commit()
        return {"message": "Deleted successfully"}
    finally:
        conn.close()
