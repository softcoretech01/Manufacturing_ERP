from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.shift import ShiftSchema
from app.services.shift_service import ShiftService
from app.repositories.shift_repository import ShiftRepository

router = APIRouter(
    prefix="/shifts",
    tags=["Shifts"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = ShiftRepository(db)
    return ShiftService(repository)

@router.get("", response_model=List[ShiftSchema])
async def get_all_shifts(
    service: ShiftService = Depends(get_service)
):
    return await service.get_shifts()

@router.get("/next-code")
async def get_next_code(
    service: ShiftService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{uid}", response_model=ShiftSchema)
async def get_shift(
    uid: str,
    service: ShiftService = Depends(get_service)
):
    return await service.get_shift_by_id(uid)

@router.post("", response_model=ShiftSchema, status_code=status.HTTP_201_CREATED)
async def create_shift(
    shift: ShiftSchema,
    service: ShiftService = Depends(get_service)
):
    # Simulated current user
    current_user = "system"
    return await service.create_shift(shift.model_dump(exclude_unset=True), current_user)

@router.put("/{uid}", response_model=ShiftSchema)
async def update_shift(
    uid: str,
    shift: ShiftSchema,
    service: ShiftService = Depends(get_service)
):
    current_user = "system"
    return await service.update_shift(uid, shift.model_dump(exclude_unset=True), current_user)

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shift(
    uid: str,
    service: ShiftService = Depends(get_service)
):
    current_user = "system"
    await service.delete_shift(uid, current_user)
