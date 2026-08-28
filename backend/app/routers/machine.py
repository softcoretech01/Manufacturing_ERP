from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.context import TenantContext
from app.core.deps import require
from app.schemas.machine import (
    MachineCreateSchema,
    MachinePatchSchema,
    MachineResponseSchema,
)
from app.repositories.machine_repository import MachineRepository
from app.repositories.production_lookup_repository import ProductionLookupRepository
from app.services.machine_service import MachineService

router = APIRouter(prefix="/machines", tags=["Machines"])


def get_service(db: AsyncSession = Depends(get_session)) -> MachineService:
    return MachineService(MachineRepository(db), ProductionLookupRepository(db))


@router.get(
    "",
    response_model=list[MachineResponseSchema],
    dependencies=[Depends(require("MASTERS.MACHINE.VIEW"))],
)
async def get_all_machines(service: MachineService = Depends(get_service)):
    return await service.get_all()


@router.get("/next-code", dependencies=[Depends(require("MASTERS.MACHINE.CREATE"))])
async def get_next_machine_code(service: MachineService = Depends(get_service)):
    return await service.get_next_code()


@router.get(
    "/{record_id}",
    response_model=MachineResponseSchema,
    dependencies=[Depends(require("MASTERS.MACHINE.VIEW"))],
)
async def get_machine(record_id: int, service: MachineService = Depends(get_service)):
    return await service.get_by_id(record_id)


@router.post("", response_model=MachineResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_machine(
    data: MachineCreateSchema,
    service: MachineService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.MACHINE.CREATE")),
):
    return await service.create(data.model_dump(), user_id=ctx.login_id or "system")


@router.put("/{record_id}", response_model=MachineResponseSchema)
async def update_machine(
    record_id: int,
    data: MachinePatchSchema,
    service: MachineService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.MACHINE.EDIT")),
):
    return await service.update(
        record_id, data.model_dump(exclude_unset=True), user_id=ctx.login_id or "system"
    )


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_machine(
    record_id: int,
    service: MachineService = Depends(get_service),
    ctx: TenantContext = Depends(require("MASTERS.MACHINE.DELETE")),
):
    await service.delete(record_id, user_id=ctx.login_id or "system")
