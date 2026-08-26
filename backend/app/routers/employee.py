from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_session
from app.schemas.employee import EmployeeSchema
from app.services.employee_service import EmployeeService
from app.repositories.employee_repository import EmployeeRepository

router = APIRouter(
    prefix="/employees",
    tags=["Employees"]
)

def get_service(db: AsyncSession = Depends(get_session)):
    repository = EmployeeRepository(db)
    return EmployeeService(repository)

@router.get("", response_model=List[EmployeeSchema])
async def get_all_employees(
    service: EmployeeService = Depends(get_service)
):
    return await service.get_all()

@router.get("/next-code")
async def get_next_code(
    service: EmployeeService = Depends(get_service)
):
    return await service.get_next_code()

@router.get("/{uid}", response_model=EmployeeSchema)
async def get_employee(
    uid: str,
    service: EmployeeService = Depends(get_service)
):
    return await service.get_by_id(uid)

@router.post("", response_model=EmployeeSchema, status_code=status.HTTP_201_CREATED)
async def create_employee(
    data: EmployeeSchema,
    service: EmployeeService = Depends(get_service)
):
    current_user = "system"
    return await service.create(data.model_dump(exclude_unset=True), current_user)

@router.put("/{uid}", response_model=EmployeeSchema)
async def update_employee(
    uid: str,
    data: EmployeeSchema,
    service: EmployeeService = Depends(get_service)
):
    current_user = "system"
    return await service.update(uid, data.model_dump(exclude_unset=True), current_user)

@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    uid: str,
    service: EmployeeService = Depends(get_service)
):
    current_user = "system"
    await service.delete(uid, current_user)
