from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
import pymysql

from app.core.config import settings

def get_db_connection():
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name
    )
from app.schemas.ncr import NcrCreate, NcrUpdate, NcrResponse

def dict_to_camel(d: Dict[str, Any]) -> Dict[str, Any]:
    if not d: return d
    return {k[0].lower() + k[1:]: v for k, v in d.items()}

router = APIRouter(prefix="/api/v1/quality/ncrs", tags=["Quality NCR"])

@router.get("/next-code")
def get_next_code():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COALESCE(MAX(Id), 0) + 1 FROM ERP_Quality.Ncr")
            result = cursor.fetchone()
            next_id = result[0] if result else 1
            return {"code": f"NCR-{next_id:03d}"}
    finally:
        conn.close()

@router.get("", response_model=List[NcrResponse])
def get_ncrs():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Ncr WHERE DeletedAt IS NULL ORDER BY Id DESC")
            ncrs = cursor.fetchall()
            
            cursor.execute("SELECT * FROM ERP_Quality.NcrStep WHERE NcrId IN (SELECT Id FROM ERP_Quality.Ncr WHERE DeletedAt IS NULL)")
            steps = cursor.fetchall()
            
            steps_by_ncr = {}
            for step in steps:
                steps_by_ncr.setdefault(step['NcrId'], []).append(dict_to_camel(step))
                
            result = []
            for ncr in ncrs:
                ncr_camel = dict_to_camel(ncr)
                ncr_camel['fiveWhys'] = steps_by_ncr.get(ncr['Id'], [])
                result.append(ncr_camel)
            
            return result
    finally:
        conn.close()

@router.post("", response_model=NcrResponse)
def create_ncr(ncr: NcrCreate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageNcr('CREATE', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    ncr.source, ncr.severity, ncr.title, ncr.description, ncr.item_code, ncr.item_name,
                    ncr.batch_no, ncr.origin_doc_no, ncr.supplier_code, ncr.quantity_affected,
                    ncr.quantity_scrapped, ncr.quantity_reworked, ncr.uom, ncr.containment,
                    ncr.contained_at, ncr.root_cause, ncr.cause_category, ncr.status, ncr.owner,
                    ncr.due_on, ncr.closed_on, ncr.capa_doc_no, ncr.cost_impact, ncr.remarks, user
                )
            )
            cursor.execute("SELECT LAST_INSERT_ID()")
            new_id = cursor.fetchone()[0]
            
            # Insert 5 whys
            if ncr.five_whys:
                for step in ncr.five_whys:
                    cursor.execute(
                        "INSERT INTO ERP_Quality.NcrStep (NcrId, Level, Question, Answer, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES (%s, %s, %s, %s, %s, NOW(), %s, NOW())",
                        (new_id, step.level, step.question, step.answer, user, user)
                    )
            
            conn.commit()
            
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Ncr WHERE Id = %s", (new_id,))
            ncr_row = cursor.fetchone()
            
            cursor.execute("SELECT * FROM ERP_Quality.NcrStep WHERE NcrId = %s", (new_id,))
            steps = cursor.fetchall()
            
            ncr_camel = dict_to_camel(ncr_row)
            ncr_camel['fiveWhys'] = [dict_to_camel(s) for s in steps]
            return ncr_camel
    finally:
        conn.close()

@router.put("/{ncr_id}", response_model=NcrResponse)
def update_ncr(ncr_id: int, ncr: NcrUpdate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageNcr('UPDATE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_DocNo)",
                (
                    ncr_id, ncr.source, ncr.severity, ncr.title, ncr.description, ncr.item_code, ncr.item_name,
                    ncr.batch_no, ncr.origin_doc_no, ncr.supplier_code, ncr.quantity_affected,
                    ncr.quantity_scrapped, ncr.quantity_reworked, ncr.uom, ncr.containment,
                    ncr.contained_at, ncr.root_cause, ncr.cause_category, ncr.status, ncr.owner,
                    ncr.due_on, ncr.closed_on, ncr.capa_doc_no, ncr.cost_impact, ncr.remarks, user
                )
            )
            
            # Sync 5 whys (delete old ones and insert new ones)
            cursor.execute("DELETE FROM ERP_Quality.NcrStep WHERE NcrId = %s", (ncr_id,))
            if ncr.five_whys:
                for step in ncr.five_whys:
                    cursor.execute(
                        "INSERT INTO ERP_Quality.NcrStep (NcrId, Level, Question, Answer, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES (%s, %s, %s, %s, %s, NOW(), %s, NOW())",
                        (ncr_id, step.level, step.question, step.answer, user, user)
                    )
            
            conn.commit()
            
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Ncr WHERE Id = %s", (ncr_id,))
            ncr_row = cursor.fetchone()
            if not ncr_row:
                raise HTTPException(status_code=404, detail="Ncr not found")
                
            cursor.execute("SELECT * FROM ERP_Quality.NcrStep WHERE NcrId = %s", (ncr_id,))
            steps = cursor.fetchall()
            
            ncr_camel = dict_to_camel(ncr_row)
            ncr_camel['fiveWhys'] = [dict_to_camel(s) for s in steps]
            return ncr_camel
    finally:
        conn.close()

@router.delete("/{ncr_id}")
def delete_ncr(ncr_id: int, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageNcr('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %s, @p_DocNo)",
                (ncr_id, user)
            )
            conn.commit()
        return {"message": "Deleted successfully"}
    finally:
        conn.close()
