from typing import Any
from fastapi import HTTPException
from app.repositories.item_repository import ItemRepository

class ItemService:
    def __init__(self, repository: ItemRepository):
        self.repository = repository

    async def get_all_items(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_items()

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def create_item(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        return await self.repository.create_item(data, user_id)

    async def update_item(self, item_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        existing = await self.repository.get_item_by_id(item_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Item not found")
        
        # Merge data to pass missing fields as they were
        for key in existing.keys():
            if key not in data and key not in ['id', 'createdDate', 'modifiedDate', 'createdBy', 'modifiedBy', 'isDeleted']:
                data[key] = existing[key]
                
        return await self.repository.update_item(item_id, data, user_id)

    async def delete_item(self, item_id: int, user_id: str) -> None:
        existing = await self.repository.get_item_by_id(item_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Item not found")
        await self.repository.delete_item(item_id, user_id)
