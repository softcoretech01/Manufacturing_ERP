from typing import Any
from fastapi import HTTPException
from app.repositories.bottle_capacity_repository import BottleCapacityRepository


class BottleCapacityService:
    def __init__(self, repository: BottleCapacityRepository):
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
            raise HTTPException(status_code=404, detail="Bottle Capacity not found")
        
        # Merge existing data with new data for partial updates
        for key, value in data.items():
            if value is not None:
                existing[key] = value
                
        return await self.repository.update(record_id, existing, user_id)

    async def delete(self, record_id: int, user_id: str) -> None:
        existing = await self.repository.get_by_id(record_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Bottle Capacity not found")
            
        await self.repository.delete(record_id, user_id)
