from fastapi import APIRouter
from typing import List
import pymysql
from pydantic import BaseModel
from app.schemas.camel import CamelModel

import pymysql

def get_db_connection():
    return pymysql.connect(
        host='187.127.131.38',
        port=3308,
        user='root',
        password='Ener9y_Demo@2026',
        database='ERP_Quality',
        autocommit=True
    )

router = APIRouter(prefix="/api/v1/quality/lookups", tags=["Quality Lookups"])

class LookupItem(CamelModel):
    id: int
    name: str
    is_active: bool

@router.get("/severities", response_model=List[LookupItem])
def get_severities():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT Id as id, Name as name, IsActive as is_active FROM ERP_Quality.QualitySeverity WHERE IsActive = 1")
            return cursor.fetchall()
    finally:
        conn.close()

@router.get("/causes", response_model=List[LookupItem])
def get_causes():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT Id as id, Name as name, IsActive as is_active FROM ERP_Quality.QualityCause WHERE IsActive = 1")
            return cursor.fetchall()
    finally:
        conn.close()
