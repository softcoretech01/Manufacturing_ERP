from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.hsn import HsnSchema
from app.services.hsn_service import HsnService
from app.repositories.hsn_repository import HsnRepository

router = APIRouter(
    prefix="/hsns",
    tags=["HSN / SAC Codes"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = HsnRepository(db)
    return HsnService(repository)

@router.get("", response_model=List[HsnSchema])
async def get_all_hsns(
    service: HsnService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: HsnService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=HsnSchema)
async def get_hsn(
    id: int,
    service: HsnService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=HsnSchema, status_code=status.HTTP_201_CREATED)
async def create_hsn(
    data: HsnSchema,
    service: HsnService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=HsnSchema)
async def update_hsn(
    id: int,
    data: HsnSchema,
    service: HsnService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hsn(
    id: int,
    service: HsnService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
