from typing import List, Dict, Any
from app.repositories.cost_centre_repository import CostCentreRepository
from fastapi import HTTPException

class CostCentreService:
    def __init__(self, repository: CostCentreRepository):
        self.repository = repository

    async def get_all(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all()

    async def get_next_code(self) -> Dict[str, str]:
        return await self.repository.get_next_code()

    async def get_by_id(self, id: int) -> Dict[str, Any]:
        result = await self.repository.get_by_id(id)
        if not result:
            raise HTTPException(status_code=404, detail="Cost Centre not found")
        return result

    async def create(self, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        if data.get('parentId'):
            # Validate parent exists and doesn't cause cycle in future (omitted for now)
            parent = await self.repository.get_by_id(data['parentId'])
            if not parent:
                raise HTTPException(status_code=400, detail="Invalid Parent Cost Centre")
                
        return await self.repository.create(data, current_user)

    async def update(self, id: int, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        result = await self.repository.get_by_id(id)
        if not result:
            raise HTTPException(status_code=404, detail="Cost Centre not found")
            
        if data.get('parentId'):
            if data['parentId'] == id:
                raise HTTPException(status_code=400, detail="Cost Centre cannot be its own parent")
            parent = await self.repository.get_by_id(data['parentId'])
            if not parent:
                raise HTTPException(status_code=400, detail="Invalid Parent Cost Centre")

        return await self.repository.update(id, data, current_user)

    async def delete(self, id: int, current_user: str) -> None:
        result = await self.repository.get_by_id(id)
        if not result:
            raise HTTPException(status_code=404, detail="Cost Centre not found")
        await self.repository.delete(id, current_user)
