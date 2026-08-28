from fastapi import APIRouter, HTTPException
from app.core.legacy_db import legacy_db_config
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import pymysql
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/pick-lists", tags=["pick_lists"])

# Credentials come from settings (env / .env) — never written in source.
DB_CONFIG = legacy_db_config(
    "ERP_Packing", multi_statements=False
)

class PickListBase(CamelModel):
    dispatch_plan_no: str = Field(..., max_length=50)
    created_on: Optional[datetime] = None
    method: str = Field(..., max_length=20)
    warehouse: str = Field(..., max_length=150)
    zone: str = Field(..., max_length=100)
    customer: str = Field(..., max_length=255)
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=255)
    batch_no: Optional[str] = Field(None, max_length=50)
    bin: str = Field(..., max_length=50)
    required_qty: int = 0
    picked_qty: int = 0
    uom: str = Field(..., max_length=20)
    picker: Optional[str] = Field(None, max_length=100)
    status: str = Field("OPEN", max_length=20)
    short_reason: Optional[str] = None

class PickListOut(PickListBase):
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
    # Ensure created_on is string for frontend ISO
    if isinstance(new_row.get('created_on'), datetime):
        new_row['created_on'] = new_row['created_on'].isoformat()
    return new_row

@router.get("", response_model=List[PickListOut])
def get_pick_lists():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManagePickList('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{pick_list_id}", response_model=PickListOut)
def get_pick_list(pick_list_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManagePickList('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (pick_list_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Pick list not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=PickListOut)
def create_pick_list(pl: PickListBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'INSERT',
            None,
            pl.dispatch_plan_no,
            pl.created_on,
            pl.method,
            pl.warehouse,
            pl.zone,
            pl.customer,
            pl.item_code,
            pl.item_name,
            pl.batch_no,
            pl.bin,
            pl.required_qty,
            pl.picked_qty,
            pl.uom,
            pl.picker,
            pl.status,
            pl.short_reason,
            'system'
        )
        cursor.execute("CALL SpManagePickList(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{pick_list_id}", response_model=PickListOut)
def update_pick_list(pick_list_id: int, pl: PickListBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'UPDATE',
            pick_list_id,
            pl.dispatch_plan_no,
            pl.created_on,
            pl.method,
            pl.warehouse,
            pl.zone,
            pl.customer,
            pl.item_code,
            pl.item_name,
            pl.batch_no,
            pl.bin,
            pl.required_qty,
            pl.picked_qty,
            pl.uom,
            pl.picker,
            pl.status,
            pl.short_reason,
            'system'
        )
        cursor.execute("CALL SpManagePickList(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Pick list not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{pick_list_id}")
def delete_pick_list(pick_list_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManagePickList('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (pick_list_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
