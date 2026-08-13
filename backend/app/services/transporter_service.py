from typing import Any
from app.repositories.transporter_repository import TransporterRepository

class TransporterService:
    def __init__(self, repository: TransporterRepository):
        self.repository = repository
        
    def _generate_code(self) -> str:
        # Simplistic code generation for demo purposes. In production, this might query the DB for max code.
        import random
        return f"TRN-{random.randint(1000, 9999)}"

    async def get_all_transporters(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_transporters()
        
    async def create_transporter(self, data: dict[str, Any]) -> dict[str, Any]:
        code = self._generate_code()
        return await self.repository.create_transporter(code, data)
        
    async def update_transporter(self, transporter_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
        return await self.repository.update_transporter(transporter_id, data)
        
    async def delete_transporter(self, transporter_id: int) -> None:
        await self.repository.delete_transporter(transporter_id)
