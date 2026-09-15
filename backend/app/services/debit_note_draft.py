"""Auto-draft a supplier debit note from an approved purchase return.

Called by the purchase-return approve flow: it reads the just-approved return and
raises a DRAFT debit note of type GOODS_RETURN for the returned value, carrying the
back-links (return, GRN, PO, supplier). The debit note is then reviewed and
approved separately — raising the return and issuing the financial claim are
distinct duties. Standalone debit notes (rate difference, LD, etc.) are created
directly on the debit-note endpoint instead.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext


async def draft_debit_note_for_return(
    session: AsyncSession, ctx: TenantContext, return_uid: Any
) -> dict[str, Any] | None:
    """Create a DRAFT GOODS_RETURN debit note from an approved return. Idempotent:
    if the return already carries a debit note, nothing new is drafted."""
    ret_row = (
        await session.execute(
            text("CALL ERP_Procurement.SpManagePurchaseReturn('READ', :id, NULL)"),
            {"id": str(return_uid)},
        )
    ).fetchone()
    if not (ret_row and ret_row[0]):
        return None
    ret = json.loads(ret_row[0])

    if ret.get("debitNoteId"):
        return {"uid": ret["debitNoteId"], "docNo": ret.get("debitNoteNo")}

    lines = [
        {
            "itemCode": ln.get("itemCode"),
            "itemName": ln.get("itemName"),
            "uom": ln.get("uom"),
            "quantity": ln.get("returnQty"),
            "rate": ln.get("rate"),
            "taxPct": ln.get("taxPct"),
            "sourceReference": ret.get("docNo"),
            "remarks": ln.get("reasonCode"),
        }
        for ln in (ret.get("lines") or [])
        if float(ln.get("returnQty") or 0) > 0
    ]

    payload = {
        "docDate": ret.get("docDate"),
        "status": "DRAFT",
        "debitNoteType": "GOODS_RETURN",
        "supplierUid": ret.get("supplierUid"),
        "supplierName": ret.get("supplierName"),
        "purchaseReturnId": int(return_uid),
        "returnNo": ret.get("docNo"),
        "grnNo": ret.get("grnNo"),
        "poNo": ret.get("poNo"),
        "reasonCode": ret.get("reasonCode"),
        "narration": f"Debit note for goods returned on {ret.get('docNo')} "
                     f"({str(ret.get('returnType') or '').replace('_', ' ').lower()}).",
        "createdBy": ctx.user_name or "System",
        "lines": lines,
    }
    created = (
        await session.execute(
            text("CALL ERP_Procurement.SpManageDebitNote('CREATE', NULL, :p)"),
            {"p": json.dumps(payload)},
        )
    ).fetchone()
    if created and created[0]:
        return json.loads(created[0])
    return None
