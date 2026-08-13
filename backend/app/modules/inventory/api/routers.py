"""Inventory storage-structure HTTP routers (zones, bins, bulk generation).
Every endpoint declares its permission via `Depends(require(...))` (CLAUDE.md §5.4).
Routers do no business logic — they call the service and shape the envelope."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.core.pagination import Page, PageParams, build_meta
from app.modules.inventory.api import schemas as s
from app.modules.inventory.application import services as svc

router = APIRouter(tags=["Inventory · Storage"])


def _page(rows: list, total: int, params: PageParams, model: type[BaseModel]) -> Page:
    return Page(data=[model.model_validate(r) for r in rows], meta=build_meta(params, total))


def _pp(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    sort: str | None = Query(None),
    q: str | None = Query(None),
) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort, q=q)


PageDep = Annotated[PageParams, Depends(_pp)]


# ═══════════════════════════ Zones ══════════════════════════════════════════
@router.get("/inventory/zones", response_model=list[s.ZoneOut])
async def list_zones(
    warehouse: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ZONE.VIEW")),
):
    rows = await svc.ZoneService(session, ctx).list_for_warehouse(warehouse)
    return [s.ZoneOut.model_validate(r) for r in rows]


@router.post("/inventory/zones", response_model=s.ZoneOut, status_code=201)
async def create_zone(
    body: s.ZoneCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ZONE.CREATE")),
):
    return await svc.ZoneService(session, ctx).create(body)


@router.get("/inventory/zones/next-code")
async def next_zone_code(
    warehouse: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ZONE.CREATE")),
) -> dict[str, str]:
    return {"code": await svc.ZoneService(session, ctx).next_code(warehouse)}


@router.get("/inventory/zones/{uid}", response_model=s.ZoneOut)
async def get_zone(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("INVENTORY.ZONE.VIEW"))
):
    return await svc.ZoneService(session, ctx).get(uid)


@router.patch("/inventory/zones/{uid}", response_model=s.ZoneOut)
async def update_zone(
    uid: str,
    body: s.ZoneUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ZONE.EDIT")),
):
    return await svc.ZoneService(session, ctx).update(uid, body)


@router.post("/inventory/zones/{uid}/deactivate", response_model=s.ZoneOut)
async def deactivate_zone(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.ZONE.DEACTIVATE")),
):
    return await svc.ZoneService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/inventory/zones/{uid}/restore", response_model=s.ZoneOut)
async def restore_zone(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("INVENTORY.ZONE.RESTORE"))
):
    return await svc.ZoneService(session, ctx).restore(uid)


# ═══════════════════════════ Bins ═══════════════════════════════════════════
@router.get("/inventory/bins", response_model=Page[s.BinOut])
async def list_bins(
    warehouse: str,
    session: SessionDep,
    params: PageDep,
    zone: str | None = Query(None),
    ctx: TenantContext = Depends(require("INVENTORY.BIN.VIEW")),
):
    rows, total = await svc.BinService(session, ctx).list_page(
        params, warehouse_uid=warehouse, zone_uid=zone
    )
    return _page(rows, total, params, s.BinOut)


@router.post("/inventory/bins", response_model=s.BinOut, status_code=201)
async def create_bin(
    body: s.BinCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.BIN.CREATE")),
):
    return await svc.BinService(session, ctx).create(body)


@router.post("/inventory/bins/bulk-generate", response_model=s.BulkBinResult, status_code=201)
async def bulk_generate_bins(
    body: s.BulkBinGenerate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.BIN.GENERATE")),
):
    return await svc.BinService(session, ctx).bulk_generate(body)


@router.get("/inventory/bins/{uid}", response_model=s.BinOut)
async def get_bin(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("INVENTORY.BIN.VIEW"))
):
    return await svc.BinService(session, ctx).get(uid)


@router.patch("/inventory/bins/{uid}", response_model=s.BinOut)
async def update_bin(
    uid: str,
    body: s.BinUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.BIN.EDIT")),
):
    return await svc.BinService(session, ctx).update(uid, body)


@router.post("/inventory/bins/{uid}/block", response_model=s.BinOut)
async def block_bin(
    uid: str,
    body: s.BinBlockRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.BIN.BLOCK")),
):
    return await svc.BinService(session, ctx).block(uid, body.version, body.reason)


@router.post("/inventory/bins/{uid}/unblock", response_model=s.BinOut)
async def unblock_bin(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.BIN.BLOCK")),
):
    return await svc.BinService(session, ctx).unblock(uid, body.version)


@router.post("/inventory/bins/{uid}/deactivate", response_model=s.BinOut)
async def deactivate_bin(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.BIN.DEACTIVATE")),
):
    return await svc.BinService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/inventory/bins/{uid}/restore", response_model=s.BinOut)
async def restore_bin(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("INVENTORY.BIN.RESTORE"))
):
    return await svc.BinService(session, ctx).restore(uid)
