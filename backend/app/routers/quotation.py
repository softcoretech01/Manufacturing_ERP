import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from pydantic import BaseModel
from app.core.database import get_session
from app.core.deps import ContextDep, SessionDep
from app.schemas.procurement import SupplierQuotationSchema

router = APIRouter(prefix="/procurement/quotations", tags=["Procurement - Quotations"])


class SupplierSelectionRequest(BaseModel):
    remarks: str | None = None


@router.post("/{uid}/select")
async def select_quotation(
    uid: str, body: SupplierSelectionRequest, session: SessionDep, ctx: ContextDep
) -> Any:
    """Award an RFQ to one supplier's quotation.

    Selection is a single decision that moves three documents together, so it is
    written here rather than being pieced together by the browser: the chosen
    quotation becomes SELECTED, every sibling quotation on the same RFQ becomes
    REJECTED, and the RFQ closes as COMPLETED with the awarded supplier recorded.
    One request, one transaction — a partial award is impossible.
    """
    row = (
        await session.execute(
            text(
                "SELECT Id, DocNo, RfqNo, SupplierUid, SupplierName, Status "
                "  FROM ERP_Procurement.SupplierQuotation WHERE Id = :uid OR DocNo = :uid LIMIT 1"
            ),
            {"uid": uid},
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Quotation not found")

    quote_id, doc_no, rfq_no, supplier_uid, supplier_name, current = row
    if current == "USED":
        raise HTTPException(
            status_code=409,
            detail=f"Quotation {doc_no} has already been converted into a purchase order.",
        )
    if current == "SELECTED":
        raise HTTPException(
            status_code=409, detail=f"Quotation {doc_no} is already the selected supplier."
        )

    actor = ctx.user_name or "System"

    async def set_quote_status(qid: int, new_status: str) -> None:
        await session.execute(
            text("CALL ERP_Procurement.SpManageSupplierQuotation('SET_STATUS', :id, :p)"),
            {"id": qid, "p": json.dumps({"status": new_status, "modifiedBy": actor})},
        )

    # Winner first, then everyone else on the same RFQ.
    await set_quote_status(quote_id, "SELECTED")
    losers = (
        await session.execute(
            text(
                "SELECT Id FROM ERP_Procurement.SupplierQuotation "
                " WHERE RfqNo = :rfq AND Id <> :id AND Status NOT IN ('USED', 'REJECTED')"
            ),
            {"rfq": rfq_no, "id": quote_id},
        )
    ).fetchall()
    for (loser_id,) in losers:
        await set_quote_status(loser_id, "REJECTED")

    # Close the RFQ and record who won it.
    rfq = (
        await session.execute(
            text("SELECT Id FROM ERP_Procurement.Rfq WHERE DocNo = :rfq LIMIT 1"),
            {"rfq": rfq_no},
        )
    ).fetchone()
    if rfq is not None:
        await session.execute(
            text("CALL ERP_Procurement.SpManageRfq('SET_STATUS', :id, :p)"),
            {
                "id": rfq[0],
                "p": json.dumps(
                    {"status": "COMPLETED", "awardedTo": supplier_name or supplier_uid,
                     "modifiedBy": actor}
                ),
            },
        )

    return {
        "quotationNo": doc_no,
        "rfqNo": rfq_no,
        "selectedSupplier": supplier_name or supplier_uid,
        "selectedBy": actor,
        "rejectedCount": len(losers),
        "status": "SELECTED",
    }

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
