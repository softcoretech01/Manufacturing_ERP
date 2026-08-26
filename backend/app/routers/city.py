from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.city import CitySchema
from app.services.city_service import CityService
from app.repositories.city_repository import CityRepository

router = APIRouter(
    prefix="/cities",
    tags=["Cities"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = CityRepository(db)
    return CityService(repository)

@router.get("", response_model=List[CitySchema])
async def get_all_cities(
    service: CityService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: CityService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=CitySchema)
async def get_city(
    id: int,
    service: CityService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=CitySchema, status_code=status.HTTP_201_CREATED)
async def create_city(
    data: CitySchema,
    service: CityService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=CitySchema)
async def update_city(
    id: int,
    data: CitySchema,
    service: CityService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_city(
    id: int,
    service: CityService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
