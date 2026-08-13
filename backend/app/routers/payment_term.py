from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.payment_term import PaymentTermSchema
from app.services.payment_term_service import PaymentTermService
from app.repositories.payment_term_repository import PaymentTermRepository

router = APIRouter(
    prefix="/payment-terms",
    tags=["Payment Terms"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = PaymentTermRepository(db)
    return PaymentTermService(repository)

@router.get("", response_model=List[PaymentTermSchema])
async def get_all_payment_terms(
    service: PaymentTermService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: PaymentTermService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=PaymentTermSchema)
async def get_payment_term(
    id: int,
    service: PaymentTermService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=PaymentTermSchema, status_code=status.HTTP_201_CREATED)
async def create_payment_term(
    data: PaymentTermSchema,
    service: PaymentTermService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=PaymentTermSchema)
async def update_payment_term(
    id: int,
    data: PaymentTermSchema,
    service: PaymentTermService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_term(
    id: int,
    service: PaymentTermService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
