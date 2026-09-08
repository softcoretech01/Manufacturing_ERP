"""Document-type master.

The Register-a-document form's Type list comes from here rather than a hardcoded
array in the React page, and the document write path validates against it.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import require
from app.repositories.document_type_repository import DocumentTypeRepository
from app.schemas.document_type import DocumentTypeSchema, DocumentTypeWrite

router = APIRouter(tags=["Document Types"])


def get_repo(db: AsyncSession = Depends(get_session)) -> DocumentTypeRepository:
    return DocumentTypeRepository(db)


@router.get("/", response_model=list[DocumentTypeSchema],
            dependencies=[Depends(require("ENGINEERING.DOCUMENT_TYPE.VIEW"))])
async def list_document_types(
    active_only: bool = Query(False, description="only types available for new documents"),
    repo: DocumentTypeRepository = Depends(get_repo),
):
    return await repo.list_types(active_only=active_only)


@router.post("/", response_model=DocumentTypeSchema, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require("ENGINEERING.DOCUMENT_TYPE.CREATE"))])
async def create_document_type(
    payload: DocumentTypeWrite,
    repo: DocumentTypeRepository = Depends(get_repo),
    ctx: TenantContext = Depends(require("ENGINEERING.DOCUMENT_TYPE.CREATE")),
):
    code = payload.code.strip().upper()
    if await repo.get_by_code(code):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document type {code} already exists.",
        )
    data = payload.model_dump()
    data["code"] = code
    return await repo.create(data, ctx.login_id or "system")


@router.put("/{uid}", response_model=DocumentTypeSchema,
            dependencies=[Depends(require("ENGINEERING.DOCUMENT_TYPE.EDIT"))])
async def update_document_type(
    uid: str,
    payload: DocumentTypeWrite,
    repo: DocumentTypeRepository = Depends(get_repo),
    ctx: TenantContext = Depends(require("ENGINEERING.DOCUMENT_TYPE.EDIT")),
):
    existing = await repo.get_by_uid(uid)
    if not existing:
        raise HTTPException(status_code=404, detail="Document type not found.")

    # The code is the value stored on every document that uses it, so it is fixed
    # once the type is in use. Renaming is done through `name`.
    if payload.code.strip().upper() != existing["code"] and existing["inUseCount"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{existing['code']} is used by {existing['inUseCount']} document(s);"
                " its code cannot be changed. Edit the name instead."
            ),
        )
    if not payload.isActive and existing["inUseCount"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{existing['code']} is used by {existing['inUseCount']} document(s)"
                " and cannot be deactivated."
            ),
        )
    return await repo.update(uid, payload.model_dump(), ctx.login_id or "system")


@router.delete("/{uid}", response_model=DocumentTypeSchema,
               dependencies=[Depends(require("ENGINEERING.DOCUMENT_TYPE.DELETE"))])
async def retire_document_type(
    uid: str,
    repo: DocumentTypeRepository = Depends(get_repo),
    ctx: TenantContext = Depends(require("ENGINEERING.DOCUMENT_TYPE.DELETE")),
):
    """Retires the type; it is never physically deleted."""
    existing = await repo.get_by_uid(uid)
    if not existing:
        raise HTTPException(status_code=404, detail="Document type not found.")
    if existing["inUseCount"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{existing['code']} is used by {existing['inUseCount']} document(s)"
                " and cannot be retired."
            ),
        )
    return await repo.retire(uid, ctx.login_id or "system")
