"""Item master CRUD (SRS §5.1 generic master pattern)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.context import TenantContext
from app.core.enums import AuditAction
from app.core.errors import (
    BusinessRuleViolationError,
    ConcurrentModificationError,
    DuplicateError,
    NotFoundError,
)
from app.core.time import utcnow
from app.modules.masters.infrastructure.models import MstItem


class ItemService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    def _scoped(self):
        return select(MstItem).where(
            MstItem.company_id == self.ctx.company_id, MstItem.deleted_at.is_(None)
        )

    async def list_page(
        self, *, item_type: str | None = None, active_only: bool = False, search: str | None = None
    ) -> list[MstItem]:
        stmt = self._scoped()
        if item_type:
            stmt = stmt.where(MstItem.item_type == item_type)
        if active_only:
            stmt = stmt.where(MstItem.is_active.is_(True))
        if search:
            like = f"%{search}%"
            stmt = stmt.where((MstItem.code.ilike(like)) | (MstItem.name.ilike(like)))
        stmt = stmt.order_by(MstItem.code)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_or_404(self, uid: str) -> MstItem:
        row: MstItem | None = (
            await self.session.execute(self._scoped().where(MstItem.uid == uid))
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Item '{uid}' not found")
        return row

    async def _assert_unique_code(self, code: str, *, exclude_uid: str | None = None) -> None:
        stmt = self._scoped().where(func.lower(MstItem.code) == code.lower())
        if exclude_uid:
            stmt = stmt.where(MstItem.uid != exclude_uid)
        if (await self.session.execute(select(stmt.exists()))).scalar():
            raise DuplicateError(f"Item code '{code}' already exists.")

    def _stamp_new(self, e: MstItem) -> None:
        now = utcnow()
        e.company_id = self.ctx.company_id
        e.created_at = now
        e.updated_at = now
        e.created_by = self.ctx.user_id
        e.updated_by = self.ctx.user_id
        e.version = 1

    async def create(self, data: dict[str, Any]) -> MstItem:
        code = data["code"].strip().upper()
        await self._assert_unique_code(code)
        item = MstItem(**{k: v for k, v in data.items() if hasattr(MstItem, k)})
        item.code = code
        self._stamp_new(item)
        self.session.add(item)
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.CREATE, entity_type="mst_item",
            entity_id=item.id, entity_uid=item.uid,
            new_values={"code": item.code, "name": item.name},
        )
        return item

    async def update(self, uid: str, data: dict[str, Any], *, expected_version: int) -> MstItem:
        item = await self.get_or_404(uid)
        if item.version != expected_version:
            raise ConcurrentModificationError(
                "Item was modified by another user.",
                extra={"current_version": item.version, "your_version": expected_version},
            )
        # code is immutable after creation (it's referenced by ledger rows).
        for k, v in data.items():
            if k in ("code", "id", "uid", "version") or not hasattr(MstItem, k):
                continue
            setattr(item, k, v)
        item.version += 1
        item.updated_at = utcnow()
        item.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.UPDATE, entity_type="mst_item",
            entity_id=item.id, entity_uid=item.uid, new_values={"name": item.name},
        )
        return item

    async def set_active(self, uid: str, active: bool) -> MstItem:
        item = await self.get_or_404(uid)
        if not active:
            # Where-used check (§5.1): don't deactivate an item that still has stock.
            from app.modules.inventory.infrastructure.models import InvStockBalance

            on_hand = (
                await self.session.execute(
                    select(func.coalesce(func.sum(InvStockBalance.quantity), 0)).where(
                        InvStockBalance.company_id == self.ctx.company_id,
                        InvStockBalance.item_id == item.id,
                    )
                )
            ).scalar() or 0
            if on_hand and float(on_hand) != 0:
                raise BusinessRuleViolationError(
                    f"Item '{item.code}' still holds {on_hand} in stock. "
                    "Issue or write it off before deactivating.",
                    rule_code="V4-STK",
                )
        item.is_active = active
        item.version += 1
        item.updated_at = utcnow()
        item.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.UPDATE, entity_type="mst_item",
            entity_id=item.id, entity_uid=item.uid,
            reason="deactivate" if not active else "restore",
        )
        return item
