from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.repositories.contact_repository import ContactRepository
from app.services.contact_service import ContactService
from app.schemas.contact import (
    ContactCreateSchema,
    ContactUpdateSchema,
    ContactResponseSchema
)

router = APIRouter(prefix="/contacts", tags=["Contacts"])

def get_service(db: AsyncSession = Depends(get_session)) -> ContactService:
    repository = ContactRepository(db)
    return ContactService(repository)

@router.get("", response_model=list[ContactResponseSchema])
async def get_all_contacts(service: ContactService = Depends(get_service)):
    return await service.get_all_contacts()

@router.get("/next-code")
async def get_next_code(service: ContactService = Depends(get_service)):
    return await service.get_next_code()

@router.post("", response_model=ContactResponseSchema)
async def create_contact(
    contact: ContactCreateSchema,
    service: ContactService = Depends(get_service)
):
    # Hardcode user_id for now until auth is fully implemented
    return await service.create_contact(contact.model_dump(), user_id="system")

@router.put("/{contact_id}", response_model=ContactResponseSchema)
async def update_contact(
    contact_id: int,
    contact: ContactUpdateSchema,
    service: ContactService = Depends(get_service)
):
    return await service.update_contact(contact_id, contact.model_dump(), user_id="system")

@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: int,
    service: ContactService = Depends(get_service)
):
    await service.delete_contact(contact_id, user_id="system")
    return {"message": "Contact deleted successfully"}
