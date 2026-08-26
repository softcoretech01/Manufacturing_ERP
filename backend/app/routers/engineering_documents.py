from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

from app.core.database import get_session
from app.schemas.engineering_document import EngDocumentSchema
from app.repositories.engineering_document_repository import EngineeringDocumentRepository
from app.services.engineering_document_service import EngineeringDocumentService

router = APIRouter(tags=["Engineering Documents"])

def get_service(db: AsyncSession = Depends(get_session)) -> EngineeringDocumentService:
    repository = EngineeringDocumentRepository(db)
    return EngineeringDocumentService(repository)

@router.get("/", response_model=List[EngDocumentSchema])
async def get_documents(service: EngineeringDocumentService = Depends(get_service)):
    return await service.get_all_documents()

@router.get("/next-code", response_model=Dict[str, str])
async def get_next_code(service: EngineeringDocumentService = Depends(get_service)):
    return await service.get_next_code()

@router.post("/", response_model=EngDocumentSchema, status_code=status.HTTP_201_CREATED)
async def create_document(
    doc: EngDocumentSchema,
    service: EngineeringDocumentService = Depends(get_service)
):
    user_id = "System"
    data = doc.model_dump(mode='json')
    result = await service.create_document(data, user_id)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create document")
    return result

@router.put("/{doc_uid}", response_model=EngDocumentSchema)
async def update_document(
    doc_uid: str,
    doc: EngDocumentSchema,
    service: EngineeringDocumentService = Depends(get_service)
):
    user_id = "System"
    data = doc.model_dump(mode='json')
    result = await service.update_document(doc_uid, data, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Document not found or update failed")
    return result

@router.delete("/{doc_uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_uid: str,
    service: EngineeringDocumentService = Depends(get_service)
):
    user_id = "System"
    await service.delete_document(doc_uid, user_id)
    return None
