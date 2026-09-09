from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.repositories.bottle_attribute_repository import BottleAttributeRepository
from app.repositories.item_repository import ItemRepository
from app.schemas.item import ItemCreateSchema, ItemPatchSchema, ItemResponseSchema
from app.services.item_service import (
    InvalidCapacityError,
    ItemService,
    UnknownAttributeReferenceError,
)

router = APIRouter(prefix="/items", tags=["Items"])

# Both are the caller sending a value the master does not carry, so both are a
# bad request rather than a server fault.
ATTRIBUTE_ERRORS = (UnknownAttributeReferenceError, InvalidCapacityError)

def get_service(db: AsyncSession = Depends(get_session)) -> ItemService:
    repository = ItemRepository(db)
    return ItemService(repository, BottleAttributeRepository(db))

@router.get("", response_model=list[ItemResponseSchema])
async def get_all_items(
    manufacturable_only: bool = Query(
        False,
        alias="manufacturableOnly",
        description="Only items the factory produces (FINISHED, SEMI_FINISHED)."
                    " Used by the Routing, BOM-parent and MPS product pickers.",
    ),
    service: ItemService = Depends(get_service),
):
    return await service.get_all_items(manufacturable_only=manufacturable_only)

@router.get("/attribute-options")
async def get_attribute_options(service: ItemService = Depends(get_service)):
    """Selectable codes and names for colour, lid type, steel grade and model.

    The item form shows the name and submits the code, so it needs both. One
    endpoint rather than four so the form fills in a single request.
    """
    return await service.get_attribute_options()

@router.get("/next-code")
async def get_next_code(service: ItemService = Depends(get_service)):
    return await service.get_next_code()

@router.post("", response_model=ItemResponseSchema)
async def create_item(
    item: ItemCreateSchema,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    try:
        return await service.create_item(item.model_dump(), user_id)
    except ATTRIBUTE_ERRORS as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.put("/{item_id}", response_model=ItemResponseSchema)
async def update_item(
    item_id: int,
    item: ItemPatchSchema,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    # Only send fields that were actually provided (not None)
    data = item.model_dump(exclude_none=True)
    try:
        return await service.update_item(item_id, data, user_id)
    except ATTRIBUTE_ERRORS as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.patch("/{item_id}", response_model=ItemResponseSchema)
async def patch_item(
    item_id: int,
    item: ItemPatchSchema,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    data = item.model_dump(exclude_none=True)
    try:
        return await service.update_item(item_id, data, user_id)
    except ATTRIBUTE_ERRORS as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.delete("/{item_id}", status_code=204)
async def delete_item(
    item_id: int,
    service: ItemService = Depends(get_service)
):
    user_id = "System"
    await service.delete_item(item_id, user_id)
