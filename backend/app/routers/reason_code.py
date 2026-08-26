from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.reason_code import ReasonCodeSchema
from app.services.reason_code_service import ReasonCodeService
from app.repositories.reason_code_repository import ReasonCodeRepository

router = APIRouter(
    prefix="/reason-codes",
    tags=["Reason Codes"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = ReasonCodeRepository(db)
    return ReasonCodeService(repository)

@router.get("", response_model=List[ReasonCodeSchema])
async def get_all_reason_codes(
    service: ReasonCodeService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: ReasonCodeService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=ReasonCodeSchema)
async def get_reason_code(
    id: int,
    service: ReasonCodeService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=ReasonCodeSchema, status_code=status.HTTP_201_CREATED)
async def create_reason_code(
    data: ReasonCodeSchema,
    service: ReasonCodeService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=ReasonCodeSchema)
async def update_reason_code(
    id: int,
    data: ReasonCodeSchema,
    service: ReasonCodeService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reason_code(
    id: int,
    service: ReasonCodeService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
