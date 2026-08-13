from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.bottle_capacity import (
    BottleCapacityCreateSchema,
    BottleCapacityPatchSchema,
    BottleCapacityResponseSchema
)
from app.repositories.bottle_capacity_repository import BottleCapacityRepository
from app.services.bottle_capacity_service import BottleCapacityService

router = APIRouter(prefix="/bottle-capacities", tags=["Bottle Capacity Master"])


def get_service(db: AsyncSession = Depends(get_session)) -> BottleCapacityService:
    repository = BottleCapacityRepository(db)
    return BottleCapacityService(repository)


@router.get("", response_model=list[BottleCapacityResponseSchema])
async def get_all(service: BottleCapacityService = Depends(get_service)):
    return await service.get_all()


@router.get("/next-code")
async def get_next_code(service: BottleCapacityService = Depends(get_service)):
    return await service.get_next_code()


@router.post("", response_model=BottleCapacityResponseSchema)
async def create(
    item: BottleCapacityCreateSchema,
    service: BottleCapacityService = Depends(get_service),
):
    user_id = "System"
    return await service.create(item.model_dump(), user_id)


@router.put("/{record_id}", response_model=BottleCapacityResponseSchema)
async def update(
    record_id: int,
    item: BottleCapacityPatchSchema,
    service: BottleCapacityService = Depends(get_service),
):
    user_id = "System"
    return await service.update(record_id, item.model_dump(exclude_unset=True), user_id)


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    record_id: int,
    service: BottleCapacityService = Depends(get_service),
):
    user_id = "System"
    await service.delete(record_id, user_id)
