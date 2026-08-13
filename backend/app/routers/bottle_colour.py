from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.bottle_colour import (
    BottleColourCreateSchema,
    BottleColourPatchSchema,
    BottleColourResponseSchema,
)
from app.repositories.bottle_colour_repository import BottleColourRepository
from app.services.bottle_colour_service import BottleColourService

router = APIRouter(prefix="/bottle-colours", tags=["Bottle Colours"])

def get_service(db: AsyncSession = Depends(get_session)) -> BottleColourService:
    repository = BottleColourRepository(db)
    return BottleColourService(repository)

@router.get("", response_model=list[BottleColourResponseSchema])
async def get_all_bottle_colours(
    service: BottleColourService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_bottle_colour_code(
    service: BottleColourService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{record_id}", response_model=BottleColourResponseSchema)
async def get_bottle_colour(
    record_id: int,
    service: BottleColourService = Depends(get_service)
):
    return await service.get_by_id(record_id)

@router.post("", response_model=BottleColourResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_bottle_colour(
    data: BottleColourCreateSchema,
    service: BottleColourService = Depends(get_service)
):
    # Hardcoded user_id for now as per previous implementations
    return await service.create(data.model_dump(), user_id="System")

@router.put("/{record_id}", response_model=BottleColourResponseSchema)
async def update_bottle_colour(
    record_id: int,
    data: BottleColourPatchSchema,
    service: BottleColourService = Depends(get_service)
):
    return await service.update(record_id, data.model_dump(exclude_unset=True), user_id="System")

@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bottle_colour(
    record_id: int,
    service: BottleColourService = Depends(get_service)
):
    await service.delete(record_id, user_id="System")
