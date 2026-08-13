from typing import List, Dict, Any
from app.repositories.shift_repository import ShiftRepository
from fastapi import HTTPException
import uuid
import datetime

class ShiftService:
    def __init__(self, repository: ShiftRepository):
        self.repository = repository

    async def get_shifts(self) -> List[Dict[str, Any]]:
        return await self.repository.get_shifts()

    async def get_next_code(self) -> Dict[str, str]:
        return await self.repository.get_next_code()

    async def get_shift_by_id(self, uid: str) -> Dict[str, Any]:
        record = await self.repository.get_shift_by_id(uid)
        if not record:
            raise HTTPException(status_code=404, detail="Shift not found")
        return record

    async def create_shift(self, shift_data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        if not shift_data.get("uid"):
            shift_data["uid"] = str(uuid.uuid4())
            
        if not shift_data.get("effectiveFrom"):
            shift_data["effectiveFrom"] = datetime.datetime.now()

        return await self.repository.create_shift(shift_data, current_user)

    async def update_shift(self, uid: str, shift_data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        existing = await self.repository.get_shift_by_id(uid)
        if not existing:
            raise HTTPException(status_code=404, detail="Shift not found")
        
        return await self.repository.update_shift(uid, shift_data, current_user)

    async def delete_shift(self, uid: str, current_user: str) -> bool:
        existing = await self.repository.get_shift_by_id(uid)
        if not existing:
            raise HTTPException(status_code=404, detail="Shift not found")
            
        return await self.repository.delete_shift(uid, current_user)
