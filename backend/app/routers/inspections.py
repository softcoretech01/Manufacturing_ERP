import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_session
from app.schemas.inspections import InspectionCreate, InspectionUpdate, InspectionResponse

router = APIRouter(prefix="/api/v1/quality/inspections", tags=["Quality Inspections"])

async def get_current_user():
    return "SystemAdmin"  # Mocked user, integrate with actual auth if available

@router.get("", response_model=List[InspectionResponse])
async def get_inspections(session: AsyncSession = Depends(get_session)):
    query = text("SELECT * FROM ERP_Quality.Inspection WHERE DeletedAt IS NULL ORDER BY Id DESC")
    result = await session.execute(query)
    inspections = result.mappings().all()

    # Fetch readings
    reading_query = text("SELECT * FROM ERP_Quality.InspectionReading WHERE InspectionId IN (SELECT Id FROM ERP_Quality.Inspection WHERE DeletedAt IS NULL)")
    reading_result = await session.execute(reading_query)
    readings = reading_result.mappings().all()

    # Group readings by InspectionId
    readings_by_insp = {}
    for r in readings:
        readings_by_insp.setdefault(r["InspectionId"], []).append(dict(r))

    # Fetch defects
    defect_query = text("SELECT * FROM ERP_Quality.InspectionDefect WHERE InspectionId IN (SELECT Id FROM ERP_Quality.Inspection WHERE DeletedAt IS NULL)")
    defect_result = await session.execute(defect_query)
    defects = defect_result.mappings().all()

    # Group defects by InspectionId
    defects_by_insp = {}
    for d in defects:
        defects_by_insp.setdefault(d["InspectionId"], []).append(dict(d))

    def to_camel(d):
        return {k[0].lower() + k[1:]: v for k, v in d.items()}

    response = []
    for insp in inspections:
        insp_dict = to_camel(dict(insp))
        insp_readings = readings_by_insp.get(insp["Id"], [])
        insp_dict["readings"] = [to_camel(dict(c)) for c in insp_readings]
        
        insp_defects = defects_by_insp.get(insp["Id"], [])
        insp_dict["defects"] = [to_camel(dict(d)) for d in insp_defects]
        
        response.append(insp_dict)

    return response

@router.post("", response_model=dict)
async def create_inspection(
    insp: InspectionCreate,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)
):
    readings_json = json.dumps([{"CharacteristicId": r.characteristicId, "Name": r.name, "Type": r.type, "Uom": r.uom, "Target": r.target, "LowerLimit": r.lowerLimit, "UpperLimit": r.upperLimit, "InstrumentCode": r.instrumentCode, "Severity": r.severity, "IsMandatory": r.isMandatory, "RequiresPhoto": r.requiresPhoto, "Actual": r.actual, "Verdict": r.verdict, "PhotoAttached": r.photoAttached, "Remarks": r.remarks} for r in insp.readings])
    defects_json = json.dumps([{"DefectCode": d.defectCode, "DefectName": d.defectName, "Severity": d.severity, "Qty": d.qty, "Source": d.source, "Remarks": d.remarks} for d in insp.defects])

    query = text("""
        CALL ERP_Quality.SpManageInspection(
            'CREATE', NULL, :Stage, :SourceType, :SourceDocNo, :ItemCode, :ItemName, :Uom, :BatchNo, :SupplierCode, :SupplierName,
            :OperationCode, :WorkCentreCode, :MachineCode, :Shift, :PlanDocNo, :PlanRevision, :LotSize, :SampleSize,
            :AcceptNumber, :RejectNumber, :SamplingMethod, :Aql, :AcceptedQty, :RejectedQty, :ReworkQty, :Status,
            :Disposition, :DispositionReason, :Inspector, :InspectedAt, :ApprovedBy, :ApprovedAt, :NcrDocNo, :Remarks,
            :User, :ReadingsJson, :DefectsJson
        )
    """)
    
    result = await session.execute(query, {
        "Stage": insp.stage,
        "SourceType": insp.sourceType,
        "SourceDocNo": insp.sourceDocNo,
        "ItemCode": insp.itemCode,
        "ItemName": insp.itemName,
        "Uom": insp.uom,
        "BatchNo": insp.batchNo,
        "SupplierCode": insp.supplierCode,
        "SupplierName": insp.supplierName,
        "OperationCode": insp.operationCode,
        "WorkCentreCode": insp.workCentreCode,
        "MachineCode": insp.machineCode,
        "Shift": insp.shift,
        "PlanDocNo": insp.planDocNo,
        "PlanRevision": insp.planRevision,
        "LotSize": insp.lotSize,
        "SampleSize": insp.sampleSize,
        "AcceptNumber": insp.acceptNumber,
        "RejectNumber": insp.rejectNumber,
        "SamplingMethod": insp.samplingMethod,
        "Aql": insp.aql,
        "AcceptedQty": insp.acceptedQty,
        "RejectedQty": insp.rejectedQty,
        "ReworkQty": insp.reworkQty,
        "Status": insp.status,
        "Disposition": insp.disposition,
        "DispositionReason": insp.dispositionReason,
        "Inspector": insp.inspector,
        "InspectedAt": insp.inspectedAt,
        "ApprovedBy": insp.approvedBy,
        "ApprovedAt": insp.approvedAt,
        "NcrDocNo": insp.ncrDocNo,
        "Remarks": insp.remarks,
        "User": current_user,
        "ReadingsJson": readings_json,
        "DefectsJson": defects_json
    })
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create inspection")
        
    return {"message": "Created successfully", "id": row[0], "docNo": row[1]}

@router.put("/{insp_id}", response_model=dict)
async def update_inspection(
    insp_id: int,
    insp: InspectionUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)
):
    readings_json = json.dumps([{"CharacteristicId": r.characteristicId, "Name": r.name, "Type": r.type, "Uom": r.uom, "Target": r.target, "LowerLimit": r.lowerLimit, "UpperLimit": r.upperLimit, "InstrumentCode": r.instrumentCode, "Severity": r.severity, "IsMandatory": r.isMandatory, "RequiresPhoto": r.requiresPhoto, "Actual": r.actual, "Verdict": r.verdict, "PhotoAttached": r.photoAttached, "Remarks": r.remarks} for r in insp.readings])
    defects_json = json.dumps([{"DefectCode": d.defectCode, "DefectName": d.defectName, "Severity": d.severity, "Qty": d.qty, "Source": d.source, "Remarks": d.remarks} for d in insp.defects])

    query = text("""
        CALL ERP_Quality.SpManageInspection(
            'UPDATE', :Id, :Stage, :SourceType, :SourceDocNo, :ItemCode, :ItemName, :Uom, :BatchNo, :SupplierCode, :SupplierName,
            :OperationCode, :WorkCentreCode, :MachineCode, :Shift, :PlanDocNo, :PlanRevision, :LotSize, :SampleSize,
            :AcceptNumber, :RejectNumber, :SamplingMethod, :Aql, :AcceptedQty, :RejectedQty, :ReworkQty, :Status,
            :Disposition, :DispositionReason, :Inspector, :InspectedAt, :ApprovedBy, :ApprovedAt, :NcrDocNo, :Remarks,
            :User, :ReadingsJson, :DefectsJson
        )
    """)
    
    await session.execute(query, {
        "Id": insp_id,
        "Stage": insp.stage,
        "SourceType": insp.sourceType,
        "SourceDocNo": insp.sourceDocNo,
        "ItemCode": insp.itemCode,
        "ItemName": insp.itemName,
        "Uom": insp.uom,
        "BatchNo": insp.batchNo,
        "SupplierCode": insp.supplierCode,
        "SupplierName": insp.supplierName,
        "OperationCode": insp.operationCode,
        "WorkCentreCode": insp.workCentreCode,
        "MachineCode": insp.machineCode,
        "Shift": insp.shift,
        "PlanDocNo": insp.planDocNo,
        "PlanRevision": insp.planRevision,
        "LotSize": insp.lotSize,
        "SampleSize": insp.sampleSize,
        "AcceptNumber": insp.acceptNumber,
        "RejectNumber": insp.rejectNumber,
        "SamplingMethod": insp.samplingMethod,
        "Aql": insp.aql,
        "AcceptedQty": insp.acceptedQty,
        "RejectedQty": insp.rejectedQty,
        "ReworkQty": insp.reworkQty,
        "Status": insp.status,
        "Disposition": insp.disposition,
        "DispositionReason": insp.dispositionReason,
        "Inspector": insp.inspector,
        "InspectedAt": insp.inspectedAt,
        "ApprovedBy": insp.approvedBy,
        "ApprovedAt": insp.approvedAt,
        "NcrDocNo": insp.ncrDocNo,
        "Remarks": insp.remarks,
        "User": current_user,
        "ReadingsJson": readings_json,
        "DefectsJson": defects_json
    })
    
    return {"message": "Updated successfully", "id": insp_id}

@router.delete("/{insp_id}", response_model=dict)
async def delete_inspection(
    insp_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)
):
    query = text("""
        CALL ERP_Quality.SpManageInspection(
            'DELETE', :Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            :User, NULL, NULL
        )
    """)
    
    await session.execute(query, {
        "Id": insp_id,
        "User": current_user
    })
    
    return {"message": "Deleted successfully", "id": insp_id}
