from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.engineering_change_repository import EngineeringChangeRepository

class EngineeringChangeService:
    def __init__(self, session: AsyncSession):
        self.repository = EngineeringChangeRepository(session)

    async def get_next_code(self, type_prefix: str) -> str:
        if type_prefix not in ["ECR", "ECN"]:
            type_prefix = "ECR"
        return await self.repository.get_next_code(type_prefix)

    async def create_change(self, data: dict, user: str) -> Optional[dict]:
        if not data.get("docNo"):
            data["docNo"] = await self.get_next_code(data.get("changeType", "ECR"))
        return await self.repository.create_change(data, user)

    async def update_change(self, uid: str, data: dict, user: str) -> Optional[str]:
        return await self.repository.update_change(uid, data, user)

    async def delete_change(self, uid: str, user: str) -> Optional[str]:
        return await self.repository.delete_change(uid, user)

    async def get_all_changes(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_changes()
