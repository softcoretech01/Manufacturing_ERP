import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.core.deps import ContextDep, SessionDep
from app.core.context import TenantContext
from app.core.doc_status import register_status_writer
from app.schemas.procurement import PurchaseRequisitionSchema
from app.modules.workflow.application.engine import WorkflowService

router = APIRouter(prefix="/procurement/requisitions", tags=["Procurement"])


# Terminal workflow decision → PR document status. RETURNED sends the PR back to
# the requester as an editable DRAFT; REJECTED and APPROVED map 1:1.
_PR_STATUS_FROM_DECISION = {
    "APPROVED": "APPROVED",
    "REJECTED": "REJECTED",
    "RETURNED": "DRAFT",
}


async def _pr_status_writer(
    session: AsyncSession, ctx: TenantContext,
    entity_uid: str, decision: str, comments: str | None,
) -> None:
    """Mirror a workflow decision onto the PR row via the (non-destructive) SP.

    Registered against ``PURCHASE_REQUISITION`` and invoked by the workflow
    engine inside the approval transaction. ``entity_uid`` is the PR's numeric
    id (as stored by :func:`create_requisition`).
    """
    new_status = _PR_STATUS_FROM_DECISION.get(decision, decision)
    payload = json.dumps({"status": new_status, "modifiedBy": ctx.user_name or "System"})
    await session.execute(
        text("CALL ERP_Procurement.SpManagePurchaseRequisition('SET_STATUS', :id, :payload)"),
        {"id": entity_uid, "payload": payload},
    )


register_status_writer("PURCHASE_REQUISITION", _pr_status_writer)

@router.get("", response_model=List[PurchaseRequisitionSchema])
async def get_all_requisitions(session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManagePurchaseRequisition('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    return []

@router.get("/{uid}", response_model=PurchaseRequisitionSchema)
async def get_requisition(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManagePurchaseRequisition('READ', :uid, NULL)")
    result = await session.execute(query, {"uid": uid})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="Requisition not found")

@router.post("", response_model=Any, status_code=status.HTTP_201_CREATED)
async def create_requisition(req: PurchaseRequisitionSchema, session: SessionDep, ctx: ContextDep) -> Any:
    payload = req.model_dump_json(exclude_none=True)
    query = text("CALL ERP_Procurement.SpManagePurchaseRequisition('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        if req.status == 'PENDING_APPROVAL' and ctx:
            await WorkflowService(session, ctx).submit(
                entity_type="PURCHASE_REQUISITION",
                entity_uid=str(data["uid"]),
                document_no=data.get("docNo", ""),
                document_version=req.version or 1,
                amount=req.estimatedValue or 0.0,
                requester_name=req.requestedBy,
                department=req.department
            )
        return data
    raise HTTPException(status_code=500, detail="Failed to create requisition")

@router.put("/{uid}", response_model=Any)
async def update_requisition(uid: str, req: PurchaseRequisitionSchema, session: SessionDep, ctx: ContextDep) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    
    req.uid = int(uid) if uid.isdigit() else uid
    payload = req.model_dump_json()
    query = text("CALL ERP_Procurement.SpManagePurchaseRequisition('UPDATE', :uid, :payload)")
    result = await session.execute(query, {"uid": req.uid, "payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        if req.status == 'PENDING_APPROVAL' and ctx:
            await WorkflowService(session, ctx).submit(
                entity_type="PURCHASE_REQUISITION",
                entity_uid=str(data["uid"]),
                document_no=data.get("docNo", ""),
                document_version=req.version or 1,
                amount=req.estimatedValue or 0.0,
                requester_name=req.requestedBy,
                department=req.department
            )
        return data
    raise HTTPException(status_code=404, detail="Requisition not found or update failed")

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_requisition(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    # We pass a simple JSON payload with modifiedBy just to be safe if the SP looks for it
    payload = json.dumps({"modifiedBy": "System"})
    query = text("CALL ERP_Procurement.SpManagePurchaseRequisition('DELETE', :uid, :payload)")
    await session.execute(query, {"uid": uid, "payload": payload})
