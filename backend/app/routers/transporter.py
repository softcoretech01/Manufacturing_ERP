from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.repositories.transporter_repository import TransporterRepository
from app.services.transporter_service import TransporterService
from app.schemas.transporter import (
    TransporterCreateSchema,
    TransporterUpdateSchema,
    TransporterResponseSchema
)

router = APIRouter(prefix="/transporters", tags=["Transporters"])

def get_transporter_service(session: AsyncSession = Depends(get_session)) -> TransporterService:
    repository = TransporterRepository(session)
    return TransporterService(repository)

@router.get("", response_model=List[TransporterResponseSchema])
async def get_transporters(service: TransporterService = Depends(get_transporter_service)):
    return await service.get_all_transporters()

@router.post("", response_model=TransporterResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_transporter(
    transporter: TransporterCreateSchema,
    service: TransporterService = Depends(get_transporter_service)
):
    try:
        return await service.create_transporter(transporter.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{transporter_id}", response_model=TransporterResponseSchema)
async def update_transporter(
    transporter_id: int,
    transporter: TransporterUpdateSchema,
    service: TransporterService = Depends(get_transporter_service)
):
    try:
        updated = await service.update_transporter(transporter_id, transporter.model_dump())
        if not updated:
            raise HTTPException(status_code=404, detail="Transporter not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{transporter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transporter(
    transporter_id: int,
    service: TransporterService = Depends(get_transporter_service)
):
    try:
        await service.delete_transporter(transporter_id)
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
