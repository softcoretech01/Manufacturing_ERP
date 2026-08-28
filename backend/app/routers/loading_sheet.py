from fastapi import APIRouter, HTTPException
from app.core.legacy_db import legacy_db_config
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import pymysql
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/loading-sheets", tags=["loading_sheets"])

# Credentials come from settings (env / .env) — never written in source.
DB_CONFIG = legacy_db_config(
    "ERP_Packing", multi_statements=False
)

class LoadingSheetBase(CamelModel):
    dispatch_plan_no: str = Field(..., max_length=50)
    vehicle_no: str = Field(..., max_length=50)
    transporter: str = Field(..., max_length=150)
    driver: str = Field(..., max_length=100)
    customer: str = Field(..., max_length=255)
    destination: str = Field(..., max_length=255)
    staging_bay: str = Field(..., max_length=50)
    cartons_planned: int = 0
    cartons_loaded: int = 0
    pallets_loaded: int = 0
    planned_weight_kg: float = 0.0
    actual_weight_kg: float = 0.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    loader: str = Field(..., max_length=100)
    supervisor: str = Field(..., max_length=100)
    seal_no: Optional[str] = Field(None, max_length=50)
    seal_verified: bool = False
    photos_attached: int = 0
    status: str = Field("STAGED", max_length=20)
    remarks: Optional[str] = None

class LoadingSheetOut(LoadingSheetBase):
    id: int
    doc_no: str

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k == 'DocNo':
            new_row['doc_no'] = v
        else:
            new_row[to_snake(k)] = v
    # Ensure datetimes are ISO strings for frontend
    if isinstance(new_row.get('started_at'), datetime):
        new_row['started_at'] = new_row['started_at'].isoformat()
    if isinstance(new_row.get('completed_at'), datetime):
        new_row['completed_at'] = new_row['completed_at'].isoformat()
    # Ensure boolean mapping
    if 'seal_verified' in new_row:
        new_row['seal_verified'] = bool(new_row['seal_verified'])
    return new_row

@router.get("", response_model=List[LoadingSheetOut])
def get_loading_sheets():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageLoadingSheet('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{loading_sheet_id}", response_model=LoadingSheetOut)
def get_loading_sheet(loading_sheet_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageLoadingSheet('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (loading_sheet_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Loading sheet not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=LoadingSheetOut)
def create_loading_sheet(ls: LoadingSheetBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'INSERT',
            None,
            ls.dispatch_plan_no,
            ls.vehicle_no,
            ls.transporter,
            ls.driver,
            ls.customer,
            ls.destination,
            ls.staging_bay,
            ls.cartons_planned,
            ls.cartons_loaded,
            ls.pallets_loaded,
            ls.planned_weight_kg,
            ls.actual_weight_kg,
            ls.started_at,
            ls.completed_at,
            ls.loader,
            ls.supervisor,
            ls.seal_no,
            ls.seal_verified,
            ls.photos_attached,
            ls.status,
            ls.remarks,
            'system'
        )
        cursor.execute("CALL SpManageLoadingSheet(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{loading_sheet_id}", response_model=LoadingSheetOut)
def update_loading_sheet(loading_sheet_id: int, ls: LoadingSheetBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'UPDATE',
            loading_sheet_id,
            ls.dispatch_plan_no,
            ls.vehicle_no,
            ls.transporter,
            ls.driver,
            ls.customer,
            ls.destination,
            ls.staging_bay,
            ls.cartons_planned,
            ls.cartons_loaded,
            ls.pallets_loaded,
            ls.planned_weight_kg,
            ls.actual_weight_kg,
            ls.started_at,
            ls.completed_at,
            ls.loader,
            ls.supervisor,
            ls.seal_no,
            ls.seal_verified,
            ls.photos_attached,
            ls.status,
            ls.remarks,
            'system'
        )
        cursor.execute("CALL SpManageLoadingSheet(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Loading sheet not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{loading_sheet_id}")
def delete_loading_sheet(loading_sheet_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageLoadingSheet('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (loading_sheet_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
