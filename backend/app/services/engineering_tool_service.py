from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.engineering_tool_repository import EngineeringToolRepository

class EngineeringToolService:
    def __init__(self, session: AsyncSession):
        self.repository = EngineeringToolRepository(session)

    async def get_next_code(self) -> str:
        return await self.repository.get_next_code()

    async def create_tool(self, data: dict, user: str) -> Optional[str]:
        return await self.repository.create_tool(data, user)

    async def update_tool(self, uid: str, data: dict, user: str) -> Optional[str]:
        return await self.repository.update_tool(uid, data, user)

    async def delete_tool(self, uid: str, user: str) -> Optional[str]:
        return await self.repository.delete_tool(uid, user)

    async def get_all_tools(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_tools()
