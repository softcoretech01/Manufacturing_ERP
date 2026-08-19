from fastapi import APIRouter, HTTPException
from typing import List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime
from app.core.database import get_session
import pymysql
import json
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/cartons", tags=["cartons"])

# Reusing same connection details as other routers
DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing',
    'cursorclass': pymysql.cursors.DictCursor
}

class CartonContent(CamelModel):
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=255)
    quantity: float

class CartonBase(CamelModel):
    carton_no: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=100)
    packing_order_no: str = Field(..., max_length=50)
    customer: Optional[str] = Field(None, max_length=255)
    item_code: Optional[str] = Field(None, max_length=50)
    item_name: Optional[str] = Field(None, max_length=255)
    batch_no: Optional[str] = Field(None, max_length=50)
    quantity: Optional[float] = 0
    uom: Optional[str] = Field(None, max_length=20)
    gross_weight_kg: Optional[float] = None
    net_weight_kg: Optional[float] = None
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    packed_on: Optional[datetime] = None
    operator: Optional[str] = Field(None, max_length=100)
    pallet_no: Optional[str] = Field(None, max_length=50)
    label_printed: Optional[bool] = False
    weight_checked: Optional[bool] = False
    status: Optional[str] = Field('OPEN', max_length=20)
    contents: Optional[List[CartonContent]] = []

class CartonOut(CartonBase):
    id: int
    doc_no: str


def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k == 'Contents':
            new_row['contents'] = parse_contents(v)
        elif k == 'DocNo':
            new_row['carton_no'] = v
            new_row['doc_no'] = v
        else:
            new_row[to_snake(k)] = v
    return new_row

def parse_contents(contents_str):
    if not contents_str: return []
    try:
        return json.loads(contents_str)
    except:
        return []

@router.get("", response_model=List[CartonOut])
def get_cartons():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageCarton('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{carton_id}", response_model=CartonOut)
def get_carton(carton_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageCarton('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (carton_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Carton not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=CartonOut)
def create_carton(carton: CartonBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        contents_json = json.dumps([c.dict(by_alias=True) for c in carton.contents]) if carton.contents else None
        args = (
            'INSERT',
            None,
            carton.barcode,
            carton.packing_order_no,
            carton.customer,
            carton.item_code,
            carton.item_name,
            carton.batch_no,
            carton.quantity,
            carton.uom,
            carton.gross_weight_kg,
            carton.net_weight_kg,
            carton.length_mm,
            carton.width_mm,
            carton.height_mm,
            carton.packed_on,
            carton.operator,
            carton.pallet_no,
            carton.label_printed,
            carton.weight_checked,
            carton.status,
            contents_json,
            'system'
        )
        cursor.execute("CALL SpManageCarton(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{carton_id}", response_model=CartonOut)
def update_carton(carton_id: int, carton: CartonBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        contents_json = json.dumps([c.dict(by_alias=True) for c in carton.contents]) if carton.contents else None
        args = (
            'UPDATE',
            carton_id,
            carton.barcode,
            carton.packing_order_no,
            carton.customer,
            carton.item_code,
            carton.item_name,
            carton.batch_no,
            carton.quantity,
            carton.uom,
            carton.gross_weight_kg,
            carton.net_weight_kg,
            carton.length_mm,
            carton.width_mm,
            carton.height_mm,
            carton.packed_on,
            carton.operator,
            carton.pallet_no,
            carton.label_printed,
            carton.weight_checked,
            carton.status,
            contents_json,
            'system'
        )
        cursor.execute("CALL SpManageCarton(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Carton not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{carton_id}")
def delete_carton(carton_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageCarton('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (carton_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
