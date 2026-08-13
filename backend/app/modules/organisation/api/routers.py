"""Organisation HTTP routers. Every endpoint declares its permission via
`Depends(require(...))` (CLAUDE.md §5.4). Routers do no business logic — they
resolve the context, call the service, and shape the response envelope."""

from __future__ import annotations

import contextlib
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.core.pagination import Page, PageParams, build_meta
from app.modules.organisation.api import schemas as s
from app.modules.organisation.application import services as svc

router = APIRouter(tags=["Organisation"])


# ═══════════════════════════ Structure (read model) ═════════════════════════
@router.get("/structure", response_model=s.OrgStructureOut)
async def get_structure(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.COMPANY.VIEW")),
):
    return s.OrgStructureOut.model_validate(await svc.StructureService(session, ctx).build())


def _page(rows: list, total: int, params: PageParams, model: type[BaseModel]) -> Page:
    return Page(data=[model.model_validate(r) for r in rows], meta=build_meta(params, total))


def _pp(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str | None = Query(None),
    q: str | None = Query(None),
) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort, q=q)


PageDep = Annotated[PageParams, Depends(_pp)]
IfMatch = Annotated[str | None, Header(alias="If-Match")]


def _apply_if_match(body, if_match: str | None):
    """If-Match header wins over the body's version field (CLAUDE.md §4.5)."""
    if if_match:
        with contextlib.suppress(ValueError):
            body.version = int(if_match.strip().strip('"'))
    return body


# ═══════════════════════════ Companies ══════════════════════════════════════
@router.get("/companies", response_model=Page[s.CompanyOut])
async def list_companies(
    session: SessionDep,
    params: PageDep,
    ctx: TenantContext = Depends(require("SYSTEM.COMPANY.VIEW")),
):
    rows, total = await svc.CompanyService(session, ctx).list_page(params)
    return _page(rows, total, params, s.CompanyOut)


@router.post("/companies", response_model=s.CompanyOut, status_code=201)
async def create_company(
    body: s.CompanyCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.COMPANY.CREATE")),
):
    return await svc.CompanyService(session, ctx).create(body)


@router.get("/companies/next-code")
async def next_company_code(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.COMPANY.CREATE"))
) -> dict[str, str]:
    return {"code": await svc.CompanyService(session, ctx).next_code()}


@router.get("/companies/{uid}", response_model=s.CompanyOut)
async def get_company(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.COMPANY.VIEW"))
):
    return await svc.CompanyService(session, ctx).get(uid)


@router.patch("/companies/{uid}", response_model=s.CompanyOut)
async def update_company(
    uid: str,
    body: s.CompanyUpdate,
    session: SessionDep,
    if_match: IfMatch = None,
    ctx: TenantContext = Depends(require("SYSTEM.COMPANY.EDIT")),
):
    return await svc.CompanyService(session, ctx).update(uid, _apply_if_match(body, if_match))


@router.post("/companies/{uid}/deactivate", response_model=s.CompanyOut)
async def deactivate_company(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.COMPANY.DEACTIVATE")),
):
    return await svc.CompanyService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/companies/{uid}/restore", response_model=s.CompanyOut)
async def restore_company(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.COMPANY.RESTORE"))
):
    return await svc.CompanyService(session, ctx).restore(uid)


@router.get("/companies/{uid}/registrations", response_model=list[s.RegistrationOut])
async def list_registrations(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.COMPANY.VIEW"))
):
    return await svc.CompanyService(session, ctx).registrations(uid)


@router.post("/companies/{uid}/registrations", response_model=s.RegistrationOut, status_code=201)
async def add_registration(
    uid: str,
    body: s.RegistrationCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.COMPANY.EDIT")),
):
    return await svc.CompanyService(session, ctx).add_registration(uid, body)


# ═══════════════════════════ Branches ═══════════════════════════════════════
@router.get("/branches", response_model=Page[s.BranchOut])
async def list_branches(
    session: SessionDep,
    params: PageDep,
    ctx: TenantContext = Depends(require("SYSTEM.BRANCH.VIEW")),
):
    rows, total = await svc.BranchService(session, ctx).list_page(params)
    return _page(rows, total, params, s.BranchOut)


@router.post("/branches", response_model=s.BranchOut, status_code=201)
async def create_branch(
    body: s.BranchCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.BRANCH.CREATE")),
):
    return await svc.BranchService(session, ctx).create(body)


@router.get("/branches/next-code")
async def next_branch_code(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.BRANCH.CREATE"))
) -> dict[str, str]:
    return {"code": await svc.BranchService(session, ctx).next_code()}


@router.get("/branches/{uid}", response_model=s.BranchOut)
async def get_branch(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.BRANCH.VIEW"))
):
    return await svc.BranchService(session, ctx).get(uid)


@router.patch("/branches/{uid}", response_model=s.BranchOut)
async def update_branch(
    uid: str,
    body: s.BranchUpdate,
    session: SessionDep,
    if_match: IfMatch = None,
    ctx: TenantContext = Depends(require("SYSTEM.BRANCH.EDIT")),
):
    return await svc.BranchService(session, ctx).update(uid, _apply_if_match(body, if_match))


@router.post("/branches/{uid}/deactivate", response_model=s.BranchOut)
async def deactivate_branch(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.BRANCH.DEACTIVATE")),
):
    return await svc.BranchService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/branches/{uid}/restore", response_model=s.BranchOut)
async def restore_branch(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.BRANCH.RESTORE"))
):
    return await svc.BranchService(session, ctx).restore(uid)


# ═══════════════════════════ Plants ═════════════════════════════════════════
@router.get("/plants", response_model=Page[s.PlantOut])
async def list_plants(
    session: SessionDep, params: PageDep, ctx: TenantContext = Depends(require("SYSTEM.PLANT.VIEW"))
):
    rows, total = await svc.PlantService(session, ctx).list_page(params)
    return _page(rows, total, params, s.PlantOut)


@router.post("/plants", response_model=s.PlantOut, status_code=201)
async def create_plant(
    body: s.PlantCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PLANT.CREATE")),
):
    return await svc.PlantService(session, ctx).create(body)


@router.get("/plants/next-code")
async def next_plant_code(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.PLANT.CREATE"))
) -> dict[str, str]:
    return {"code": await svc.PlantService(session, ctx).next_code()}


@router.get("/plants/{uid}", response_model=s.PlantOut)
async def get_plant(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.PLANT.VIEW"))
):
    return await svc.PlantService(session, ctx).get(uid)


@router.patch("/plants/{uid}", response_model=s.PlantOut)
async def update_plant(
    uid: str,
    body: s.PlantUpdate,
    session: SessionDep,
    if_match: IfMatch = None,
    ctx: TenantContext = Depends(require("SYSTEM.PLANT.EDIT")),
):
    return await svc.PlantService(session, ctx).update(uid, _apply_if_match(body, if_match))


@router.post("/plants/{uid}/deactivate", response_model=s.PlantOut)
async def deactivate_plant(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PLANT.DEACTIVATE")),
):
    return await svc.PlantService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/plants/{uid}/restore", response_model=s.PlantOut)
async def restore_plant(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.PLANT.RESTORE"))
):
    return await svc.PlantService(session, ctx).restore(uid)


# ═══════════════════════════ Warehouses ═════════════════════════════════════
@router.get("/warehouses", response_model=Page[s.WarehouseOut])
async def list_warehouses(
    session: SessionDep,
    params: PageDep,
    ctx: TenantContext = Depends(require("SYSTEM.WAREHOUSE.VIEW")),
):
    rows, total = await svc.WarehouseService(session, ctx).list_page(params)
    return _page(rows, total, params, s.WarehouseOut)


@router.post("/warehouses", response_model=s.WarehouseOut, status_code=201)
async def create_warehouse(
    body: s.WarehouseCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.WAREHOUSE.CREATE")),
):
    return await svc.WarehouseService(session, ctx).create(body)


@router.get("/warehouses/next-code")
async def next_warehouse_code(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.WAREHOUSE.CREATE"))
) -> dict[str, str]:
    return {"code": await svc.WarehouseService(session, ctx).next_code()}


@router.get("/warehouses/{uid}", response_model=s.WarehouseOut)
async def get_warehouse(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.WAREHOUSE.VIEW"))
):
    return await svc.WarehouseService(session, ctx).get(uid)


@router.patch("/warehouses/{uid}", response_model=s.WarehouseOut)
async def update_warehouse(
    uid: str,
    body: s.WarehouseUpdate,
    session: SessionDep,
    if_match: IfMatch = None,
    ctx: TenantContext = Depends(require("SYSTEM.WAREHOUSE.EDIT")),
):
    return await svc.WarehouseService(session, ctx).update(uid, _apply_if_match(body, if_match))


@router.post("/warehouses/{uid}/deactivate", response_model=s.WarehouseOut)
async def deactivate_warehouse(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.WAREHOUSE.DEACTIVATE")),
):
    return await svc.WarehouseService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/warehouses/{uid}/restore", response_model=s.WarehouseOut)
async def restore_warehouse(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.WAREHOUSE.RESTORE"))
):
    return await svc.WarehouseService(session, ctx).restore(uid)


# ═══════════════════════════ Departments ════════════════════════════════════
@router.get("/departments", response_model=Page[s.DepartmentOut])
async def list_departments(
    session: SessionDep,
    params: PageDep,
    ctx: TenantContext = Depends(require("SYSTEM.DEPARTMENT.VIEW")),
):
    rows, total = await svc.DepartmentService(session, ctx).list_page(params)
    return _page(rows, total, params, s.DepartmentOut)


@router.post("/departments", response_model=s.DepartmentOut, status_code=201)
async def create_department(
    body: s.DepartmentCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.DEPARTMENT.CREATE")),
):
    return await svc.DepartmentService(session, ctx).create(body)


@router.get("/departments/next-code")
async def next_department_code(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.DEPARTMENT.CREATE"))
) -> dict[str, str]:
    return {"code": await svc.DepartmentService(session, ctx).next_code()}


@router.get("/departments/{uid}", response_model=s.DepartmentOut)
async def get_department(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.DEPARTMENT.VIEW"))
):
    return await svc.DepartmentService(session, ctx).get(uid)


@router.patch("/departments/{uid}", response_model=s.DepartmentOut)
async def update_department(
    uid: str,
    body: s.DepartmentUpdate,
    session: SessionDep,
    if_match: IfMatch = None,
    ctx: TenantContext = Depends(require("SYSTEM.DEPARTMENT.EDIT")),
):
    return await svc.DepartmentService(session, ctx).update(uid, _apply_if_match(body, if_match))


@router.post("/departments/{uid}/deactivate", response_model=s.DepartmentOut)
async def deactivate_department(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.DEPARTMENT.DEACTIVATE")),
):
    return await svc.DepartmentService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/departments/{uid}/restore", response_model=s.DepartmentOut)
async def restore_department(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.DEPARTMENT.RESTORE")),
):
    return await svc.DepartmentService(session, ctx).restore(uid)


# ═══════════════════════════ Cost centres ═══════════════════════════════════
@router.get("/cost-centres", response_model=Page[s.CostCentreOut])
async def list_cost_centres(
    session: SessionDep,
    params: PageDep,
    ctx: TenantContext = Depends(require("SYSTEM.COST_CENTRE.VIEW")),
):
    rows, total = await svc.CostCentreService(session, ctx).list_page(params)
    return _page(rows, total, params, s.CostCentreOut)


@router.post("/cost-centres", response_model=s.CostCentreOut, status_code=201)
async def create_cost_centre(
    body: s.CostCentreCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.COST_CENTRE.CREATE")),
):
    return await svc.CostCentreService(session, ctx).create(body)


@router.get("/cost-centres/next-code")
async def next_cost_centre_code(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.COST_CENTRE.CREATE"))
) -> dict[str, str]:
    return {"code": await svc.CostCentreService(session, ctx).next_code()}


@router.get("/cost-centres/{uid}", response_model=s.CostCentreOut)
async def get_cost_centre(
    uid: str, session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.COST_CENTRE.VIEW"))
):
    return await svc.CostCentreService(session, ctx).get(uid)


@router.patch("/cost-centres/{uid}", response_model=s.CostCentreOut)
async def update_cost_centre(
    uid: str,
    body: s.CostCentreUpdate,
    session: SessionDep,
    if_match: IfMatch = None,
    ctx: TenantContext = Depends(require("SYSTEM.COST_CENTRE.EDIT")),
):
    return await svc.CostCentreService(session, ctx).update(uid, _apply_if_match(body, if_match))


@router.post("/cost-centres/{uid}/deactivate", response_model=s.CostCentreOut)
async def deactivate_cost_centre(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.COST_CENTRE.DEACTIVATE")),
):
    return await svc.CostCentreService(session, ctx).deactivate(uid, body.version, body.reason)


@router.post("/cost-centres/{uid}/restore", response_model=s.CostCentreOut)
async def restore_cost_centre(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.COST_CENTRE.RESTORE")),
):
    return await svc.CostCentreService(session, ctx).restore(uid)


# ═══════════════════════════ Financial years ════════════════════════════════
@router.get("/financial-years", response_model=list[s.FinancialYearOut])
async def list_financial_years(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.FINANCIAL_YEAR.VIEW"))
):
    return await svc.FinancialYearService(session, ctx).list_page()


@router.post("/financial-years", response_model=s.FinancialYearOut, status_code=201)
async def create_financial_year(
    body: s.FinancialYearCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.FINANCIAL_YEAR.CREATE")),
):
    return await svc.FinancialYearService(session, ctx).create(body)


@router.get("/financial-years/{uid}", response_model=s.FinancialYearOut)
async def get_financial_year(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.FINANCIAL_YEAR.VIEW")),
):
    return await svc.FinancialYearService(session, ctx).get(uid)


@router.get("/financial-years/{uid}/periods", response_model=list[s.AccountingPeriodOut])
async def list_periods(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.FINANCIAL_YEAR.VIEW")),
):
    return await svc.FinancialYearService(session, ctx).list_periods(uid)


@router.post("/financial-years/{uid}/set-current", response_model=s.FinancialYearOut)
async def set_current_financial_year(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.FINANCIAL_YEAR.EDIT")),
):
    return await svc.FinancialYearService(session, ctx).set_current(uid)


# ═══════════════════════════ Currency + FX ══════════════════════════════════
@router.get("/currencies", response_model=list[s.CurrencyOut])
async def list_currencies(
    session: SessionDep, ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.VIEW"))
):
    return await svc.CurrencyService(session, ctx).list_page()


@router.get("/exchange-rates", response_model=Page[s.ExchangeRateOut])
async def list_exchange_rates(
    session: SessionDep,
    params: PageDep,
    ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.VIEW")),
):
    rows, total = await svc.ExchangeRateService(session, ctx).list_page(params)
    return _page(rows, total, params, s.ExchangeRateOut)


@router.post("/exchange-rates", response_model=s.ExchangeRateOut, status_code=201)
async def create_exchange_rate(
    body: s.ExchangeRateCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.EDIT")),
):
    return await svc.ExchangeRateService(session, ctx).create(body)


@router.get("/exchange-rates/resolve", response_model=s.ExchangeRateOut)
async def resolve_exchange_rate(
    session: SessionDep,
    from_currency: str = Query(..., min_length=3, max_length=3),
    to_currency: str = Query(..., min_length=3, max_length=3),
    rate_type: str = Query("AVERAGE"),
    as_of: date = Query(...),
    ctx: TenantContext = Depends(require("SYSTEM.PARAMETER.VIEW")),
):
    return await svc.ExchangeRateService(session, ctx).resolve_rate(
        from_code=from_currency, to_code=to_currency, rate_type=rate_type, as_of=as_of
    )
