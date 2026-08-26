from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.uom import UomSchema
from app.services.uom_service import UomService
from app.repositories.uom_repository import UomRepository

router = APIRouter(
    prefix="/uoms",
    tags=["UOMs"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = UomRepository(db)
    return UomService(repository)

@router.get("", response_model=List[UomSchema])
async def get_all_uoms(
    service: UomService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: UomService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=UomSchema)
async def get_uom(
    id: int,
    service: UomService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=UomSchema, status_code=status.HTTP_201_CREATED)
async def create_uom(
    data: UomSchema,
    service: UomService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=UomSchema)
async def update_uom(
    id: int,
    data: UomSchema,
    service: UomService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_uom(
    id: int,
    service: UomService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
