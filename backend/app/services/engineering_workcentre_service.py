from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.engineering_workcentre_repository import EngineeringWorkCentreRepository
from app.core.errors import BusinessRuleViolationError, NotFoundError

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
        # Where-used check (CLAUDE.md §5.1). "Used by" has a single definition
        # across the system — routing operation lines in ACTIVE or APPROVED
        # routings — and this guard is the authoritative copy of it. A centre
        # carrying live routing steps cannot be retired: those steps would lose
        # the rate and capacity basis they are costed and scheduled on.
        code = await self.repository.get_code(uid)
        if code is None:
            raise NotFoundError("Work centre not found.")
        refs = await self.repository.count_live_routing_usage(code)
        if refs:
            raise BusinessRuleViolationError(
                f"Cannot delete work centre {code} because it is used by {refs} "
                f"active/approved routing operation(s). Remove those steps from "
                f"their routings, or deactivate the work centre instead.",
                rule_code="V5-WC-BR-001",
                errors=[{
                    "field": "uid",
                    "code": "in_use",
                    "message": f"{refs} live routing operation(s).",
                }],
            )
        return await self.repository.delete_workcentre(uid, user)

    async def get_all_workcentres(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_workcentres()
