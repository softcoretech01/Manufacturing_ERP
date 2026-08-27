from typing import Any, Dict, List
from fastapi import HTTPException, status
from app.repositories.admin_plants_repository import AdminPlantsRepository


class AdminPlantsService:
    def __init__(self, repository: AdminPlantsRepository):
        self.repository = repository

    async def get_branches(self) -> List[Dict[str, Any]]:
        return await self.repository.get_branches()

    async def get_plants(self) -> List[Dict[str, Any]]:
        return await self.repository.get_plants()

    async def get_next_plant_code(self) -> str:
        return await self.repository.get_next_plant_code()

    async def get_plant_by_id(self, uid: str) -> Dict[str, Any]:
        record = await self.repository.get_plant_by_id(uid)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plant not found")
        return record

    async def create_plant(self, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        return await self.repository.create_plant(data, user_id)

    async def update_plant(self, uid: str, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        existing = await self.repository.get_plant_by_id(uid)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plant not found")
        
        # Merge existing data with new data
        update_data = {k: v for k, v in data.items() if v is not None}
        final_data = {**existing, **update_data}

        return await self.repository.update_plant(uid, final_data, user_id)

    async def delete_plant(self, uid: str, user_id: str) -> None:
        existing = await self.repository.get_plant_by_id(uid)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plant not found")
        await self.repository.delete_plant(uid, user_id)

    async def get_production_lines(self, plant_uid: str | None = None) -> List[Dict[str, Any]]:
        return await self.repository.get_production_lines(plant_uid)

    async def get_work_centres(self, line_id: int | None = None) -> List[Dict[str, Any]]:
        return await self.repository.get_work_centres(line_id)

    async def get_machine_groups(self) -> List[Dict[str, Any]]:
        return await self.repository.get_machine_groups()

    async def get_warehouses(self) -> List[Dict[str, Any]]:
        return await self.repository.get_warehouses()
