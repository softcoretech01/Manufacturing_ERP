from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
import pymysql

from app.core.config import settings
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/freight-charges", tags=["freight-charges"])

def get_db_connection():
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database="ERP_Packing",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

class FreightChargeBase(CamelModel):
    doc_no: Optional[str] = Field(None, max_length=50)
    shipment_no: str = Field(..., max_length=50)
    customer: str = Field(..., max_length=255)
    transporter: str = Field(..., max_length=150)
    route: str = Field(..., max_length=100)
    charge_type: str = Field(..., max_length=50)
    basis: str = Field(..., max_length=20)
    quantity: float = 0.0
    rate: float = 0.0
    amount: float = 0.0
    allocate_to: str = Field(..., max_length=20)
    bill_no: Optional[str] = Field(None, max_length=50)
    bill_date: Optional[str] = None
    approved_by: Optional[str] = Field(None, max_length=100)
    status: str = Field("ESTIMATED", max_length=30)
    remarks: Optional[str] = None

class FreightChargeOut(FreightChargeBase):
    id: int
    uid: str

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k in ('BillDate',) and v is not None:
            new_row[to_snake(k)] = v.isoformat()
        elif k in ('Quantity', 'Rate', 'Amount') and v is not None:
            new_row[to_snake(k)] = float(v)
        else:
            new_row[to_snake(k)] = v
    new_row['uid'] = str(new_row['id'])
    return new_row

@router.get("", response_model=List[FreightChargeOut])
def get_freight_charges():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageFreightCharge", [
            "GET_ALL", 0, None, None, None, None, None, None, None, 0.0, 0.0, 0.0, None, None, None, None, None, None, "system"
        ])
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=FreightChargeOut)
def create_freight_charge(req: FreightChargeBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "CREATE",
            0,
            None,
            req.shipment_no,
            req.customer,
            req.transporter,
            req.route,
            req.charge_type,
            req.basis,
            req.quantity,
            req.rate,
            req.amount,
            req.allocate_to,
            req.bill_no,
            req.bill_date,
            req.approved_by,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageFreightCharge", args)
        row = cursor.fetchone()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{id}", response_model=FreightChargeOut)
def update_freight_charge(id: int, req: FreightChargeBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "UPDATE",
            id,
            None,
            req.shipment_no,
            req.customer,
            req.transporter,
            req.route,
            req.charge_type,
            req.basis,
            req.quantity,
            req.rate,
            req.amount,
            req.allocate_to,
            req.bill_no,
            req.bill_date,
            req.approved_by,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageFreightCharge", args)
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Charge not found")
        return map_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{id}")
def delete_freight_charge(id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageFreightCharge", [
            "DELETE", id, None, None, None, None, None, None, None, 0.0, 0.0, 0.0, None, None, None, None, None, None, "system"
        ])
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
