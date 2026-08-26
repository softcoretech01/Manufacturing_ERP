import json
from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.schemas.procurement import PurchaseOrderSchema

router = APIRouter(prefix="/procurement/purchase-orders", tags=["Procurement Purchase Orders"])

@router.get("/", response_model=List[PurchaseOrderSchema])
async def get_purchase_orders(session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    return []

@router.get("/{uid}", response_model=PurchaseOrderSchema)
async def get_purchase_order(uid: str = Path(...), session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('READ', :uid, NULL)")
    result = await session.execute(query, {"uid": uid})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="Purchase order not found")

@router.post("/", response_model=PurchaseOrderSchema, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(req: PurchaseOrderSchema, session: AsyncSession = Depends(get_session)) -> Any:
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=500, detail="Failed to create purchase order")

@router.put("/{uid}", response_model=PurchaseOrderSchema)
async def update_purchase_order(uid: str, req: PurchaseOrderSchema, session: AsyncSession = Depends(get_session)) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    
    req.uid = int(uid) if uid.isdigit() else uid
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('UPDATE', :uid, :payload)")
    result = await session.execute(query, {"uid": req.uid, "payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="Purchase order not found or update failed")

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase_order(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    payload = json.dumps({"modifiedBy": "System"})
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('DELETE', :uid, :payload)")
    await session.execute(query, {"uid": uid, "payload": payload})
