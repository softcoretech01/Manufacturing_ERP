from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
import pymysql

from app.core.config import settings
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/analytics", tags=["transporter-analytics"])

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

class TransporterScoreBase(CamelModel):
    transporter: str = Field(..., max_length=150)
    trips: int = 0
    on_time_pct: float = 0.0
    damage_pct: float = 0.0
    avg_transit_days: float = 0.0
    freight_per_kg: float = 0.0

class TransporterScoreOut(TransporterScoreBase):
    id: int

class RegionDispatchBase(CamelModel):
    region: str = Field(..., max_length=50)
    cartons: int = 0
    weight_kg: float = 0.0
    value: float = 0.0
    on_time_pct: float = 0.0

class RegionDispatchOut(RegionDispatchBase):
    id: int

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_score_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k in ('Trips',):
            new_row[to_snake(k)] = int(v)
        elif k in ('OnTimePct', 'DamagePct', 'AvgTransitDays', 'FreightPerKg') and v is not None:
            new_row[to_snake(k)] = float(v)
        else:
            new_row[to_snake(k)] = v
    return new_row

def map_region_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k in ('Cartons',):
            new_row[to_snake(k)] = int(v)
        elif k in ('WeightKg', 'Value', 'OnTimePct') and v is not None:
            new_row[to_snake(k)] = float(v)
        else:
            new_row[to_snake(k)] = v
    return new_row

# --- SCORES ---
@router.get("/transporter-scores", response_model=List[TransporterScoreOut])
def get_transporter_scores():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageTransporterAnalytics", [
            "SCORE", "GET_ALL", 0, None, 0, 0.0, 0.0, 0.0, 0.0, None, 0, 0.0, 0.0, 0.0, "system"
        ])
        rows = cursor.fetchall()
        return [map_score_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("/transporter-scores", response_model=TransporterScoreOut)
def create_transporter_score(req: TransporterScoreBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "SCORE", "CREATE", 0,
            req.transporter, req.trips, req.on_time_pct, req.damage_pct, req.avg_transit_days, req.freight_per_kg,
            None, 0, 0.0, 0.0, 0.0, "system"
        )
        cursor.callproc("SpManageTransporterAnalytics", args)
        row = cursor.fetchone()
        return map_score_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/transporter-scores/{id}", response_model=TransporterScoreOut)
def update_transporter_score(id: int, req: TransporterScoreBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "SCORE", "UPDATE", id,
            req.transporter, req.trips, req.on_time_pct, req.damage_pct, req.avg_transit_days, req.freight_per_kg,
            None, 0, 0.0, 0.0, 0.0, "system"
        )
        cursor.callproc("SpManageTransporterAnalytics", args)
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Score not found")
        return map_score_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/transporter-scores/{id}")
def delete_transporter_score(id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageTransporterAnalytics", [
            "SCORE", "DELETE", id, None, 0, 0.0, 0.0, 0.0, 0.0, None, 0, 0.0, 0.0, 0.0, "system"
        ])
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

# --- REGIONS ---
@router.get("/region-dispatch", response_model=List[RegionDispatchOut])
def get_region_dispatch():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageTransporterAnalytics", [
            "REGION", "GET_ALL", 0, None, 0, 0.0, 0.0, 0.0, 0.0, None, 0, 0.0, 0.0, 0.0, "system"
        ])
        rows = cursor.fetchall()
        return [map_region_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("/region-dispatch", response_model=RegionDispatchOut)
def create_region_dispatch(req: RegionDispatchBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "REGION", "CREATE", 0,
            None, 0, 0.0, 0.0, 0.0, 0.0,
            req.region, req.cartons, req.weight_kg, req.value, req.on_time_pct, "system"
        )
        cursor.callproc("SpManageTransporterAnalytics", args)
        row = cursor.fetchone()
        return map_region_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/region-dispatch/{id}", response_model=RegionDispatchOut)
def update_region_dispatch(id: int, req: RegionDispatchBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "REGION", "UPDATE", id,
            None, 0, 0.0, 0.0, 0.0, 0.0,
            req.region, req.cartons, req.weight_kg, req.value, req.on_time_pct, "system"
        )
        cursor.callproc("SpManageTransporterAnalytics", args)
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Region not found")
        return map_region_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/region-dispatch/{id}")
def delete_region_dispatch(id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageTransporterAnalytics", [
            "REGION", "DELETE", id, None, 0, 0.0, 0.0, 0.0, 0.0, None, 0, 0.0, 0.0, 0.0, "system"
        ])
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
