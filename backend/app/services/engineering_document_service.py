from typing import Any

from app.repositories.document_type_repository import DocumentTypeRepository
from app.repositories.engineering_document_repository import EngineeringDocumentRepository


class UnknownDocumentTypeError(ValueError):
    """Raised when a document is written with a type the master does not have."""

    def __init__(self, doc_type: str, allowed: set[str]):
        self.doc_type = doc_type
        self.allowed = sorted(allowed)
        super().__init__(
            f"Unknown document type {doc_type!r}. Allowed: {', '.join(self.allowed)}."
        )


class EngineeringDocumentService:
    def __init__(
        self,
        repository: EngineeringDocumentRepository,
        type_repository: DocumentTypeRepository | None = None,
    ):
        self.repository = repository
        self.type_repository = type_repository

    async def _validate_doc_type(self, data: dict) -> None:
        """Reject a type the master does not carry.

        The column is a plain VARCHAR, so without this the API accepts any string
        and the Type dropdown is the only thing keeping the data clean.
        """
        if self.type_repository is None:
            return
        doc_type = (data.get("docType") or "").strip()
        allowed = await self.type_repository.active_codes()
        if doc_type not in allowed:
            raise UnknownDocumentTypeError(doc_type, allowed)
        data["docType"] = doc_type

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def get_all_documents(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_documents()

    async def create_document(self, data: dict, user_id: str) -> dict[str, Any]:
        await self._validate_doc_type(data)

        if data.get('revision') is None or data.get('revision') < 1:
            data['revision'] = 1

        new_id = await self.repository.execute_sp('INSERT', data, user_id=user_id)
        if new_id:
            return await self.repository.get_document_by_id(new_id)
        return None

    async def update_document(self, uid: str, data: dict, user_id: str) -> dict[str, Any]:
        await self._validate_doc_type(data)
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
