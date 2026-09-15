"""Purchase return — rejected/damaged/wrong material leaving the plant against a
document (Vol 3 Ch 7). Thin async router over ERP_Procurement.SpManagePurchaseReturn,
matching the other procurement routers. APPROVE posts the stock-out through
PurchaseReturnPostingService and (once a debit note exists) auto-drafts one.
"""
import json
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import SessionDep, require
from app.schemas.procurement import PurchaseReturnSchema
from app.services.purchase_return_posting import PurchaseReturnPostingService

router = APIRouter(prefix="/procurement/purchase-returns", tags=["Procurement - Purchase Return"])


class DispatchRequest(BaseModel):
    vehicleNo: str | None = None
    ewayBillNo: str | None = None


async def _call(session: AsyncSession, action: str, uid: Any, payload: dict | None) -> Any:
    result = await session.execute(
        text("CALL ERP_Procurement.SpManagePurchaseReturn(:a, :id, :p)"),
        {"a": action, "id": uid, "p": json.dumps(payload) if payload is not None else None},
    )
    row = result.fetchone()
    return json.loads(row[0]) if row and row[0] else None


@router.get("", response_model=List[PurchaseReturnSchema], dependencies=[Depends(require("PROCUREMENT.RETURN.VIEW"))])
async def get_all_returns(session: AsyncSession = Depends(get_session)) -> Any:
    return await _call(session, "READ_ALL", None, None) or []


@router.get("/{uid}", response_model=PurchaseReturnSchema, dependencies=[Depends(require("PROCUREMENT.RETURN.VIEW"))])
async def get_return(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    data = await _call(session, "READ", uid, None)
    if not data:
        raise HTTPException(status_code=404, detail="Purchase return not found")
    return data


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require("PROCUREMENT.RETURN.CREATE"))])
async def create_return(req: PurchaseReturnSchema, session: SessionDep,
                        ctx: TenantContext = Depends(require("PROCUREMENT.RETURN.CREATE"))) -> Any:
    """Raise a purchase return against a posted GRN.

    You can only return material that was actually received, so the GRN must
    exist and be POSTED.
    """
    grn = (await session.execute(
        text("SELECT Status FROM ERP_Procurement.Grn WHERE DocNo = :g OR Id = :g LIMIT 1"),
        {"g": req.grnNo},
    )).fetchone()
    if grn is None:
        raise HTTPException(status_code=400, detail=f"GRN {req.grnNo} not found")
    if str(grn[0]).upper() != "POSTED":
        raise HTTPException(status_code=400, detail=f"GRN {req.grnNo} is {grn[0]} — only a posted GRN can be returned against")

    payload = json.loads(req.model_dump_json())
    payload["createdBy"] = ctx.user_name or "System"
    created = await _call(session, "CREATE", None, payload)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create purchase return")
    return created


@router.put("/{uid}", dependencies=[Depends(require("PROCUREMENT.RETURN.EDIT"))])
async def update_return(uid: str, req: PurchaseReturnSchema, session: SessionDep,
                        ctx: TenantContext = Depends(require("PROCUREMENT.RETURN.EDIT"))) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    existing = await _call(session, "READ", uid, None)
    if not existing:
        raise HTTPException(status_code=404, detail="Purchase return not found")
    if str(existing.get("status", "")).upper() in ("APPROVED", "DISPATCHED"):
        raise HTTPException(status_code=409, detail="An approved return can no longer be edited")

    payload = json.loads(req.model_dump_json())
    payload["modifiedBy"] = ctx.user_name or "System"
    updated = await _call(session, "UPDATE", uid, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Purchase return not found or update failed")
    return updated


@router.post("/{uid}/approve", dependencies=[Depends(require("PROCUREMENT.RETURN.APPROVE"))])
async def approve_return(uid: str, session: SessionDep,
                         ctx: TenantContext = Depends(require("PROCUREMENT.RETURN.APPROVE"))) -> Any:
    """Approve a return: post the stock-out (for stocked lines), roll the returned
    quantity onto the GRN and PO, and auto-draft the supplier debit note.

    Rejected-at-GRN material never entered stock, so those lines post no ledger
    movement — only the debit note recovers their value.
    """
    ret = await _call(session, "READ", uid, None)
    if not ret:
        raise HTTPException(status_code=404, detail="Purchase return not found")
    st = str(ret.get("status", "")).upper()
    if st in ("APPROVED", "DISPATCHED"):
        raise HTTPException(status_code=409, detail="Return is already approved")
    if st == "CANCELLED":
        raise HTTPException(status_code=409, detail="A cancelled return cannot be approved")

    posting = await PurchaseReturnPostingService(session, ctx).post(ret)
    await _call(session, "SET_STATUS", uid,
                {"status": "APPROVED", "stockPosted": True, "modifiedBy": ctx.user_name or "System"})

    result: dict[str, Any] = {"uid": uid, "status": "APPROVED", "posting": posting}

    # Auto-draft the supplier debit note for the returned value.
    try:
        from app.services.debit_note_draft import draft_debit_note_for_return  # noqa: PLC0415
    except ImportError:
        draft_debit_note_for_return = None  # debit-note module not present yet
    if draft_debit_note_for_return is not None:
        dn = await draft_debit_note_for_return(session, ctx, uid)
        if dn and dn.get("uid") is not None:
            await _call(session, "SET_STATUS", uid,
                        {"status": "APPROVED", "debitNoteId": int(dn["uid"]),
                         "debitNoteNo": dn.get("docNo"), "modifiedBy": ctx.user_name or "System"})
            result["debitNote"] = dn

    return result


@router.post("/{uid}/dispatch", dependencies=[Depends(require("PROCUREMENT.RETURN.DISPATCH"))])
async def dispatch_return(uid: str, body: DispatchRequest, session: SessionDep,
                          ctx: TenantContext = Depends(require("PROCUREMENT.RETURN.DISPATCH"))) -> Any:
    """Record physical dispatch of an approved return (gate-out)."""
    ret = await _call(session, "READ", uid, None)
    if not ret:
        raise HTTPException(status_code=404, detail="Purchase return not found")
    if str(ret.get("status", "")).upper() != "APPROVED":
        raise HTTPException(status_code=409, detail="Only an approved return can be dispatched")
    await _call(session, "SET_STATUS", uid, {"status": "DISPATCHED", "modifiedBy": ctx.user_name or "System"})
    return {"uid": uid, "status": "DISPATCHED"}


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require("PROCUREMENT.RETURN.DELETE"))])
async def delete_return(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    await _call(session, "DELETE", uid, None)
