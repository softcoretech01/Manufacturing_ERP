from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.engineering_operation_repository import EngineeringOperationRepository

class EngineeringOperationService:
    def __init__(self, session: AsyncSession):
        self.repository = EngineeringOperationRepository(session)

    async def get_next_code(self) -> str:
        return await self.repository.get_next_code()

    async def create_operation(self, data: dict, user: str) -> str:
        return await self.repository.create_operation(data, user)

    async def update_operation(self, uid: str, data: dict, user: str) -> str:
        return await self.repository.update_operation(uid, data, user)

    async def delete_operation(self, uid: str, user: str) -> str:
        return await self.repository.delete_operation(uid, user)

    async def get_all_operations(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_operations()
