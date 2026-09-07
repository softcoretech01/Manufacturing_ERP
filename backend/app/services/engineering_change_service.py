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

    async def _reload(self, uid: Optional[str]) -> Optional[Dict[str, Any]]:
        """Return the stored row.

        The INSERT/UPDATE branches of SpManageEngineeringChange return only the
        uid and document number, which does not satisfy the endpoint's response
        model — the write succeeded but the request came back as a 500. Reading
        the row back also means the caller sees server-applied defaults.
        """
        if not uid:
            return None
        rows = await self.repository.get_all_changes()
        return next((r for r in rows if str(r.get("uid")) == str(uid)), None)

    async def create_change(self, data: dict, user: str) -> Optional[dict]:
        if not data.get("docNo"):
            data["docNo"] = await self.get_next_code(data.get("changeType", "ECR"))
        created = await self.repository.create_change(data, user)
        uid = created.get("uid") if isinstance(created, dict) else created
        return await self._reload(uid) or created

    async def update_change(self, uid: str, data: dict, user: str) -> Optional[Dict[str, Any]]:
        await self.repository.update_change(uid, data, user)
        return await self._reload(uid)

    async def delete_change(self, uid: str, user: str) -> Optional[str]:
        return await self.repository.delete_change(uid, user)

    async def get_all_changes(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_changes()
