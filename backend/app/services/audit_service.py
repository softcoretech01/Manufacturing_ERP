from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from datetime import datetime

from app.repositories.audit_repository import AuditRepository

class AuditService:
    def __init__(self, session: AsyncSession):
        self.repository = AuditRepository(session)

    async def create_audit_entry(self, data: dict, user_id: str = "System") -> str:
        if not data.get("uid"):
            data["uid"] = str(uuid.uuid4())
        
        if not data.get("at"):
            data["at"] = datetime.utcnow().isoformat()
            
        return await self.repository.create_audit_entry(data, user_id)

    async def get_all_audit_entries(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_audit_entries()
