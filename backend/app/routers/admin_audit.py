from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_session
from app.schemas.audit import AuditEntrySchema
from app.services.audit_service import AuditService

router = APIRouter(tags=["Admin Audit"])

def get_service(db: AsyncSession = Depends(get_session)) -> AuditService:
    return AuditService(db)

@router.get("", response_model=List[AuditEntrySchema])
async def get_audit_entries(service: AuditService = Depends(get_service)):
    return await service.get_all_audit_entries()

@router.post("", response_model=AuditEntrySchema, status_code=status.HTTP_201_CREATED)
async def create_audit_entry(
    entry: AuditEntrySchema,
    service: AuditService = Depends(get_service)
):
    user_id = "System"
    data = entry.model_dump(mode='json')
    result_uid = await service.create_audit_entry(data, user_id)
    if not result_uid:
        raise HTTPException(status_code=500, detail="Failed to create audit entry")
    data["uid"] = result_uid
    return data
