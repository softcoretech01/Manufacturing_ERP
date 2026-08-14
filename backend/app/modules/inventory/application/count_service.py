"""Physical inventory — cycle count & verification (SRS Vol 4 Ch 8), on the engine.

Flow: create (snapshot the system quantity into blind lines) → record counts →
submit (COUNTED, variances become visible) → approve (post reconciling movements
through the stock engine, immutable). Key rules honoured here:
  - blind (BR-002): system_qty is not returned while status is COUNTING,
  - SoD (FR-013): the approver must differ from the counter,
  - posting writes movements per variance line at the current valuation rate.

Deferred (flagged, not silently dropped): two-pass recount + tolerance, freeze
during a full verification, event-triggered count plan / ABC frequency,
found-stock quarantine, value-scaled approval matrix.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.context import TenantContext
from app.core.enums import AuditAction, CountStatus, CountType, MovementDirection
from app.core.errors import (
    BusinessRuleViolationError,
    InvalidStateTransitionError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.time import utcnow
from app.modules.inventory.application.stock_service import StockService
from app.modules.inventory.infrastructure.models import (
    InvStockBalance,
    InvStockCount,
    InvStockCountLine,
)
from app.modules.masters.infrastructure.models import MstItem
from app.modules.numbering.application.service import NumberingService
from app.modules.organisation.infrastructure.models import SysWarehouse


class CountService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.stock = StockService(session, ctx)
        self.numbering = NumberingService(session, ctx)

    def _stamp_new(self, e: Any) -> None:
        now = utcnow()
        e.company_id = self.ctx.company_id
        e.created_at = now
        e.updated_at = now
        e.created_by = self.ctx.user_id
        e.updated_by = self.ctx.user_id
        e.version = 1

    async def _get(self, uid: str) -> InvStockCount:
        row = (
            await self.session.execute(
                select(InvStockCount).where(
                    InvStockCount.uid == uid,
                    InvStockCount.company_id == self.ctx.company_id,
                    InvStockCount.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Count '{uid}' not found")
        return row

    async def _lines(self, count_id: int) -> list[InvStockCountLine]:
        rows = await self.session.execute(
            select(InvStockCountLine)
            .where(InvStockCountLine.count_id == count_id, InvStockCountLine.deleted_at.is_(None))
            .order_by(InvStockCountLine.item_code)
        )
        return list(rows.scalars().all())

    # ── create (snapshot) ────────────────────────────────────────────────────
    async def create(
        self, *, warehouse_uid: str, count_type: str = CountType.CYCLE.value,
        item_uid: str | None = None, remarks: str | None = None,
    ) -> InvStockCount:
        wh = (
            await self.session.execute(
                select(SysWarehouse).where(
                    SysWarehouse.uid == warehouse_uid,
                    SysWarehouse.company_id == self.ctx.company_id,
                    SysWarehouse.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if wh is None:
            raise NotFoundError(f"Warehouse '{warehouse_uid}' not found")

        # Snapshot the current balances for this warehouse (optionally one item).
        stmt = (
            select(InvStockBalance, MstItem)
            .join(MstItem, MstItem.id == InvStockBalance.item_id)
            .where(
                InvStockBalance.company_id == self.ctx.company_id,
                InvStockBalance.warehouse_id == wh.id,
            )
        )
        if item_uid:
            item = await self.stock._item(item_uid)
            stmt = stmt.where(InvStockBalance.item_id == item.id)
        balances = (await self.session.execute(stmt)).all()
        if not balances:
            raise ValidationFailedError(
                f"Warehouse '{wh.code}' has no stock to count.",
                errors=[{"field": "warehouse_uid", "code": "empty", "message": "No stock"}],
            )

        doc_type = (
            "PHYSICAL_VERIFICATION" if count_type == CountType.FULL.value else "CYCLE_COUNT"
        )
        alloc = await self.numbering.allocate(
            document_type=doc_type, entity_type=doc_type, entity_label=f"Count {wh.code}"
        )
        count = InvStockCount(
            document_no=alloc["number"], warehouse_id=wh.id, warehouse_code=wh.code,
            count_type=count_type, status=CountStatus.COUNTING.value, count_date=utcnow().date(),
            remarks=remarks, counted_by=self.ctx.user_id, counted_by_name=self.ctx.user_name,
        )
        self._stamp_new(count)
        self.session.add(count)
        await self.session.flush()

        for bal, item in balances:
            line = InvStockCountLine(
                count_id=count.id, item_id=item.id, item_code=item.code, item_name=item.name,
                uom=item.base_uom, bin_id=bal.bin_id, batch_no=bal.batch_no,
                stock_status=bal.stock_status, system_qty=float(bal.quantity),
            )
            self._stamp_new(line)
            self.session.add(line)
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.CREATE, entity_type="inv_stock_count",
            entity_id=count.id, entity_uid=count.uid, document_no=count.document_no,
            new_values={"warehouse": wh.code, "lines": len(balances)},
        )
        return count

    # ── record counts (blind entry) ──────────────────────────────────────────
    async def record_counts(
        self, uid: str, entries: list[dict[str, Any]]
    ) -> InvStockCount:
        count = await self._get(uid)
        if count.status != CountStatus.COUNTING.value:
            raise InvalidStateTransitionError(
                "Counts can only be entered while the count is in progress.",
                current_status=count.status,
            )
        by_uid = {ln.uid: ln for ln in await self._lines(count.id)}
        for e in entries:
            ln = by_uid.get(e["line_uid"])
            if ln is None:
                continue
            cq = e.get("counted_qty")
            ln.counted_qty = float(cq) if cq is not None else None
            if "reason_code" in e:
                ln.reason_code = e["reason_code"]
            if "root_cause" in e:
                ln.root_cause = e["root_cause"]
            if "remarks" in e:
                ln.remarks = e["remarks"]
            ln.updated_at = utcnow()
            ln.updated_by = self.ctx.user_id
        await self.session.flush()
        return count

    # ── submit (→ COUNTED, variances visible) ────────────────────────────────
    async def submit(self, uid: str) -> InvStockCount:
        count = await self._get(uid)
        if count.status != CountStatus.COUNTING.value:
            raise InvalidStateTransitionError(
                "Only an in-progress count can be submitted.", current_status=count.status
            )
        lines = await self._lines(count.id)
        uncounted = [ln for ln in lines if ln.counted_qty is None]
        if uncounted:
            raise ValidationFailedError(
                f"{len(uncounted)} line(s) not counted. Enter a quantity for every line "
                "(0 for an empty location).",
                errors=[{"field": "lines", "code": "incomplete",
                         "message": f"{len(uncounted)} uncounted"}],
            )
        for ln in lines:
            ln.variance = float(Decimal(str(ln.counted_qty)) - Decimal(str(ln.system_qty)))
            ln.updated_at = utcnow()
            ln.updated_by = self.ctx.user_id
        count.status = CountStatus.COUNTED.value
        count.submitted_at = utcnow()
        count.version += 1
        count.updated_at = utcnow()
        count.updated_by = self.ctx.user_id
        await self.session.flush()
        return count

    # ── approve (post reconciling movements) ─────────────────────────────────
    async def approve(self, uid: str) -> dict[str, Any]:
        count = await self._get(uid)
        if count.status != CountStatus.COUNTED.value:
            raise InvalidStateTransitionError(
                "Only a submitted (counted) count can be approved.", current_status=count.status
            )
        # SoD (V4-CNT-FR-013): the approver cannot be the counter.
        if count.counted_by == self.ctx.user_id:
            raise BusinessRuleViolationError(
                "You counted this stock — a different user must approve the variance "
                "(segregation of duties).",
                rule_code="V4-CNT-FR-013",
            )
        doc_type = (
            "PHYSICAL_VERIFICATION" if count.count_type == CountType.FULL.value else "CYCLE_COUNT"
        )
        lines = await self._lines(count.id)
        items = {
            it.id: it
            for it in (
                await self.session.execute(
                    select(MstItem).where(MstItem.id.in_([ln.item_id for ln in lines] or [0]))
                )
            ).scalars().all()
        }
        posted = 0
        net_value = Decimal("0")
        for ln in lines:
            if ln.counted_qty is None:
                continue
            # Reconcile against the CURRENT system quantity (may differ from the
            # snapshot if stock moved since counting).
            current = (
                await self.session.execute(
                    select(func.coalesce(InvStockBalance.quantity, 0)).where(
                        InvStockBalance.company_id == self.ctx.company_id,
                        InvStockBalance.item_id == ln.item_id,
                        InvStockBalance.warehouse_id == count.warehouse_id,
                        InvStockBalance.bin_id == ln.bin_id,
                        InvStockBalance.batch_no == ln.batch_no,
                        InvStockBalance.stock_status == ln.stock_status,
                    )
                )
            ).scalar() or 0
            delta = Decimal(str(ln.counted_qty)) - Decimal(str(current))
            if delta == 0:
                continue
            direction = MovementDirection.IN.value if delta > 0 else MovementDirection.OUT.value
            led = await self.stock.post_movement(
                item=items[ln.item_id], warehouse_id=count.warehouse_id, bin_id=ln.bin_id,
                batch_no=ln.batch_no, stock_status=ln.stock_status, direction=direction,
                quantity=abs(delta), movement_type="COUNT", document_type=doc_type,
                document_no=count.document_no, line_ref=ln.item_code,
                remarks=ln.reason_code or "count reconciliation",
            )
            net_value += Decimal(str(led.value)) * (Decimal("1") if delta > 0 else Decimal("-1"))
            posted += 1

        count.status = CountStatus.POSTED.value
        count.approved_by = self.ctx.user_id
        count.approved_at = utcnow()
        count.version += 1
        count.updated_at = utcnow()
        count.updated_by = self.ctx.user_id
        await self.session.flush()
        await record_audit(
            self.session, self.ctx, action=AuditAction.APPROVE, entity_type="inv_stock_count",
            entity_id=count.id, entity_uid=count.uid, document_no=count.document_no,
            new_values={"movements": posted, "net_value": float(net_value)},
        )
        return {"document_no": count.document_no, "movements_posted": posted,
                "net_value": float(net_value), "status": count.status}

    async def cancel(self, uid: str) -> InvStockCount:
        count = await self._get(uid)
        if count.status == CountStatus.POSTED.value:
            raise InvalidStateTransitionError(
                "A posted count is immutable — correct it with an adjustment.",
                current_status=count.status,
            )
        count.status = CountStatus.CANCELLED.value
        count.version += 1
        count.updated_at = utcnow()
        count.updated_by = self.ctx.user_id
        await self.session.flush()
        return count

    # ── reads ────────────────────────────────────────────────────────────────
    async def list_counts(
        self, *, status: str | None = None, count_type: str | None = None
    ) -> list[dict[str, Any]]:
        stmt = select(InvStockCount).where(
            InvStockCount.company_id == self.ctx.company_id, InvStockCount.deleted_at.is_(None)
        )
        if status:
            stmt = stmt.where(InvStockCount.status == status)
        if count_type:
            stmt = stmt.where(InvStockCount.count_type == count_type)
        stmt = stmt.order_by(InvStockCount.created_at.desc())
        counts = list((await self.session.execute(stmt)).scalars().all())
        out = []
        for c in counts:
            lines = await self._lines(c.id)
            variance_lines = [ln for ln in lines if ln.variance is not None and ln.variance != 0]
            out.append(
                {
                    "count": c, "line_count": len(lines),
                    "variance_lines": len(variance_lines),
                    "counted": sum(1 for ln in lines if ln.counted_qty is not None),
                }
            )
        return out

    async def get_detail(self, uid: str) -> dict[str, Any]:
        count = await self._get(uid)
        lines = await self._lines(count.id)
        blind = count.status == CountStatus.COUNTING.value
        return {
            "count": count,
            "blind": blind,
            "lines": [
                {
                    "uid": ln.uid, "item_code": ln.item_code, "item_name": ln.item_name,
                    "uom": ln.uom, "batch_no": ln.batch_no, "stock_status": ln.stock_status,
                    # Blind (BR-002): hide system_qty + variance until submitted.
                    "system_qty": None if blind else float(ln.system_qty),
                    "counted_qty": float(ln.counted_qty) if ln.counted_qty is not None else None,
                    "variance": None if blind or ln.variance is None else float(ln.variance),
                    "reason_code": ln.reason_code, "root_cause": ln.root_cause,
                    "remarks": ln.remarks,
                }
                for ln in lines
            ],
        }
