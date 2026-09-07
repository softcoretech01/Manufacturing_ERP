from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_session
from app.core.deps import require
from app.schemas.engineering_workcentre import EngWorkCentreSchema
from app.services.engineering_workcentre_service import EngineeringWorkCentreService

router = APIRouter(tags=["Engineering Work Centres"])

def get_service(db: AsyncSession = Depends(get_session)) -> EngineeringWorkCentreService:
    return EngineeringWorkCentreService(db)

@router.get("", response_model=List[EngWorkCentreSchema], dependencies=[Depends(require("ENGINEERING.WORK_CENTRE.VIEW"))])
async def get_workcentres(service: EngineeringWorkCentreService = Depends(get_service)):
    return await service.get_all_workcentres()

@router.get("/next-code", dependencies=[Depends(require("ENGINEERING.WORK_CENTRE.CREATE"))])
async def get_next_code(service: EngineeringWorkCentreService = Depends(get_service)):
    code = await service.get_next_code()
    return {"nextCode": code}

@router.post("", response_model=EngWorkCentreSchema, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require("ENGINEERING.WORK_CENTRE.CREATE"))])
async def create_workcentre(
    wc: EngWorkCentreSchema,
    service: EngineeringWorkCentreService = Depends(get_service)
):
    user_id = "System"
    data = wc.model_dump(mode='json')
    result_uid = await service.create_workcentre(data, user_id)
    if not result_uid:
        raise HTTPException(status_code=500, detail="Failed to create work centre")
    data["uid"] = result_uid
    return data

@router.put("/{wc_uid}", response_model=EngWorkCentreSchema, dependencies=[Depends(require("ENGINEERING.WORK_CENTRE.EDIT"))])
async def update_workcentre(
    wc_uid: str,
    wc: EngWorkCentreSchema,
    service: EngineeringWorkCentreService = Depends(get_service)
):
    user_id = "System"
    data = wc.model_dump(mode='json')
    result_uid = await service.update_workcentre(wc_uid, data, user_id)
    if not result_uid:
        raise HTTPException(status_code=404, detail="Work centre not found or update failed")
    data["uid"] = result_uid
    return data

@router.delete("/{wc_uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require("ENGINEERING.WORK_CENTRE.DELETE"))])
async def delete_workcentre(
    wc_uid: str,
    service: EngineeringWorkCentreService = Depends(get_service)
):
    user_id = "System"
    await service.delete_workcentre(wc_uid, user_id)
    return None
