from typing import Any
from fastapi import HTTPException, status
from app.repositories.bottle_colour_repository import BottleColourRepository


class BottleColourService:
    def __init__(self, repository: BottleColourRepository):
        self.repository = repository

    async def get_all(self) -> list[dict[str, Any]]:
        return await self.repository.get_all()

    async def get_by_id(self, record_id: int) -> dict[str, Any]:
        record = await self.repository.get_by_id(record_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
        return record

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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
        
        # Merge existing data with new data
        merged_data = {**existing, **data}
        # Clean out None values from the incoming data dictionary so it doesn't overwrite with None unless intended
        update_data = {k: v for k, v in data.items() if v is not None}
        final_data = {**existing, **update_data}

        return await self.repository.update(record_id, final_data, user_id)

    async def delete(self, record_id: int, user_id: str) -> None:
        existing = await self.repository.get_by_id(record_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
        await self.repository.delete(record_id, user_id)
