from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.defect import DefectSchema
from app.services.defect_service import DefectService
from app.repositories.defect_repository import DefectRepository

router = APIRouter(
    prefix="/defects",
    tags=["Defects"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = DefectRepository(db)
    return DefectService(repository)

@router.get("", response_model=List[DefectSchema])
async def get_all_defects(
    service: DefectService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: DefectService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{uid}", response_model=DefectSchema)
async def get_defect(
    uid: str,
    service: DefectService = Depends(get_service)
):
    return await service.get_by_id(uid)

@router.post("", response_model=DefectSchema, status_code=status.HTTP_201_CREATED)
async def create_defect(
    data: DefectSchema,
    service: DefectService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{uid}", response_model=DefectSchema)
async def update_defect(
    uid: str,
    data: DefectSchema,
    service: DefectService = Depends(get_service)
):
    current_user = "system"
    return await service.update(uid, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_defect(
    uid: str,
    service: DefectService = Depends(get_service)
):
    current_user = "system"
    await service.delete(uid, current_user)
