from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.core.config import settings
from app.schemas.packing_order import PackingOrderCreate, PackingOrderUpdate, PackingOrderResponse
import pymysql

router = APIRouter(prefix="/api/v1/dispatch/packing-orders", tags=["Packing Orders"])

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

# Helper function to execute the SP
def execute_sp(action: str, p_id: int = None, data: dict = None, user: str = "system"):
    conn = get_db_connection('ERP_Packing')
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    try:
        with conn.cursor() as cursor:
            if data is None:
                data = {}
            
            # The SP arguments:
            # p_Action, p_Id, p_Status, p_SourceType, p_SourceNo, p_Customer, p_CustomerCode, p_SalesOrderNo,
            # p_ItemCode, p_ItemName, p_BatchNo, p_Quantity, p_PackedQuantity, p_Uom, p_Warehouse, p_PackingDate,
            # p_Supervisor, p_CartonSpec, p_CartonsPlanned, p_CartonsPacked, p_MaterialReady, p_QcReleased,
            # p_WeightVerified, p_Priority, p_IsExport, p_IsOem, p_Remarks, p_User
            args = (
                action,
                p_id,
                data.get("status"),
                data.get("source_type"),
                data.get("source_no"),
                data.get("customer"),
                data.get("customer_code"),
                data.get("sales_order_no"),
                data.get("item_code"),
                data.get("item_name"),
                data.get("batch_no"),
                data.get("quantity"),
                data.get("packed_quantity"),
                data.get("uom"),
                data.get("warehouse"),
                data.get("packing_date"),
                data.get("supervisor"),
                data.get("carton_spec"),
                data.get("cartons_planned"),
                data.get("cartons_packed"),
                data.get("material_ready"),
                data.get("qc_released"),
                data.get("weight_verified"),
                data.get("priority"),
                data.get("is_export"),
                data.get("is_oem"),
                data.get("remarks"),
                user
            )
            
            cursor.execute("CALL SpManagePackingOrder(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
            
            result = cursor.fetchall()
        conn.commit()
        return [dict_to_camel(row) for row in result]
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.post("", response_model=PackingOrderResponse)
def create_packing_order(order: PackingOrderCreate):
    result = execute_sp('CREATE', data=order.dict())
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create packing order")
    return result[0]

@router.get("", response_model=List[PackingOrderResponse])
def get_packing_orders():
    result = execute_sp('READ')
    return result

@router.get("/{id}", response_model=PackingOrderResponse)
def get_packing_order(id: int):
    result = execute_sp('READ', p_id=id)
    if not result:
        raise HTTPException(status_code=404, detail="Packing order not found")
    return result[0]

@router.put("/{id}", response_model=PackingOrderResponse)
def update_packing_order(id: int, order: PackingOrderUpdate):
    # Ensure it exists
    existing = execute_sp('READ', p_id=id)
    if not existing:
        raise HTTPException(status_code=404, detail="Packing order not found")
    
    result = execute_sp('UPDATE', p_id=id, data=order.dict(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=400, detail="Failed to update packing order")
    return result[0]

@router.delete("/{id}")
def delete_packing_order(id: int):
    existing = execute_sp('READ', p_id=id)
    if not existing:
        raise HTTPException(status_code=404, detail="Packing order not found")
    
    execute_sp('DELETE', p_id=id)
    return {"message": "Packing order deleted successfully"}
