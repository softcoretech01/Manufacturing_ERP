from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.holiday_calendar import HolidayCalendarSchema
from app.services.holiday_calendar_service import HolidayCalendarService
from app.repositories.holiday_calendar_repository import HolidayCalendarRepository

router = APIRouter(
    prefix="/holiday-calendars",
    tags=["Holiday Calendars"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = HolidayCalendarRepository(db)
    return HolidayCalendarService(repository)

@router.get("", response_model=List[HolidayCalendarSchema])
async def get_all_holiday_calendars(
    service: HolidayCalendarService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: HolidayCalendarService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{uid}", response_model=HolidayCalendarSchema)
async def get_holiday_calendar(
    uid: str,
    service: HolidayCalendarService = Depends(get_service)
):
    return await service.get_by_id(uid)

@router.post("", response_model=HolidayCalendarSchema, status_code=status.HTTP_201_CREATED)
async def create_holiday_calendar(
    data: HolidayCalendarSchema,
    service: HolidayCalendarService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{uid}", response_model=HolidayCalendarSchema)
async def update_holiday_calendar(
    uid: str,
    data: HolidayCalendarSchema,
    service: HolidayCalendarService = Depends(get_service)
):
    current_user = "system"
    return await service.update(uid, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday_calendar(
    uid: str,
    service: HolidayCalendarService = Depends(get_service)
):
    current_user = "system"
    await service.delete(uid, current_user)
