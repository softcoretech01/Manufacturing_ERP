from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
import pymysql

from app.core.config import settings
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/export-shipments", tags=["export-shipments"])

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

class ExportShipmentBase(CamelModel):
    doc_no: Optional[str] = Field(None, max_length=50)
    shipment_no: str = Field(..., max_length=50)
    customer: str = Field(..., max_length=255)
    country: str = Field(..., max_length=100)
    incoterm: str = Field(..., max_length=10)
    container_no: str = Field(..., max_length=50)
    container_size: str = Field(..., max_length=10)
    seal_no: Optional[str] = Field(None, max_length=50)
    stuffing_date: str
    vessel: str = Field(..., max_length=150)
    voyage_no: Optional[str] = Field(None, max_length=50)
    port_of_loading: str = Field(..., max_length=100)
    port_of_discharge: str = Field(..., max_length=100)
    etd: str
    eta: str
    hs_code: str = Field(..., max_length=50)
    fob_value_usd: float = 0.0
    exchange_rate: float = 83.5
    shipping_bill_no: Optional[str] = Field(None, max_length=50)
    bl_no: Optional[str] = Field(None, max_length=50)
    customs_status: str = Field("NOT_FILED", max_length=30)
    status: str = Field("PLANNED", max_length=30)
    remarks: Optional[str] = None

class ExportShipmentOut(ExportShipmentBase):
    id: int
    uid: str

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k in ('StuffingDate', 'Etd', 'Eta') and v is not None:
            new_row[to_snake(k)] = v.isoformat()
        elif k in ('FobValueUsd', 'ExchangeRate') and v is not None:
            new_row[to_snake(k)] = float(v)
        else:
            new_row[to_snake(k)] = v
    new_row['uid'] = str(new_row['id'])
    return new_row

@router.get("", response_model=List[ExportShipmentOut])
def get_export_shipments():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageExportShipment", [
            "GET_ALL", 0, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, 0.0, 0.0, None, None, None, None, None, "system"
        ])
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=ExportShipmentOut)
def create_export_shipment(req: ExportShipmentBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "CREATE",
            0,
            None,
            req.shipment_no,
            req.customer,
            req.country,
            req.incoterm,
            req.container_no,
            req.container_size,
            req.seal_no,
            req.stuffing_date,
            req.vessel,
            req.voyage_no,
            req.port_of_loading,
            req.port_of_discharge,
            req.etd,
            req.eta,
            req.hs_code,
            req.fob_value_usd,
            req.exchange_rate,
            req.shipping_bill_no,
            req.bl_no,
            req.customs_status,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageExportShipment", args)
        row = cursor.fetchone()
        return map_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{id}", response_model=ExportShipmentOut)
def update_export_shipment(id: int, req: ExportShipmentBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "UPDATE",
            id,
            None,
            req.shipment_no,
            req.customer,
            req.country,
            req.incoterm,
            req.container_no,
            req.container_size,
            req.seal_no,
            req.stuffing_date,
            req.vessel,
            req.voyage_no,
            req.port_of_loading,
            req.port_of_discharge,
            req.etd,
            req.eta,
            req.hs_code,
            req.fob_value_usd,
            req.exchange_rate,
            req.shipping_bill_no,
            req.bl_no,
            req.customs_status,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageExportShipment", args)
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Shipment not found")
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
def delete_export_shipment(id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageExportShipment", [
            "DELETE", id, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, 0.0, 0.0, None, None, None, None, None, "system"
        ])
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
