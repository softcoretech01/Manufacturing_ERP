from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date
import pymysql
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/plans", tags=["dispatch_plans"])

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing',
    'cursorclass': pymysql.cursors.DictCursor
}

class DispatchPlanBase(CamelModel):
    plan_date: date
    status: str = Field("DRAFT", max_length=20)
    basis: str = Field(..., max_length=20)
    customer: str = Field(..., max_length=255)
    customer_code: str = Field(..., max_length=50)
    sales_order_no: Optional[str] = Field(None, max_length=50)
    route: str = Field(..., max_length=100)
    region: str = Field(..., max_length=100)
    delivery_date: date
    priority: str = Field("NORMAL", max_length=20)
    cartons: int = 0
    pallets: int = 0
    weight_kg: float = 0
    volume_cbm: float = 0
    vehicle_no: Optional[str] = Field(None, max_length=50)
    transporter: Optional[str] = Field(None, max_length=150)
    vehicle_capacity_kg: Optional[float] = None
    is_export: bool = False
    remarks: Optional[str] = None

class DispatchPlanOut(DispatchPlanBase):
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
        elif k == 'IsExport':
            new_row['is_export'] = bool(v)
        else:
            new_row[to_snake(k)] = v
    return new_row

@router.get("", response_model=List[DispatchPlanOut])
def get_dispatch_plans():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageDispatchPlan('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')")
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.get("/{plan_id}", response_model=DispatchPlanOut)
def get_dispatch_plan(plan_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageDispatchPlan('SELECT_BY_ID', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (plan_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Dispatch plan not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=DispatchPlanOut)
def create_dispatch_plan(plan: DispatchPlanBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'INSERT',
            None,
            plan.plan_date,
            plan.status,
            plan.basis,
            plan.customer,
            plan.customer_code,
            plan.sales_order_no,
            plan.route,
            plan.region,
            plan.delivery_date,
            plan.priority,
            plan.cartons,
            plan.pallets,
            plan.weight_kg,
            plan.volume_cbm,
            plan.vehicle_no,
            plan.transporter,
            plan.vehicle_capacity_kg,
            plan.is_export,
            plan.remarks,
            'system'
        )
        cursor.execute("CALL SpManageDispatchPlan(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{plan_id}", response_model=DispatchPlanOut)
def update_dispatch_plan(plan_id: int, plan: DispatchPlanBase):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        args = (
            'UPDATE',
            plan_id,
            plan.plan_date,
            plan.status,
            plan.basis,
            plan.customer,
            plan.customer_code,
            plan.sales_order_no,
            plan.route,
            plan.region,
            plan.delivery_date,
            plan.priority,
            plan.cartons,
            plan.pallets,
            plan.weight_kg,
            plan.volume_cbm,
            plan.vehicle_no,
            plan.transporter,
            plan.vehicle_capacity_kg,
            plan.is_export,
            plan.remarks,
            'system'
        )
        cursor.execute("CALL SpManageDispatchPlan(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
        row = cursor.fetchone()
        conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Dispatch plan not found")
        return map_row(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{plan_id}")
def delete_dispatch_plan(plan_id: int):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("CALL SpManageDispatchPlan('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'system')", (plan_id,))
        conn.commit()
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
