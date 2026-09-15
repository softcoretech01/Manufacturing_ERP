"""What actually happens on the floor.

The bill of material says what is required, the routing says how it is made, the
work centre says where — and this service records what happened. It owns four
things and nothing else:

  * the operation lifecycle (start, pause, resume, complete, hold, cancel),
  * production entries, which are the only source of produced and scrap figures,
  * material consumption and the finished-goods receipt, both posted through the
    inventory module's own engine so the stock ledger is the single truth,
  * closing the production order once the floor has genuinely finished.

Two rules run through all of it. A quantity only ever moves forward from the
good quantity of the operation before it, so an operation that produced 490 of
500 feeds 490 onward. And every posting is a row: nothing is a counter held in a
browser, and a mistake is reversed rather than edited.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import MovementDirection
from app.core.errors import (
    BusinessRuleViolationError,
    InvalidStateTransitionError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.time import utcnow
from app.modules.inventory.application.stock_service import StockService
from app.modules.masters.infrastructure.models import MstItem
from app.modules.planning.application.conversion_service import ConversionService
from app.modules.planning.infrastructure.models import PpProdOrderComponent, PpProductionOrder
from app.modules.production.infrastructure.models import (
    PrdProductionEntry,
    PrdProductionEntryScrap,
    PrdScrap,
    PrdWorkOrder,
)

RULE = "V6-PRD-BR"

#: Where an operation may go next. Anything not listed is refused.
TRANSITIONS: dict[str, frozenset[str]] = {
    "QUEUED": frozenset({"READY", "CANCELLED", "HOLD"}),
    "READY": frozenset({"RUNNING", "HOLD", "CANCELLED"}),
    "RUNNING": frozenset({"PAUSED", "COMPLETED", "QC_HOLD", "HOLD"}),
    "PAUSED": frozenset({"RUNNING", "HOLD", "CANCELLED"}),
    "HOLD": frozenset({"READY", "RUNNING", "CANCELLED"}),
    "QC_HOLD": frozenset({"COMPLETED", "HOLD", "CANCELLED"}),
    "COMPLETED": frozenset(),
    "CANCELLED": frozenset(),
}

#: An operation that has finished producing, whether or not QC has cleared it.
FINISHED = frozenset({"COMPLETED", "CANCELLED"})

#: States in which an operation may still be moved to another machine or shift.
OPEN_FOR_ASSIGNMENT = ("QUEUED", "READY", "PAUSED", "HOLD")

#: Document types written to the stock ledger, so production movements are
#: distinguishable from purchase and transfer movements in every stock report.
ISSUE_DOC_TYPE = "PRODUCTION_ISSUE"
RECEIPT_DOC_TYPE = "PRODUCTION_RECEIPT"


def _d(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _q(value: Any) -> str:
    """A quantity as an operator would read it: 500, not 500.000000."""
    d = _d(value).normalize()
    return f"{d:f}"


class ProductionExecutionService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.stock = StockService(session, ctx)

    # ── helpers ─────────────────────────────────────────────────────────────

    def _audit(self, obj: Any, now: Any) -> Any:
        obj.company_id = self.ctx.company_id
        obj.branch_id = self.ctx.branch_id
        obj.created_at = now
        obj.created_by = self.ctx.user_id
        obj.updated_at = now
        obj.updated_by = self.ctx.user_id
        obj.version = 1
        return obj

    async def _work_order(self, uid: str, *, lock: bool = False) -> PrdWorkOrder:
        stmt = select(PrdWorkOrder).where(
            PrdWorkOrder.uid == uid,
            PrdWorkOrder.company_id == self.ctx.company_id,
            PrdWorkOrder.deleted_at.is_(None),
        )
        if lock:
            stmt = stmt.with_for_update()
        wo = (await self.session.execute(stmt)).scalar_one_or_none()
        if wo is None:
            raise NotFoundError("Work order not found.")
        return wo

    async def _order(self, order_id: int, *, lock: bool = False) -> PpProductionOrder:
        stmt = select(PpProductionOrder).where(
            PpProductionOrder.id == order_id,
            PpProductionOrder.company_id == self.ctx.company_id,
        )
        if lock:
            stmt = stmt.with_for_update()
        order = (await self.session.execute(stmt)).scalar_one_or_none()
        if order is None:
            raise NotFoundError("Production order not found.")
        return order

    async def _siblings(self, order_id: int) -> List[PrdWorkOrder]:
        return list(
            (
                await self.session.execute(
                    select(PrdWorkOrder)
                    .where(
                        PrdWorkOrder.order_id == order_id,
                        PrdWorkOrder.company_id == self.ctx.company_id,
                        PrdWorkOrder.deleted_at.is_(None),
                    )
                    .order_by(PrdWorkOrder.seq)
                )
            )
            .scalars()
            .all()
        )

    def _move(self, wo: PrdWorkOrder, to: str) -> None:
        allowed = TRANSITIONS.get(wo.status, frozenset())
        if to not in allowed:
            raise InvalidStateTransitionError(
                f"{wo.doc_no} is {wo.status}; it cannot become {to}.",
                current_status=wo.status,
                allowed=sorted(allowed),
            )
        wo.status = to

    async def _next_doc_no(self, table: str, prefix: str, width: int) -> str:
        highest = (
            await self.session.execute(
                text(
                    f"SELECT MAX(CAST(SUBSTRING_INDEX(doc_no, '/', -1) AS UNSIGNED))"
                    f" FROM {table} WHERE company_id = :cid"
                ),
                {"cid": self.ctx.company_id},
            )
        ).scalar()
        today = utcnow().date()
        fy = today.year % 100 if today.month >= 4 else (today.year - 1) % 100
        return f"{prefix}/{fy:02d}-{fy + 1:02d}/{int(highest or 0) + 1:0{width}d}"

    # ── the queue ───────────────────────────────────────────────────────────

    async def queue(self, *, work_centre: str = "", status: str = "") -> List[Dict[str, Any]]:
        """Released work, in sequence, with the reason anything is not startable."""
        stmt = (
            select(PrdWorkOrder)
            .where(
                PrdWorkOrder.company_id == self.ctx.company_id,
                PrdWorkOrder.deleted_at.is_(None),
            )
            .order_by(PrdWorkOrder.order_doc_no, PrdWorkOrder.seq)
        )
        if work_centre:
            stmt = stmt.where(PrdWorkOrder.work_centre_code == work_centre)
        if status:
            stmt = stmt.where(PrdWorkOrder.status == status)
        rows = list((await self.session.execute(stmt)).scalars().all())

        by_order: dict[int, List[PrdWorkOrder]] = {}
        for wo in rows:
            by_order.setdefault(wo.order_id, []).append(wo)

        out: List[Dict[str, Any]] = []
        for wo in rows:
            previous = [s for s in by_order.get(wo.order_id, []) if s.seq < wo.seq]
            blocked_by = next(
                (p for p in sorted(previous, key=lambda p: p.seq) if p.status not in FINISHED),
                None,
            )
            out.append(
                {
                    "uid": wo.uid,
                    "docNo": wo.doc_no,
                    "orderDocNo": wo.order_doc_no,
                    "productCode": wo.product_code,
                    "productName": wo.product_name,
                    "seq": wo.seq,
                    "operationCode": wo.operation_code,
                    "operationName": wo.operation_name,
                    "workCentreCode": wo.work_centre_code,
                    "machineCode": wo.machine_code,
                    "toolCode": wo.tool_code,
                    "skill": wo.skill,
                    "operators": wo.operators,
                    "status": wo.status,
                    "qcCheckpoint": bool(wo.qc_checkpoint),
                    "qcResult": wo.qc_result,
                    "uom": wo.uom,
                    "inputQty": float(wo.input_qty or 0),
                    "plannedQty": float(wo.planned_qty or 0),
                    "producedQty": float(wo.produced_qty or 0),
                    "scrapQty": float(wo.scrap_qty or 0),
                    "reworkQty": float(wo.rework_qty or 0),
                    "setupMinutesStd": float(wo.setup_minutes_std or 0),
                    "runMinutesStd": float(wo.run_minutes_std or 0),
                    "setupMinutesAct": float(wo.setup_minutes_act or 0),
                    "runMinutesAct": float(wo.run_minutes_act or 0),
                    "operatorName": wo.operator_name,
                    "shiftCode": wo.shift_code,
                    "batchNo": wo.batch_no,
                    "plannedStart": wo.planned_start,
                    "plannedFinish": wo.planned_finish,
                    "startedAt": wo.started_at.isoformat() if wo.started_at else None,
                    "completedAt": wo.completed_at.isoformat() if wo.completed_at else None,
                    "remarks": wo.remarks,
                    # Readiness, computed rather than stored: an operation waits
                    # for the one before it, and for whatever input it was given.
                    "blockedBy": blocked_by.doc_no if blocked_by else None,
                    "blockedReason": (
                        f"Waiting on operation {blocked_by.seq} ({blocked_by.operation_name}), "
                        f"which is {blocked_by.status.lower().replace('_', ' ')}."
                        if blocked_by
                        else ("Nothing has been passed to this operation yet."
                              if float(wo.input_qty or 0) <= 0 and wo.status not in FINISHED
                              else None)
                    ),
                    "canStart": (
                        blocked_by is None
                        and float(wo.input_qty or 0) > 0
                        and wo.status in ("READY", "PAUSED")
                    ),
                }
            )
        return out

    # ── lifecycle ───────────────────────────────────────────────────────────

    async def start(self, uid: str, *, machine_code: str = "", shift_code: str = "") -> Dict[str, Any]:
        wo = await self._work_order(uid, lock=True)
        siblings = await self._siblings(wo.order_id)
        blocker = next(
            (s for s in siblings if s.seq < wo.seq and s.status not in FINISHED), None
        )
        if blocker is not None:
            raise BusinessRuleViolationError(
                f"Operation {blocker.seq} ({blocker.operation_name}) is {blocker.status.lower()}. "
                f"{wo.doc_no} cannot start until it finishes.",
                rule_code=f"{RULE}-010",
            )
        if _d(wo.input_qty) <= 0:
            raise BusinessRuleViolationError(
                f"{wo.doc_no} has nothing to work on: the previous operation has passed "
                "no quantity to it.",
                rule_code=f"{RULE}-011",
            )

        self._move(wo, "RUNNING")
        now = utcnow()
        if wo.started_at is None:
            wo.started_at = now
        # The operator is whoever the token says is asking, never a typed name.
        wo.operator_code = str(self.ctx.user_id)
        wo.operator_name = self.ctx.user_name
        if machine_code:
            wo.machine_code = machine_code
        if shift_code:
            wo.shift_code = shift_code
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1
        await self._touch_order_in_progress(wo.order_id, now)
        await self.session.flush()
        return self._state(wo)

    async def assign(
        self, uid: str, *, machine_code: str = "", shift_code: str = ""
    ) -> Dict[str, Any]:
        """Put an operation on a machine and a shift before it runs.

        Assignment is a plan, not a record of work: it says where the operation
        should go, and it can be changed until the operation starts. The
        operator is deliberately not part of it — `start` records whoever
        actually signed in and pressed start, and a name typed in advance would
        be contradicted the moment someone else ran the job.

        A machine that is already running another operation is refused, because
        one machine cannot run two jobs at once.
        """
        wo = await self._work_order(uid, lock=True)
        if wo.status in FINISHED:
            raise InvalidStateTransitionError(
                f"{wo.doc_no} is {wo.status.lower()} and can no longer be assigned.",
                current_status=wo.status,
                allowed=list(OPEN_FOR_ASSIGNMENT),
            )
        if wo.status == "RUNNING":
            raise BusinessRuleViolationError(
                f"{wo.doc_no} is running. Pause it before moving it to another machine.",
                rule_code=f"{RULE}-012",
            )

        if machine_code:
            await self._check_machine_free(machine_code, wo)
            wo.machine_code = machine_code
        if shift_code:
            wo.shift_code = shift_code

        now = utcnow()
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1
        await self.session.flush()
        return self._state(wo)

    async def _check_machine_free(self, machine_code: str, wo: PrdWorkOrder) -> None:
        """Refuse a machine that is mid-job on something else."""
        busy = (
            await self.session.execute(
                select(PrdWorkOrder).where(
                    PrdWorkOrder.company_id == self.ctx.company_id,
                    PrdWorkOrder.deleted_at.is_(None),
                    PrdWorkOrder.machine_code == machine_code,
                    PrdWorkOrder.status == "RUNNING",
                    PrdWorkOrder.id != wo.id,
                )
            )
        ).scalars().first()
        if busy is not None:
            raise BusinessRuleViolationError(
                f"{machine_code} is running {busy.doc_no} ({busy.operation_name}). "
                "Finish or pause that operation first.",
                rule_code=f"{RULE}-013",
            )

    async def pause(self, uid: str, *, reason: str = "") -> Dict[str, Any]:
        return await self._simple_move(uid, "PAUSED", remarks=reason)

    async def resume(self, uid: str) -> Dict[str, Any]:
        wo = await self._work_order(uid, lock=True)
        if wo.status not in ("PAUSED", "HOLD"):
            raise InvalidStateTransitionError(
                f"{wo.doc_no} is {wo.status}; only a paused or held operation resumes.",
                current_status=wo.status,
                allowed=["PAUSED", "HOLD"],
            )
        self._move(wo, "RUNNING")
        now = utcnow()
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1
        await self.session.flush()
        return self._state(wo)

    async def hold(self, uid: str, *, reason: str) -> Dict[str, Any]:
        if not reason.strip():
            raise ValidationFailedError(
                "A hold needs a reason.",
                errors=[{"field": "reason", "code": "required", "message": "Say why."}],
            )
        return await self._simple_move(uid, "HOLD", remarks=reason)

    async def cancel(self, uid: str, *, reason: str) -> Dict[str, Any]:
        if not reason.strip():
            raise ValidationFailedError(
                "Cancelling an operation needs a reason.",
                errors=[{"field": "reason", "code": "required", "message": "Say why."}],
            )
        wo = await self._work_order(uid, lock=True)
        self._move(wo, "CANCELLED")
        now = utcnow()
        wo.cancel_reason = reason.strip()[:300]
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1
        await self.session.flush()
        return self._state(wo)

    async def _simple_move(self, uid: str, to: str, *, remarks: str = "") -> Dict[str, Any]:
        wo = await self._work_order(uid, lock=True)
        self._move(wo, to)
        now = utcnow()
        if remarks:
            wo.remarks = remarks.strip()[:400]
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1
        await self.session.flush()
        return self._state(wo)

    def _state(self, wo: PrdWorkOrder) -> Dict[str, Any]:
        return {
            "uid": wo.uid,
            "docNo": wo.doc_no,
            "orderDocNo": wo.order_doc_no,
            "seq": wo.seq,
            "status": wo.status,
            "qcResult": wo.qc_result,
            "inputQty": float(wo.input_qty or 0),
            "producedQty": float(wo.produced_qty or 0),
            "scrapQty": float(wo.scrap_qty or 0),
            "reworkQty": float(wo.rework_qty or 0),
            "operatorName": wo.operator_name,
            "machineCode": wo.machine_code,
            "startedAt": wo.started_at.isoformat() if wo.started_at else None,
            "completedAt": wo.completed_at.isoformat() if wo.completed_at else None,
        }

    async def _touch_order_in_progress(self, order_id: int, now: Any) -> None:
        order = await self._order(order_id)
        if order.status == "RELEASED":
            order.status = "IN_PROGRESS"
            order.updated_at = now
            order.updated_by = self.ctx.user_id
            order.version = (order.version or 1) + 1

    # ── production entry ────────────────────────────────────────────────────

    async def record_production(
        self,
        uid: str,
        *,
        good_qty: Decimal,
        scrap_qty: Decimal = Decimal("0"),
        rework_qty: Decimal = Decimal("0"),
        started_at: Optional[Any] = None,
        ended_at: Optional[Any] = None,
        business_date: Optional[date] = None,
        machine_code: str = "",
        shift_code: str = "",
        scrap_reason: str = "",
        defect_code: str = "",
        remarks: str = "",
    ) -> Dict[str, Any]:
        """Book what an operation produced. This is the only source of quantities."""
        wo = await self._work_order(uid, lock=True)

        if wo.status not in ("RUNNING", "PAUSED"):
            raise BusinessRuleViolationError(
                f"{wo.doc_no} is {wo.status}. Start the operation before booking against it.",
                rule_code=f"{RULE}-020",
            )

        good, scrap, rework = _d(good_qty), _d(scrap_qty), _d(rework_qty)
        if min(good, scrap, rework) < 0:
            raise ValidationFailedError(
                "Quantities cannot be negative.",
                errors=[{"field": "goodQty", "code": "negative", "message": "Zero or more."}],
            )
        booked = good + scrap + rework
        if booked <= 0:
            raise ValidationFailedError(
                "Book at least one piece — good, scrap or rework.",
                errors=[{"field": "goodQty", "code": "required", "message": "Nothing booked."}],
            )
        if scrap > 0 and not scrap_reason.strip():
            raise ValidationFailedError(
                "Scrap needs a reason.",
                errors=[{"field": "scrapReason", "code": "required", "message": "Say why."}],
            )

        already = _d(wo.produced_qty) + _d(wo.scrap_qty) + _d(wo.rework_qty)
        remaining = _d(wo.input_qty) - already
        if booked > remaining:
            raise BusinessRuleViolationError(
                f"{wo.doc_no} received {_q(wo.input_qty)} {wo.uom} and {_q(already)} is already "
                f"accounted for. Only {_q(remaining)} remains; {_q(booked)} was booked.",
                rule_code=f"{RULE}-021",
            )

        now = utcnow()
        entry_no = await self._next_doc_no("prd_production_entry", "PE", 6)
        entry = self._audit(
            PrdProductionEntry(
                doc_no=entry_no,
                work_order_id=wo.id,
                work_order_doc_no=wo.doc_no,
                order_id=wo.order_id,
                order_doc_no=wo.order_doc_no,
                product_code=wo.product_code,
                seq=wo.seq,
                operation_code=wo.operation_code,
                operation_name=wo.operation_name,
                work_centre_code=wo.work_centre_code,
                machine_code=machine_code or wo.machine_code,
                operator_code=str(self.ctx.user_id),
                operator_name=self.ctx.user_name,
                shift_code=shift_code or wo.shift_code,
                business_date=business_date or now.date(),
                started_at=started_at,
                ended_at=ended_at,
                good_qty=float(good),
                scrap_qty=float(scrap),
                rework_qty=float(rework),
                uom=wo.uom,
                batch_no=wo.batch_no,
                status="POSTED",
                posted_at=now,
                posted_by=self.ctx.user_id,
                remarks=remarks[:400],
            ),
            now,
        )
        self.session.add(entry)
        await self.session.flush()

        if scrap > 0:
            self.session.add(
                self._audit(
                    PrdProductionEntryScrap(
                        entry_id=entry.id,
                        defect_code=defect_code[:30],
                        defect_name="",
                        qty=float(scrap),
                        reason=scrap_reason.strip()[:300],
                    ),
                    now,
                )
            )
            scrap_no = await self._next_doc_no("prd_scrap", "SCR", 5)
            self.session.add(
                self._audit(
                    PrdScrap(
                        doc_no=scrap_no,
                        source="PRODUCTION",
                        business_date=business_date or now.date(),
                        order_id=wo.order_id,
                        order_doc_no=wo.order_doc_no,
                        work_order_id=wo.id,
                        work_order_doc_no=wo.doc_no,
                        entry_id=entry.id,
                        entry_doc_no=entry.doc_no,
                        seq=wo.seq,
                        operation_name=wo.operation_name,
                        work_centre_code=wo.work_centre_code,
                        machine_code=machine_code or wo.machine_code,
                        operator_name=self.ctx.user_name,
                        shift_code=shift_code or wo.shift_code,
                        item_code=wo.product_code,
                        item_name=wo.product_name,
                        uom=wo.uom,
                        batch_no=wo.batch_no,
                        qty=float(scrap),
                        defect_code=defect_code[:30],
                        reason=scrap_reason.strip()[:300],
                        disposition="PENDING",
                        status="OPEN",
                    ),
                    now,
                )
            )

        wo.produced_qty = float(_d(wo.produced_qty) + good)
        wo.scrap_qty = float(_d(wo.scrap_qty) + scrap)
        wo.rework_qty = float(_d(wo.rework_qty) + rework)
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1
        await self.session.flush()

        return {
            "entryDocNo": entry.doc_no,
            "workOrder": self._state(wo),
            "remainingToBook": float(_d(wo.input_qty) - (_d(wo.produced_qty) + _d(wo.scrap_qty) + _d(wo.rework_qty))),
        }

    # ── completing an operation ─────────────────────────────────────────────

    async def complete(self, uid: str) -> Dict[str, Any]:
        """Finish an operation and pass its good quantity to the next one."""
        wo = await self._work_order(uid, lock=True)
        if wo.status not in ("RUNNING", "PAUSED"):
            raise InvalidStateTransitionError(
                f"{wo.doc_no} is {wo.status} and cannot be completed.",
                current_status=wo.status,
                allowed=["RUNNING", "PAUSED"],
            )
        if _d(wo.produced_qty) + _d(wo.scrap_qty) + _d(wo.rework_qty) <= 0:
            raise BusinessRuleViolationError(
                f"Nothing has been booked against {wo.doc_no}. Record production before "
                "completing the operation — the quantity has to come from somewhere.",
                rule_code=f"{RULE}-022",
            )

        now = utcnow()
        siblings = await self._siblings(wo.order_id)
        nxt = next((s for s in siblings if s.seq > wo.seq), None)

        if wo.qc_checkpoint and wo.qc_result not in ("PASS", "NOT_REQUIRED"):
            # A checkpoint operation stops here. Quality decides whether the
            # quantity moves on; nothing is passed forward on an unchecked lot.
            self._move(wo, "QC_HOLD")
            wo.qc_result = "PENDING"
            wo.updated_at = now
            wo.updated_by = self.ctx.user_id
            wo.version = (wo.version or 1) + 1
            await self.session.flush()
            return {
                "workOrder": self._state(wo),
                "awaitingQc": True,
                "next": None,
                "finishedGoods": None,
            }

        return await self._finish(wo, nxt, now)

    async def _finish(
        self, wo: PrdWorkOrder, nxt: Optional[PrdWorkOrder], now: Any
    ) -> Dict[str, Any]:
        """Close the operation, hand the good quantity on, receive if it is last."""
        if wo.status != "COMPLETED":
            self._move(wo, "COMPLETED")
        wo.completed_at = now
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1

        good = _d(wo.produced_qty)
        receipt: Optional[Dict[str, Any]] = None

        if nxt is not None:
            # The next operation receives exactly what passed this one.
            nxt.input_qty = float(good)
            nxt.status = "READY" if good > 0 else "QUEUED"
            nxt.updated_at = now
            nxt.updated_by = self.ctx.user_id
            nxt.version = (nxt.version or 1) + 1
        else:
            receipt = await self._receive_finished_goods(wo, good, now)

        await self.session.flush()
        return {
            "workOrder": self._state(wo),
            "awaitingQc": False,
            "next": {"docNo": nxt.doc_no, "seq": nxt.seq, "inputQty": float(good)} if nxt else None,
            "finishedGoods": receipt,
        }

    # ── quality ─────────────────────────────────────────────────────────────

    async def record_qc(
        self, uid: str, *, result: str, inspection_doc_no: str = "", note: str = ""
    ) -> Dict[str, Any]:
        """Record the quality decision on a checkpoint operation.

        The decision itself belongs to the Quality module. This links it to the
        work order and lets the quantity move on, or stops it. An inspection
        number, when given, is checked against `ERP_Quality.Inspection` rather
        than invented here.
        """
        result = (result or "").upper()
        if result not in ("PASS", "FAIL", "REWORK", "HOLD"):
            raise ValidationFailedError(
                f"'{result}' is not a quality decision this system records.",
                errors=[{"field": "result", "code": "invalid", "message": "PASS, FAIL, REWORK or HOLD."}],
            )

        wo = await self._work_order(uid, lock=True)
        if not wo.qc_checkpoint:
            raise BusinessRuleViolationError(
                f"{wo.doc_no} carries no QC checkpoint, so there is no decision to record.",
                rule_code=f"{RULE}-030",
            )
        if wo.status not in ("QC_HOLD", "RUNNING", "PAUSED"):
            raise InvalidStateTransitionError(
                f"{wo.doc_no} is {wo.status}; a quality decision applies to an operation "
                "waiting on inspection.",
                current_status=wo.status,
                allowed=["QC_HOLD", "RUNNING", "PAUSED"],
            )

        if inspection_doc_no.strip():
            exists = (
                await self.session.execute(
                    text(
                        "SELECT COUNT(*) FROM ERP_Quality.Inspection"
                        " WHERE DocNo = :doc AND DeletedAt IS NULL"
                    ),
                    {"doc": inspection_doc_no.strip()},
                )
            ).scalar() or 0
            if not exists:
                raise ValidationFailedError(
                    f"Inspection {inspection_doc_no.strip()} does not exist in Quality.",
                    errors=[{"field": "inspectionDocNo", "code": "not_found", "message": "Unknown inspection."}],
                )

        now = utcnow()
        wo.qc_result = result
        if note or inspection_doc_no:
            wo.remarks = f"{inspection_doc_no.strip()} {note}".strip()[:400]
        wo.updated_at = now
        wo.updated_by = self.ctx.user_id
        wo.version = (wo.version or 1) + 1

        if result != "PASS":
            # FAIL, REWORK and HOLD all stop the lot here. Nothing moves on.
            if wo.status != "QC_HOLD":
                self._move(wo, "QC_HOLD")
            await self.session.flush()
            return {"workOrder": self._state(wo), "released": False, "next": None, "finishedGoods": None}

        siblings = await self._siblings(wo.order_id)
        nxt = next((s for s in siblings if s.seq > wo.seq), None)
        outcome = await self._finish(wo, nxt, now)
        outcome["released"] = True
        return outcome

    # ── material ────────────────────────────────────────────────────────────

    async def issue_material(
        self, order_uid: str, *, warehouse_uid: str, work_order_uid: str = "", remarks: str = ""
    ) -> Dict[str, Any]:
        """Consume the order's components from stock, once.

        Quantities come from `pp_prod_order_component.required_qty`, which the
        order already holds: the bill exploded at the revision the order was cut
        against, scrap percentage included. Each component is issued through the
        inventory module's own posting engine, so the stock ledger, the balance
        and the moving average are all maintained by the module that owns them.
        """
        order = await self._order_by_uid(order_uid, lock=True)
        if order.status not in ("RELEASED", "IN_PROGRESS"):
            raise BusinessRuleViolationError(
                f"{order.doc_no} is {order.status}. Material is issued to released work.",
                rule_code=f"{RULE}-040",
            )

        warehouse_id = await self._warehouse_id(warehouse_uid)
        components = list(
            (
                await self.session.execute(
                    select(PpProdOrderComponent)
                    .where(
                        PpProdOrderComponent.order_id == order.id,
                        PpProdOrderComponent.company_id == self.ctx.company_id,
                        PpProdOrderComponent.deleted_at.is_(None),
                    )
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        if not components:
            raise BusinessRuleViolationError(
                f"{order.doc_no} has no components, so there is nothing to issue.",
                rule_code=f"{RULE}-041",
            )

        outstanding = [c for c in components if _d(c.required_qty) > _d(c.issued_qty)]
        if not outstanding:
            # Re-posting the same issue is refused rather than doubling the draw.
            raise BusinessRuleViolationError(
                f"Every component of {order.doc_no} has already been issued in full.",
                rule_code=f"{RULE}-042",
            )

        now = utcnow()
        issued: List[Dict[str, Any]] = []
        for component in outstanding:
            qty = _d(component.required_qty) - _d(component.issued_qty)
            item = await self._item_by_code(component.item_code)
            ledger = await self.stock.post_movement(
                item=item,
                warehouse_id=warehouse_id,
                direction=MovementDirection.OUT.value,
                quantity=qty,
                movement_type="ISSUE",
                document_type=ISSUE_DOC_TYPE,
                document_no=order.doc_no,
                line_ref=work_order_uid or component.item_code,
                business_date=now.date(),
                remarks=remarks or f"Consumed by {order.doc_no}",
            )
            component.issued_qty = float(_d(component.issued_qty) + qty)
            component.updated_at = now
            component.updated_by = self.ctx.user_id
            component.version = (component.version or 1) + 1
            issued.append(
                {
                    "itemCode": component.item_code,
                    "quantity": float(qty),
                    "rate": float(ledger.rate or 0),
                    "value": float(ledger.value or 0),
                    "balanceAfter": float(ledger.balance_qty_after or 0),
                }
            )

        # The reservation has now been spent. Planning holds it on both the
        # component and the stock balance, so it is planning's own service that
        # gives it back — otherwise the shelf keeps showing stock as spoken for
        # after it has physically left, and free stock reads low by the issued
        # amount for the rest of the order's life.
        released = await ConversionService(self.session, self.ctx).release_components(order_uid)

        await self.session.flush()
        return {
            "orderDocNo": order.doc_no,
            "documentType": ISSUE_DOC_TYPE,
            "components": issued,
            "totalValue": round(sum(i["value"] for i in issued), 2),
            "reservationReleased": released["released_qty"],
        }

    async def _receive_finished_goods(
        self, wo: PrdWorkOrder, good: Decimal, now: Any
    ) -> Optional[Dict[str, Any]]:
        """Take the finished quantity into stock at the end of the last operation.

        Posted as a production receipt, never through the purchase receipt path:
        this stock came off the floor, not from a supplier. It is valued at the
        order's estimated unit cost, which is what the roll-up published.
        """
        if good <= 0:
            return None

        order = await self._order(wo.order_id, lock=True)
        warehouse_id = await self._warehouse_id(order.warehouse or "")
        if warehouse_id is None:
            raise BusinessRuleViolationError(
                f"{order.doc_no} names no warehouse, so its output has nowhere to go. "
                "Set the receiving warehouse on the order.",
                rule_code=f"{RULE}-050",
            )

        item = await self._item_by_code(wo.product_code)
        ledger = await self.stock.post_movement(
            item=item,
            warehouse_id=warehouse_id,
            direction=MovementDirection.IN.value,
            quantity=good,
            rate=_d(order.estimated_unit_cost),
            movement_type="RECEIPT",
            document_type=RECEIPT_DOC_TYPE,
            document_no=order.doc_no,
            line_ref=wo.doc_no,
            batch_no=wo.batch_no or "",
            business_date=now.date(),
            remarks=f"Produced on {wo.doc_no}",
        )

        order.produced_qty = float(_d(order.produced_qty) + good)
        order.updated_at = now
        order.updated_by = self.ctx.user_id
        order.version = (order.version or 1) + 1

        return {
            "documentType": RECEIPT_DOC_TYPE,
            "documentNo": order.doc_no,
            "itemCode": wo.product_code,
            "quantity": float(good),
            "rate": float(ledger.rate or 0),
            "balanceAfter": float(ledger.balance_qty_after or 0),
        }

    # ── closing the order ───────────────────────────────────────────────────

    async def complete_order(self, order_uid: str) -> Dict[str, Any]:
        """Close a production order, but only once the floor has actually finished."""
        order = await self._order_by_uid(order_uid, lock=True)
        if order.status in ("COMPLETED", "CLOSED"):
            raise InvalidStateTransitionError(
                f"{order.doc_no} is already {order.status}.",
                current_status=order.status,
                allowed=["IN_PROGRESS"],
            )

        work_orders = await self._siblings(order.id)
        if not work_orders:
            raise BusinessRuleViolationError(
                f"{order.doc_no} has no work orders. It was never released.",
                rule_code=f"{RULE}-060",
            )

        blockers: List[str] = []
        for wo in work_orders:
            if wo.status not in FINISHED:
                blockers.append(f"{wo.doc_no} (operation {wo.seq}) is {wo.status.lower()}")
            if wo.qc_checkpoint and wo.qc_result not in ("PASS", "NOT_REQUIRED"):
                blockers.append(f"{wo.doc_no} has not passed inspection ({wo.qc_result.lower()})")
        if _d(order.produced_qty) <= 0:
            blockers.append("nothing has been received into finished goods")
        if blockers:
            raise BusinessRuleViolationError(
                f"{order.doc_no} cannot be completed: " + "; ".join(blockers) + ".",
                rule_code=f"{RULE}-061",
            )

        now = utcnow()
        scrap_total = sum(_d(wo.scrap_qty) for wo in work_orders)
        order.rejected_qty = float(scrap_total)
        order.status = "COMPLETED"
        order.updated_at = now
        order.updated_by = self.ctx.user_id
        order.version = (order.version or 1) + 1
        await self.session.flush()

        return {
            "docNo": order.doc_no,
            "status": order.status,
            "orderedQty": float(_d(order.qty)),
            "producedQty": float(_d(order.produced_qty)),
            "scrapQty": float(scrap_total),
            "operations": len(work_orders),
        }

    # ── lookups ─────────────────────────────────────────────────────────────

    async def _order_by_uid(self, uid: str, *, lock: bool = False) -> PpProductionOrder:
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

    async def _item_by_code(self, code: str) -> MstItem:
        item = (
            await self.session.execute(
                select(MstItem).where(
                    MstItem.code == code,
                    MstItem.company_id == self.ctx.company_id,
                    MstItem.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if item is None:
            raise NotFoundError(
                f"'{code}' is on the order but not in the item master, so its stock "
                "cannot be moved."
            )
        return item

    async def _warehouse_id(self, warehouse: str) -> Optional[int]:
        """Resolve a warehouse by uid or by code; the order stores a code."""
        if not warehouse:
            return None
        row = (
            await self.session.execute(
                text(
                    "SELECT id FROM sys_warehouse"
                    " WHERE company_id = :cid AND deleted_at IS NULL"
                    "   AND (uid = :key OR code = :key OR name = :key) LIMIT 1"
                ),
                {"cid": self.ctx.company_id, "key": warehouse},
            )
        ).scalar()
        if row is None:
            raise NotFoundError(f"Warehouse '{warehouse}' not found.")
        return int(row)
