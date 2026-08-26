from typing import Any
from fastapi import HTTPException
from app.repositories.bank_repository import BankRepository

class BankService:
    def __init__(self, repository: BankRepository):
        self.repository = repository

    async def get_all_banks(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_banks()

    async def create_bank(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        return await self.repository.create_bank(data, user_id)

    async def update_bank(self, bank_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        result = await self.repository.update_bank(bank_id, data, user_id)
        if not result:
            raise HTTPException(status_code=404, detail="Bank not found")
        return result

    async def delete_bank(self, bank_id: int, user_id: str) -> None:
        await self.repository.delete_bank(bank_id, user_id)
