"""Dropdown sources for the Master Portal's Production screens."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import require
from app.repositories.production_lookup_repository import ProductionLookupRepository
from app.schemas.production_lookups import (
    MachineGroupLookup,
    PlantLookup,
    ProductionLineLookup,
    WorkCentreLookup,
)

router = APIRouter(tags=["Production Lookups"])


def get_repository(db: AsyncSession = Depends(get_session)) -> ProductionLookupRepository:
    return ProductionLookupRepository(db)


@router.get(
    "/production-plants",
    response_model=list[PlantLookup],
    dependencies=[Depends(require("SYSTEM.PLANT.VIEW", "MASTERS.MACHINE.VIEW"))],
)
async def get_production_plants(repo: ProductionLookupRepository = Depends(get_repository)):
    """Plants keyed by their integer id — the machine table's PlantId foreign key.

    `/plants` returns ULIDs for the organisation module; machine writes need the id.
    """
    return await repo.get_plants()


@router.get(
    "/machine-groups",
    response_model=list[MachineGroupLookup],
    dependencies=[Depends(require("MASTERS.MACHINE_GROUP.VIEW", "MASTERS.MACHINE.VIEW"))],
)
async def get_machine_groups(repo: ProductionLookupRepository = Depends(get_repository)):
    return await repo.get_machine_groups()


@router.get(
    "/production-lines",
    response_model=list[ProductionLineLookup],
    dependencies=[Depends(require("MASTERS.PRODUCTION_LINE.VIEW", "MASTERS.MACHINE.VIEW"))],
)
async def get_production_lines(
    plantId: Optional[int] = Query(None, ge=1),
    repo: ProductionLookupRepository = Depends(get_repository),
):
    return await repo.get_production_lines(plant_id=plantId)


@router.get(
    "/work-centres",
    response_model=list[WorkCentreLookup],
    dependencies=[Depends(require("MASTERS.WORK_CENTRE.VIEW", "MASTERS.MACHINE.VIEW"))],
)
async def get_work_centres(
    plantId: Optional[int] = Query(None, ge=1),
    lineId: Optional[int] = Query(None, ge=1),
    repo: ProductionLookupRepository = Depends(get_repository),
):
    return await repo.get_work_centres(plant_id=plantId, line_id=lineId)
