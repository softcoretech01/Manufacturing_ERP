from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime

from app.core.context import TenantContext
from app.modules.planning.infrastructure.models import (
    PpCalendarDay,
    PpDemand,
    PpMps,
    PpPlanningPolicy,
    PpProductionOrder,
    PpProdOrderComponent,
    PpProdOrderOperation,
    PpForecast,
)


class PlanningRepository:
    def __init__(self, session: AsyncSession, ctx: TenantContext):
        self.session = session
        self.ctx = ctx
        self.company_id = ctx.company_id

    # --- Demand ---
    async def get_all_demand(self) -> list[PpDemand]:
        stmt = select(PpDemand).where(PpDemand.company_id == self.company_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_demand(self, demand: PpDemand) -> PpDemand:
        demand.company_id = self.company_id
        now = datetime.now()
        demand.created_at = now
        demand.updated_at = now
        demand.created_by = self.ctx.user_id
        demand.updated_by = self.ctx.user_id
        self.session.add(demand)
        await self.session.flush()
        return demand

    async def update_demand(self, uid: str, updates: dict) -> PpDemand | None:
        stmt = select(PpDemand).where(
            PpDemand.uid == uid, PpDemand.company_id == self.company_id
        )
        result = await self.session.execute(stmt)
        demand = result.scalar_one_or_none()
        if not demand:
            return None
        for key, value in updates.items():
            setattr(demand, key, value)
        demand.updated_at = datetime.now()
        demand.updated_by = self.ctx.user_id
        await self.session.flush()
        return demand

    # --- MPS ---
    async def get_all_mps(self) -> list[PpMps]:
        stmt = select(PpMps).where(PpMps.company_id == self.company_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_mps(self, mps: PpMps) -> PpMps:
        mps.company_id = self.company_id
        now = datetime.now()
        mps.created_at = now
        mps.updated_at = now
        mps.created_by = self.ctx.user_id
        mps.updated_by = self.ctx.user_id
        self.session.add(mps)
        await self.session.flush()
        return mps

    async def update_mps(self, uid: str, updates: dict) -> PpMps | None:
        stmt = select(PpMps).where(PpMps.uid == uid, PpMps.company_id == self.company_id)
        result = await self.session.execute(stmt)
        mps = result.scalar_one_or_none()
        if not mps:
            return None
        for key, value in updates.items():
            setattr(mps, key, value)
        mps.updated_at = datetime.now()
        mps.updated_by = self.ctx.user_id
        await self.session.flush()
        return mps

    # --- Planning Policy ---
    async def get_all_policies(self) -> list[PpPlanningPolicy]:
        stmt = select(PpPlanningPolicy).where(PpPlanningPolicy.company_id == self.company_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_policy(self, policy: PpPlanningPolicy) -> PpPlanningPolicy:
        policy.company_id = self.company_id
        now = datetime.now()
        policy.created_at = now
        policy.updated_at = now
        policy.created_by = self.ctx.user_id
        policy.updated_by = self.ctx.user_id
        self.session.add(policy)
        await self.session.flush()
        return policy

    async def update_policy(self, uid: str, updates: dict) -> PpPlanningPolicy | None:
        stmt = select(PpPlanningPolicy).where(
            PpPlanningPolicy.uid == uid, PpPlanningPolicy.company_id == self.company_id
        )
        result = await self.session.execute(stmt)
        policy = result.scalar_one_or_none()
        if not policy:
            return None
        for key, value in updates.items():
            setattr(policy, key, value)
        policy.updated_at = datetime.now()
        policy.updated_by = self.ctx.user_id
        await self.session.flush()
        return policy

    # --- Calendar ---
    async def get_all_calendar_days(self) -> list[PpCalendarDay]:
        stmt = select(PpCalendarDay).where(PpCalendarDay.company_id == self.company_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_calendar_day(self, day: PpCalendarDay) -> PpCalendarDay:
        day.company_id = self.company_id
        now = datetime.now()
        day.created_at = now
        day.updated_at = now
        day.created_by = self.ctx.user_id
        day.updated_by = self.ctx.user_id
        self.session.add(day)
        await self.session.flush()
        return day

    async def update_calendar_day(self, uid: str, updates: dict) -> PpCalendarDay | None:
        stmt = select(PpCalendarDay).where(
            PpCalendarDay.uid == uid, PpCalendarDay.company_id == self.company_id
        )
        result = await self.session.execute(stmt)
        day = result.scalar_one_or_none()
        if not day:
            return None
        for key, value in updates.items():
            setattr(day, key, value)
        day.updated_at = datetime.now()
        day.updated_by = self.ctx.user_id
        await self.session.flush()
        return day

    # --- Production Orders ---
    async def get_all_orders(self) -> list[PpProductionOrder]:
        stmt = (
            select(PpProductionOrder)
            .where(PpProductionOrder.company_id == self.company_id)
            .options(
                selectinload(PpProductionOrder.components),
                selectinload(PpProductionOrder.operations),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_order(self, order: PpProductionOrder) -> PpProductionOrder:
        order.company_id = self.company_id
        now = datetime.now()
        order.created_at = now
        order.updated_at = now
        order.created_by = self.ctx.user_id
        order.updated_by = self.ctx.user_id
        for comp in order.components:
            comp.company_id = self.company_id
            comp.created_at = now
            comp.updated_at = now
            comp.created_by = self.ctx.user_id
            comp.updated_by = self.ctx.user_id
        for op in order.operations:
            op.company_id = self.company_id
            op.created_at = now
            op.updated_at = now
            op.created_by = self.ctx.user_id
            op.updated_by = self.ctx.user_id
        self.session.add(order)
        await self.session.flush()
        return order

    async def update_order(self, uid: str, updates: dict) -> PpProductionOrder | None:
        stmt = select(PpProductionOrder).where(
            PpProductionOrder.uid == uid, PpProductionOrder.company_id == self.company_id
        )
        result = await self.session.execute(stmt)
        order = result.scalar_one_or_none()
        if not order:
            return None
        for key, value in updates.items():
            setattr(order, key, value)
        order.updated_at = datetime.now()
        order.updated_by = self.ctx.user_id
        await self.session.flush()
        return order

    # --- Forecasts ---
    async def get_all_forecasts(self) -> list[PpForecast]:
        stmt = select(PpForecast).where(PpForecast.company_id == self.company_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_forecast(self, forecast: PpForecast) -> PpForecast:
        forecast.company_id = self.company_id
        now = datetime.now()
        forecast.created_at = now
        forecast.updated_at = now
        forecast.created_by = self.ctx.user_id
        forecast.updated_by = self.ctx.user_id
        self.session.add(forecast)
        await self.session.flush()
        return forecast

    async def update_forecast(self, uid: str, updates: dict) -> PpForecast | None:
        stmt = select(PpForecast).where(
            PpForecast.uid == uid, PpForecast.company_id == self.company_id
        )
        result = await self.session.execute(stmt)
        forecast = result.scalar_one_or_none()
        if not forecast:
            return None
        for key, value in updates.items():
            setattr(forecast, key, value)
        forecast.updated_at = datetime.now()
        forecast.updated_by = self.ctx.user_id
        await self.session.flush()
        return forecast
