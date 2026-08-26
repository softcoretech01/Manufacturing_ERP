from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import pymysql
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/shipments", tags=["shipments"])

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing',
    'cursorclass': pymysql.cursors.DictCursor
}

class ShipmentBase(CamelModel):
    doc_no: Optional[str] = Field(None, max_length=50)
    shipment_type: str = Field(..., max_length=20)
    customer: str = Field(..., max_length=150)
    customer_code: str = Field('CUS-NEW', max_length=50)
    destination: str = Field(..., max_length=150)
    region: str = Field(..., max_length=50)
    route: str = Field(..., max_length=100)
    challan_no: str = Field(..., max_length=50)
    invoice_no: Optional[str] = Field(None, max_length=50)
    eway_bill_no: Optional[str] = Field(None, max_length=50)
    vehicle_no: str = Field(..., max_length=50)
    transporter: str = Field(..., max_length=150)
    driver: str = Field(..., max_length=100)
    driver_phone: str = Field(..., max_length=10)
    cartons: int = 0
    pallets: int = 0
    weight_kg: float = 0.0
    invoice_value: float = 0.0
    remarks: Optional[str] = None
    status: str = Field("PLANNED", max_length=20)
    dispatch_plan_no: Optional[str] = Field("—", max_length=50)
    dispatched_at: Optional[datetime] = None
    eta_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    last_location: Optional[str] = Field(None, max_length=255)
    last_updated_at: Optional[datetime] = None
    delay_reason: Optional[str] = Field(None, max_length=255)
    pod_status: str = Field("NOT_DUE", max_length=20)
    is_export: bool = False

class ShipmentOut(ShipmentBase):
    id: int
    uid: int

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k in ('IsExport', 'IsDeleted'):
            new_row[to_snake(k)] = bool(v)
        else:
            new_row[to_snake(k)] = v
    new_row['uid'] = new_row['id']
    return new_row

@router.get("", response_model=List[ShipmentOut])
def get_shipments():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageShipment('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{shipment_id}", response_model=ShipmentOut)
def get_shipment(shipment_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageShipment('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (shipment_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Shipment not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=ShipmentOut)
def create_shipment(shipment: ShipmentBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'INSERT',
            None,
            shipment.shipment_type,
            shipment.customer,
            shipment.customer_code,
            shipment.destination,
            shipment.region,
            shipment.route,
            shipment.challan_no,
            shipment.invoice_no,
            shipment.eway_bill_no,
            shipment.vehicle_no,
            shipment.transporter,
            shipment.driver,
            shipment.driver_phone,
            shipment.cartons,
            shipment.pallets,
            shipment.weight_kg,
            shipment.invoice_value,
            shipment.remarks,
            shipment.status,
            shipment.dispatch_plan_no,
            shipment.dispatched_at,
            shipment.eta_at,
            shipment.delivered_at,
            shipment.last_location,
            shipment.last_updated_at,
            shipment.delay_reason,
            shipment.pod_status,
            shipment.is_export,
            'system'
        )
        cursor.execute("CALL SpManageShipment(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except pymysql.err.MySQLError as e:
        if e.args and e.args[0] == 1062:
            raise HTTPException(status_code=400, detail="A shipment with this number already exists.")
        if e.args and e.args[0] in (3819, 4025):
            raise HTTPException(status_code=400, detail="Invalid format: Phone number must be exactly 10 digits.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{shipment_id}", response_model=ShipmentOut)
def update_shipment(shipment_id: int, shipment: ShipmentBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'UPDATE',
            shipment_id,
            shipment.shipment_type,
            shipment.customer,
            shipment.customer_code,
            shipment.destination,
            shipment.region,
            shipment.route,
            shipment.challan_no,
            shipment.invoice_no,
            shipment.eway_bill_no,
            shipment.vehicle_no,
            shipment.transporter,
            shipment.driver,
            shipment.driver_phone,
            shipment.cartons,
            shipment.pallets,
            shipment.weight_kg,
            shipment.invoice_value,
            shipment.remarks,
            shipment.status,
            shipment.dispatch_plan_no,
            shipment.dispatched_at,
            shipment.eta_at,
            shipment.delivered_at,
            shipment.last_location,
            shipment.last_updated_at,
            shipment.delay_reason,
            shipment.pod_status,
            shipment.is_export,
            'system'
        )
        cursor.execute("CALL SpManageShipment(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Shipment not found")
        return map_row(row)
    except pymysql.err.MySQLError as e:
        if e.args and e.args[0] == 1062:
            raise HTTPException(status_code=400, detail="A shipment with this number already exists.")
        if e.args and e.args[0] in (3819, 4025):
            raise HTTPException(status_code=400, detail="Invalid format: Phone number must be exactly 10 digits.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{shipment_id}")
def delete_shipment(shipment_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageShipment('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (shipment_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
