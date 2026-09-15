"""Releasing a production order onto the shop floor.

Release is the moment planning hands work to the floor, and it is the step that
was missing: the order's status could be set to RELEASED from a browser, but no
work order was ever created, so the floor never saw it.

What release does, in one transaction:

  1. Check the order may be released at all, server-side.
  2. Read the routing snapshot already on the order — `pp_prod_order_operation`,
     copied from the live routing when the order was raised. The live routing is
     deliberately *not* re-read: an order is built to the engineering it was cut
     against.
  3. Write one `prd_work_order` per operation, carrying that snapshot.
  4. Move the order to RELEASED.

Repeating a release is refused rather than duplicating work orders.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.errors import (
    BusinessRuleViolationError,
    InvalidStateTransitionError,
    NotFoundError,
)
from app.core.time import utcnow
from app.modules.planning.infrastructure.models import PpProdOrderOperation, PpProductionOrder
from app.modules.production.infrastructure.models import PrdWorkOrder

#: A production order may be released from these, and from nothing else.
RELEASABLE = frozenset({"PLANNED", "FIRM_PLANNED"})

RULE = "V6-PRD-BR"


class ProductionReleaseService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    def _audit(self, obj: Any, now: Any) -> Any:
        obj.company_id = self.ctx.company_id
        obj.branch_id = self.ctx.branch_id
        obj.created_at = now
        obj.created_by = self.ctx.user_id
        obj.updated_at = now
        obj.updated_by = self.ctx.user_id
        obj.version = 1
        return obj

    async def _order(self, uid: str, *, lock: bool = False) -> PpProductionOrder:
        stmt = select(PpProductionOrder).where(
            PpProductionOrder.uid == uid,
            PpProductionOrder.company_id == self.ctx.company_id,
            PpProductionOrder.deleted_at.is_(None),
        )
        if lock:
            stmt = stmt.with_for_update()
        order = (await self.session.execute(stmt)).scalar_one_or_none()
        if order is None:
            raise NotFoundError("Production order not found.")
        return order

    async def _next_work_order_no(self) -> str:
        """WO/<yy-yy>/<6 digits>, continuing the series already on disk."""
        highest = (
            await self.session.execute(
                text(
                    "SELECT MAX(CAST(SUBSTRING_INDEX(doc_no, '/', -1) AS UNSIGNED))"
                    " FROM prd_work_order WHERE company_id = :cid"
                ),
                {"cid": self.ctx.company_id},
            )
        ).scalar()
        today = utcnow().date()
        fy = today.year % 100 if today.month >= 4 else (today.year - 1) % 100
        return f"WO/{fy:02d}-{fy + 1:02d}/{int(highest or 0) + 1:06d}"

    async def release(self, uid: str) -> Dict[str, Any]:
        order = await self._order(uid, lock=True)

        if order.status not in RELEASABLE:
            raise InvalidStateTransitionError(
                f"{order.doc_no} is {order.status} and cannot be released.",
                current_status=order.status,
                allowed=sorted(RELEASABLE),
            )

        # Already-released work is the signal that a repeat is a mistake, not a
        # reason to write a second set of work orders.
        existing = (
            await self.session.execute(
                select(func.count())
                .select_from(PrdWorkOrder)
                .where(
                    PrdWorkOrder.order_id == order.id,
                    PrdWorkOrder.company_id == self.ctx.company_id,
                    PrdWorkOrder.deleted_at.is_(None),
                )
            )
        ).scalar() or 0
        if existing:
            raise BusinessRuleViolationError(
                f"{order.doc_no} already has {existing} work order(s) on the floor. "
                "Releasing again would duplicate them.",
                rule_code=f"{RULE}-001",
            )

        if not (order.bom_doc_no or "").strip():
            raise BusinessRuleViolationError(
                f"{order.doc_no} carries no bill of material, so the material it needs "
                "is unknown. Raise the order from planning against a live BOM.",
                rule_code=f"{RULE}-002",
            )

        operations = (
            (
                await self.session.execute(
                    select(PpProdOrderOperation)
                    .where(
                        PpProdOrderOperation.order_id == order.id,
                        PpProdOrderOperation.company_id == self.ctx.company_id,
                        PpProdOrderOperation.deleted_at.is_(None),
                    )
                    .order_by(PpProdOrderOperation.seq)
                )
            )
            .scalars()
            .all()
        )
        if not operations:
            raise BusinessRuleViolationError(
                f"{order.doc_no} has no routing operations, so there is nothing for the "
                "floor to do. A routing must be live when the order is raised.",
                rule_code=f"{RULE}-003",
            )

        now = utcnow()
        qty = Decimal(str(order.qty))
        created: List[str] = []

        for index, op in enumerate(operations):
            doc_no = await self._next_work_order_no()
            work_order = self._audit(
                PrdWorkOrder(
                    doc_no=doc_no,
                    order_id=order.id,
                    order_doc_no=order.doc_no,
                    product_code=order.product_code,
                    product_name=order.product_name or order.product_code,
                    uom=order.uom or "NOS",
                    seq=op.seq,
                    operation_code=op.operation_code or "",
                    operation_name=op.operation_name or op.operation_code or "",
                    work_centre_code=op.work_centre_code or "",
                    machine_code=op.machine_code or None,
                    tool_code=op.tool_code or None,
                    operators=int(op.operators or 1),
                    skill=op.skill or "",
                    setup_minutes_std=float(op.setup_minutes or 0),
                    run_minutes_std=float(op.run_minutes or 0),
                    qc_checkpoint=bool(op.qc_checkpoint),
                    # Only the first operation has material to work on. Every
                    # later one is fed by the good quantity of the one before it,
                    # which is what stops 500 flowing through an operation that
                    # only produced 490.
                    input_qty=float(qty) if index == 0 else 0,
                    planned_qty=float(qty),
                    produced_qty=0,
                    scrap_qty=0,
                    rework_qty=0,
                    status="READY" if index == 0 else "QUEUED",
                    qc_result="PENDING" if op.qc_checkpoint else "NOT_REQUIRED",
                    planned_start=str(op.planned_start or ""),
                    planned_finish=str(op.planned_finish or ""),
                    batch_no=order.doc_no,
                ),
                now,
            )
            self.session.add(work_order)
            await self.session.flush()
            created.append(doc_no)

        order.status = "RELEASED"
        order.updated_at = now
        order.updated_by = self.ctx.user_id
        order.version = (order.version or 1) + 1
        await self.session.flush()

        return {
            "uid": order.uid,
            "docNo": order.doc_no,
            "status": order.status,
            "productCode": order.product_code,
            "quantity": float(qty),
            "workOrders": created,
            "firstOperation": created[0] if created else None,
        }
