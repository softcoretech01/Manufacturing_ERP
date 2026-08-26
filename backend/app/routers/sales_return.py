from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
import pymysql

from app.core.config import settings
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/sales-returns", tags=["sales-returns"])

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

class SalesReturnBase(CamelModel):
    doc_no: Optional[str] = Field(None, max_length=50)
    requested_on: str
    return_type: str = Field(..., max_length=30)
    customer: str = Field(..., max_length=255)
    customer_code: str = Field(..., max_length=50)
    shipment_no: Optional[str] = Field(None, max_length=50)
    invoice_no: Optional[str] = Field(None, max_length=50)
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=255)
    batch_no: Optional[str] = Field(None, max_length=50)
    quantity: int = 0
    received_qty: int = 0
    uom: str = Field(..., max_length=20)
    reason: str
    approved_by: Optional[str] = Field(None, max_length=100)
    pickup_on: Optional[str] = None
    received_on: Optional[str] = None
    inspected_by: Optional[str] = Field(None, max_length=100)
    disposition: str = Field("PENDING", max_length=20)
    credit_note_no: Optional[str] = Field(None, max_length=50)
    value: float = 0.0
    status: str = Field("REQUESTED", max_length=30)
    remarks: Optional[str] = None

class SalesReturnOut(SalesReturnBase):
    id: int
    uid: str

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k in ('RequestedOn', 'PickupOn', 'ReceivedOn') and v is not None:
            new_row[to_snake(k)] = v.isoformat()
        else:
            new_row[to_snake(k)] = v
    new_row['uid'] = str(new_row['id'])
    return new_row

@router.get("", response_model=List[SalesReturnOut])
def get_sales_returns():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageSalesReturn", [
            "GET_ALL", 0, None, None, None, None, None, None, None, None, None, None,
            0, 0, None, None, None, None, None, None, None, None, 0.0, None, None, "system"
        ])
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=SalesReturnOut)
def create_sales_return(req: SalesReturnBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "CREATE",
            0,
            None,
            req.requested_on,
            req.return_type,
            req.customer,
            req.customer_code,
            req.shipment_no,
            req.invoice_no,
            req.item_code,
            req.item_name,
            req.batch_no,
            req.quantity,
            req.received_qty,
            req.uom,
            req.reason,
            req.approved_by,
            req.pickup_on,
            req.received_on,
            req.inspected_by,
            req.disposition,
            req.credit_note_no,
            req.value,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageSalesReturn", args)
        row = cursor.fetchone()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{id}", response_model=SalesReturnOut)
def update_sales_return(id: int, req: SalesReturnBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "UPDATE",
            id,
            None,
            req.requested_on,
            req.return_type,
            req.customer,
            req.customer_code,
            req.shipment_no,
            req.invoice_no,
            req.item_code,
            req.item_name,
            req.batch_no,
            req.quantity,
            req.received_qty,
            req.uom,
            req.reason,
            req.approved_by,
            req.pickup_on,
            req.received_on,
            req.inspected_by,
            req.disposition,
            req.credit_note_no,
            req.value,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageSalesReturn", args)
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Return not found")
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
def delete_sales_return(id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageSalesReturn", [
            "DELETE", id, None, None, None, None, None, None, None, None, None, None,
            0, 0, None, None, None, None, None, None, None, None, 0.0, None, None, "system"
        ])
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
