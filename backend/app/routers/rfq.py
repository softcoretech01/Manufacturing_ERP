import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.schemas.procurement import RfqSchema

router = APIRouter(prefix="/procurement/rfq", tags=["Procurement - RFQ"])

@router.get("/", response_model=List[RfqSchema])
async def get_all_rfqs(session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageRfq('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    return []

@router.get("/{uid}", response_model=RfqSchema)
async def get_rfq(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageRfq('READ', :uid, NULL)")
    result = await session.execute(query, {"uid": uid})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="RFQ not found")

@router.post("/", response_model=RfqSchema, status_code=status.HTTP_201_CREATED)
async def create_rfq(req: RfqSchema, session: AsyncSession = Depends(get_session)) -> Any:
    payload = req.model_dump_json()
    query = text("CALL ERP_Procurement.SpManageRfq('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=500, detail="Failed to create RFQ")

@router.put("/{uid}", response_model=RfqSchema)
async def update_rfq(uid: str, req: RfqSchema, session: AsyncSession = Depends(get_session)) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    
    req.uid = int(uid) if uid.isdigit() else uid
    payload = req.model_dump_json()
    query = text("CALL ERP_Procurement.SpManageRfq('UPDATE', :uid, :payload)")
    result = await session.execute(query, {"uid": req.uid, "payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="RFQ not found or update failed")

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rfq(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    payload = json.dumps({"modifiedBy": "System"})
    query = text("CALL ERP_Procurement.SpManageRfq('DELETE', :uid, :payload)")
    await session.execute(query, {"uid": uid, "payload": payload})
