from fastapi import APIRouter, Depends, HTTPException

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.planning.api import schemas as s
from app.modules.planning.domain.services import PlanningService

router = APIRouter(tags=["Production Planning"], prefix="/planning")

# --- Demand ---

@router.get("/demand", response_model=list[s.PpDemandSchema])
async def get_demand(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
):
    service = PlanningService(session, ctx)
    return await service.get_demand()


@router.post("/demand", response_model=s.PpDemandSchema, status_code=201)
async def create_demand(
    data: s.PpDemandCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    demand = await service.create_demand(data)
    await session.commit()
    return demand


@router.put("/demand/{uid}", response_model=s.PpDemandSchema)
async def update_demand(
    uid: str,
    data: s.PpDemandUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    demand = await service.update_demand(uid, data)
    if not demand:
        raise HTTPException(status_code=404, detail="Demand not found")
    await session.commit()
    return demand


# --- MPS ---

@router.get("/mps", response_model=list[s.PpMpsSchema])
async def get_mps(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
):
    service = PlanningService(session, ctx)
    return await service.get_mps()


@router.post("/mps", response_model=s.PpMpsSchema, status_code=201)
async def create_mps(
    data: s.PpMpsCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    mps = await service.create_mps(data)
    await session.commit()
    return mps


@router.put("/mps/{uid}", response_model=s.PpMpsSchema)
async def update_mps(
    uid: str,
    data: s.PpMpsUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    mps = await service.update_mps(uid, data)
    if not mps:
        raise HTTPException(status_code=404, detail="MPS not found")
    await session.commit()
    return mps


# --- Planning Policy ---

@router.get("/policies", response_model=list[s.PpPlanningPolicySchema])
async def get_policies(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
):
    service = PlanningService(session, ctx)
    return await service.get_policies()


@router.post("/policies", response_model=s.PpPlanningPolicySchema, status_code=201)
async def create_policy(
    data: s.PpPlanningPolicyCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    policy = await service.create_policy(data)
    await session.commit()
    return policy


@router.put("/policies/{uid}", response_model=s.PpPlanningPolicySchema)
async def update_policy(
    uid: str,
    data: s.PpPlanningPolicyUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    policy = await service.update_policy(uid, data)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    await session.commit()
    return policy


# --- Calendar ---

@router.get("/calendar", response_model=list[s.PpCalendarDaySchema])
async def get_calendar(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
):
    service = PlanningService(session, ctx)
    return await service.get_calendar()


@router.post("/calendar", response_model=s.PpCalendarDaySchema, status_code=201)
async def create_calendar_day(
    data: s.PpCalendarDayCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    day = await service.create_calendar_day(data)
    await session.commit()
    return day


@router.put("/calendar/{uid}", response_model=s.PpCalendarDaySchema)
async def update_calendar_day(
    uid: str,
    data: s.PpCalendarDayUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    day = await service.update_calendar_day(uid, data)
    if not day:
        raise HTTPException(status_code=404, detail="Calendar Day not found")
    await session.commit()
    return day


# --- Production Orders ---

@router.get("/orders", response_model=list[s.PpProductionOrderSchema])
async def get_orders(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.ORDER.VIEW")),
):
    service = PlanningService(session, ctx)
    return await service.get_orders()


@router.post("/orders", response_model=s.PpProductionOrderSchema, status_code=201)
async def create_order(
    data: s.PpProductionOrderCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.ORDER.CREATE")),
):
    service = PlanningService(session, ctx)
    order = await service.create_order(data)
    await session.commit()
    # Eager load the relationships for the response if needed, 
    # but the service layer created them directly attached to the model instance.
    return order


@router.put("/orders/{uid}", response_model=s.PpProductionOrderSchema)
async def update_order(
    uid: str,
    data: s.PpProductionOrderUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.ORDER.EDIT")),
):
    service = PlanningService(session, ctx)
    order = await service.update_order(uid, data)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await session.commit()
    return order


# --- Forecasts ---

@router.get("/forecasts", response_model=list[s.PpForecastSchema])
async def get_forecasts(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
):
    service = PlanningService(session, ctx)
    return await service.get_forecasts()


@router.post("/forecasts", response_model=s.PpForecastSchema, status_code=201)
async def create_forecast(
    data: s.PpForecastCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    forecast = await service.create_forecast(data)
    await session.commit()
    return forecast


@router.put("/forecasts/{uid}", response_model=s.PpForecastSchema)
async def update_forecast(
    uid: str,
    data: s.PpForecastUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
):
    service = PlanningService(session, ctx)
    forecast = await service.update_forecast(uid, data)
    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast not found")
    await session.commit()
    return forecast
