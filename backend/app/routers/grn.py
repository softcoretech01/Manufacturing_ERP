import json
from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.core.deps import ContextDep, SessionDep
from app.schemas.procurement import GrnSchema, IncomingInspectionSchema
from app.services.grn_posting import GrnPostingService

router = APIRouter(prefix="/procurement", tags=["Procurement GRN & IQC"])

# --- GRN Endpoints ---

@router.get("/grn/", response_model=List[GrnSchema])
async def get_grns(session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageGrn('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    return []

@router.get("/grn/{uid}", response_model=GrnSchema)
async def get_grn(uid: str = Path(...), session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageGrn('READ', :uid, NULL)")
    result = await session.execute(query, {"uid": uid})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="GRN not found")

@router.post("/grn/", status_code=status.HTTP_201_CREATED)
async def create_grn(req: GrnSchema, session: SessionDep, ctx: ContextDep) -> Any:
    """Create a GRN and, unless it is saved as a draft, post it to inventory.

    Creation and stock posting share this request's transaction, so a GRN that
    fails to post leaves no document behind (V4 transaction safety). Approval is
    enforced upstream on the purchase order — an unapproved PO cannot be received.
    """
    posting = GrnPostingService(session, ctx)
    is_draft = str(req.status or "").upper() == "DRAFT"

    # Validate the PO up front so a bad reference never creates a document.
    if req.poNo:
        await posting._po_or_error(req.poNo)

    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManageGrn('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if not (row and row[0]):
        raise HTTPException(status_code=500, detail="Failed to create GRN")

    created = json.loads(row[0])
    if is_draft:
        return created

    # Re-read the persisted GRN: CREATE returns only the new id, and posting must
    # work from what was actually stored (including the generated document number
    # and the saved lines), never from the client's claim.
    stored = await session.execute(
        text("CALL ERP_Procurement.SpManageGrn('READ', :uid, NULL)"), {"uid": created["uid"]}
    )
    stored_row = stored.fetchone()
    if not (stored_row and stored_row[0]):
        raise HTTPException(status_code=500, detail="GRN was created but could not be read back")

    data = json.loads(stored_row[0])
    data["posting"] = await posting.post(data)
    data["status"] = "POSTED"
    return data


@router.post("/grn/{uid}/post")
async def post_grn(uid: str, session: SessionDep, ctx: ContextDep) -> Any:
    """Post an existing draft GRN to inventory.

    Refuses a GRN that is already POSTED, so a retried request or a double click
    can never move the same goods into stock twice.
    """
    result = await session.execute(
        text("CALL ERP_Procurement.SpManageGrn('READ', :uid, NULL)"), {"uid": uid}
    )
    row = result.fetchone()
    if not (row and row[0]):
        raise HTTPException(status_code=404, detail="GRN not found")

    grn = json.loads(row[0])
    grn["_alreadyPersisted"] = True
    posting = await GrnPostingService(session, ctx).post(grn)
    return {"uid": uid, "status": "POSTED", "posting": posting}

@router.put("/grn/{uid}")
async def update_grn(uid: str, req: GrnSchema, session: AsyncSession = Depends(get_session)) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    
    req.uid = int(uid) if uid.isdigit() else uid
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManageGrn('UPDATE', :uid, :payload)")
    result = await session.execute(query, {"uid": req.uid, "payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="GRN not found or update failed")

@router.delete("/grn/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grn(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    query = text("CALL ERP_Procurement.SpManageGrn('DELETE', :uid, NULL)")
    await session.execute(query, {"uid": uid})

# --- IQC Endpoints ---

@router.get("/iqc/", response_model=List[IncomingInspectionSchema])
async def get_iqcs(session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageIqc('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    return []

@router.get("/iqc/{uid}", response_model=IncomingInspectionSchema)
async def get_iqc(uid: str = Path(...), session: AsyncSession = Depends(get_session)) -> Any:
    query = text("CALL ERP_Procurement.SpManageIqc('READ', :uid, NULL)")
    result = await session.execute(query, {"uid": uid})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="IQC not found")

@router.post("/iqc/", status_code=status.HTTP_201_CREATED)
async def create_iqc(req: IncomingInspectionSchema, session: AsyncSession = Depends(get_session)) -> Any:
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManageIqc('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=500, detail="Failed to create IQC")

@router.put("/iqc/{uid}")
async def update_iqc(uid: str, req: IncomingInspectionSchema, session: AsyncSession = Depends(get_session)) -> Any:
    if req.uid and str(req.uid) != str(uid):
        raise HTTPException(status_code=400, detail="UID in path does not match UID in payload")
    
    req.uid = int(uid) if uid.isdigit() else uid
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManageIqc('UPDATE', :uid, :payload)")
    result = await session.execute(query, {"uid": req.uid, "payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=404, detail="IQC not found or update failed")

@router.delete("/iqc/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_iqc(uid: str, session: AsyncSession = Depends(get_session)) -> None:
    query = text("CALL ERP_Procurement.SpManageIqc('DELETE', :uid, NULL)")
    await session.execute(query, {"uid": uid})
