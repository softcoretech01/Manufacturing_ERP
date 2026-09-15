"""Read-only projections of what the floor has actually recorded.

Nothing here writes. Every figure is read from a row the floor put there —
`prd_production_entry` for output, `prd_production_entry_scrap` and `prd_scrap`
for rejects, `prd_work_order` for where the work has got to — or derived from
those rows by arithmetic that is stated in the docstring.

Where a figure cannot be derived from a row, this service returns it as `None`
and says so in an `unavailable` list, rather than returning a plausible number.
A shop-floor screen that shows an invented figure is worse than one that shows a
gap, because the gap prompts someone to go and measure.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.errors import NotFoundError, ValidationFailedError
from app.modules.planning.infrastructure.models import (
    PpProdOrderComponent,
    PpProdOrderOperation,
    PpProductionOrder,
)
from app.modules.production.infrastructure.models import (
    PrdProductionEntry,
    PrdProductionEntryScrap,
    PrdScrap,
    PrdWorkOrder,
)

#: An operation that is neither finished nor cancelled still holds its pieces.
OPEN_STATES = ("QUEUED", "READY", "RUNNING", "PAUSED", "HOLD", "QC_HOLD")
FINISHED_STATES = ("COMPLETED", "CANCELLED")


def _f(v: Any) -> float:
    return float(v or 0)


def _iso(v: Any) -> Optional[str]:
    return v.isoformat() if v is not None else None


class ShopFloorQueryService:
    """Everything the shop-floor screens read, and nothing they write."""

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    # ── Production entries ──────────────────────────────────────────────────

    async def entries(
        self,
        *,
        order_doc_no: str = "",
        work_order_doc_no: str = "",
        work_centre: str = "",
        shift: str = "",
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        """Bookings, newest first, with the defect breakdown each one carries."""
        stmt = (
            select(PrdProductionEntry)
            .where(
                PrdProductionEntry.company_id == self.ctx.company_id,
                PrdProductionEntry.deleted_at.is_(None),
            )
            .order_by(PrdProductionEntry.business_date.desc(), PrdProductionEntry.id.desc())
            .limit(min(limit, 1000))
        )
        if order_doc_no:
            stmt = stmt.where(PrdProductionEntry.order_doc_no == order_doc_no)
        if work_order_doc_no:
            stmt = stmt.where(PrdProductionEntry.work_order_doc_no == work_order_doc_no)
        if work_centre:
            stmt = stmt.where(PrdProductionEntry.work_centre_code == work_centre)
        if shift:
            stmt = stmt.where(PrdProductionEntry.shift_code == shift)
        if from_date:
            stmt = stmt.where(PrdProductionEntry.business_date >= from_date)
        if to_date:
            stmt = stmt.where(PrdProductionEntry.business_date <= to_date)

        rows = list((await self.session.execute(stmt)).scalars().all())
        if not rows:
            return []

        defects = await self._defects_by_entry([r.id for r in rows])
        return [
            {
                "uid": r.uid,
                "docNo": r.doc_no,
                "workOrderDocNo": r.work_order_doc_no,
                "orderDocNo": r.order_doc_no,
                "productCode": r.product_code,
                "seq": r.seq,
                "operationCode": r.operation_code,
                "operationName": r.operation_name,
                "workCentreCode": r.work_centre_code,
                "machineCode": r.machine_code,
                "operatorCode": r.operator_code,
                "operatorName": r.operator_name,
                "shiftCode": r.shift_code,
                "businessDate": _iso(r.business_date),
                "startedAt": _iso(r.started_at),
                "endedAt": _iso(r.ended_at),
                "goodQty": _f(r.good_qty),
                "scrapQty": _f(r.scrap_qty),
                "reworkQty": _f(r.rework_qty),
                "uom": r.uom,
                "setupMinutes": _f(r.setup_minutes),
                "runMinutes": _f(r.run_minutes),
                "downMinutes": _f(r.down_minutes),
                "batchNo": r.batch_no,
                "status": r.status,
                "postedAt": _iso(r.posted_at),
                "isReversal": bool(r.is_reversal),
                "reversalOfDocNo": r.reversal_of_doc_no or None,
                "remarks": r.remarks,
                "defects": defects.get(r.id, []),
            }
            for r in rows
        ]

    async def _defects_by_entry(self, entry_ids: List[int]) -> Dict[int, List[Dict[str, Any]]]:
        if not entry_ids:
            return {}
        rows = list(
            (
                await self.session.execute(
                    select(PrdProductionEntryScrap).where(
                        PrdProductionEntryScrap.entry_id.in_(entry_ids),
                        PrdProductionEntryScrap.deleted_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        out: Dict[int, List[Dict[str, Any]]] = {}
        for r in rows:
            out.setdefault(r.entry_id, []).append(
                {
                    "defectCode": r.defect_code,
                    "defectName": r.defect_name,
                    "qty": _f(r.qty),
                    "reason": r.reason,
                }
            )
        return out

    # ── Scrap ───────────────────────────────────────────────────────────────

    async def scrap(
        self,
        *,
        order_doc_no: str = "",
        work_centre: str = "",
        disposition: str = "",
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        limit: int = 200,
    ) -> Dict[str, Any]:
        """Scrap documents, with the totals the header strip shows.

        `unit_cost` is whatever was recorded on the scrap document. It is not
        recalculated here: this is a report, and re-costing a posted document in
        a report would make the screen disagree with the ledger.
        """
        stmt = (
            select(PrdScrap)
            .where(PrdScrap.company_id == self.ctx.company_id, PrdScrap.deleted_at.is_(None))
            .order_by(PrdScrap.business_date.desc(), PrdScrap.id.desc())
            .limit(min(limit, 1000))
        )
        if order_doc_no:
            stmt = stmt.where(PrdScrap.order_doc_no == order_doc_no)
        if work_centre:
            stmt = stmt.where(PrdScrap.work_centre_code == work_centre)
        if disposition:
            stmt = stmt.where(PrdScrap.disposition == disposition)
        if from_date:
            stmt = stmt.where(PrdScrap.business_date >= from_date)
        if to_date:
            stmt = stmt.where(PrdScrap.business_date <= to_date)

        rows = list((await self.session.execute(stmt)).scalars().all())
        records = [
            {
                "uid": r.uid,
                "docNo": r.doc_no,
                "source": r.source,
                "businessDate": _iso(r.business_date),
                "orderDocNo": r.order_doc_no,
                "workOrderDocNo": r.work_order_doc_no,
                "entryDocNo": r.entry_doc_no,
                "seq": r.seq,
                "operationName": r.operation_name,
                "workCentreCode": r.work_centre_code,
                "machineCode": r.machine_code,
                "operatorName": r.operator_name,
                "shiftCode": r.shift_code,
                "itemCode": r.item_code,
                "itemName": r.item_name,
                "uom": r.uom,
                "batchNo": r.batch_no,
                "qty": _f(r.qty),
                "unitCost": _f(r.unit_cost),
                "value": round(_f(r.qty) * _f(r.unit_cost), 2),
                "defectCode": r.defect_code,
                "defectName": r.defect_name,
                "reason": r.reason,
                "disposition": r.disposition,
                "decisionNote": r.decision_note,
                "status": r.status,
                "warehouseCode": r.warehouse_code,
                "inventoryDocNo": r.inventory_doc_no,
                "remarks": r.remarks,
            }
            for r in rows
        ]

        by_reason: Dict[str, Dict[str, float]] = {}
        for r in records:
            key = r["defectName"] or r["reason"] or r["defectCode"] or "Unclassified"
            bucket = by_reason.setdefault(key, {"qty": 0.0, "value": 0.0, "count": 0})
            bucket["qty"] += r["qty"]
            bucket["value"] += r["value"]
            bucket["count"] += 1

        return {
            "records": records,
            "totals": {
                "documents": len(records),
                "qty": round(sum(r["qty"] for r in records), 6),
                "value": round(sum(r["value"] for r in records), 2),
            },
            "byReason": [
                {"reason": k, **v} for k, v in sorted(by_reason.items(), key=lambda kv: -kv[1]["qty"])
            ],
        }

    # ── Work in progress ────────────────────────────────────────────────────

    async def wip(self, *, work_centre: str = "") -> Dict[str, Any]:
        """What is between operations right now, derived from the work orders.

        A work order that has been fed but not finished is holding pieces. How
        many it holds is what came in less what has already been booked out of
        it as good, scrap or rework — no separate WIP table is kept, so this is
        the arithmetic rather than a stored figure.
        """
        stmt = (
            select(PrdWorkOrder)
            .where(
                PrdWorkOrder.company_id == self.ctx.company_id,
                PrdWorkOrder.deleted_at.is_(None),
                PrdWorkOrder.status.in_(OPEN_STATES),
            )
            .order_by(PrdWorkOrder.order_doc_no, PrdWorkOrder.seq)
        )
        if work_centre:
            stmt = stmt.where(PrdWorkOrder.work_centre_code == work_centre)
        rows = list((await self.session.execute(stmt)).scalars().all())

        lots: List[Dict[str, Any]] = []
        for wo in rows:
            held = _f(wo.input_qty) - _f(wo.produced_qty) - _f(wo.scrap_qty) - _f(wo.rework_qty)
            if held <= 0 and wo.status not in ("RUNNING", "QC_HOLD"):
                continue
            lots.append(
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
                    "batchNo": wo.batch_no,
                    "uom": wo.uom,
                    "inputQty": _f(wo.input_qty),
                    "producedQty": _f(wo.produced_qty),
                    "scrapQty": _f(wo.scrap_qty),
                    "reworkQty": _f(wo.rework_qty),
                    "heldQty": round(max(held, 0.0), 6),
                    "state": wo.status,
                    "startedAt": _iso(wo.started_at),
                    # How long it has been sitting here. Only an operation that
                    # has actually started has a clock to read.
                    "ageHours": self._age_hours(wo.started_at),
                    "qcResult": wo.qc_result,
                }
            )

        by_centre: Dict[str, Dict[str, float]] = {}
        for lot in lots:
            bucket = by_centre.setdefault(lot["workCentreCode"], {"lots": 0, "qty": 0.0})
            bucket["lots"] += 1
            bucket["qty"] += lot["heldQty"]

        return {
            "lots": lots,
            "byWorkCentre": [{"workCentreCode": k, **v} for k, v in sorted(by_centre.items())],
            "totals": {
                "lots": len(lots),
                "qty": round(sum(lot["heldQty"] for lot in lots), 6),
            },
        }

    @staticmethod
    def _age_hours(started_at: Any) -> Optional[float]:
        if started_at is None:
            return None
        from app.core.time import utcnow

        delta = utcnow().replace(tzinfo=None) - started_at.replace(tzinfo=None)
        return round(delta.total_seconds() / 3600.0, 2)

    # ── The traveller ───────────────────────────────────────────────────────

    async def traveller(self, order_doc_no: str) -> Dict[str, Any]:
        """One order's route, operation by operation, with what each one did.

        This is the job card a lot carries with it. Every step is a work order
        row; the quantities and times come from the entries booked against it.
        """
        order = (
            await self.session.execute(
                select(PpProductionOrder).where(
                    PpProductionOrder.doc_no == order_doc_no,
                    PpProductionOrder.company_id == self.ctx.company_id,
                    PpProductionOrder.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if order is None:
            raise NotFoundError(f"Production order '{order_doc_no}' not found")

        steps = list(
            (
                await self.session.execute(
                    select(PrdWorkOrder)
                    .where(
                        PrdWorkOrder.order_id == order.id,
                        PrdWorkOrder.company_id == self.ctx.company_id,
                        PrdWorkOrder.deleted_at.is_(None),
                    )
                    .order_by(PrdWorkOrder.seq)
                )
            )
            .scalars()
            .all()
        )

        entries = list(
            (
                await self.session.execute(
                    select(PrdProductionEntry)
                    .where(
                        PrdProductionEntry.order_id == order.id,
                        PrdProductionEntry.company_id == self.ctx.company_id,
                        PrdProductionEntry.deleted_at.is_(None),
                    )
                    .order_by(PrdProductionEntry.id)
                )
            )
            .scalars()
            .all()
        )
        by_seq: Dict[int, List[PrdProductionEntry]] = {}
        for e in entries:
            by_seq.setdefault(e.seq, []).append(e)

        components = list(
            (
                await self.session.execute(
                    select(PpProdOrderComponent)
                    .where(
                        PpProdOrderComponent.order_id == order.id,
                        PpProdOrderComponent.deleted_at.is_(None),
                    )
                    .order_by(PpProdOrderComponent.id)
                )
            )
            .scalars()
            .all()
        )

        return {
            "order": {
                "uid": order.uid,
                "docNo": order.doc_no,
                "productCode": order.product_code,
                "productName": order.product_name,
                "uom": order.uom,
                "qty": _f(order.qty),
                "producedQty": _f(order.produced_qty),
                "rejectedQty": _f(order.rejected_qty),
                "status": order.status,
                "plant": order.plant,
                "warehouse": order.warehouse,
                "bomDocNo": order.bom_doc_no,
                "bomRevision": order.bom_revision,
                "routingDocNo": order.routing_doc_no,
                "routingRevision": order.routing_revision,
                "plannedStart": _iso(order.planned_start),
                "plannedFinish": _iso(order.planned_finish),
            },
            "steps": [
                {
                    "uid": wo.uid,
                    "docNo": wo.doc_no,
                    "seq": wo.seq,
                    "operationCode": wo.operation_code,
                    "operationName": wo.operation_name,
                    "workCentreCode": wo.work_centre_code,
                    "machineCode": wo.machine_code,
                    "operatorName": wo.operator_name,
                    "shiftCode": wo.shift_code,
                    "status": wo.status,
                    "qcCheckpoint": bool(wo.qc_checkpoint),
                    "qcResult": wo.qc_result,
                    "uom": wo.uom,
                    "inputQty": _f(wo.input_qty),
                    "producedQty": _f(wo.produced_qty),
                    "scrapQty": _f(wo.scrap_qty),
                    "reworkQty": _f(wo.rework_qty),
                    "setupMinutesStd": _f(wo.setup_minutes_std),
                    "runMinutesStd": _f(wo.run_minutes_std),
                    "setupMinutesAct": _f(wo.setup_minutes_act),
                    "runMinutesAct": _f(wo.run_minutes_act),
                    "batchNo": wo.batch_no,
                    "startedAt": _iso(wo.started_at),
                    "completedAt": _iso(wo.completed_at),
                    "entries": [
                        {
                            "docNo": e.doc_no,
                            "businessDate": _iso(e.business_date),
                            "operatorName": e.operator_name,
                            "shiftCode": e.shift_code,
                            "goodQty": _f(e.good_qty),
                            "scrapQty": _f(e.scrap_qty),
                            "reworkQty": _f(e.rework_qty),
                            "isReversal": bool(e.is_reversal),
                        }
                        for e in by_seq.get(wo.seq, [])
                    ],
                }
                for wo in steps
            ],
            "components": [
                {
                    "itemCode": c.item_code,
                    "itemName": c.item_name,
                    "uom": c.uom,
                    "requiredQty": _f(c.required_qty),
                    "reservedQty": _f(c.reserved_qty),
                    "issuedQty": _f(c.issued_qty),
                }
                for c in components
            ],
        }

    # ── Does the floor's own data agree with itself ─────────────────────────

    async def integrity(self) -> Dict[str, Any]:
        """Check the shop-floor figures against the entries behind them.

        Production entries are meant to be the only source of produced and
        scrap quantities, so a work order's totals should equal the sum of its
        entries, reversals counted negative. Where they do not, something wrote
        a quantity without a booking, and a report that silently reconciles the
        difference would hide it.

        Nothing here corrects anything. It reports.
        """
        mismatched = list(
            (
                await self.session.execute(
                    text(
                        "SELECT w.doc_no, w.order_doc_no, w.seq, w.operation_name, w.status,"
                        "       w.produced_qty, w.scrap_qty,"
                        "       COALESCE(SUM(CASE WHEN e.is_reversal = 0 THEN e.good_qty"
                        "                         ELSE -e.good_qty END), 0) AS entry_good,"
                        "       COALESCE(SUM(CASE WHEN e.is_reversal = 0 THEN e.scrap_qty"
                        "                         ELSE -e.scrap_qty END), 0) AS entry_scrap,"
                        "       COUNT(e.id) AS entries"
                        "  FROM prd_work_order w"
                        "  LEFT JOIN prd_production_entry e"
                        "    ON e.work_order_id = w.id AND e.deleted_at IS NULL"
                        " WHERE w.company_id = :cid AND w.deleted_at IS NULL"
                        " GROUP BY w.id"
                        " HAVING ABS(w.produced_qty - entry_good) > 0.000001"
                        "     OR ABS(w.scrap_qty - entry_scrap) > 0.000001"
                        " ORDER BY w.order_doc_no, w.seq"
                    ),
                    {"cid": self.ctx.company_id},
                )
            ).all()
        )

        over_issued = list(
            (
                await self.session.execute(
                    text(
                        "SELECT o.doc_no, c.item_code, c.required_qty, c.issued_qty"
                        "  FROM pp_prod_order_component c"
                        "  JOIN pp_production_order o ON o.id = c.order_id"
                        " WHERE c.company_id = :cid AND c.deleted_at IS NULL"
                        "   AND c.issued_qty > c.required_qty + 0.000001"
                        " ORDER BY o.doc_no, c.item_code"
                    ),
                    {"cid": self.ctx.company_id},
                )
            ).all()
        )

        # A component a live order needs that inventory has never heard of
        # cannot be issued at all, so the order can never finish.
        unissuable = list(
            (
                await self.session.execute(
                    text(
                        "SELECT DISTINCT o.doc_no, c.item_code"
                        "  FROM pp_prod_order_component c"
                        "  JOIN pp_production_order o ON o.id = c.order_id"
                        "  LEFT JOIN mst_item i"
                        "    ON i.code = c.item_code AND i.company_id = c.company_id"
                        "   AND i.deleted_at IS NULL"
                        " WHERE c.company_id = :cid AND c.deleted_at IS NULL"
                        "   AND o.deleted_at IS NULL"
                        "   AND o.status NOT IN ('CLOSED', 'COMPLETED', 'CANCELLED')"
                        "   AND i.id IS NULL"
                        " ORDER BY o.doc_no, c.item_code"
                    ),
                    {"cid": self.ctx.company_id},
                )
            ).all()
        )

        return {
            "quantitiesWithoutEntries": [
                {
                    "docNo": r[0],
                    "orderDocNo": r[1],
                    "seq": r[2],
                    "operationName": r[3],
                    "status": r[4],
                    "workOrderProduced": _f(r[5]),
                    "workOrderScrap": _f(r[6]),
                    "entriesGood": _f(r[7]),
                    "entriesScrap": _f(r[8]),
                    "entries": int(r[9]),
                    "goodDifference": round(_f(r[5]) - _f(r[7]), 6),
                    "scrapDifference": round(_f(r[6]) - _f(r[8]), 6),
                }
                for r in mismatched
            ],
            "overIssuedComponents": [
                {
                    "orderDocNo": r[0],
                    "itemCode": r[1],
                    "requiredQty": _f(r[2]),
                    "issuedQty": _f(r[3]),
                    "excessQty": round(_f(r[3]) - _f(r[2]), 6),
                }
                for r in over_issued
            ],
            "componentsNotInInventory": [
                {"orderDocNo": r[0], "itemCode": r[1]} for r in unissuable
            ],
            "clean": not mismatched and not over_issued and not unissuable,
        }

    # ── Who and when booked the output ──────────────────────────────────────

    async def output_by(self, *, dimension: str, from_date: Optional[date] = None) -> Dict[str, Any]:
        """Booked output grouped by shift or by operator.

        This answers "what came off this shift" and "what did this operator
        book", both of which are real: every production entry names a shift
        code and an operator. It does not answer utilisation, attendance or
        labour cost, which need models this system does not hold, so those are
        returned as explicit gaps rather than derived from output.
        """
        if dimension == "shift":
            column = PrdProductionEntry.shift_code
        elif dimension == "operator":
            column = PrdProductionEntry.operator_code
        else:  # pragma: no cover - the router constrains this
            raise ValidationFailedError(f"Cannot group output by '{dimension}'.")

        stmt = (
            select(
                column,
                func.max(PrdProductionEntry.operator_name),
                func.coalesce(func.sum(PrdProductionEntry.good_qty), 0),
                func.coalesce(func.sum(PrdProductionEntry.scrap_qty), 0),
                func.coalesce(func.sum(PrdProductionEntry.rework_qty), 0),
                func.coalesce(func.sum(PrdProductionEntry.run_minutes), 0),
                func.coalesce(func.sum(PrdProductionEntry.setup_minutes), 0),
                func.coalesce(func.sum(PrdProductionEntry.down_minutes), 0),
                func.count(),
                func.min(PrdProductionEntry.business_date),
                func.max(PrdProductionEntry.business_date),
            )
            .where(
                PrdProductionEntry.company_id == self.ctx.company_id,
                PrdProductionEntry.deleted_at.is_(None),
                PrdProductionEntry.is_reversal.is_(False),
            )
            .group_by(column)
            .order_by(func.sum(PrdProductionEntry.good_qty).desc())
        )
        if from_date:
            stmt = stmt.where(PrdProductionEntry.business_date >= from_date)

        rows = list((await self.session.execute(stmt)).all())
        out = []
        for key, name, good, scrap, rework, run, setup, down, count, first, last in rows:
            booked = _f(good) + _f(scrap) + _f(rework)
            out.append(
                {
                    "key": key or "—",
                    "operatorName": name,
                    "goodQty": _f(good),
                    "scrapQty": _f(scrap),
                    "reworkQty": _f(rework),
                    "runMinutes": _f(run) + _f(setup),
                    "downMinutes": _f(down),
                    "entries": int(count),
                    "firstBooked": _iso(first),
                    "lastBooked": _iso(last),
                    "yieldPct": round(_f(good) / booked * 100, 2) if booked > 0 else None,
                }
            )

        return {
            "dimension": dimension,
            "rows": out,
            "unavailable": (
                SHIFT_GAPS if dimension == "shift" else LABOUR_GAPS
            ),
        }

    # ── Effectiveness, as far as it can honestly be measured ────────────────

    async def effectiveness(self, *, from_date: Optional[date] = None) -> Dict[str, Any]:
        """Quality and performance per work centre. Availability, and therefore
        OEE itself, are deliberately absent.

        Quality is good over good plus scrap — both booked figures, so it is a
        measurement. Performance is the standard time the booked output should
        have taken over the time it actually took; the standard comes from the
        routing and the actual from the entries, so it is also a measurement,
        though a figure over 100% means the standard or the time capture is
        wrong rather than that the line beat physics.

        Availability would be running time over planned time. Neither exists:
        there is no downtime event with a reason and a duration, and no planned
        production calendar. It is returned as None with the reason attached,
        and OEE is not multiplied out from two factors of three.
        """
        stmt = (
            select(PrdProductionEntry)
            .where(
                PrdProductionEntry.company_id == self.ctx.company_id,
                PrdProductionEntry.deleted_at.is_(None),
                PrdProductionEntry.is_reversal.is_(False),
            )
            .order_by(PrdProductionEntry.business_date)
        )
        if from_date:
            stmt = stmt.where(PrdProductionEntry.business_date >= from_date)
        entries = list((await self.session.execute(stmt)).scalars().all())

        # The routing standard lives on the work order, so the per-piece
        # standard has to be read from there rather than from the entry.
        work = {
            wo.doc_no: wo
            for wo in (
                await self.session.execute(
                    select(PrdWorkOrder).where(
                        PrdWorkOrder.company_id == self.ctx.company_id,
                        PrdWorkOrder.deleted_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        }

        buckets: Dict[str, Dict[str, float]] = {}
        for e in entries:
            key = e.work_centre_code or "—"
            b = buckets.setdefault(
                key,
                {"good": 0.0, "scrap": 0.0, "rework": 0.0, "runMinutes": 0.0,
                 "downMinutes": 0.0, "standardMinutes": 0.0, "entries": 0},
            )
            b["good"] += _f(e.good_qty)
            b["scrap"] += _f(e.scrap_qty)
            b["rework"] += _f(e.rework_qty)
            b["runMinutes"] += _f(e.run_minutes) + _f(e.setup_minutes)
            b["downMinutes"] += _f(e.down_minutes)
            b["entries"] += 1

            wo = work.get(e.work_order_doc_no)
            if wo is not None:
                basis = _f(wo.planned_qty) or _f(wo.input_qty)
                if basis > 0:
                    per_piece = (_f(wo.run_minutes_std) + _f(wo.setup_minutes_std)) / basis
                    booked = _f(e.good_qty) + _f(e.scrap_qty) + _f(e.rework_qty)
                    b["standardMinutes"] += per_piece * booked

        rows: List[Dict[str, Any]] = []
        for code, b in sorted(buckets.items()):
            produced = b["good"] + b["scrap"] + b["rework"]
            quality = round(b["good"] / produced * 100, 2) if produced > 0 else None
            performance = (
                round(b["standardMinutes"] / b["runMinutes"] * 100, 2)
                if b["runMinutes"] > 0 and b["standardMinutes"] > 0
                else None
            )
            rows.append(
                {
                    "workCentreCode": code,
                    "entries": int(b["entries"]),
                    "goodQty": round(b["good"], 6),
                    "scrapQty": round(b["scrap"], 6),
                    "reworkQty": round(b["rework"], 6),
                    "runMinutes": round(b["runMinutes"], 3),
                    "downMinutes": round(b["downMinutes"], 3),
                    "standardMinutes": round(b["standardMinutes"], 3),
                    "qualityPct": quality,
                    "performancePct": performance,
                    # Named, not zero. A zero here would read as a dead line.
                    "availabilityPct": None,
                    "oeePct": None,
                }
            )

        total_good = sum(r["goodQty"] for r in rows)
        total_produced = sum(r["goodQty"] + r["scrapQty"] + r["reworkQty"] for r in rows)
        total_run = sum(r["runMinutes"] for r in rows)
        total_std = sum(r["standardMinutes"] for r in rows)

        return {
            "from": from_date.isoformat() if from_date else None,
            "workCentres": rows,
            "overall": {
                "qualityPct": round(total_good / total_produced * 100, 2) if total_produced > 0 else None,
                "performancePct": round(total_std / total_run * 100, 2) if total_run > 0 and total_std > 0 else None,
                "availabilityPct": None,
                "oeePct": None,
                "goodQty": round(total_good, 6),
                "runMinutes": round(total_run, 3),
                "standardMinutes": round(total_std, 3),
            },
            "cannotCompute": [
                {
                    "factor": "Availability",
                    "reason": "Running time over planned time. Production entries carry a total "
                    "down-minutes figure but no reason-coded downtime events, and there is no "
                    "planned production calendar to divide by.",
                    "needs": "A downtime event model (reason, start, end) and a shift calendar.",
                },
                {
                    "factor": "OEE",
                    "reason": "OEE is availability times performance times quality. Two factors "
                    "out of three is not OEE, and publishing their product under that name would "
                    "overstate the line.",
                    "needs": "Availability, above.",
                },
            ],
        }

    # ── Orders and their readiness ──────────────────────────────────────────

    async def orders(self, *, status: str = "") -> List[Dict[str, Any]]:
        """Production orders with how far the floor has actually got with each.

        Progress is not a stored percentage. It is the good quantity booked at
        the last operation of the route, which is the only quantity that has
        genuinely been made.
        """
        stmt = (
            select(PpProductionOrder)
            .where(
                PpProductionOrder.company_id == self.ctx.company_id,
                PpProductionOrder.deleted_at.is_(None),
            )
            .order_by(PpProductionOrder.id.desc())
        )
        if status:
            stmt = stmt.where(PpProductionOrder.status == status)
        orders = list((await self.session.execute(stmt)).scalars().all())
        if not orders:
            return []

        ids = [o.id for o in orders]
        work = list(
            (
                await self.session.execute(
                    select(PrdWorkOrder)
                    .where(
                        PrdWorkOrder.order_id.in_(ids),
                        PrdWorkOrder.company_id == self.ctx.company_id,
                        PrdWorkOrder.deleted_at.is_(None),
                    )
                    .order_by(PrdWorkOrder.seq)
                )
            )
            .scalars()
            .all()
        )
        by_order: Dict[int, List[PrdWorkOrder]] = {}
        for wo in work:
            by_order.setdefault(wo.order_id, []).append(wo)

        out: List[Dict[str, Any]] = []
        for o in orders:
            steps = by_order.get(o.id, [])
            last = steps[-1] if steps else None
            out.append(
                {
                    "uid": o.uid,
                    "docNo": o.doc_no,
                    "orderType": o.order_type,
                    "productCode": o.product_code,
                    "productName": o.product_name,
                    "uom": o.uom,
                    "qty": _f(o.qty),
                    "producedQty": _f(o.produced_qty),
                    "rejectedQty": _f(o.rejected_qty),
                    "status": o.status,
                    "priority": o.priority,
                    "plant": o.plant,
                    "warehouse": o.warehouse,
                    "bomDocNo": o.bom_doc_no,
                    "bomRevision": o.bom_revision,
                    "routingDocNo": o.routing_doc_no,
                    "routingRevision": o.routing_revision,
                    "estimatedUnitCost": _f(o.estimated_unit_cost),
                    "plannedStart": _iso(o.planned_start),
                    "plannedFinish": _iso(o.planned_finish),
                    "remarks": o.remarks,
                    "operations": len(steps),
                    "operationsDone": sum(1 for s in steps if s.status in FINISHED_STATES),
                    # What has genuinely come off the end of the route.
                    "completedQty": _f(last.produced_qty) if last else 0.0,
                    "released": bool(steps),
                }
            )
        return out

    async def readiness(self, order_uid: str) -> Dict[str, Any]:
        """Can this order be released, as far as the data can actually say.

        Only material can be answered from rows: each component's outstanding
        requirement is compared with free stock, which is on-hand less whatever
        is already reserved for something else. Machine, tooling and manpower
        readiness are reported as unknown, because this system holds no machine
        availability calendar, no tooling issue register and no shift roster.
        Showing them green would be a guess dressed up as a check.
        """
        order = (
            await self.session.execute(
                select(PpProductionOrder).where(
                    PpProductionOrder.uid == order_uid,
                    PpProductionOrder.company_id == self.ctx.company_id,
                    PpProductionOrder.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if order is None:
            raise NotFoundError(f"Production order '{order_uid}' not found")

        components = list(
            (
                await self.session.execute(
                    select(PpProdOrderComponent)
                    .where(
                        PpProdOrderComponent.order_id == order.id,
                        PpProdOrderComponent.deleted_at.is_(None),
                    )
                    .order_by(PpProdOrderComponent.id)
                )
            )
            .scalars()
            .all()
        )

        lines: List[Dict[str, Any]] = []
        for c in components:
            outstanding = max(_f(c.required_qty) - _f(c.issued_qty), 0.0)
            row = (
                await self.session.execute(
                    text(
                        "SELECT i.id,"
                        "       COALESCE(SUM(b.quantity), 0),"
                        "       GREATEST(COALESCE(SUM(b.quantity - b.reserved_qty), 0), 0)"
                        "  FROM mst_item i"
                        "  LEFT JOIN inv_stock_balance b"
                        "    ON b.item_id = i.id AND b.stock_status = 'AVAILABLE'"
                        " WHERE i.company_id = :cid AND i.deleted_at IS NULL AND i.code = :code"
                        " GROUP BY i.id"
                    ),
                    {"cid": self.ctx.company_id, "code": c.item_code},
                )
            ).first()
            # No inventory item at all is a different problem from no stock, and
            # the screen has to be able to say which.
            known = row is not None
            on_hand = _f(row[1]) if row else 0.0
            free = _f(row[2]) if row else 0.0
            lines.append(
                {
                    "itemCode": c.item_code,
                    "itemName": c.item_name,
                    "uom": c.uom,
                    "requiredQty": _f(c.required_qty),
                    "reservedQty": _f(c.reserved_qty),
                    "issuedQty": _f(c.issued_qty),
                    "outstandingQty": round(outstanding, 6),
                    "inInventoryMaster": known,
                    "onHandQty": on_hand,
                    "freeQty": free,
                    "shortQty": round(max(outstanding - free, 0.0), 6),
                    "covered": known and free >= outstanding,
                }
            )

        missing = [ln for ln in lines if not ln["inInventoryMaster"]]
        short = [ln for ln in lines if ln["inInventoryMaster"] and not ln["covered"]]

        return {
            "orderDocNo": order.doc_no,
            "status": order.status,
            "components": lines,
            "material": {
                "answerable": True,
                "ready": not missing and not short,
                "missingFromInventory": [ln["itemCode"] for ln in missing],
                "short": [
                    {"itemCode": ln["itemCode"], "shortQty": ln["shortQty"], "uom": ln["uom"]}
                    for ln in short
                ],
            },
            # Named rather than silently omitted, so nobody reads a missing
            # check as a passed one.
            "unknown": UNANSWERABLE_RELEASE_CHECKS,
        }

    # ── Dashboard ───────────────────────────────────────────────────────────

    async def dashboard(self, *, on: Optional[date] = None) -> Dict[str, Any]:
        """The floor at a glance. Every tile is a count or a sum of real rows.

        Anything that would need a model this system does not keep — machine
        availability, downtime reasons, labour cost — is named in `unavailable`
        instead of being filled with a plausible figure.
        """
        day = on or date.today()

        orders = list(
            (
                await self.session.execute(
                    select(PpProductionOrder.status, func.count(), func.sum(PpProductionOrder.qty))
                    .where(
                        PpProductionOrder.company_id == self.ctx.company_id,
                        PpProductionOrder.deleted_at.is_(None),
                    )
                    .group_by(PpProductionOrder.status)
                )
            ).all()
        )

        work = list(
            (
                await self.session.execute(
                    select(PrdWorkOrder.status, func.count())
                    .where(
                        PrdWorkOrder.company_id == self.ctx.company_id,
                        PrdWorkOrder.deleted_at.is_(None),
                    )
                    .group_by(PrdWorkOrder.status)
                )
            ).all()
        )

        today = (
            await self.session.execute(
                select(
                    func.coalesce(func.sum(PrdProductionEntry.good_qty), 0),
                    func.coalesce(func.sum(PrdProductionEntry.scrap_qty), 0),
                    func.coalesce(func.sum(PrdProductionEntry.rework_qty), 0),
                    func.count(),
                ).where(
                    PrdProductionEntry.company_id == self.ctx.company_id,
                    PrdProductionEntry.deleted_at.is_(None),
                    PrdProductionEntry.business_date == day,
                    PrdProductionEntry.is_reversal.is_(False),
                )
            )
        ).one()

        # The last fortnight of output, so the trend line is real history.
        since = day - timedelta(days=13)
        trend = list(
            (
                await self.session.execute(
                    select(
                        PrdProductionEntry.business_date,
                        func.coalesce(func.sum(PrdProductionEntry.good_qty), 0),
                        func.coalesce(func.sum(PrdProductionEntry.scrap_qty), 0),
                    )
                    .where(
                        PrdProductionEntry.company_id == self.ctx.company_id,
                        PrdProductionEntry.deleted_at.is_(None),
                        PrdProductionEntry.business_date >= since,
                        PrdProductionEntry.business_date <= day,
                        PrdProductionEntry.is_reversal.is_(False),
                    )
                    .group_by(PrdProductionEntry.business_date)
                    .order_by(PrdProductionEntry.business_date)
                )
            ).all()
        )

        by_centre = list(
            (
                await self.session.execute(
                    select(
                        PrdProductionEntry.work_centre_code,
                        func.coalesce(func.sum(PrdProductionEntry.good_qty), 0),
                        func.coalesce(func.sum(PrdProductionEntry.scrap_qty), 0),
                        func.count(),
                    )
                    .where(
                        PrdProductionEntry.company_id == self.ctx.company_id,
                        PrdProductionEntry.deleted_at.is_(None),
                        PrdProductionEntry.is_reversal.is_(False),
                    )
                    .group_by(PrdProductionEntry.work_centre_code)
                    .order_by(func.sum(PrdProductionEntry.good_qty).desc())
                )
            ).all()
        )

        wip = await self.wip()
        good, scrap, rework, entry_count = today

        return {
            "date": day.isoformat(),
            "orders": [
                {"status": s, "count": int(n), "qty": _f(q)} for s, n, q in orders
            ],
            "workOrders": [{"status": s, "count": int(n)} for s, n in work],
            "today": {
                "goodQty": _f(good),
                "scrapQty": _f(scrap),
                "reworkQty": _f(rework),
                "entries": int(entry_count),
                # Yield is a ratio of two booked figures, so it is real.
                "yieldPct": (
                    round(_f(good) / (_f(good) + _f(scrap)) * 100, 2)
                    if (_f(good) + _f(scrap)) > 0
                    else None
                ),
            },
            "trend": [
                {"date": _iso(d), "goodQty": _f(g), "scrapQty": _f(s)} for d, g, s in trend
            ],
            "byWorkCentre": [
                {
                    "workCentreCode": c,
                    "goodQty": _f(g),
                    "scrapQty": _f(s),
                    "entries": int(n),
                    "yieldPct": (
                        round(_f(g) / (_f(g) + _f(s)) * 100, 2) if (_f(g) + _f(s)) > 0 else None
                    ),
                }
                for c, g, s, n in by_centre
            ],
            "wip": wip["totals"],
            "unavailable": UNAVAILABLE_METRICS,
        }


#: Tiles a shop-floor dashboard usually carries that this system cannot yet
#: source. Each names the model that is missing, so the screen can say why the
#: figure is absent instead of showing a zero that looks like a measurement.
#: What a shift log usually carries beyond the output that was booked.
SHIFT_GAPS = [
    {
        "metric": "Shift handover log",
        "reason": "No handover or shift-log document exists. What was booked during a shift is "
        "known; what the outgoing supervisor wanted the incoming one to know is not recorded.",
    },
    {
        "metric": "Manning and attendance",
        "reason": "No attendance or roster model, so who was actually on a shift cannot be "
        "listed — only who booked an entry during it.",
    },
]

#: What a labour screen usually carries that this system cannot source.
LABOUR_GAPS = [
    {
        "metric": "Attendance and hours present",
        "reason": "No attendance model. Run minutes on entries say how long a job took, not how "
        "long anyone was at work.",
    },
    {
        "metric": "Labour cost",
        "reason": "No operator rate master and no labour posting, so booked minutes cannot be "
        "valued.",
    },
    {
        "metric": "Certification and skill matrix",
        "reason": "The employee master holds a free-text skills field with no structure, so "
        "which operators are certified for which work centre cannot be answered.",
    },
]

#: Release checks a shop floor normally makes that this system cannot answer.
#: They are returned alongside the material check so a blank is never mistaken
#: for a pass.
UNANSWERABLE_RELEASE_CHECKS = [
    {
        "check": "Machine available",
        "reason": "No machine availability calendar or booking model, so whether a machine on "
        "the routing is free at the planned time cannot be answered.",
    },
    {
        "check": "Tooling available",
        "reason": "No tooling issue or service register, so whether a die, jig or fixture is in "
        "service cannot be answered.",
    },
    {
        "check": "Manpower available",
        "reason": "No shift roster, attendance or operator certification model, so whether "
        "enough certified operators are on shift cannot be answered.",
    },
]

UNAVAILABLE_METRICS = [
    {
        "metric": "Machine availability",
        "reason": "No downtime event model. Entries carry total down minutes but not "
        "reason-coded start and end times, and there is no planned-time calendar.",
    },
    {
        "metric": "OEE",
        "reason": "Availability cannot be computed, so the product of the three factors "
        "cannot be either. Performance and quality alone are published on the OEE screen.",
    },
    {
        "metric": "Labour cost and utilisation",
        "reason": "No labour booking or attendance model, and no operator rate master.",
    },
    {
        "metric": "Actual production cost",
        "reason": "Material issues are valued, but there is no machine-hour rate or labour "
        "rate posting, so an actual unit cost cannot be built.",
    },
]
