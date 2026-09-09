import json
from typing import Any

from sqlalchemy.exc import IntegrityError

from app.repositories.engineering_bom_repository import EngineeringBomRepository
from app.utils.db_errors import raise_for_duplicate

# What each unique index on EngineeringBom actually means to a planner. Without
# this the constraints surface as a raw MySQL 1062 and a 500.
_DUPLICATE_MESSAGES = {
    "uk_engbom_default_per_product": (
        "{value} already has a default bill of material. Clear the default on the"
        " existing BOM first, or save this one as an alternate."
    ),
    "DocNo": "BOM number {value} already exists.",
}


class EngineeringBomService:
    def __init__(self, repository: EngineeringBomRepository):
        self.repository = repository

    async def _execute(self, action: str, payload_json: str, bom_id: int | None = None):
        """Run the procedure, translating constraint violations on the way out.

        The session is rolled back first: after an IntegrityError the transaction
        is aborted, and the re-read that follows a write would fail on a poisoned
        connection.
        """
        try:
            return await self.repository.execute_sp(action, payload_json, bom_id=bom_id)
        except IntegrityError as exc:
            await self.repository.session.rollback()
            raise_for_duplicate(exc, _DUPLICATE_MESSAGES)
            raise

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def get_all_boms(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_boms_with_lines()

    async def create_bom(self, data: dict, user_id: str) -> dict[str, Any]:
        data['createdBy'] = user_id
        if data.get('revision') is None or data.get('revision') < 1:
            data['revision'] = 1

        payload_json = json.dumps(data)
        new_id = await self._execute('INSERT', payload_json)
        if new_id:
            return await self.repository.get_bom_by_id(new_id)
        return None

    async def update_bom(self, uid: str, data: dict, user_id: str) -> dict[str, Any]:
        bom_id = int(uid)

        # Determine action (APPROVE vs UPDATE)
        if data.get('status') == 'ACTIVE' and data.get('approvedBy'):
            action = 'APPROVE'
            data['approvedBy'] = user_id
        else:
            action = 'UPDATE'

        payload_json = json.dumps(data)
        await self._execute(action, payload_json, bom_id=bom_id)
        return await self.repository.get_bom_by_id(bom_id)

    async def delete_bom(self, uid: str) -> None:
        bom_id = int(uid)
        await self._execute('DELETE', '{}', bom_id=bom_id)
