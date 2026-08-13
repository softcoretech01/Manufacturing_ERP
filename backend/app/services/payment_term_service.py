from typing import List, Dict, Any
from app.repositories.payment_term_repository import PaymentTermRepository
from fastapi import HTTPException

class PaymentTermService:
    def __init__(self, repository: PaymentTermRepository):
        self.repository = repository

    async def get_all(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all()

    async def get_next_code(self) -> Dict[str, str]:
        return await self.repository.get_next_code()

    async def get_by_id(self, id: int) -> Dict[str, Any]:
        result = await self.repository.get_by_id(id)
        if not result:
            raise HTTPException(status_code=404, detail="Payment Term not found")
        return result

    async def create(self, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        return await self.repository.create(data, current_user)

    async def update(self, id: int, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        result = await self.repository.get_by_id(id)
        if not result:
            raise HTTPException(status_code=404, detail="Payment Term not found")
        return await self.repository.update(id, data, current_user)

    async def delete(self, id: int, current_user: str) -> None:
        result = await self.repository.get_by_id(id)
        if not result:
            raise HTTPException(status_code=404, detail="Payment Term not found")
        await self.repository.delete(id, current_user)
