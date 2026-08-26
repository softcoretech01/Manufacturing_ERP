# Customer Master API Endpoints (V0-API-001)
# File: backend/app/routers/customer.py

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.repositories.customer_repository import CustomerRepository
from app.schemas.customer import (
    CustomerCreateSchema,
    CustomerResponseSchema,
    CustomerUpdateSchema,
)

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=list[CustomerResponseSchema])
async def list_customers(session: AsyncSession = Depends(get_session)) -> Any:
    """Retrieve all non-deleted customer records."""
    repo = CustomerRepository(session)
    return await repo.get_all_customers()


@router.get("/{id}", response_model=CustomerResponseSchema)
async def get_customer(id: int, session: AsyncSession = Depends(get_session)) -> Any:
    """Retrieve a single customer record by its internal Id."""
    repo = CustomerRepository(session)
    customer = await repo.get_customer_by_id(id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    return customer


@router.post("", response_model=CustomerResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_customer(
    schema: CustomerCreateSchema,
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Create a new customer master record along with child details."""
    repo = CustomerRepository(session)
    # Default auditor user
    user_id = "Anand Krishnan"
    return await repo.create_customer(schema, user_id=user_id)


@router.put("/{id}", response_model=CustomerResponseSchema)
async def update_customer(
    id: int,
    schema: CustomerUpdateSchema,
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Update an existing customer master record by Id."""
    repo = CustomerRepository(session)
    user_id = "Anand Krishnan"
    return await repo.update_customer(id, schema, user_id=user_id)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(id: int, session: AsyncSession = Depends(get_session)) -> None:
    """Soft delete a customer master record."""
    repo = CustomerRepository(session)
    user_id = "Anand Krishnan"
    # Check existence
    customer = await repo.get_customer_by_id(id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    await repo.delete_customer(id, user_id=user_id)
