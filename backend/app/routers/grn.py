import json
from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Any
from app.core.database import get_session
from app.schemas.procurement import GrnSchema, IncomingInspectionSchema

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
async def create_grn(req: GrnSchema, session: AsyncSession = Depends(get_session)) -> Any:
    if req.poNo:
        po_query = text("SELECT Status FROM ERP_Procurement.PurchaseOrder WHERE DocNo = :poNo")
        po_res = await session.execute(po_query, {"poNo": req.poNo})
        po_row = po_res.fetchone()
        if not po_row or po_row[0] not in ('APPROVED', 'RELEASED'):
            raise HTTPException(status_code=400, detail=f"Referenced PO {req.poNo} must be APPROVED or RELEASED before a GRN can be raised")
    payload = req.model_dump_json(by_alias=True)
    query = text("CALL ERP_Procurement.SpManageGrn('CREATE', NULL, :payload)")
    result = await session.execute(query, {"payload": payload})
    row = result.fetchone()
    if row and row[0]:
        data = json.loads(row[0])
        return data
    raise HTTPException(status_code=500, detail="Failed to create GRN")

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
