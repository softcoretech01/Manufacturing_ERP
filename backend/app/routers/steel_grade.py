from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.steel_grade import (
    SteelGradeCreateSchema,
    SteelGradePatchSchema,
    SteelGradeResponseSchema,
)
from app.repositories.steel_grade_repository import SteelGradeRepository
from app.services.steel_grade_service import SteelGradeService

router = APIRouter(prefix="/steel-grades", tags=["Steel Grades"])

def get_service(db: AsyncSession = Depends(get_session)) -> SteelGradeService:
    repository = SteelGradeRepository(db)
    return SteelGradeService(repository)

@router.get("", response_model=list[SteelGradeResponseSchema])
async def get_all_steel_grades(
    service: SteelGradeService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_steel_grade_code(
    service: SteelGradeService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{record_id}", response_model=SteelGradeResponseSchema)
async def get_steel_grade(
    record_id: int,
    service: SteelGradeService = Depends(get_service)
):
    return await service.get_by_id(record_id)

@router.post("", response_model=SteelGradeResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_steel_grade(
    data: SteelGradeCreateSchema,
    service: SteelGradeService = Depends(get_service)
):
    # Hardcoded user_id for now as per previous implementations
    return await service.create(data.model_dump(), user_id="System")

@router.put("/{record_id}", response_model=SteelGradeResponseSchema)
async def update_steel_grade(
    record_id: int,
    data: SteelGradePatchSchema,
    service: SteelGradeService = Depends(get_service)
):
    return await service.update(record_id, data.model_dump(exclude_unset=True), user_id="System")

@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_steel_grade(
    record_id: int,
    service: SteelGradeService = Depends(get_service)
):
    await service.delete(record_id, user_id="System")
