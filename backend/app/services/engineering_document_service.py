from typing import Any, Dict, List
from app.repositories.engineering_document_repository import EngineeringDocumentRepository

class EngineeringDocumentService:
    def __init__(self, repository: EngineeringDocumentRepository):
        self.repository = repository

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def get_all_documents(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_documents()

    async def create_document(self, data: dict, user_id: str) -> dict[str, Any]:
        if data.get('revision') is None or data.get('revision') < 1:
            data['revision'] = 1
            
        new_id = await self.repository.execute_sp('INSERT', data, user_id=user_id)
        if new_id:
            return await self.repository.get_document_by_id(new_id)
        return None

    async def update_document(self, uid: str, data: dict, user_id: str) -> dict[str, Any]:
        doc_id = int(uid)
        
        # Determine action (APPROVE vs UPDATE)
        if data.get('status') == 'ACTIVE' and data.get('approvedBy'):
            action = 'APPROVE'
        else:
            action = 'UPDATE'
            
        await self.repository.execute_sp(action, data, doc_id=doc_id, user_id=user_id)
        return await self.repository.get_document_by_id(doc_id)

    async def delete_document(self, uid: str, user_id: str = "System") -> None:
        doc_id = int(uid)
        await self.repository.execute_sp('DELETE', {}, doc_id=doc_id, user_id=user_id)
