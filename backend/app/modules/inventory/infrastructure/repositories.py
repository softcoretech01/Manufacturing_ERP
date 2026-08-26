from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.inventory.infrastructure.models import InvBin, InvZone


class ZoneRepository(BaseRepository[InvZone]):
    model = InvZone

    async def list_for_warehouse(self, warehouse_id: int) -> list[InvZone]:
        stmt = (
            self.base_query()
            .where(InvZone.warehouse_id == warehouse_id)
            .order_by(InvZone.pick_sequence, InvZone.code)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def code_exists(
        self, code: str, *, warehouse_id: int, exclude_uid: str | None = None
    ) -> bool:
        stmt = self.base_query().where(
            func.lower(InvZone.code) == code.lower(),
            InvZone.warehouse_id == warehouse_id,
        )
        if exclude_uid:
            stmt = stmt.where(InvZone.uid != exclude_uid)
        return (await self.session.execute(select(stmt.exists()))).scalar() or False

    async def count_bins(self, zone_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(InvBin)
            .where(InvBin.zone_id == zone_id, InvBin.deleted_at.is_(None))
        )
        result = await self.session.execute(
            select(func.count()).select_from(stmt.subquery())
        )
        return int(result.scalar_one())


class BinRepository(BaseRepository[InvBin]):
    model = InvBin

    def base_query(self, *, include_deleted: bool = False):
        return super().base_query(include_deleted=include_deleted).options(
            selectinload(InvBin.zone)
        )

    async def code_exists(
        self, code: str, *, warehouse_id: int, exclude_uid: str | None = None
    ) -> bool:
        stmt = self.base_query().where(
            func.lower(InvBin.code) == code.lower(),
            InvBin.warehouse_id == warehouse_id,
        )
        if exclude_uid:
            stmt = stmt.where(InvBin.uid != exclude_uid)
        return (await self.session.execute(select(stmt.exists()))).scalar() or False

    async def count_for_warehouse(self, warehouse_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(InvBin)
            .where(
                InvBin.company_id == self.ctx.company_id,
                InvBin.warehouse_id == warehouse_id,
                InvBin.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(
            select(func.count()).select_from(stmt.subquery())
        )
        return int(result.scalar_one())
