from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.core.config import settings
from app.schemas.pack_material import PackMaterialLineCreate, PackMaterialLineUpdate, PackMaterialLineResponse
import pymysql

router = APIRouter(prefix="/api/v1/dispatch/pack-materials", tags=["Pack Materials"])

def get_db_connection(db_name: str):
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=db_name,
        cursorclass=pymysql.cursors.DictCursor
    )

def dict_to_camel(d):
    if not d: return d
    return {k[0].lower() + k[1:]: v for k, v in d.items()}

def execute_sp(action: str, p_id: int = None, p_packing_order_no: str = None, data: dict = None, user: str = "system"):
    conn = get_db_connection('ERP_Packing')
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")

    try:
        with conn.cursor() as cursor:
            if data is None:
                data = {}

            args = (
                action,
                p_id,
                p_packing_order_no or data.get("packing_order_no"),
                data.get("item_code"),
                data.get("item_name"),
                data.get("category"),
                data.get("standard_qty"),
                data.get("issued_qty"),
                data.get("consumed_qty"),
                data.get("uom"),
                data.get("unit_cost"),
                data.get("warehouse"),
                data.get("issued_on"),
                data.get("issued_by"),
                data.get("status"),
                user
            )

            cursor.execute("CALL SpManagePackMaterialLine(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
            result = cursor.fetchall()
            
        conn.commit()
        return [dict_to_camel(row) for row in result]
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.post("", response_model=PackMaterialLineResponse)
def create_pack_material(material: PackMaterialLineCreate):
    result = execute_sp('CREATE', data=material.dict())
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create material line")
    return result[0]

@router.get("", response_model=List[PackMaterialLineResponse])
def get_pack_materials():
    result = execute_sp('READ')
    return result

@router.get("/{id}", response_model=PackMaterialLineResponse)
def get_pack_material(id: int):
    result = execute_sp('READ', p_id=id)
    if not result:
        raise HTTPException(status_code=404, detail="Material line not found")
    return result[0]

@router.put("/{id}", response_model=PackMaterialLineResponse)
def update_pack_material(id: int, material: PackMaterialLineUpdate):
    result = execute_sp('UPDATE', p_id=id, data=material.dict(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Material line not found or failed to update")
    return result[0]

@router.delete("/{id}")
def delete_pack_material(id: int):
    execute_sp('DELETE', p_id=id)
    return {"message": "Deleted successfully"}

@router.post("/issue-order/{packing_order_no}", response_model=List[PackMaterialLineResponse])
def issue_all_for_order(packing_order_no: str):
    result = execute_sp('ISSUE_ALL', p_packing_order_no=packing_order_no)
    return result
