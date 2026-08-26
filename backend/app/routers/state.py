from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.state import StateSchema
from app.services.state_service import StateService
from app.repositories.state_repository import StateRepository

router = APIRouter(
    prefix="/states",
    tags=["States"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = StateRepository(db)
    return StateService(repository)

@router.get("", response_model=List[StateSchema])
async def get_all_states(
    service: StateService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: StateService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{id}", response_model=StateSchema)
async def get_state(
    id: int,
    service: StateService = Depends(get_service)
):
    return await service.get_by_id(id)

@router.post("", response_model=StateSchema, status_code=status.HTTP_201_CREATED)
async def create_state(
    data: StateSchema,
    service: StateService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{id}", response_model=StateSchema)
async def update_state(
    id: int,
    data: StateSchema,
    service: StateService = Depends(get_service)
):
    current_user = "system"
    return await service.update(id, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_state(
    id: int,
    service: StateService = Depends(get_service)
):
    current_user = "system"
    await service.delete(id, current_user)
