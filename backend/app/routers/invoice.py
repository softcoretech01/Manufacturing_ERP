"""Supplier invoice verification (3-way match) — the settlement stage.

A supplier invoice is booked against an approved purchase order, reconciled
against what was ordered (PO rate) and what was received and accepted (posted
GRNs), and — once it matches — approved, which bills the PO lines and clears the
invoice for finance. Thin async router over the ERP_Procurement
``SpManageSupplierInvoice`` stored procedure, matching the other procurement
routers (rfq/quotation/purchase_order/grn).
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
from app.schemas.procurement import SupplierInvoiceSchema

router = APIRouter(prefix="/procurement/invoices", tags=["Procurement - Invoice Verification"])


class MatchRequest(BaseModel):
    remarks: str | None = None


class ApproveRequest(BaseModel):
    override: bool = False           # approve despite open match exceptions
    reason: str | None = None


async def _call(session: AsyncSession, action: str, uid: Any, payload: dict | None) -> Any:
    """Invoke the stored procedure and return its decoded JSON result (or None)."""
    result = await session.execute(
        text("CALL ERP_Procurement.SpManageSupplierInvoice(:a, :id, :p)"),
        {"a": action, "id": uid, "p": json.dumps(payload) if payload is not None else None},
    )
    row = result.fetchone()
    return json.loads(row[0]) if row and row[0] else None


@router.get("", response_model=List[SupplierInvoiceSchema], dependencies=[Depends(require("PROCUREMENT.INVOICE.VIEW"))])
async def get_all_invoices(session: AsyncSession = Depends(get_session)) -> Any:
    return await _call(session, "READ_ALL", None, None) or []


@router.get("/{uid}", response_model=SupplierInvoiceSchema, dependencies=[Depends(require("PROCUREMENT.INVOICE.VIEW"))])
async def get_invoice(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    data = await _call(session, "READ", uid, None)
    if not data:
        raise HTTPException(status_code=404, detail="Supplier invoice not found")
    return data


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require("PROCUREMENT.INVOICE.CREATE"))])
async def create_invoice(req: SupplierInvoiceSchema, session: SessionDep,
                         ctx: TenantContext = Depends(require("PROCUREMENT.INVOICE.CREATE"))) -> Any:
    """Book a supplier invoice against a purchase order.

    The PO must exist and be approved/receivable — an invoice can only settle a
    real commitment. Line money is recomputed by the SP from quantity × rate, so
    a client cannot dictate the payable amount.
    """
    po = (await session.execute(
        text("SELECT Status FROM ERP_Procurement.PurchaseOrder WHERE DocNo = :po OR Id = :po LIMIT 1"),
        {"po": req.poNo},
    )).fetchone()
    if po is None:
        raise HTTPException(status_code=400, detail=f"Purchase order {req.poNo} not found")
    if str(po[0]).upper() in ("DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"PO {req.poNo} is {po[0]} — only an approved PO can be invoiced")

    payload = json.loads(req.model_dump_json())
    payload["createdBy"] = ctx.user_name or "System"
    created = await _call(session, "CREATE", None, payload)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create supplier invoice")
    return created


@router.put("/{uid}", dependencies=[Depends(require("PROCUREMENT.INVOICE.EDIT"))])
async def update_invoice(uid: str, req: SupplierInvoiceSchema, session: SessionDep,
                         ctx: TenantContext = Depends(require("PROCUREMENT.INVOICE.EDIT"))) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    existing = await _call(session, "READ", uid, None)
    if not existing:
        raise HTTPException(status_code=404, detail="Supplier invoice not found")
    if str(existing.get("status", "")).upper() == "APPROVED":
        raise HTTPException(status_code=409, detail="An approved invoice cannot be edited")

    payload = json.loads(req.model_dump_json())
    payload["modifiedBy"] = ctx.user_name or "System"
    updated = await _call(session, "UPDATE", uid, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Supplier invoice not found or update failed")
    return updated


@router.post("/{uid}/match", dependencies=[Depends(require("PROCUREMENT.INVOICE.MATCH"))])
async def match_invoice(uid: str, body: MatchRequest, session: SessionDep,
                        ctx: TenantContext = Depends(require("PROCUREMENT.INVOICE.MATCH"))) -> Any:
    """Run the 3-way match: PO rate vs invoice rate, and billed vs received-accepted.

    Writes exception rows and sets the invoice's match status. A matched invoice
    is cleared for approval; one with exceptions is blocked until they are
    resolved or the invoice is corrected and re-matched.
    """
    if not await _call(session, "READ", uid, None):
        raise HTTPException(status_code=404, detail="Supplier invoice not found")
    outcome = await _call(session, "MATCH", uid, {"modifiedBy": ctx.user_name or "System"})
    return await _call(session, "READ", uid, None) if outcome is None else {**outcome, "invoice": await _call(session, "READ", uid, None)}


@router.post("/{uid}/approve", dependencies=[Depends(require("PROCUREMENT.INVOICE.APPROVE"))])
async def approve_invoice(uid: str, body: ApproveRequest, session: SessionDep,
                          ctx: TenantContext = Depends(require("PROCUREMENT.INVOICE.APPROVE"))) -> Any:
    """Approve a matched invoice, billing its quantities back onto the PO.

    Refuses an invoice that has not been matched, and one that still carries open
    match exceptions unless an approver explicitly overrides with a reason — the
    3-way match is the control that stops payment for goods never received.
    """
    inv = await _call(session, "READ", uid, None)
    if not inv:
        raise HTTPException(status_code=404, detail="Supplier invoice not found")
    if str(inv.get("status", "")).upper() == "APPROVED":
        raise HTTPException(status_code=409, detail="Invoice is already approved")
    if str(inv.get("matchStatus", "")).upper() == "NOT_MATCHED":
        raise HTTPException(status_code=409, detail="Run the 3-way match before approving this invoice")

    open_exceptions = [e for e in (inv.get("exceptions") or []) if str(e.get("status")).upper() == "OPEN"]
    if open_exceptions and not body.override:
        raise HTTPException(
            status_code=409,
            detail=f"{len(open_exceptions)} open match exception(s) — resolve them or approve with an override reason.",
        )
    if open_exceptions and body.override and not (body.reason or "").strip():
        raise HTTPException(status_code=400, detail="An override reason is required to approve past match exceptions")

    result = await _call(session, "APPROVE", uid, {"modifiedBy": ctx.user_name or "System"})
    return {**(result or {"uid": uid, "status": "APPROVED"}),
            "overridden": bool(open_exceptions and body.override),
            "overrideReason": body.reason if open_exceptions else None}


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require("PROCUREMENT.INVOICE.DELETE"))])
async def delete_invoice(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    await _call(session, "DELETE", uid, None)
