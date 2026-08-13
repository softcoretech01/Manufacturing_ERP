from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.repositories.bank_repository import BankRepository
from app.services.bank_service import BankService
from app.schemas.bank import (
    BankCreateSchema,
    BankUpdateSchema,
    BankResponseSchema
)

router = APIRouter(prefix="/banks", tags=["Banks"])

def get_service(db: AsyncSession = Depends(get_session)) -> BankService:
    repository = BankRepository(db)
    return BankService(repository)

@router.get("", response_model=list[BankResponseSchema])
async def get_all_banks(service: BankService = Depends(get_service)):
    return await service.get_all_banks()

@router.post("", response_model=BankResponseSchema)
async def create_bank(
    bank: BankCreateSchema,
    service: BankService = Depends(get_service)
):
    # Hardcode user_id for now until auth is fully implemented
    return await service.create_bank(bank.model_dump(), user_id="system")

@router.put("/{bank_id}", response_model=BankResponseSchema)
async def update_bank(
    bank_id: int,
    bank: BankUpdateSchema,
    service: BankService = Depends(get_service)
):
    return await service.update_bank(bank_id, bank.model_dump(), user_id="system")

@router.delete("/{bank_id}")
async def delete_bank(
    bank_id: int,
    service: BankService = Depends(get_service)
):
    await service.delete_bank(bank_id, user_id="system")
    return {"message": "Bank deleted successfully"}
