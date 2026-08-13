from typing import Any
from fastapi import HTTPException
from app.repositories.contact_repository import ContactRepository

class ContactService:
    def __init__(self, repository: ContactRepository):
        self.repository = repository

    async def get_all_contacts(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_contacts()

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def create_contact(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        return await self.repository.create_contact(data, user_id)

    async def update_contact(self, contact_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        result = await self.repository.update_contact(contact_id, data, user_id)
        if not result:
            raise HTTPException(status_code=404, detail="Contact not found")
        return result

    async def delete_contact(self, contact_id: int, user_id: str) -> None:
        await self.repository.delete_contact(contact_id, user_id)
