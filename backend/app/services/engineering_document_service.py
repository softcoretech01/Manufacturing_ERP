from typing import Any

from app.repositories.document_type_repository import DocumentTypeRepository
from app.repositories.engineering_document_repository import EngineeringDocumentRepository

# Sentinel meaning "the caller did not send this field", as distinct from "the
# caller sent an empty value". The stored procedure already does the right thing
# with NULL -- `ProductCode = COALESCE(p_ProductCode, ProductCode)` -- so an
# omitted field keeps what is stored.
UNSET = object()


class UnknownDocumentTypeError(ValueError):
    """Raised when a document is written with a type the master does not have."""

    def __init__(self, doc_type: str, allowed: set[str]):
        self.doc_type = doc_type
        self.allowed = sorted(allowed)
        super().__init__(
            f"Unknown document type {doc_type!r}. Allowed: {', '.join(self.allowed)}."
        )


class UnknownProductError(ValueError):
    """Raised when a document names a product that is not in the item master."""

    def __init__(self, product_code: str, *, existing: bool = False):
        self.product_code = product_code
        self.existing = existing
        if existing:
            # The document already carried this code; the product disappeared
            # underneath it. Saying "invalid" would blame the wrong thing.
            msg = (
                f"This document is filed against {product_code}, which is no longer"
                " in the item master. Choose a product that exists, or restore"
                f" {product_code}, before saving."
            )
        else:
            msg = (
                f"Product {product_code!r} is not in the item master. Choose an"
                " existing product."
            )
        super().__init__(msg)


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

        The column is a plain VARCHAR behind a foreign key, so this turns what
        would be a raw constraint error into a message naming the valid codes.
        """
        if self.type_repository is None:
            return
        doc_type = (data.get("docType") or "").strip()
        allowed = await self.type_repository.active_codes()
        if doc_type not in allowed:
            raise UnknownDocumentTypeError(doc_type, allowed)
        data["docType"] = doc_type

    async def _validate_product(self, data: dict, *, was: str | None = None) -> None:
        """Reject a product the item master does not carry.

        `was` is the code already stored on the document. When the caller sends
        that same code back unchanged and it is an orphan, the message says so
        rather than accusing the user of picking something invalid.
        """
        product = data.get("productCode", UNSET)
        if product is UNSET or product is None:
            # Not sent: the procedure's COALESCE keeps the stored value.
            return
        product = str(product).strip()
        if not product:
            raise UnknownProductError("")

        if product == was:
            # Unchanged. Grandfathered even when it is an orphan: refusing here
            # would mean a typo in the title could not be fixed until someone
            # made a business decision about the product, and the likely
            # response to that is picking a replacement at random -- exactly the
            # silent change of ownership this is meant to prevent.
            data["productCode"] = product
            return

        allowed = await self.repository.active_product_codes()
        if product not in allowed:
            raise UnknownProductError(product, existing=False)
        data["productCode"] = product

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def get_all_documents(self) -> list[dict[str, Any]]:
        return await self.repository.get_all_documents()

    async def create_document(self, data: dict, user_id: str) -> dict[str, Any]:
        await self._validate_doc_type(data)
        await self._validate_product(data)

        if data.get('revision') is None or data.get('revision') < 1:
            data['revision'] = 1

        new_id = await self.repository.execute_sp('INSERT', data, user_id=user_id)
        if new_id:
            return await self.repository.get_document_by_id(new_id)
        return None

    async def update_document(self, uid: str, data: dict, user_id: str) -> dict[str, Any]:
        doc_id = int(uid)

        # What the document currently points at, so an unchanged orphan can be
        # reported honestly and an omitted field can be left alone.
        current = await self.repository.get_document_by_id(doc_id)
        was = current.get("productCode") if current else None

        await self._validate_doc_type(data)
        await self._validate_product(data, was=was)

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
