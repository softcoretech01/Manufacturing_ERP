from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_session
from app.schemas.engineering_change import EngChangeSchema
from app.services.engineering_change_service import EngineeringChangeService
from app.utils.audit_logger import log_audit_entry

router = APIRouter(tags=["Engineering Changes"])

def get_service(db: AsyncSession = Depends(get_session)) -> EngineeringChangeService:
    return EngineeringChangeService(db)

@router.get("", response_model=List[EngChangeSchema])
async def get_changes(service: EngineeringChangeService = Depends(get_service)):
    return await service.get_all_changes()

@router.get("/next-code")
async def get_next_code(type: str = "ECR", service: EngineeringChangeService = Depends(get_service)):
    code = await service.get_next_code(type)
    return {"nextCode": code}

@router.post("", response_model=EngChangeSchema, status_code=status.HTTP_201_CREATED)
async def create_change(
    change: EngChangeSchema,
    service: EngineeringChangeService = Depends(get_service)
):
    user_id = "System"
    data = change.model_dump(mode='json')
    result = await service.create_change(data, user_id)
    await log_audit_entry(
        db=service.repository.session,
        entity_type="EngineeringChange",
        entity_label=result.get("title", "Unknown"),
        documentNo=result.get("docNo"),
        action="CREATE",
        changes=[{"field": "all", "old": None, "new": "Created"}]
    )
    return result

@router.put("/{change_uid}", response_model=EngChangeSchema)
async def update_change(
    change_uid: str,
    change: EngChangeSchema,
    service: EngineeringChangeService = Depends(get_service)
):
    user_id = "System"
    data = change.model_dump(mode='json')
    result = await service.update_change(change_uid, data, user_id)
    await log_audit_entry(
        db=service.repository.session,
        entity_type="EngineeringChange",
        entity_label=result.get("title", "Unknown"),
        documentNo=result.get("docNo"),
        action="UPDATE",
        changes=[{"field": "all", "old": "Previous", "new": "Updated"}]
    )
    return result

@router.delete("/{change_uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_change(
    change_uid: str,
    service: EngineeringChangeService = Depends(get_service)
):
    user_id = "System"
    await service.delete_change(change_uid, user_id)
    await log_audit_entry(
        db=service.repository.session,
        entity_type="EngineeringChange",
        entity_label=change_uid,
        action="DELETE",
        changes=[{"field": "id", "old": change_uid, "new": None}]
    )
    return None
