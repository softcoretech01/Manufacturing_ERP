from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.packaging import (
    PackagingCreateSchema,
    PackagingPatchSchema,
    PackagingResponseSchema,
)
from app.repositories.packaging_repository import PackagingRepository
from app.services.packaging_service import PackagingService

router = APIRouter(prefix="/packaging", tags=["Packaging Materials"])

def get_service(db: AsyncSession = Depends(get_session)) -> PackagingService:
    repository = PackagingRepository(db)
    return PackagingService(repository)

@router.get("", response_model=list[PackagingResponseSchema])
async def get_all_packagings(
    service: PackagingService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_packaging_code(
    service: PackagingService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{record_id}", response_model=PackagingResponseSchema)
async def get_packaging(
    record_id: int,
    service: PackagingService = Depends(get_service)
):
    return await service.get_by_id(record_id)

@router.post("", response_model=PackagingResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_packaging(
    data: PackagingCreateSchema,
    service: PackagingService = Depends(get_service)
):
    # Hardcoded user_id for now as per previous implementations
    return await service.create(data.model_dump(), user_id="System")

@router.put("/{record_id}", response_model=PackagingResponseSchema)
async def update_packaging(
    record_id: int,
    data: PackagingPatchSchema,
    service: PackagingService = Depends(get_service)
):
    return await service.update(record_id, data.model_dump(exclude_unset=True), user_id="System")

@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_packaging(
    record_id: int,
    service: PackagingService = Depends(get_service)
):
    await service.delete(record_id, user_id="System")
