"""Quotation comparison — the scored, persisted comparison document (Vol 3 Ch 5).

Build computes landed cost + weighted scores from an RFQ's quotations and snapshots
them (comparison_service). Award records the human decision and drives the underlying
quotation SELECT (winner SELECTED, others REJECTED, RFQ COMPLETED). The recommendation
is advisory; awarding off the top-ranked vendor needs a deviation reason (BR-011).
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
from app.schemas.procurement import ComparisonSchema
from app.services.comparison_service import build_comparison

router = APIRouter(prefix="/procurement/comparisons", tags=["Procurement - Quotation Comparison"])


class BuildRequest(BaseModel):
    rfqNo: str
    weights: dict | None = None


class AwardRequest(BaseModel):
    quotationUid: str
    deviationReasonCode: str | None = None      # required when awarding off the recommendation
    deviationJustification: str | None = None
    remarks: str | None = None


async def _call(session: AsyncSession, action: str, uid: Any, payload: dict | None) -> Any:
    result = await session.execute(
        text("CALL ERP_Procurement.SpManageComparison(:a, :id, :p)"),
        {"a": action, "id": uid, "p": json.dumps(payload) if payload is not None else None},
    )
    row = result.fetchone()
    return json.loads(row[0]) if row and row[0] else None


@router.get("", response_model=List[ComparisonSchema], dependencies=[Depends(require("PROCUREMENT.COMPARISON.VIEW"))])
async def get_all_comparisons(session: AsyncSession = Depends(get_session)) -> Any:
    return await _call(session, "READ_ALL", None, None) or []


@router.get("/{uid}", response_model=ComparisonSchema, dependencies=[Depends(require("PROCUREMENT.COMPARISON.VIEW"))])
async def get_comparison(uid: str, session: AsyncSession = Depends(get_session)) -> Any:
    data = await _call(session, "READ", uid, None)
    if not data:
        raise HTTPException(status_code=404, detail="Comparison not found")
    return data


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require("PROCUREMENT.COMPARISON.CREATE"))])
async def build(req: BuildRequest, session: SessionDep,
                ctx: TenantContext = Depends(require("PROCUREMENT.COMPARISON.CREATE"))) -> Any:
    """Build and persist a scored comparison for an RFQ's quotations."""
    return await build_comparison(session, ctx, req.rfqNo, req.weights)


@router.post("/{uid}/award", dependencies=[Depends(require("PROCUREMENT.COMPARISON.AWARD"))])
async def award(uid: str, body: AwardRequest, session: SessionDep,
                ctx: TenantContext = Depends(require("PROCUREMENT.COMPARISON.AWARD"))) -> Any:
    """Award the comparison to a supplier's quotation.

    Awarding off the recommended (top-ranked) vendor requires a deviation reason
    (BR-011). This records the award on the comparison and moves the quotations:
    the winner becomes SELECTED, its siblings on the RFQ REJECTED, and the RFQ
    closes COMPLETED — one decision, one transaction.
    """
    cmp = await _call(session, "READ", uid, None)
    if not cmp:
        raise HTTPException(status_code=404, detail="Comparison not found")
    if str(cmp.get("status", "")).upper() in ("AWARDED", "APPROVED"):
        raise HTTPException(status_code=409, detail="This comparison has already been awarded")

    vendor = next((v for v in cmp.get("vendors") or [] if str(v.get("quotationUid")) == str(body.quotationUid)), None)
    if vendor is None:
        raise HTTPException(status_code=400, detail="That quotation is not part of this comparison")

    off_recommendation = str(body.quotationUid) != str(cmp.get("recommendedQuotationUid") or "")
    if off_recommendation and not (body.deviationReasonCode or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Awarding off the recommended vendor requires a deviation reason code (QUALITY, DELIVERY, CAPACITY, …).",
        )

    actor = ctx.user_name or "System"

    # 1) record the award on the comparison
    await _call(session, "SET_STATUS", uid, {
        "status": "AWARDED",
        "awardedQuotationUid": str(body.quotationUid),
        "awardedSupplier": vendor.get("supplierName"),
        "awardValue": vendor.get("landedValue"),
        "deviationReasonCode": body.deviationReasonCode,
        "deviationJustification": body.deviationJustification,
        "modifiedBy": actor,
    })

    # 2) drive the underlying quotation SELECT (winner SELECTED, siblings REJECTED, RFQ COMPLETED)
    row = (await session.execute(
        text("SELECT Id, DocNo, RfqNo, SupplierName, Status FROM ERP_Procurement.SupplierQuotation "
             "WHERE Id = :uid OR DocNo = :uid LIMIT 1"),
        {"uid": str(body.quotationUid)},
    )).fetchone()
    quotation_moved = False
    if row is not None and str(row[4]).upper() not in ("USED", "SELECTED"):
        quote_id, _doc, rfq_no, supplier_name, _st = row

        async def set_quote(qid: int, new_status: str) -> None:
            await session.execute(
                text("CALL ERP_Procurement.SpManageSupplierQuotation('SET_STATUS', :id, :p)"),
                {"id": qid, "p": json.dumps({"status": new_status, "modifiedBy": actor})},
            )

        await set_quote(quote_id, "SELECTED")
        losers = (await session.execute(
            text("SELECT Id FROM ERP_Procurement.SupplierQuotation "
                 "WHERE RfqNo = :rfq AND Id <> :id AND Status NOT IN ('USED','REJECTED')"),
            {"rfq": rfq_no, "id": quote_id},
        )).fetchall()
        for (loser_id,) in losers:
            await set_quote(loser_id, "REJECTED")
        rfq = (await session.execute(
            text("SELECT Id FROM ERP_Procurement.Rfq WHERE DocNo = :rfq LIMIT 1"), {"rfq": rfq_no}
        )).fetchone()
        if rfq is not None:
            await session.execute(
                text("CALL ERP_Procurement.SpManageRfq('SET_STATUS', :id, :p)"),
                {"id": rfq[0], "p": json.dumps({"status": "COMPLETED", "awardedTo": supplier_name, "modifiedBy": actor})},
            )
        quotation_moved = True

    return {
        "uid": uid, "status": "AWARDED",
        "awardedSupplier": vendor.get("supplierName"),
        "offRecommendation": off_recommendation,
        "quotationSelected": quotation_moved,
    }


@router.post("/{uid}/approve", dependencies=[Depends(require("PROCUREMENT.COMPARISON.APPROVE"))])
async def approve(uid: str, session: SessionDep,
                  ctx: TenantContext = Depends(require("PROCUREMENT.COMPARISON.APPROVE"))) -> Any:
    """Approve an awarded comparison (sign-off on the vendor selection)."""
    cmp = await _call(session, "READ", uid, None)
    if not cmp:
        raise HTTPException(status_code=404, detail="Comparison not found")
    if str(cmp.get("status", "")).upper() != "AWARDED":
        raise HTTPException(status_code=409, detail="Only an awarded comparison can be approved")
    await _call(session, "SET_STATUS", uid, {"status": "APPROVED", "modifiedBy": ctx.user_name or "System"})
    return {"uid": uid, "status": "APPROVED"}


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require("PROCUREMENT.COMPARISON.CREATE"))])
async def delete_comparison(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    await _call(session, "DELETE", uid, None)
