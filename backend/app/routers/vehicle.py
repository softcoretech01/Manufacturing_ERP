from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import pymysql
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/vehicles", tags=["vehicles"])

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing',
    'cursorclass': pymysql.cursors.DictCursor
}

class VehicleBase(CamelModel):
    vehicle_no: str = Field(..., max_length=50)
    transporter: str = Field(..., max_length=150)
    driver: str = Field(..., max_length=100)
    driver_phone: str = Field(..., max_length=10)
    capacity_kg: float
    state: str = Field("AVAILABLE", max_length=20)
    current_shipment_no: Optional[str] = Field(None, max_length=50)
    is_active: bool = True

class VehicleOut(VehicleBase):
    id: int

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k == 'IsActive':
            new_row['is_active'] = bool(v)
        else:
            new_row[to_snake(k)] = v
    return new_row

@router.get("", response_model=List[VehicleOut])
def get_vehicles():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageVehicle('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except pymysql.err.MySQLError as e:
        if e.args and e.args[0] == 1062:
            raise HTTPException(status_code=400, detail="A vehicle with this number already exists.")
        if e.args and e.args[0] in (3819, 4025):
            raise HTTPException(status_code=400, detail="Invalid format: Phone number must be exactly 10 digits.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(vehicle_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageVehicle('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (vehicle_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        return map_row(row)
    except pymysql.err.MySQLError as e:
        if e.args and e.args[0] == 1062:
            raise HTTPException(status_code=400, detail="A vehicle with this number already exists.")
        if e.args and e.args[0] in (3819, 4025):
            raise HTTPException(status_code=400, detail="Invalid format: Phone number must be exactly 10 digits.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=VehicleOut)
def create_vehicle(vehicle: VehicleBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'INSERT',
            None,
            vehicle.vehicle_no,
            vehicle.transporter,
            vehicle.driver,
            vehicle.driver_phone,
            vehicle.capacity_kg,
            vehicle.state,
            vehicle.current_shipment_no,
            vehicle.is_active,
            'system'
        )
        cursor.execute("CALL SpManageVehicle(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except pymysql.err.MySQLError as e:
        if e.args and e.args[0] == 1062:
            raise HTTPException(status_code=400, detail="A vehicle with this number already exists.")
        if e.args and e.args[0] in (3819, 4025):
            raise HTTPException(status_code=400, detail="Invalid format: Phone number must be exactly 10 digits.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(vehicle_id: int, vehicle: VehicleBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'UPDATE',
            vehicle_id,
            vehicle.vehicle_no,
            vehicle.transporter,
            vehicle.driver,
            vehicle.driver_phone,
            vehicle.capacity_kg,
            vehicle.state,
            vehicle.current_shipment_no,
            vehicle.is_active,
            'system'
        )
        cursor.execute("CALL SpManageVehicle(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        return map_row(row)
    except pymysql.err.MySQLError as e:
        if e.args and e.args[0] == 1062:
            raise HTTPException(status_code=400, detail="A vehicle with this number already exists.")
        if e.args and e.args[0] in (3819, 4025):
            raise HTTPException(status_code=400, detail="Invalid format: Phone number must be exactly 10 digits.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{vehicle_id}")
def delete_vehicle(vehicle_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageVehicle('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (vehicle_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except pymysql.err.MySQLError as e:
        if e.args and e.args[0] == 1062:
            raise HTTPException(status_code=400, detail="A vehicle with this number already exists.")
        if e.args and e.args[0] in (3819, 4025):
            raise HTTPException(status_code=400, detail="Invalid format: Phone number must be exactly 10 digits.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
