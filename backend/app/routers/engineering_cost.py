from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.core.database import get_session
from app.services.engineering_cost_service import EngineeringCostService

router = APIRouter(prefix="/engineering", tags=["Engineering Cost"])

def get_cost_service(db: AsyncSession = Depends(get_session)) -> EngineeringCostService:
    return EngineeringCostService(db)

@router.post("/cost-rollup/{item_code}", response_model=Dict[str, Any])
async def cost_rollup(
    item_code: str,
    service: EngineeringCostService = Depends(get_cost_service)
):
    user_id = "System"
    result = await service.calculate_and_update_cost_rollup(item_code, user_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Cost rollup failed for item {item_code}")
    return {"message": "Cost rollup successful", "data": result}
