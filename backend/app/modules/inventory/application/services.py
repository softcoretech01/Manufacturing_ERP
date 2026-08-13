"""Inventory storage-structure services (SRS Vol 4 Ch 1).

Zones and bins sit under a warehouse owned by the Organisation module; that
warehouse is resolved through Organisation's published application service — never
by importing its models (CLAUDE.md §3.3). Bulk bin generation (V4-WHS-FR-007) is
delegated to the `sp_generate_bins` stored procedure so a 700-bin store is created
in one round-trip rather than 700 inserts.
"""

from __future__ import annotations

from typing import Any, ClassVar

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import codegen
from app.core.audit import diff, record_audit
from app.core.context import TenantContext
from app.core.enums import AuditAction, BinStatus
from app.core.errors import (
    BusinessRuleViolationError,
    DuplicateError,
    ValidationFailedError,
)
from app.core.pagination import ListSpec, PageParams
from app.core.time import utcnow
from app.modules.inventory.infrastructure import models as m
from app.modules.inventory.infrastructure import repositories as repo
from app.modules.organisation.application.services import WarehouseService

MAX_BULK_BINS = 5000  # SRS V4-WHS validation #9 — bulk generation guard.


def _snapshot(entity: Any, fields: list[str]) -> dict[str, Any]:
    return {f: getattr(entity, f) for f in fields}


async def _resolve_warehouse(session: AsyncSession, ctx: TenantContext, warehouse_uid: str):
    """Resolve a warehouse the caller owns, or 404 (V0-IR-011). Cross-module read
    via Organisation's application service."""
    return await WarehouseService(session, ctx).get(warehouse_uid)


# ─────────────────────────── Zone ────────────────────────────────────────────
class ZoneService:
    AUDITED: ClassVar[list[str]] = ["code", "name", "zone_type", "pick_sequence", "is_active"]

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.ZoneRepository(session, ctx)

    async def list_for_warehouse(self, warehouse_uid: str) -> list[m.InvZone]:
        warehouse = await _resolve_warehouse(self.session, self.ctx, warehouse_uid)
        return await self.repo.list_for_warehouse(warehouse.id)

    async def get(self, uid: str) -> m.InvZone:
        return await self.repo.get_by_uid_or_404(uid)

    async def next_code(self, warehouse_uid: str) -> str:
        # Scope the sequence per company; ZN prefix keeps zone codes recognisable.
        return await codegen.next_code(
            self.session, m.InvZone, "ZN", company_id=self.ctx.company_id, width=3
        )

    async def create(self, data: Any) -> m.InvZone:
        warehouse = await _resolve_warehouse(self.session, self.ctx, data.warehouse_uid)
        code = (data.code or "").strip().upper() or await self.next_code(data.warehouse_uid)
        if await self.repo.code_exists(code, warehouse_id=warehouse.id):
            raise DuplicateError(
                f"Zone code '{code}' already exists in this warehouse.", rule_code="V4-WHS-FR-001"
            )
        payload = data.model_dump(exclude={"warehouse_uid"})
        payload["code"] = code
        entity = m.InvZone(
            company_id=self.ctx.company_id, warehouse_id=warehouse.id, **payload
        )
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="inv_zone",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.InvZone:
        entity = await self.repo.get_by_uid_or_404(uid)
        before = _snapshot(entity, self.AUDITED)
        for key, value in data.model_dump(exclude_unset=True, exclude={"version"}).items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="inv_zone",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.InvZone:
        entity = await self.repo.get_by_uid_or_404(uid)
        if await self.repo.count_bins(entity.id):
            raise BusinessRuleViolationError(
                "Zone cannot be deactivated while it still contains bins.",
                rule_code="V4-WHS-BR-002",
            )
        entity.is_active = False
        self.repo.stamp_update(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="inv_zone",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        return entity

    async def restore(self, uid: str) -> m.InvZone:
        entity = await self.repo.get_by_uid_or_404(uid)
        if entity.is_active:
            raise BusinessRuleViolationError("Zone is already active.")
        entity.is_active = True
        self.repo.stamp_update(entity, expected_version=None)
        await self.repo.flush()
        return entity


# ─────────────────────────── Bin ─────────────────────────────────────────────
class BinService:
    AUDITED: ClassVar[list[str]] = [
        "code",
        "bin_type",
        "pick_sequence",
        "mixing_allowed",
        "status",
        "is_active",
    ]
    SPEC = ListSpec(
        sortable={
            "code": m.InvBin.code,
            "pick_sequence": m.InvBin.pick_sequence,
            "id": m.InvBin.id,
        },
        searchable=[m.InvBin.code],
    )

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.BinRepository(session, ctx)

    async def list_page(
        self, params: PageParams, *, warehouse_uid: str, zone_uid: str | None
    ) -> tuple[list[m.InvBin], int]:
        warehouse = await _resolve_warehouse(self.session, self.ctx, warehouse_uid)
        stmt = self.repo.base_query().where(m.InvBin.warehouse_id == warehouse.id)
        if zone_uid:
            zone = await repo.ZoneRepository(self.session, self.ctx).get_by_uid_or_404(zone_uid)
            stmt = stmt.where(m.InvBin.zone_id == zone.id)
        stmt = self.SPEC.apply_search(stmt, params.q)
        total = await self.repo.count(stmt)
        stmt = self.SPEC.apply_sort(stmt, params.sort)
        rows = await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size)
        return rows, total

    async def get(self, uid: str) -> m.InvBin:
        return await self.repo.get_by_uid_or_404(uid)

    async def _resolve_zone_id(self, warehouse_id: int, zone_uid: str | None) -> int | None:
        if not zone_uid:
            return None
        zone = await repo.ZoneRepository(self.session, self.ctx).get_by_uid_or_404(zone_uid)
        if zone.warehouse_id != warehouse_id:
            raise ValidationFailedError(
                "Zone does not belong to this warehouse.",
                errors=[{"field": "zone_uid", "code": "mismatch", "message": "Zone/warehouse"}],
            )
        return zone.id

    async def create(self, data: Any) -> m.InvBin:
        warehouse = await _resolve_warehouse(self.session, self.ctx, data.warehouse_uid)
        zone_id = await self._resolve_zone_id(warehouse.id, data.zone_uid)
        code = (data.code or "").strip().upper()
        if not code:
            raise ValidationFailedError(
                "Bin code is required.",
                errors=[{"field": "code", "code": "required", "message": "Enter a bin address"}],
            )
        if await self.repo.code_exists(code, warehouse_id=warehouse.id):
            raise DuplicateError(
                f"Bin code '{code}' already exists in this warehouse.", rule_code="V4-WHS-VAL-1"
            )
        payload = data.model_dump(exclude={"warehouse_uid", "zone_uid"})
        payload["code"] = code
        entity = m.InvBin(
            company_id=self.ctx.company_id, warehouse_id=warehouse.id, zone_id=zone_id, **payload
        )
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="inv_bin",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.InvBin:
        entity = await self.repo.get_by_uid_or_404(uid)
        before = _snapshot(entity, self.AUDITED)
        payload = data.model_dump(exclude_unset=True, exclude={"version", "zone_uid"})
        
        if "zone_uid" in data.model_fields_set:
            entity.zone_id = await self._resolve_zone_id(entity.warehouse_id, data.zone_uid)
            
        if "code" in payload:
            code = (payload["code"] or "").strip().upper()
            if not code:
                raise ValidationFailedError(
                    "Bin code is required.",
                    errors=[
                        {"field": "code", "code": "required", "message": "Enter a bin address"}
                    ],
                )
            if code != entity.code and await self.repo.code_exists(
                code, warehouse_id=entity.warehouse_id
            ):
                raise DuplicateError(
                    f"Bin code '{code}' already exists in this warehouse.", rule_code="V4-WHS-VAL-1"
                )
            payload["code"] = code
            
        for key, value in payload.items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="inv_bin",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        return entity

    async def block(self, uid: str, version: int, reason: str) -> m.InvBin:
        entity = await self.repo.get_by_uid_or_404(uid)
        entity.status = BinStatus.BLOCKED.value
        entity.block_reason = reason
        self.repo.stamp_update(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="inv_bin",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=f"block: {reason}",
        )
        return entity

    async def unblock(self, uid: str, version: int) -> m.InvBin:
        entity = await self.repo.get_by_uid_or_404(uid)
        entity.status = BinStatus.AVAILABLE.value
        entity.block_reason = None
        self.repo.stamp_update(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="inv_bin",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason="unblock",
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.InvBin:
        entity = await self.repo.get_by_uid_or_404(uid)
        # V4-WHS-BR-002 — a bin holding stock cannot be deactivated. Stock lives in
        # a later slice; when it exists this guard checks on-hand > 0 first.
        entity.is_active = False
        entity.status = BinStatus.INACTIVE.value
        self.repo.stamp_update(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="inv_bin",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        return entity

    async def restore(self, uid: str) -> m.InvBin:
        entity = await self.repo.get_by_uid_or_404(uid)
        entity.is_active = True
        entity.status = BinStatus.AVAILABLE.value
        self.repo.stamp_update(entity, expected_version=None)
        await self.repo.flush()
        return entity

    async def bulk_generate(self, data: Any) -> dict[str, int]:
        """Generate a rack structure via the `sp_generate_bins` procedure.

        Codes follow `{AISLE}-{RACK}-{LEVEL}-{POS}` (e.g. A-01-1-1). Duplicates are
        skipped by the procedure (INSERT IGNORE on the unique key), so re-running is
        safe. Returns how many were requested, created and skipped.
        """
        warehouse = await _resolve_warehouse(self.session, self.ctx, data.warehouse_uid)
        zone_id = await self._resolve_zone_id(warehouse.id, data.zone_uid)
        total = data.aisles * data.racks * data.levels * data.positions
        if total <= 0:
            raise ValidationFailedError(
                "Every dimension must be at least 1.",
                errors=[{"field": "aisles", "code": "invalid", "message": "Ranges must be ≥ 1"}],
            )
        if total > MAX_BULK_BINS:
            raise BusinessRuleViolationError(
                f"That pattern would create {total:,} bins; the limit is {MAX_BULK_BINS:,}. "
                "Split it across zones or reduce the ranges.",
                rule_code="V4-WHS-VAL-9",
            )

        before = await self.repo.count_for_warehouse(warehouse.id)
        await self.session.execute(
            text(
                "CALL sp_generate_bins("
                ":company_id, :warehouse_id, :zone_id, :aisles, :racks, :levels, "
                ":positions, :bin_type, :user_id)"
            ),
            {
                "company_id": self.ctx.company_id,
                "warehouse_id": warehouse.id,
                "zone_id": zone_id,
                "aisles": data.aisles,
                "racks": data.racks,
                "levels": data.levels,
                "positions": data.positions,
                "bin_type": getattr(data.bin_type, "value", data.bin_type),
                "user_id": self.ctx.user_id,
            },
        )
        await self.session.flush()
        after = await self.repo.count_for_warehouse(warehouse.id)
        created = after - before
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="inv_bin",
            entity_id=warehouse.id,
            entity_uid=warehouse.uid,
            new_values={"requested": total, "created": created, "generated_at": str(utcnow())},
            reason="bulk bin generation",
        )
        return {"requested": total, "created": created, "skipped": total - created}
