from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
import pymysql

from app.core.config import settings
from app.schemas.capa import CapaCreate, CapaUpdate, CapaResponse

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

router = APIRouter(prefix="/api/v1/quality/capas", tags=["Quality CAPA"])

@router.get("/next-code")
def get_next_code():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COALESCE(MAX(Id), 0) + 1 FROM ERP_Quality.Capa")
            result = cursor.fetchone()
            next_id = result[0] if result else 1
            return {"code": f"CAPA-{next_id:03d}"}
    finally:
        conn.close()

@router.get("", response_model=List[CapaResponse])
def get_capas():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Capa WHERE DeletedAt IS NULL ORDER BY Id DESC")
            rows = cursor.fetchall()
            return [dict_to_camel(r) for r in rows]
    finally:
        conn.close()

@router.post("", response_model=CapaResponse)
def create_capa(capa: CapaCreate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageCapa('CREATE', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    capa.title, capa.ncr_doc_no, capa.item_code, capa.root_cause, capa.cause_category,
                    capa.corrective_action, capa.preventive_action, capa.owner, capa.due_on,
                    capa.status, capa.verification_method, capa.verification_result,
                    capa.verified_by, capa.verified_on, capa.closed_on,
                    1 if capa.recurrence_checked else 0, capa.effectiveness_pct, user
                )
            )
            cursor.execute("SELECT LAST_INSERT_ID()")
            new_id = cursor.fetchone()[0]
            conn.commit()

        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Capa WHERE Id = %s", (new_id,))
            row = cursor.fetchone()
            return dict_to_camel(row)
    finally:
        conn.close()

@router.put("/{capa_id}", response_model=CapaResponse)
def update_capa(capa_id: int, capa: CapaUpdate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageCapa('UPDATE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    capa_id, capa.title, capa.ncr_doc_no, capa.item_code, capa.root_cause, capa.cause_category,
                    capa.corrective_action, capa.preventive_action, capa.owner, capa.due_on,
                    capa.status, capa.verification_method, capa.verification_result,
                    capa.verified_by, capa.verified_on, capa.closed_on,
                    1 if capa.recurrence_checked else 0 if capa.recurrence_checked is not None else None,
                    capa.effectiveness_pct, user
                )
            )
            conn.commit()

        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Capa WHERE Id = %s", (capa_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="CAPA not found")
            return dict_to_camel(row)
    finally:
        conn.close()

@router.delete("/{capa_id}")
def delete_capa(capa_id: int, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageCapa('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %s, @p_DocNo)",
                (capa_id, user)
            )
            conn.commit()
        return {"message": "Deleted successfully"}
    finally:
        conn.close()
