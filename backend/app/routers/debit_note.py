"""Supplier debit note — the financial claim on a supplier (Vol 3 Ch 7). A document
in its own right: usually auto-drafted from an approved purchase return, but can be
raised standalone (rate difference, short quantity, LD, freight claim, …). Thin async
router over ERP_Procurement.SpManageDebitNote. No stock effect; approving it issues the
claim (AP posting/netting is Finance, Vol 9).
"""
import json
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import SessionDep, require
from app.schemas.procurement import DebitNoteSchema

router = APIRouter(prefix="/procurement/debit-notes", tags=["Procurement - Debit Note"])


async def _call(session: AsyncSession, action: str, uid: Any, payload: dict | None) -> Any:
    result = await session.execute(
        text("CALL ERP_Procurement.SpManageDebitNote(:a, :id, :p)"),
        {"a": action, "id": uid, "p": json.dumps(payload) if payload is not None else None},
    )
    row = result.fetchone()
    return json.loads(row[0]) if row and row[0] else None


@router.get("", response_model=List[DebitNoteSchema], dependencies=[Depends(require("PROCUREMENT.DEBIT_NOTE.VIEW"))])
async def get_all_debit_notes(session: AsyncSession = Depends(get_session)) -> Any:
    return await _call(session, "READ_ALL", None, None) or []


@router.get("/{uid}", response_model=DebitNoteSchema, dependencies=[Depends(require("PROCUREMENT.DEBIT_NOTE.VIEW"))])
async def get_debit_note(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    data = await _call(session, "READ", uid, None)
    if not data:
        raise HTTPException(status_code=404, detail="Debit note not found")
    return data


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require("PROCUREMENT.DEBIT_NOTE.CREATE"))])
async def create_debit_note(req: DebitNoteSchema, session: SessionDep,
                            ctx: TenantContext = Depends(require("PROCUREMENT.DEBIT_NOTE.CREATE"))) -> Any:
    """Raise a debit note. A GOODS_RETURN note is normally auto-drafted from the
    return; this endpoint also serves standalone claims (rate/LD/short/etc.)."""
    if not req.lines:
        raise HTTPException(status_code=400, detail="A debit note needs at least one line")
    payload = json.loads(req.model_dump_json())
    payload["createdBy"] = ctx.user_name or "System"
    created = await _call(session, "CREATE", None, payload)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create debit note")
    return created


@router.put("/{uid}", dependencies=[Depends(require("PROCUREMENT.DEBIT_NOTE.EDIT"))])
async def update_debit_note(uid: str, req: DebitNoteSchema, session: SessionDep,
                            ctx: TenantContext = Depends(require("PROCUREMENT.DEBIT_NOTE.EDIT"))) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    existing = await _call(session, "READ", uid, None)
    if not existing:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if str(existing.get("status", "")).upper() == "APPROVED":
        raise HTTPException(status_code=409, detail="An approved debit note cannot be edited")
    payload = json.loads(req.model_dump_json())
    payload["modifiedBy"] = ctx.user_name or "System"
    updated = await _call(session, "UPDATE", uid, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Debit note not found or update failed")
    return updated


@router.post("/{uid}/approve", dependencies=[Depends(require("PROCUREMENT.DEBIT_NOTE.APPROVE"))])
async def approve_debit_note(uid: str, session: SessionDep,
                             ctx: TenantContext = Depends(require("PROCUREMENT.DEBIT_NOTE.APPROVE"))) -> Any:
    """Approve (issue) a debit note. Raising the return and issuing the claim are
    separate duties, so approval is its own permission."""
    dn = await _call(session, "READ", uid, None)
    if not dn:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if str(dn.get("status", "")).upper() == "APPROVED":
        raise HTTPException(status_code=409, detail="Debit note is already approved")
    if str(dn.get("status", "")).upper() == "CANCELLED":
        raise HTTPException(status_code=409, detail="A cancelled debit note cannot be approved")
    await _call(session, "SET_STATUS", uid,
                {"status": "APPROVED", "supplierAckStatus": "PENDING", "modifiedBy": ctx.user_name or "System"})
    return {"uid": uid, "status": "APPROVED"}


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require("PROCUREMENT.DEBIT_NOTE.DELETE"))])
async def delete_debit_note(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    await _call(session, "DELETE", uid, None)
