from typing import Any
from fastapi import HTTPException
from app.repositories.bottle_model_repository import BottleModelRepository


class BottleModelService:
    def __init__(self, repository: BottleModelRepository):
        self.repository = repository

    async def get_all(self) -> list[dict[str, Any]]:
        return await self.repository.get_all()

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def create(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        if not data.get('code') or not str(data['code']).strip():
            next_code_info = await self.repository.get_next_code()
            data['code'] = next_code_info['nextCode']
        return await self.repository.create(data, user_id)

    async def update(self, record_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        existing = await self.repository.get_by_id(record_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Bottle model not found")

        # Merge: fill missing fields from existing record
        for key in existing.keys():
            if key not in data and key not in ['id', 'createdDate', 'modifiedDate', 'createdBy', 'modifiedBy', 'isDeleted', 'usageCount']:
                data[key] = existing[key]

        return await self.repository.update(record_id, data, user_id)

    async def delete(self, record_id: int, user_id: str) -> None:
        existing = await self.repository.get_by_id(record_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Bottle model not found")
        await self.repository.delete(record_id, user_id)
