from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import pymysql
import json
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/labels", tags=["labels"])

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing',
    'cursorclass': pymysql.cursors.DictCursor
}

class LabelFormatBase(CamelModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=255)
    kind: str = Field(..., max_length=20)
    standard: str = Field(..., max_length=20)
    customer: Optional[str] = Field(None, max_length=255)
    width_mm: float
    height_mm: float
    fields: List[str]
    has_barcode: bool = False
    has_qr_code: bool = False
    has_customer_logo: bool = False
    languages: List[str]
    is_active: bool = True
    printed_count: int = 0
    last_printed_on: Optional[datetime] = None

class LabelFormatOut(LabelFormatBase):
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
        elif k == 'Fields':
            new_row['fields'] = [f.strip() for f in v.split(',') if f.strip()] if v else []
        elif k == 'Languages':
            new_row['languages'] = [l.strip() for l in v.split(',') if l.strip()] if v else []
        elif k == 'HasBarcode':
            new_row['has_barcode'] = bool(v)
        elif k == 'HasQrCode':
            new_row['has_qr_code'] = bool(v)
        elif k == 'HasCustomerLogo':
            new_row['has_customer_logo'] = bool(v)
        elif k == 'IsActive':
            new_row['is_active'] = bool(v)
        else:
            new_row[to_snake(k)] = v
    return new_row

@router.get("", response_model=List[LabelFormatOut])
def get_labels():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageLabelFormat('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{label_id}", response_model=LabelFormatOut)
def get_label(label_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageLabelFormat('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (label_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Label format not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=LabelFormatOut)
def create_label(label: LabelFormatBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        fields_str = ','.join(label.fields) if label.fields else ''
        languages_str = ','.join(label.languages) if label.languages else 'English'
        
        args = (
            'INSERT',
            None,
            label.code,
            label.name,
            label.kind,
            label.standard,
            label.customer,
            label.width_mm,
            label.height_mm,
            fields_str,
            label.has_barcode,
            label.has_qr_code,
            label.has_customer_logo,
            languages_str,
            label.printed_count,
            label.last_printed_on,
            label.is_active,
            'system'
        )
        cursor.execute("CALL SpManageLabelFormat(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{label_id}", response_model=LabelFormatOut)
def update_label(label_id: int, label: LabelFormatBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        fields_str = ','.join(label.fields) if label.fields else ''
        languages_str = ','.join(label.languages) if label.languages else 'English'
        
        args = (
            'UPDATE',
            label_id,
            label.code,
            label.name,
            label.kind,
            label.standard,
            label.customer,
            label.width_mm,
            label.height_mm,
            fields_str,
            label.has_barcode,
            label.has_qr_code,
            label.has_customer_logo,
            languages_str,
            label.printed_count,
            label.last_printed_on,
            label.is_active,
            'system'
        )
        cursor.execute("CALL SpManageLabelFormat(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Label format not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{label_id}")
def delete_label(label_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageLabelFormat('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (label_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
