from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.machine import (
    MachineCreateSchema,
    MachinePatchSchema,
    MachineResponseSchema,
)
from app.repositories.machine_repository import MachineRepository
from app.services.machine_service import MachineService

router = APIRouter(prefix="/machines", tags=["Machines"])

def get_service(db: AsyncSession = Depends(get_session)) -> MachineService:
    repository = MachineRepository(db)
    return MachineService(repository)

@router.get("", response_model=list[MachineResponseSchema])
async def get_all_machines(
    service: MachineService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_machine_code(
    service: MachineService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{record_id}", response_model=MachineResponseSchema)
async def get_machine(
    record_id: int,
    service: MachineService = Depends(get_service)
):
    return await service.get_by_id(record_id)

@router.post("", response_model=MachineResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_machine(
    data: MachineCreateSchema,
    service: MachineService = Depends(get_service)
):
    return await service.create(data.model_dump(), user_id="System")

@router.put("/{record_id}", response_model=MachineResponseSchema)
async def update_machine(
    record_id: int,
    data: MachinePatchSchema,
    service: MachineService = Depends(get_service)
):
    return await service.update(record_id, data.model_dump(exclude_unset=True), user_id="System")

@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_machine(
    record_id: int,
    service: MachineService = Depends(get_service)
):
    await service.delete(record_id, user_id="System")
