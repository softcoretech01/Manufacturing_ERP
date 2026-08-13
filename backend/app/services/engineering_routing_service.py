from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.engineering_routing_repository import EngineeringRoutingRepository
from app.schemas.engineering_routing import EngRoutingSchema

class EngineeringRoutingService:
    def __init__(self, session: AsyncSession):
        self.repository = EngineeringRoutingRepository(session)

    async def get_next_code(self) -> str:
        return await self.repository.get_next_code()

    async def create_routing(self, data: EngRoutingSchema) -> str:
        return await self.repository.create_routing(data)

    async def update_routing(self, uid: str, data: EngRoutingSchema) -> str:
        return await self.repository.update_routing(uid, data)

    async def delete_routing(self, uid: str) -> str:
        return await self.repository.delete_routing(uid)

    async def get_all_routings(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_routings()
