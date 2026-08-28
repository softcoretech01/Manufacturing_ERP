from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import require
from app.repositories.shift_repository import ShiftRepository
from app.schemas.shift import ShiftResponseSchema, ShiftWriteSchema
from app.services.shift_service import ShiftService

router = APIRouter(prefix="/shifts", tags=["Shifts"])


def get_service(db: AsyncSession = Depends(get_session)) -> ShiftService:
    return ShiftService(ShiftRepository(db))


@router.get(
    "",
    response_model=List[ShiftResponseSchema],
    dependencies=[Depends(require("MASTERS.SHIFT.VIEW"))],
)
async def get_all_shifts(service: ShiftService = Depends(get_service)):
    return await service.get_shifts()


@router.get("/next-code", dependencies=[Depends(require("MASTERS.SHIFT.CREATE"))])
async def get_next_code(service: ShiftService = Depends(get_service)):
    return await service.get_next_code()


@router.get(
    "/{uid}",
    response_model=ShiftResponseSchema,
    dependencies=[Depends(require("MASTERS.SHIFT.VIEW"))],
)
async def get_shift(uid: str, service: ShiftService = Depends(get_service)):
    return await service.get_shift_by_id(uid)


@router.post("", response_model=ShiftResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_shift(
    shift: ShiftWriteSchema,
    service: ShiftService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.SHIFT.CREATE")),
):
    return await service.create_shift(
        shift.model_dump(), ctx.login_id or "system"
    )


@router.put("/{uid}", response_model=ShiftResponseSchema)
async def update_shift(
    uid: str,
    shift: ShiftWriteSchema,
    service: ShiftService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.SHIFT.EDIT")),
):
    return await service.update_shift(
        uid, shift.model_dump(), ctx.login_id or "system"
    )


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shift(
    uid: str,
    service: ShiftService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.SHIFT.DELETE")),
):
    await service.delete_shift(uid, ctx.login_id or "system")
