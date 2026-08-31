from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

from app.core.database import get_session
from app.core.deps import require
from app.schemas.engineering_bom import EngBomSchema
from app.repositories.engineering_bom_repository import EngineeringBomRepository
from app.services.engineering_bom_service import EngineeringBomService

router = APIRouter(tags=["Engineering BOMs"])

def get_service(db: AsyncSession = Depends(get_session)) -> EngineeringBomService:
    repository = EngineeringBomRepository(db)
    return EngineeringBomService(repository)

@router.get("/", response_model=List[EngBomSchema], dependencies=[Depends(require("ENGINEERING.BOM.VIEW"))])
async def get_boms(service: EngineeringBomService = Depends(get_service)):
    return await service.get_all_boms()

@router.get("/next-code", response_model=Dict[str, str], dependencies=[Depends(require("ENGINEERING.BOM.CREATE"))])
async def get_next_code(service: EngineeringBomService = Depends(get_service)):
    return await service.get_next_code()

@router.post("/", response_model=EngBomSchema, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require("ENGINEERING.BOM.CREATE"))])
async def create_bom(
    bom: EngBomSchema,
    service: EngineeringBomService = Depends(get_service)
):
    user_id = "System"
    data = bom.model_dump(mode='json')
    result = await service.create_bom(data, user_id)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create BOM")
    return result

@router.put("/{bom_uid}", response_model=EngBomSchema, dependencies=[Depends(require("ENGINEERING.BOM.EDIT"))])
async def update_bom(
    bom_uid: str,
    bom: EngBomSchema,
    service: EngineeringBomService = Depends(get_service)
):
    user_id = "System"
    data = bom.model_dump(mode='json')
    result = await service.update_bom(bom_uid, data, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="BOM not found or update failed")
    return result

@router.delete("/{bom_uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require("ENGINEERING.BOM.DELETE"))])
async def delete_bom(
    bom_uid: str,
    service: EngineeringBomService = Depends(get_service)
):
    await service.delete_bom(bom_uid)
    return None
