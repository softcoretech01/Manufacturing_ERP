from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_session
from app.schemas.engineering_tool import EngToolSchema
from app.services.engineering_tool_service import EngineeringToolService

router = APIRouter(tags=["Engineering Tools"])

def get_service(db: AsyncSession = Depends(get_session)) -> EngineeringToolService:
    return EngineeringToolService(db)

@router.get("", response_model=List[EngToolSchema])
async def get_tools(service: EngineeringToolService = Depends(get_service)):
    return await service.get_all_tools()

@router.get("/next-code")
async def get_next_code(service: EngineeringToolService = Depends(get_service)):
    code = await service.get_next_code()
    return {"nextCode": code}

@router.post("", response_model=EngToolSchema, status_code=status.HTTP_201_CREATED)
async def create_tool(
    tl: EngToolSchema,
    service: EngineeringToolService = Depends(get_service)
):
    user_id = "System"
    data = tl.model_dump(mode='json')
    result_uid = await service.create_tool(data, user_id)
    if not result_uid:
        raise HTTPException(status_code=500, detail="Failed to create tool")
    data["uid"] = result_uid
    return data

@router.put("/{tl_uid}", response_model=EngToolSchema)
async def update_tool(
    tl_uid: str,
    tl: EngToolSchema,
    service: EngineeringToolService = Depends(get_service)
):
    user_id = "System"
    data = tl.model_dump(mode='json')
    result_uid = await service.update_tool(tl_uid, data, user_id)
    if not result_uid:
        raise HTTPException(status_code=404, detail="Tool not found or update failed")
    data["uid"] = result_uid
    return data

@router.delete("/{tl_uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tool(
    tl_uid: str,
    service: EngineeringToolService = Depends(get_service)
):
    user_id = "System"
    await service.delete_tool(tl_uid, user_id)
    return None
