from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import Field
from datetime import datetime
from app.core.database import get_session
import pymysql
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/pallets", tags=["pallets"])

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing',
    'cursorclass': pymysql.cursors.DictCursor
}

class PalletBase(CamelModel):
    pallet_no: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=100)
    pallet_type: str = Field(..., max_length=20)
    customer: str = Field(..., max_length=255)
    destination: str = Field(..., max_length=255)
    carton_count: Optional[int] = 0
    carton_capacity: int
    total_weight_kg: Optional[float] = 0
    length_mm: float
    width_mm: float
    stack_height_mm: float
    built_on: Optional[datetime] = None
    built_by: str = Field(..., max_length=100)
    wrapped: Optional[bool] = False
    strapped: Optional[bool] = False
    label_printed: Optional[bool] = False
    shipment_no: Optional[str] = Field(None, max_length=50)
    container_no: Optional[str] = Field(None, max_length=50)
    status: Optional[str] = Field('BUILDING', max_length=20)

class PalletOut(PalletBase):
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
            new_row['pallet_no'] = v
            new_row['doc_no'] = v
        else:
            new_row[to_snake(k)] = v
    return new_row

@router.get("", response_model=List[PalletOut])
def get_pallets():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManagePallet('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{pallet_id}", response_model=PalletOut)
def get_pallet(pallet_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManagePallet('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (pallet_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Pallet not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=PalletOut)
def create_pallet(pallet: PalletBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'INSERT',
            None,
            pallet.barcode,
            pallet.pallet_type,
            pallet.customer,
            pallet.destination,
            pallet.carton_count,
            pallet.carton_capacity,
            pallet.total_weight_kg,
            pallet.length_mm,
            pallet.width_mm,
            pallet.stack_height_mm,
            pallet.built_on,
            pallet.built_by,
            pallet.wrapped,
            pallet.strapped,
            pallet.label_printed,
            pallet.shipment_no,
            pallet.container_no,
            pallet.status,
            'system'
        )
        cursor.execute("CALL SpManagePallet(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{pallet_id}", response_model=PalletOut)
def update_pallet(pallet_id: int, pallet: PalletBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'UPDATE',
            pallet_id,
            pallet.barcode,
            pallet.pallet_type,
            pallet.customer,
            pallet.destination,
            pallet.carton_count,
            pallet.carton_capacity,
            pallet.total_weight_kg,
            pallet.length_mm,
            pallet.width_mm,
            pallet.stack_height_mm,
            pallet.built_on,
            pallet.built_by,
            pallet.wrapped,
            pallet.strapped,
            pallet.label_printed,
            pallet.shipment_no,
            pallet.container_no,
            pallet.status,
            'system'
        )
        cursor.execute("CALL SpManagePallet(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Pallet not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{pallet_id}")
def delete_pallet(pallet_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManagePallet('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (pallet_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
