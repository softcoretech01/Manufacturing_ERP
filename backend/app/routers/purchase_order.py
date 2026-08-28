import json
from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.core.deps import ContextDep, SessionDep
from app.core.context import TenantContext
from app.core.doc_status import register_status_writer
from app.schemas.procurement import PurchaseOrderSchema
from app.modules.workflow.application.engine import WorkflowService

router = APIRouter(prefix="/procurement/purchase-orders", tags=["Procurement Purchase Orders"])


# Terminal workflow decision → PO document status. On approval a PO becomes
# APPROVED (a later, explicit release step moves it to RELEASED). RETURNED sends
# it back to the buyer as an editable DRAFT.
_PO_STATUS_FROM_DECISION = {
    "APPROVED": "APPROVED",
    "REJECTED": "REJECTED",
    "RETURNED": "DRAFT",
}


async def _po_status_writer(
    session: AsyncSession, ctx: TenantContext,
    entity_uid: str, decision: str, comments: str | None,
) -> None:
    """Mirror a workflow decision onto the PO row via the non-destructive SP action."""
    new_status = _PO_STATUS_FROM_DECISION.get(decision, decision)
    payload = json.dumps({"status": new_status, "modifiedBy": ctx.user_name or "System"})
    await session.execute(
        text("CALL ERP_Procurement.SpManagePurchaseOrder('SET_STATUS', :id, :payload)"),
        {"id": entity_uid, "payload": payload},
    )


register_status_writer("PURCHASE_ORDER", _po_status_writer)

@router.get("", response_model=List[PurchaseOrderSchema])
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

async def _submit_po_for_approval(session: AsyncSession, ctx: TenantContext, req: PurchaseOrderSchema, data: dict) -> None:
    """Enter the PO into the approval workflow (V1-WFL). Amount-banded PO rules
    already exist in the workflow config; submit() fails closed if none match."""
    await WorkflowService(session, ctx).submit(
        entity_type="PURCHASE_ORDER",
        entity_uid=str(data["uid"]),
        document_no=data.get("docNo", ""),
        document_version=req.version or 1,
        amount=req.totalValue or 0.0,
        requester_name=req.buyer,
    )


@router.post("", response_model=Any, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(req: PurchaseOrderSchema, session: SessionDep, ctx: ContextDep) -> Any:
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        if req.status == 'PENDING_APPROVAL' and ctx:
            await _submit_po_for_approval(session, ctx, req, data)
        return data
    raise HTTPException(status_code=500, detail="Failed to create purchase order")

@router.put("/{uid}", response_model=Any)
async def update_purchase_order(uid: str, req: PurchaseOrderSchema, session: SessionDep, ctx: ContextDep) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")

    req.uid = int(uid) if uid.isdigit() else uid
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('UPDATE', :uid, :payload)")
    result = await session.execute(query, {"uid": req.uid, "payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        if req.status == 'PENDING_APPROVAL' and ctx:
            await _submit_po_for_approval(session, ctx, req, data)
        return data
    raise HTTPException(status_code=404, detail="Purchase order not found or update failed")

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase_order(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    payload = json.dumps({"modifiedBy": "System"})
    query = text("CALL ERP_Procurement.SpManagePurchaseOrder('DELETE', :uid, :payload)")
    await session.execute(query, {"uid": uid, "payload": payload})
