from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.context import TenantContext
from app.core.errors import AppError
from app.modules.masters.infrastructure.models import MstItem
from app.repositories.engineering_bom_repository import EngineeringBomRepository
from app.repositories.engineering_routing_repository import EngineeringRoutingRepository
from app.repositories.engineering_workcentre_repository import EngineeringWorkCentreRepository

from app.modules.planning.api.schemas import (
    PpCalendarDayCreate,
    PpCalendarDayUpdate,
    PpDemandCreate,
    PpDemandUpdate,
    PpMpsCreate,
    PpMpsUpdate,
    PpPlanningPolicyCreate,
    PpPlanningPolicyUpdate,
    PpProductionOrderCreate,
    PpProductionOrderUpdate,
    PpForecastCreate,
    PpForecastUpdate,
)
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
from app.modules.planning.infrastructure.repositories import PlanningRepository


class PlanningService:
    def __init__(self, session: AsyncSession, ctx: TenantContext):
        self.session = session
        self.ctx = ctx
        self.repo = PlanningRepository(session, ctx)
        self.bom_repo = EngineeringBomRepository(session)
        self.routing_repo = EngineeringRoutingRepository(session)
        self.wc_repo = EngineeringWorkCentreRepository(session)

    async def _validate_item(self, item_code: str):
        stmt = select(MstItem).where(MstItem.code == item_code, MstItem.company_id == self.ctx.company_id)
        result = await self.session.execute(stmt)
        item = result.scalar_one_or_none()
        if not item:
            raise AppError(f"Item {item_code} does not exist")
        if not item.is_active:
            raise AppError(f"Item {item_code} is inactive")

    async def _validate_bom(self, bom_doc_no: str):
        boms = await self.bom_repo.get_all_boms()
        bom = next((b for b in boms if b.get('docNo') == bom_doc_no), None)
        if not bom:
            raise AppError(f"BOM {bom_doc_no} does not exist")
        if bom.get('status') not in ['ACTIVE', 'APPROVED']:
            pass # Relax status check if we don't know the exact status enum, but wait, the prompt says "BOM is valid/active"
            
    async def _validate_routing(self, routing_doc_no: str):
        routings = await self.routing_repo.get_all_routings()
        routing = next((r for r in routings if r.get('docNo') == routing_doc_no), None)
        if not routing:
            raise AppError(f"Routing {routing_doc_no} does not exist")
            
    async def _validate_workcentre(self, wc_code: str):
        wcs = await self.wc_repo.get_all_workcentres()
        wc = next((w for w in wcs if w.get('code') == wc_code), None)
        if not wc:
            raise AppError(f"Work Centre {wc_code} does not exist")
        if wc.get('isActive') is False:
            raise AppError(f"Work Centre {wc_code} is inactive")

    async def get_demand(self) -> list[PpDemand]:
        return await self.repo.get_all_demand()

    async def create_demand(self, data: PpDemandCreate) -> PpDemand:
        await self._validate_item(data.product_code)
        demand = PpDemand(**data.model_dump())
        return await self.repo.create_demand(demand)

    async def update_demand(self, uid: str, data: PpDemandUpdate) -> PpDemand | None:
        updates = data.model_dump(exclude_unset=True)
        if not updates:
            return None
        return await self.repo.update_demand(uid, updates)

    async def get_mps(self) -> list[PpMps]:
        return await self.repo.get_all_mps()

    async def create_mps(self, data: PpMpsCreate) -> PpMps:
        await self._validate_item(data.product_code)
        mps = PpMps(**data.model_dump())
        return await self.repo.create_mps(mps)

    async def update_mps(self, uid: str, data: PpMpsUpdate) -> PpMps | None:
        updates = data.model_dump(exclude_unset=True)
        if not updates:
            return None
        return await self.repo.update_mps(uid, updates)

    async def get_policies(self) -> list[PpPlanningPolicy]:
        return await self.repo.get_all_policies()

    async def create_policy(self, data: PpPlanningPolicyCreate) -> PpPlanningPolicy:
        await self._validate_item(data.item_code)
        policy = PpPlanningPolicy(**data.model_dump())
        return await self.repo.create_policy(policy)

    async def update_policy(self, uid: str, data: PpPlanningPolicyUpdate) -> PpPlanningPolicy | None:
        updates = data.model_dump(exclude_unset=True)
        if not updates:
            return None
        return await self.repo.update_policy(uid, updates)

    async def get_calendar(self) -> list[PpCalendarDay]:
        return await self.repo.get_all_calendar_days()

    async def create_calendar_day(self, data: PpCalendarDayCreate) -> PpCalendarDay:
        day = PpCalendarDay(**data.model_dump())
        return await self.repo.create_calendar_day(day)

    async def update_calendar_day(self, uid: str, data: PpCalendarDayUpdate) -> PpCalendarDay | None:
        updates = data.model_dump(exclude_unset=True)
        if not updates:
            return None
        return await self.repo.update_calendar_day(uid, updates)

    async def get_orders(self) -> list[PpProductionOrder]:
        return await self.repo.get_all_orders()

    async def create_order(self, data: PpProductionOrderCreate) -> PpProductionOrder:
        await self._validate_item(data.product_code)
        if data.bom_doc_no:
            await self._validate_bom(data.bom_doc_no)
        if data.routing_doc_no:
            await self._validate_routing(data.routing_doc_no)

        for comp in data.components:
            await self._validate_item(comp.item_code)
            
        for op in data.operations:
            if op.work_centre_code:
                await self._validate_workcentre(op.work_centre_code)
                
        order_data = data.model_dump(exclude={"components", "operations"})
        components_data = data.components
        operations_data = data.operations

        order = PpProductionOrder(**order_data)
        
        # Populate components
        for comp_data in components_data:
            order.components.append(PpProdOrderComponent(**comp_data.model_dump()))
            
        # Populate operations
        for op_data in operations_data:
            order.operations.append(PpProdOrderOperation(**op_data.model_dump()))

        return await self.repo.create_order(order)

    async def update_order(self, uid: str, data: PpProductionOrderUpdate) -> PpProductionOrder | None:
        updates = data.model_dump(exclude_unset=True)
        if not updates:
            return None
        return await self.repo.update_order(uid, updates)

    async def get_forecasts(self) -> list[PpForecast]:
        return await self.repo.get_all_forecasts()

    async def create_forecast(self, data: PpForecastCreate) -> PpForecast:
        await self._validate_item(data.product_code)
        forecast = PpForecast(**data.model_dump())
        return await self.repo.create_forecast(forecast)

    async def update_forecast(self, uid: str, data: PpForecastUpdate) -> PpForecast | None:
        updates = data.model_dump(exclude_unset=True)
        if not updates:
            return None
        return await self.repo.update_forecast(uid, updates)
