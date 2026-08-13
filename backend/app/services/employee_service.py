from typing import List, Dict, Any
from app.repositories.employee_repository import EmployeeRepository
from fastapi import HTTPException
import uuid

class EmployeeService:
    def __init__(self, repository: EmployeeRepository):
        self.repository = repository

    async def get_all(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all()

    async def get_next_code(self) -> Dict[str, str]:
        return await self.repository.get_next_code()

    async def get_by_id(self, uid: str) -> Dict[str, Any]:
        result = await self.repository.get_by_id(uid)
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found")
        return result

    async def create(self, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        new_uid = str(uuid.uuid4())
        return await self.repository.create(new_uid, data, current_user)

    async def update(self, uid: str, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        result = await self.repository.get_by_id(uid)
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found")
        return await self.repository.update(uid, data, current_user)

    async def delete(self, uid: str, current_user: str) -> None:
        result = await self.repository.get_by_id(uid)
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found")
        await self.repository.delete(uid, current_user)
