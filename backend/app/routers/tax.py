from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.tax import TaxSchema
from app.services.tax_service import TaxService
from app.repositories.tax_repository import TaxRepository

router = APIRouter(
    prefix="/taxes",
    tags=["Tax Rates & Groups"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = TaxRepository(db)
    return TaxService(repository)

@router.get("", response_model=List[TaxSchema])
async def get_all_taxes(
    service: TaxService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: TaxService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=TaxSchema)
async def get_tax(
    id: int,
    service: TaxService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=TaxSchema, status_code=status.HTTP_201_CREATED)
async def create_tax(
    data: TaxSchema,
    service: TaxService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=TaxSchema)
async def update_tax(
    id: int,
    data: TaxSchema,
    service: TaxService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tax(
    id: int,
    service: TaxService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
