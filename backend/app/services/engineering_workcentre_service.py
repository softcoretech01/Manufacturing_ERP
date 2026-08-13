from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.engineering_workcentre_repository import EngineeringWorkCentreRepository

class EngineeringWorkCentreService:
    def __init__(self, session: AsyncSession):
        self.repository = EngineeringWorkCentreRepository(session)

    async def get_next_code(self) -> str:
        return await self.repository.get_next_code()

    async def create_workcentre(self, data: dict, user: str) -> Optional[str]:
        return await self.repository.create_workcentre(data, user)

    async def update_workcentre(self, uid: str, data: dict, user: str) -> Optional[str]:
        return await self.repository.update_workcentre(uid, data, user)

    async def delete_workcentre(self, uid: str, user: str) -> Optional[str]:
        return await self.repository.delete_workcentre(uid, user)

    async def get_all_workcentres(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_workcentres()
