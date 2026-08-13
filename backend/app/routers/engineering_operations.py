from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

from app.core.database import get_session
from app.schemas.engineering_operation import EngOperationSchema
from app.repositories.engineering_operation_repository import EngineeringOperationRepository
from app.services.engineering_operation_service import EngineeringOperationService

router = APIRouter(tags=["Engineering Operations"])

def get_service(db: AsyncSession = Depends(get_session)) -> EngineeringOperationService:
    return EngineeringOperationService(db)

@router.get("", response_model=List[EngOperationSchema])
async def get_operations(service: EngineeringOperationService = Depends(get_service)):
    return await service.get_all_operations()

@router.get("/next-code")
async def get_next_code(service: EngineeringOperationService = Depends(get_service)):
    code = await service.get_next_code()
    return {"nextCode": code}

@router.post("", response_model=EngOperationSchema, status_code=status.HTTP_201_CREATED)
async def create_operation(
    op: EngOperationSchema,
    service: EngineeringOperationService = Depends(get_service)
):
    user_id = "System"
    data = op.model_dump(mode='json')
    result_uid = await service.create_operation(data, user_id)
    if not result_uid:
        raise HTTPException(status_code=500, detail="Failed to create operation")
    data["uid"] = result_uid
    return data

@router.put("/{op_uid}", response_model=EngOperationSchema)
async def update_operation(
    op_uid: str,
    op: EngOperationSchema,
    service: EngineeringOperationService = Depends(get_service)
):
    user_id = "System"
    data = op.model_dump(mode='json')
    result_uid = await service.update_operation(op_uid, data, user_id)
    if not result_uid:
        raise HTTPException(status_code=404, detail="Operation not found or update failed")
    data["uid"] = result_uid
    return data

@router.delete("/{op_uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_operation(
    op_uid: str,
    service: EngineeringOperationService = Depends(get_service)
):
    user_id = "System"
    await service.delete_operation(op_uid, user_id)
    return None
