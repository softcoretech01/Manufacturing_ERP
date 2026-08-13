# File: backend/app/routers/supplier.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.database import get_session
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.supplier import (
    SupplierCreateSchema,
    SupplierUpdateSchema,
    SupplierResponseSchema
)

router = APIRouter(prefix="/suppliers", tags=["Supplier Master"])

@router.get("", response_model=list[SupplierResponseSchema])
async def list_suppliers(db: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    repo = SupplierRepository(db)
    return await repo.get_all_suppliers()

@router.get("/{id}", response_model=SupplierResponseSchema)
async def get_supplier(id: int, db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    repo = SupplierRepository(db)
    supplier = await repo.get_supplier_by_id(id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@router.post("", response_model=SupplierResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    schema: SupplierCreateSchema,
    db: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    repo = SupplierRepository(db)
    # Using a placeholder user; in a real app, extract from auth token
    user_id = "System Administrator"
    try:
        return await repo.create_supplier(schema, user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{id}", response_model=SupplierResponseSchema)
async def update_supplier(
    id: int,
    schema: SupplierUpdateSchema,
    db: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    repo = SupplierRepository(db)
    user_id = "System Administrator"
    try:
        return await repo.update_supplier(id, schema, user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(id: int, db: AsyncSession = Depends(get_session)) -> None:
    repo = SupplierRepository(db)
    user_id = "System Administrator"
    try:
        await repo.delete_supplier(id, user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
