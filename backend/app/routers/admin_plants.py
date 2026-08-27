from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.admin_plants import (
    BranchSchema,
    PlantSchema,
    PlantCreateSchema,
    PlantPatchSchema,
    ProductionLineSchema,
    WorkCentreSchema,
    WarehouseSchema
)
from app.repositories.admin_plants_repository import AdminPlantsRepository
from app.services.admin_plants_service import AdminPlantsService

router = APIRouter(tags=["Admin Plants"])

def get_service(db: AsyncSession = Depends(get_session)) -> AdminPlantsService:
    repository = AdminPlantsRepository(db)
    return AdminPlantsService(repository)

@router.get("/branches", response_model=list[BranchSchema])
async def get_all_branches(
    service: AdminPlantsService = Depends(get_service)
):
    return await service.get_branches()

@router.get("/plants", response_model=list[PlantSchema])
async def get_all_plants(
    service: AdminPlantsService = Depends(get_service)
):
    return await service.get_plants()

@router.get("/plants/next-code")
async def get_next_plant_code(
    service: AdminPlantsService = Depends(get_service)
):
    code = await service.get_next_plant_code()
    return {"code": code}

@router.get("/plants/{uid}", response_model=PlantSchema)
async def get_plant_legacy(
    uid: str,
    service: AdminPlantsService = Depends(get_service)
):
    return await service.get_plant_by_id(uid)

@router.post("/plants", response_model=PlantSchema, status_code=status.HTTP_201_CREATED)
async def create_plant_legacy(
    data: PlantCreateSchema,
    service: AdminPlantsService = Depends(get_service)
):
    return await service.create_plant(data.model_dump(), user_id="System")

@router.put("/plants/{uid}", response_model=PlantSchema)
async def update_plant(
    uid: str,
    data: PlantPatchSchema,
    service: AdminPlantsService = Depends(get_service)
):
    return await service.update_plant(uid, data.model_dump(exclude_unset=True), user_id="System")

@router.delete("/plants/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plant(
    uid: str,
    service: AdminPlantsService = Depends(get_service)
):
    await service.delete_plant(uid, user_id="System")

@router.get("/production-lines")
async def get_all_production_lines(
    plant_uid: str | None = None,
    service: AdminPlantsService = Depends(get_service)
):
    # Optionally scoped to a plant (by its public uid) for cascading dropdowns.
    return await service.get_production_lines(plant_uid)

@router.get("/work-centres")
async def get_all_work_centres(
    line_id: int | None = None,
    service: AdminPlantsService = Depends(get_service)
):
    return await service.get_work_centres(line_id)

@router.get("/machine-groups")
async def get_all_machine_groups(
    service: AdminPlantsService = Depends(get_service)
):
    return await service.get_machine_groups()

@router.get("/warehouses", response_model=list[WarehouseSchema])
async def get_all_warehouses(
    service: AdminPlantsService = Depends(get_service)
):
    return await service.get_warehouses()
