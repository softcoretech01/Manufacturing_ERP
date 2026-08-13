from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.repositories.item_repository import ItemRepository
from app.services.item_service import ItemService
from app.schemas.item import (
    ItemCreateSchema,
    ItemUpdateSchema,
    ItemPatchSchema,
    ItemResponseSchema
)

router = APIRouter(prefix="/items", tags=["Items"])

def get_service(db: AsyncSession = Depends(get_session)) -> ItemService:
    repository = ItemRepository(db)
    return ItemService(repository)

@router.get("", response_model=list[ItemResponseSchema])
async def get_all_items(service: ItemService = Depends(get_service)):
    return await service.get_all_items()

@router.get("/next-code")
async def get_next_code(service: ItemService = Depends(get_service)):
    return await service.get_next_code()

@router.post("", response_model=ItemResponseSchema)
async def create_item(
    item: ItemCreateSchema,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    return await service.create_item(item.model_dump(), user_id)

@router.put("/{item_id}", response_model=ItemResponseSchema)
async def update_item(
    item_id: int,
    item: ItemPatchSchema,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    # Only send fields that were actually provided (not None)
    data = item.model_dump(exclude_none=True)
    return await service.update_item(item_id, data, user_id)

@router.patch("/{item_id}", response_model=ItemResponseSchema)
async def patch_item(
    item_id: int,
    item: ItemPatchSchema,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    data = item.model_dump(exclude_none=True)
    return await service.update_item(item_id, data, user_id)

@router.delete("/{item_id}", status_code=204)
async def delete_item(
    item_id: int,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    await service.delete_item(item_id, user_id)
