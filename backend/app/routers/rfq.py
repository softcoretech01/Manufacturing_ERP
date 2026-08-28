import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.core.deps import require
from app.schemas.procurement import RfqSchema
from app.services.rfq_sync import sync_rfq_supplier_response

router = APIRouter(prefix="/procurement/rfq", tags=["Procurement - RFQ"])

@router.get("", response_model=List[RfqSchema], dependencies=[Depends(require("PROCUREMENT.RFQ.VIEW"))])
async def get_all_rfqs(session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageRfq('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    return []

@router.get("/{uid}", response_model=RfqSchema, dependencies=[Depends(require("PROCUREMENT.RFQ.VIEW"))])
async def get_rfq(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageRfq('READ', :uid, NULL)")
    result = await session.execute(query, {"uid": uid})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="RFQ not found")

@router.post("", response_model=Any, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require("PROCUREMENT.RFQ.CREATE"))])
async def create_rfq(req: RfqSchema, session: AsyncSession = Depends(get_session)) -> Any:
    if req.prRefs:
        for pr_id in req.prRefs:
            pr_query = text("SELECT Status FROM ERP_Procurement.PurchaseRequisition WHERE Id = :uid OR DocNo = :uid")
            pr_res = await session.execute(pr_query, {"uid": pr_id})
            pr_row = pr_res.fetchone()
            if not pr_row or pr_row[0] != 'APPROVED':
                raise HTTPException(status_code=400, detail=f"Referenced PR {pr_id} must be in APPROVED status")
    payload = req.model_dump_json()
    query = text("CALL ERP_Procurement.SpManageRfq('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=500, detail="Failed to create RFQ")

@router.put("/{uid}", response_model=Any, dependencies=[Depends(require("PROCUREMENT.RFQ.EDIT"))])
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
        # UPDATE rewrites the invited-supplier rows from the request body, which
        # carries no knowledge of the quotations already received. Recompute them
        # from the quotations themselves so an edit cannot lose a response.
        await sync_rfq_supplier_response(session, data.get("docNo"))
        return data
    raise HTTPException(status_code=404, detail="RFQ not found or update failed")

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require("PROCUREMENT.RFQ.DELETE"))])
async def delete_rfq(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    payload = json.dumps({"modifiedBy": "System"})
    query = text("CALL ERP_Procurement.SpManageRfq('DELETE', :uid, :payload)")
    await session.execute(query, {"uid": uid, "payload": payload})
