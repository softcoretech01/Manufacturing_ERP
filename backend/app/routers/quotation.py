import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.schemas.procurement import SupplierQuotationSchema

router = APIRouter(prefix="/procurement/quotations", tags=["Procurement - Quotations"])

@router.get("", response_model=List[SupplierQuotationSchema])
async def get_all_quotations(session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageSupplierQuotation('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    return []

@router.get("/{uid}", response_model=SupplierQuotationSchema)
async def get_quotation(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageSupplierQuotation('READ', :uid, NULL)")
    result = await session.execute(query, {"uid": uid})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="Quotation not found")

@router.post("", response_model=Any, status_code=status.HTTP_201_CREATED)
async def create_quotation(req: SupplierQuotationSchema, session: AsyncSession = Depends(get_session)) -> Any:
    payload = req.model_dump_json()
    query = text("CALL ERP_Procurement.SpManageSupplierQuotation('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=500, detail="Failed to create Quotation")

@router.put("/{uid}", response_model=Any)
async def update_quotation(uid: str, req: SupplierQuotationSchema, session: AsyncSession = Depends(get_session)) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    
    req.uid = int(uid) if uid.isdigit() else uid
    payload = req.model_dump_json()
    query = text("CALL ERP_Procurement.SpManageSupplierQuotation('UPDATE', :uid, :payload)")
    result = await session.execute(query, {"uid": req.uid, "payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="Quotation not found or update failed")

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quotation(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    payload = json.dumps({"modifiedBy": "System"})
    query = text("CALL ERP_Procurement.SpManageSupplierQuotation('DELETE', :uid, :payload)")
    await session.execute(query, {"uid": uid, "payload": payload})
