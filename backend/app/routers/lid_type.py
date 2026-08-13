from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.lid_type import (
    LidTypeCreateSchema,
    LidTypePatchSchema,
    LidTypeResponseSchema,
)
from app.repositories.lid_type_repository import LidTypeRepository
from app.services.lid_type_service import LidTypeService

router = APIRouter(prefix="/lid-types", tags=["Lid Types"])

def get_service(db: AsyncSession = Depends(get_session)) -> LidTypeService:
    repository = LidTypeRepository(db)
    return LidTypeService(repository)

@router.get("", response_model=list[LidTypeResponseSchema])
async def get_all_lid_types(
    service: LidTypeService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_lid_type_code(
    service: LidTypeService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{record_id}", response_model=LidTypeResponseSchema)
async def get_lid_type(
    record_id: int,
    service: LidTypeService = Depends(get_service)
):
    return await service.get_by_id(record_id)

@router.post("", response_model=LidTypeResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_lid_type(
    data: LidTypeCreateSchema,
    service: LidTypeService = Depends(get_service)
):
    # Hardcoded user_id for now as per previous implementations
    return await service.create(data.model_dump(), user_id="System")

@router.put("/{record_id}", response_model=LidTypeResponseSchema)
async def update_lid_type(
    record_id: int,
    data: LidTypePatchSchema,
    service: LidTypeService = Depends(get_service)
):
    return await service.update(record_id, data.model_dump(exclude_unset=True), user_id="System")

@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lid_type(
    record_id: int,
    service: LidTypeService = Depends(get_service)
):
    await service.delete(record_id, user_id="System")
