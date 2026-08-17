from fastapi import APIRouter, Depends, HTTPException
from typing import List
import pymysql

import pymysql
from app.schemas.defects import DefectTypeCreate, DefectTypeUpdate, DefectTypeResponse

def get_db_connection():
    return pymysql.connect(
        host='187.127.131.38',
        port=3308,
        user='root',
        password='Ener9y_Demo@2026',
        database='ERP_Quality',
        autocommit=True
    )

def to_camel(d):
    return {k[0].lower() + k[1:]: v for k, v in d.items()}

router = APIRouter(prefix="/api/v1/quality/defects", tags=["Quality Defects"])

@router.get("", response_model=List[DefectTypeResponse])
def get_defects():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE DeletedAt IS NULL")
            rows = cursor.fetchall()
            return [to_camel(r) for r in rows]
    finally:
        conn.close()

@router.get("/next-code")
def get_next_code():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COALESCE(MAX(Id), 0) + 1 FROM ERP_Quality.DefectType")
            next_id = cursor.fetchone()[0]
            code = f"DF-{str(next_id).zfill(3)}"
            return {"code": code}
    finally:
        conn.close()

@router.post("", response_model=DefectTypeResponse)
def create_defect(defect: DefectTypeCreate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageDefectType('CREATE', 0, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    defect.code,
                    defect.name,
                    defect.severity,
                    defect.category,
                    defect.default_cause,
                    defect.scrap_cost_per_unit,
                    defect.rework_cost_per_unit,
                    defect.is_active,
                    user
                )
            )
            result = cursor.fetchone()
            new_id = result[0]
            conn.commit()
            
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE Id = %s", (new_id,))
            return to_camel(cursor.fetchone())
    finally:
        conn.close()

@router.put("/{defect_id}", response_model=DefectTypeResponse)
def update_defect(defect_id: int, defect: DefectTypeUpdate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageDefectType('UPDATE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    defect_id,
                    defect.code,
                    defect.name,
                    defect.severity,
                    defect.category,
                    defect.default_cause,
                    defect.scrap_cost_per_unit,
                    defect.rework_cost_per_unit,
                    defect.is_active,
                    user
                )
            )
            conn.commit()
            
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE Id = %s", (defect_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Defect not found")
            return to_camel(row)
    finally:
        conn.close()

@router.delete("/{defect_id}")
def delete_defect(defect_id: int, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageDefectType('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %s)",
                (defect_id, user)
            )
            conn.commit()
        return {"message": "Deleted successfully"}
    finally:
        conn.close()
