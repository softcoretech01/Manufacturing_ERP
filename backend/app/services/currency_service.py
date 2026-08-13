from typing import List, Dict, Any
from app.repositories.currency_repository import CurrencyRepository
from fastapi import HTTPException
import uuid

class CurrencyService:
    def __init__(self, repository: CurrencyRepository):
        self.repository = repository

    async def get_all_currencies(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_currencies()

    async def get_currency(self, code: str) -> Dict[str, Any]:
        result = await self.repository.get_currency(code)
        if not result:
            raise HTTPException(status_code=404, detail="Currency not found")
        return result

    async def get_all_exchange_rates(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_exchange_rates()

    async def get_exchange_rate(self, uid: str) -> Dict[str, Any]:
        result = await self.repository.get_exchange_rate(uid)
        if not result:
            raise HTTPException(status_code=404, detail="Exchange Rate not found")
        return result

    async def create_exchange_rate(self, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        uid = f"xr-{uuid.uuid4().hex[:8]}"
        return await self.repository.create_exchange_rate(uid, data, current_user)
