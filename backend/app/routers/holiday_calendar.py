from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import require
from app.repositories.holiday_calendar_repository import HolidayCalendarRepository
from app.repositories.production_lookup_repository import ProductionLookupRepository
from app.schemas.holiday_calendar import (
    HolidayCalendarResponseSchema,
    HolidayCalendarWriteSchema,
)
from app.services.holiday_calendar_service import HolidayCalendarService

router = APIRouter(prefix="/holiday-calendars", tags=["Holiday Calendars"])


def get_service(db: AsyncSession = Depends(get_session)) -> HolidayCalendarService:
    return HolidayCalendarService(
        HolidayCalendarRepository(db), ProductionLookupRepository(db)
    )


@router.get(
    "",
    response_model=List[HolidayCalendarResponseSchema],
    dependencies=[Depends(require("MASTERS.HOLIDAY_CALENDAR.VIEW"))],
)
async def get_all_holiday_calendars(service: HolidayCalendarService = Depends(get_service)):
    return await service.get_all()


@router.get("/next-code", dependencies=[Depends(require("MASTERS.HOLIDAY_CALENDAR.CREATE"))])
async def get_next_code(service: HolidayCalendarService = Depends(get_service)):
    return await service.get_next_code()


@router.get(
    "/{uid}",
    response_model=HolidayCalendarResponseSchema,
    dependencies=[Depends(require("MASTERS.HOLIDAY_CALENDAR.VIEW"))],
)
async def get_holiday_calendar(uid: str, service: HolidayCalendarService = Depends(get_service)):
    return await service.get_by_id(uid)


@router.post("", response_model=HolidayCalendarResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_holiday_calendar(
    data: HolidayCalendarWriteSchema,
    service: HolidayCalendarService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.HOLIDAY_CALENDAR.CREATE")),
):
    return await service.create(data.model_dump(exclude_unset=True), ctx.login_id or "system")


@router.put("/{uid}", response_model=HolidayCalendarResponseSchema)
async def update_holiday_calendar(
    uid: str,
    data: HolidayCalendarWriteSchema,
    service: HolidayCalendarService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.HOLIDAY_CALENDAR.EDIT")),
):
    return await service.update(uid, data.model_dump(exclude_unset=True), ctx.login_id or "system")


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday_calendar(
    uid: str,
    service: HolidayCalendarService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.HOLIDAY_CALENDAR.DELETE")),
):
    await service.delete(uid, ctx.login_id or "system")
