"""Item master endpoints. Every endpoint declares its permission (CLAUDE.md §5.4).
`get_session` commits on success — routers don't."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.masters.api import schemas as s
from app.modules.masters.application.item_service import ItemService

router = APIRouter(tags=["Masters"])


@router.get("/items", response_model=list[s.ItemOut])
async def list_items(
    session: SessionDep,
    item_type: str | None = None,
    active_only: bool = False,
    search: str | None = None,
    ctx: TenantContext = Depends(require("MASTERS.ITEM.VIEW")),
):
    return await ItemService(session, ctx).list_page(
        item_type=item_type, active_only=active_only, search=search
    )


@router.post("/items", response_model=s.ItemOut, status_code=201)
async def create_item(
    body: s.ItemCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("MASTERS.ITEM.CREATE")),
):
    return await ItemService(session, ctx).create(body.model_dump())


@router.get("/items/{uid}", response_model=s.ItemOut)
async def get_item(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("MASTERS.ITEM.VIEW")),
):
    return await ItemService(session, ctx).get_or_404(uid)


@router.patch("/items/{uid}", response_model=s.ItemOut)
async def update_item(
    uid: str,
    body: s.ItemUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("MASTERS.ITEM.EDIT")),
):
    data = body.model_dump(exclude_none=True)
    version = data.pop("version")
    return await ItemService(session, ctx).update(uid, data, expected_version=version)


@router.post("/items/{uid}/deactivate", response_model=s.ItemOut)
async def deactivate_item(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("MASTERS.ITEM.DEACTIVATE")),
):
    return await ItemService(session, ctx).set_active(uid, False)


@router.post("/items/{uid}/restore", response_model=s.ItemOut)
async def restore_item(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("MASTERS.ITEM.RESTORE")),
):
    return await ItemService(session, ctx).set_active(uid, True)
