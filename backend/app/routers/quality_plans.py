import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_session
from app.schemas.quality_plans import InspectionPlanCreate, InspectionPlanUpdate, InspectionPlanResponse

router = APIRouter(prefix="/api/v1/quality/plans", tags=["Quality Plans"])

async def get_current_user():
    return "SystemAdmin"  # Mocked user, integrate with actual auth if available

@router.get("", response_model=List[InspectionPlanResponse])
async def get_plans(session: AsyncSession = Depends(get_session)):
    query = text("SELECT * FROM ERP_Quality.InspectionPlan WHERE DeletedAt IS NULL ORDER BY Id DESC")
    result = await session.execute(query)
    plans = result.mappings().all()

    # Fetch characteristics
    char_query = text("SELECT * FROM ERP_Quality.PlanCharacteristic WHERE PlanId IN (SELECT Id FROM ERP_Quality.InspectionPlan WHERE DeletedAt IS NULL)")
    char_result = await session.execute(char_query)
    characteristics = char_result.mappings().all()

    # Group characteristics by PlanId
    chars_by_plan = {}
    for char in characteristics:
        chars_by_plan.setdefault(char["PlanId"], []).append(dict(char))

    def to_camel(d):
        return {k[0].lower() + k[1:]: v for k, v in d.items()}

    response = []
    for plan in plans:
        plan_dict = to_camel(dict(plan))
        plan_chars = chars_by_plan.get(plan["Id"], [])
        plan_dict["characteristics"] = [to_camel(dict(c)) for c in plan_chars]
        response.append(plan_dict)

    return response

@router.post("", response_model=dict)
async def create_plan(
    plan: InspectionPlanCreate,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)
):
    chars_json = json.dumps([{"Seq": c.seq, "Name": c.name, "Type": c.type, "Uom": c.uom, "Target": c.target, "LowerLimit": c.lowerLimit, "UpperLimit": c.upperLimit, "InstrumentCode": c.instrumentCode, "Severity": c.severity, "IsMandatory": c.isMandatory, "RequiresPhoto": c.requiresPhoto, "Method": c.method} for c in plan.characteristics])

    query = text("""
        CALL ERP_Quality.SpManageInspectionPlan(
            'CREATE', NULL, :Name, :Stage, :ItemCode, :ItemName, :OperationCode,
            :SamplingMethod, :Aql, :FixedSampleSize, :RandomPercent, :Revision,
            :Status, :EffectiveFrom, :InspectorRole, :Frequency, :Remarks, :ApprovedBy,
            :User, :CharacteristicsJson
        )
    """)
    
    result = await session.execute(query, {
        "Name": plan.name,
        "Stage": plan.stage,
        "ItemCode": plan.itemCode,
        "ItemName": plan.itemName,
        "OperationCode": plan.operationCode,
        "SamplingMethod": plan.samplingMethod,
        "Aql": plan.aql,
        "FixedSampleSize": plan.fixedSampleSize,
        "RandomPercent": plan.randomPercent,
        "Revision": plan.revision,
        "Status": plan.status,
        "EffectiveFrom": plan.effectiveFrom,
        "InspectorRole": plan.inspectorRole,
        "Frequency": plan.frequency,
        "Remarks": plan.remarks,
        "ApprovedBy": plan.approvedBy,
        "User": current_user,
        "CharacteristicsJson": chars_json
    })
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create plan")
        
    return {"message": "Created successfully", "id": row[0], "planCode": row[1]}

@router.put("/{plan_id}", response_model=dict)
async def update_plan(
    plan_id: int,
    plan: InspectionPlanUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)
):
    chars_json = json.dumps([c.model_dump() for c in plan.characteristics])

    query = text("""
        CALL ERP_Quality.SpManageInspectionPlan(
            'UPDATE', :Id, :Name, :Stage, :ItemCode, :ItemName, :OperationCode,
            :SamplingMethod, :Aql, :FixedSampleSize, :RandomPercent, :Revision,
            :Status, :EffectiveFrom, :InspectorRole, :Frequency, :Remarks, :ApprovedBy,
            :User, :CharacteristicsJson
        )
    """)
    
    await session.execute(query, {
        "id": plan_id,
        "Name": plan.name,
        "Stage": plan.stage,
        "ItemCode": plan.itemCode,
        "ItemName": plan.itemName,
        "OperationCode": plan.operationCode,
        "SamplingMethod": plan.samplingMethod,
        "Aql": plan.aql,
        "FixedSampleSize": plan.fixedSampleSize,
        "RandomPercent": plan.randomPercent,
        "Revision": plan.revision,
        "Status": plan.status,
        "EffectiveFrom": plan.effectiveFrom,
        "InspectorRole": plan.inspectorRole,
        "Frequency": plan.frequency,
        "Remarks": plan.remarks,
        "ApprovedBy": plan.approvedBy,
        "User": current_user,
        "CharacteristicsJson": chars_json
    })
    
    return {"message": "Updated successfully", "id": plan_id}

@router.delete("/{plan_id}", response_model=dict)
async def delete_plan(
    plan_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)
):
    query = text("""
        CALL ERP_Quality.SpManageInspectionPlan(
            'DELETE', :Id, NULL, NULL, NULL, NULL, NULL,
            NULL, NULL, NULL, NULL, NULL,
            NULL, NULL, NULL, NULL, NULL, NULL,
            :User, NULL
        )
    """)
    
    await session.execute(query, {
        "id": plan_id,
        "User": current_user
    })
    
    return {"message": "Deleted successfully", "id": plan_id}
