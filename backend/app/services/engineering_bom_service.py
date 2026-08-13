import json
from typing import Any, Dict, List
from app.repositories.engineering_bom_repository import EngineeringBomRepository

class EngineeringBomService:
    def __init__(self, repository: EngineeringBomRepository):
        self.repository = repository

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def get_all_boms(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_boms_with_lines()

    async def create_bom(self, data: dict, user_id: str) -> dict[str, Any]:
        data['createdBy'] = user_id
        if data.get('revision') is None or data.get('revision') < 1:
            data['revision'] = 1
            
        payload_json = json.dumps(data)
        new_id = await self.repository.execute_sp('INSERT', payload_json)
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
        await self.repository.execute_sp(action, payload_json, bom_id=bom_id)
        return await self.repository.get_bom_by_id(bom_id)

    async def delete_bom(self, uid: str) -> None:
        bom_id = int(uid)
        await self.repository.execute_sp('DELETE', '{}', bom_id=bom_id)
