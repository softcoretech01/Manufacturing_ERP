from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.steel_thickness import (
    SteelThicknessCreateSchema,
    SteelThicknessPatchSchema,
    SteelThicknessResponseSchema,
)
from app.repositories.steel_thickness_repository import SteelThicknessRepository
from app.services.steel_thickness_service import SteelThicknessService

router = APIRouter(prefix="/steel-thicknesses", tags=["Steel Thicknesses"])

def get_service(db: AsyncSession = Depends(get_session)) -> SteelThicknessService:
    repository = SteelThicknessRepository(db)
    return SteelThicknessService(repository)

@router.get("", response_model=list[SteelThicknessResponseSchema])
async def get_all_steel_thicknesses(
    service: SteelThicknessService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_steel_thickness_code(
    service: SteelThicknessService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{record_id}", response_model=SteelThicknessResponseSchema)
async def get_steel_thickness(
    record_id: int,
    service: SteelThicknessService = Depends(get_service)
):
    return await service.get_by_id(record_id)

@router.post("", response_model=SteelThicknessResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_steel_thickness(
    data: SteelThicknessCreateSchema,
    service: SteelThicknessService = Depends(get_service)
):
    # Hardcoded user_id for now as per previous implementations
    return await service.create(data.model_dump(), user_id="System")

@router.put("/{record_id}", response_model=SteelThicknessResponseSchema)
async def update_steel_thickness(
    record_id: int,
    data: SteelThicknessPatchSchema,
    service: SteelThicknessService = Depends(get_service)
):
    return await service.update(record_id, data.model_dump(exclude_unset=True), user_id="System")

@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_steel_thickness(
    record_id: int,
    service: SteelThicknessService = Depends(get_service)
):
    await service.delete(record_id, user_id="System")
