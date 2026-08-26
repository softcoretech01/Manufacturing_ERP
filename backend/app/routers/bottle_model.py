from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.repositories.bottle_model_repository import BottleModelRepository
from app.services.bottle_model_service import BottleModelService
from app.schemas.bottle_model import (
    BottleModelCreateSchema,
    BottleModelPatchSchema,
    BottleModelResponseSchema,
)

router = APIRouter(prefix="/bottle-models", tags=["Bottle Models"])


def get_service(db: AsyncSession = Depends(get_session)) -> BottleModelService:
    repository = BottleModelRepository(db)
    return BottleModelService(repository)


@router.get("", response_model=list[BottleModelResponseSchema])
async def get_all(service: BottleModelService = Depends(get_service)):
    return await service.get_all()


@router.get("/next-code")
async def get_next_code(service: BottleModelService = Depends(get_service)):
    return await service.get_next_code()


@router.post("", response_model=BottleModelResponseSchema)
async def create(
    item: BottleModelCreateSchema,
    service: BottleModelService = Depends(get_service),
):
    user_id = "System"
    return await service.create(item.model_dump(), user_id)


@router.put("/{record_id}", response_model=BottleModelResponseSchema)
async def update(
    record_id: int,
    item: BottleModelPatchSchema,
    service: BottleModelService = Depends(get_service),
):
    user_id = "System"
    data = item.model_dump(exclude_none=True)
    return await service.update(record_id, data, user_id)


@router.patch("/{record_id}", response_model=BottleModelResponseSchema)
async def patch(
    record_id: int,
    item: BottleModelPatchSchema,
    service: BottleModelService = Depends(get_service),
):
    user_id = "System"
    data = item.model_dump(exclude_none=True)
    return await service.update(record_id, data, user_id)


@router.delete("/{record_id}", status_code=204)
async def delete(
    record_id: int,
    service: BottleModelService = Depends(get_service),
):
    user_id = "System"
    await service.delete(record_id, user_id)
