from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.country import CountrySchema
from app.services.country_service import CountryService
from app.repositories.country_repository import CountryRepository

router = APIRouter(
    prefix="/countries",
    tags=["Countries"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = CountryRepository(db)
    return CountryService(repository)

@router.get("", response_model=List[CountrySchema])
async def get_all_countries(
    service: CountryService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: CountryService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=CountrySchema)
async def get_country(
    id: int,
    service: CountryService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=CountrySchema, status_code=status.HTTP_201_CREATED)
async def create_country(
    data: CountrySchema,
    service: CountryService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=CountrySchema)
async def update_country(
    id: int,
    data: CountrySchema,
    service: CountryService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_country(
    id: int,
    service: CountryService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
