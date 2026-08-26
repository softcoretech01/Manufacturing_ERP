from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.quality_parameter import QualityParameterSchema
from app.services.quality_parameter_service import QualityParameterService
from app.repositories.quality_parameter_repository import QualityParameterRepository

router = APIRouter(
    prefix="/quality-parameters",
    tags=["Quality Parameters"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = QualityParameterRepository(db)
    return QualityParameterService(repository)

@router.get("", response_model=List[QualityParameterSchema])
async def get_all_quality_parameters(
    service: QualityParameterService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: QualityParameterService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{uid}", response_model=QualityParameterSchema)
async def get_quality_parameter(
    uid: str,
    service: QualityParameterService = Depends(get_service)
):
    return await service.get_by_id(uid)

@router.post("", response_model=QualityParameterSchema, status_code=status.HTTP_201_CREATED)
async def create_quality_parameter(
    data: QualityParameterSchema,
    service: QualityParameterService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{uid}", response_model=QualityParameterSchema)
async def update_quality_parameter(
    uid: str,
    data: QualityParameterSchema,
    service: QualityParameterService = Depends(get_service)
):
    current_user = "system"
    return await service.update(uid, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quality_parameter(
    uid: str,
    service: QualityParameterService = Depends(get_service)
):
    current_user = "system"
    await service.delete(uid, current_user)
