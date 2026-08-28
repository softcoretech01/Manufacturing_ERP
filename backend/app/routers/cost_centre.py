from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.cost_centre import CostCentreSchema
from app.services.cost_centre_service import CostCentreService
from app.repositories.cost_centre_repository import CostCentreRepository

router = APIRouter(
    prefix="/cost-centres",
    tags=["Cost Centres"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = CostCentreRepository(db)
    return CostCentreService(repository)

@router.get("", response_model=List[CostCentreSchema])
async def get_all_cost_centres(
    service: CostCentreService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: CostCentreService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=CostCentreSchema)
async def get_cost_centre(
    id: int,
    service: CostCentreService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=CostCentreSchema, status_code=status.HTTP_201_CREATED)
async def create_cost_centre(
    data: CostCentreSchema,
    service: CostCentreService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=CostCentreSchema)
async def update_cost_centre(
    id: int,
    data: CostCentreSchema,
    service: CostCentreService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cost_centre(
    id: int,
    service: CostCentreService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
