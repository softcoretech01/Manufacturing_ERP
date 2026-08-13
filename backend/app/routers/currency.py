from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.currency import CurrencySchema, ExchangeRateSchema
from app.services.currency_service import CurrencyService
from app.repositories.currency_repository import CurrencyRepository

router = APIRouter(
    prefix="/currencies",
    tags=["Currency & Exchange Rates"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = CurrencyRepository(db)
    return CurrencyService(repository)

@router.get("", response_model=List[CurrencySchema])
async def get_all_currencies(
    service: CurrencyService = Depends(get_service)
):
    return await service.get_all_currencies()

@router.get("/exchange-rates", response_model=List[ExchangeRateSchema])
async def get_all_exchange_rates(
    service: CurrencyService = Depends(get_service)
):
    return await service.get_all_exchange_rates()

@router.post("/exchange-rates", response_model=ExchangeRateSchema, status_code=status.HTTP_201_CREATED)
async def create_exchange_rate(
    data: ExchangeRateSchema,
    service: CurrencyService = Depends(get_service)
):
    current_user = "system"
    return await service.create_exchange_rate(data.model_dump(exclude_unset=True), current_user)
