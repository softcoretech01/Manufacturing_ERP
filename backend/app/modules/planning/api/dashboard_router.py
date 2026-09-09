"""Planning dashboard.

Every figure here is a query. The screen this replaces computed its KPIs from the
browser MRP engine and read plan-attainment off a hardcoded eight-element array,
so the headline "95% attainment" was a literal in the source file.

The tiles answer the questions a planner opens the day with: what is late, what
is short, what is overloaded, and is the plan being hit. All of them are derived
from the same stored MRP run and the same capacity service the rest of the portal
reads, so the dashboard cannot disagree with the screen you click into.
"""

from __future__ import annotations

import json

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.core.time import utcnow
from app.modules.planning.application.capacity_service import CapacityService
from app.modules.planning.application.mrp_service import MrpService
from app.modules.planning.domain import mrp_engine as eng
from app.modules.planning.infrastructure.models import (
    PpDemand,
    PpMps,
    PpProdOrderComponent,
    PpProductionOrder,
)
from app.modules.planning.infrastructure.mrp_models import (
    PpMrpException,
    PpMrpPlannedOrder,
)

router = APIRouter(prefix="/planning", tags=["Planning · Dashboard"])

# Orders that still represent work to do.
OPEN_ORDER_STATUSES = (
    "PLANNED", "FIRM_PLANNED", "RELEASED",
    "MATERIAL_RESERVED", "MATERIAL_ISSUED", "IN_PRODUCTION",
)


def _d(v: Any) -> Decimal:
    return Decimal("0") if v in (None, "") else Decimal(str(v))


@router.get("/dashboard")
async def planning_dashboard(
    session: SessionDep,
    horizon: int = Query(8, ge=1, le=26),
    attainment_weeks: int = Query(8, ge=1, le=52),
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
) -> dict[str, Any]:
    today = utcnow().date()
    starts = eng.bucket_starts(horizon, today)

    # ── Demand ────────────────────────────────────────────────────────────
    demand_rows = (
        await session.execute(
            select(PpDemand).where(
                PpDemand.company_id == ctx.company_id,
                PpDemand.deleted_at.is_(None),
                PpDemand.status == "OPEN",
            )
        )
    ).scalars().all()
    open_demand_qty = sum(
        (max(Decimal("0"), _d(d.qty) - _d(d.qty_planned)) for d in demand_rows), Decimal("0")
    )
    overdue_demand = [d for d in demand_rows if d.required_on and d.required_on < today]

    # ── Where each demand has stalled ─────────────────────────────────────
    #
    # The dashboard's job is to say what needs a planner's attention next, and
    # in make-to-order that is the demand that has not moved on: ordered but
    # never scheduled, or scheduled but never planned. Both are counted here
    # rather than in the browser so the dashboard does not have to fetch the
    # whole demand, schedule and order books to work them out.
    scheduled_docs = set(
        (
            await session.execute(
                select(PpMps.demand_doc_no).where(
                    PpMps.company_id == ctx.company_id,
                    PpMps.deleted_at.is_(None),
                    PpMps.demand_doc_no.is_not(None),
                )
            )
        ).scalars().all()
    )
    # A demand that already has an order raised has been planned, whether or not
    # the current MRP run still holds a live proposal for it.
    ordered_docs: set[str] = set()
    planned_docs = set(
        d
        for d in (
            await session.execute(
                select(PpMrpPlannedOrder.demand_doc_no).where(
                    PpMrpPlannedOrder.company_id == ctx.company_id,
                    PpMrpPlannedOrder.deleted_at.is_(None),
                    PpMrpPlannedOrder.demand_doc_no != "",
                )
            )
        ).scalars().all()
        if d
    )
    # `demand_doc_no` on a proposal can list several documents.
    planned_docs = {part.strip() for entry in planned_docs for part in entry.split(",") if part.strip()}

    open_docs = {d.doc_no for d in demand_rows}
    pending_mps = len(open_docs - scheduled_docs)

    # ── Production orders ─────────────────────────────────────────────────
    orders = (
        await session.execute(
            select(PpProductionOrder).where(
                PpProductionOrder.company_id == ctx.company_id,
                PpProductionOrder.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    open_orders = [o for o in orders if o.status in OPEN_ORDER_STATUSES]
    for o in orders:
        refs = o.demand_refs
        if isinstance(refs, str):
            try:
                refs = json.loads(refs)
            except (ValueError, TypeError):
                refs = []
        if isinstance(refs, (list, tuple)):
            ordered_docs.update(str(r) for r in refs if r)

    # Scheduled, but nothing planned or raised against it yet. Computed here
    # rather than with `pending_mps` above because it needs the orders.
    pending_mrp = len((open_docs & scheduled_docs) - planned_docs - ordered_docs)
    running = [o for o in open_orders if o.status == "IN_PRODUCTION"]
    late_orders = [
        o for o in open_orders if o.planned_finish and o.planned_finish < today
    ]
    wip_value = sum(
        (_d(o.estimated_unit_cost) * max(Decimal("0"), _d(o.qty) - _d(o.produced_qty))
         for o in running),
        Decimal("0"),
    )

    # Orders whose components are not fully reserved. One query, not one per order.
    open_ids = [o.id for o in open_orders]
    short_order_ids: set[int] = set()
    if open_ids:
        comps = (
            await session.execute(
                select(
                    PpProdOrderComponent.order_id,
                    PpProdOrderComponent.required_qty,
                    PpProdOrderComponent.reserved_qty,
                ).where(
                    PpProdOrderComponent.company_id == ctx.company_id,
                    PpProdOrderComponent.deleted_at.is_(None),
                    PpProdOrderComponent.order_id.in_(open_ids),
                )
            )
        ).all()
        for order_id, required, reserved in comps:
            if _d(reserved) < _d(required):
                short_order_ids.add(order_id)

    # ── The current MRP run ───────────────────────────────────────────────
    mrp = MrpService(session, ctx)
    run = await mrp.latest_run()
    shortages = exceptions_to_review = planned_waiting = 0
    # Split by type: a buyer and a production planner act on different
    # halves of the same list, and a combined figure serves neither.
    to_buy = to_make = 0
    unconverted_value = Decimal("0")
    run_no = run_at = None
    if run is not None:
        run_no, run_at = run.run_no, run.run_at
        shortages = (
            await session.execute(
                select(PpMrpPlannedOrder).where(
                    PpMrpPlannedOrder.run_id == run.id,
                    PpMrpPlannedOrder.is_late.is_(True),
                )
            )
        ).scalars().all()
        shortages = len(shortages)
        exc = (
            await session.execute(
                select(PpMrpException).where(
                    PpMrpException.run_id == run.id,
                    PpMrpException.severity != "INFO",
                    PpMrpException.is_resolved.is_(False),
                )
            )
        ).scalars().all()
        exceptions_to_review = len(exc)
        waiting = (
            await session.execute(
                select(PpMrpPlannedOrder).where(
                    PpMrpPlannedOrder.run_id == run.id,
                    PpMrpPlannedOrder.converted_to_doc_no.is_(None),
                )
            )
        ).scalars().all()
        planned_waiting = len(waiting)
        to_buy = sum(1 for o in waiting if o.order_type == "PURCHASE")
        to_make = sum(1 for o in waiting if o.order_type == "PRODUCTION")
        unconverted_value = sum((_d(o.value) for o in waiting), Decimal("0"))

    # ── Capacity ──────────────────────────────────────────────────────────
    cap = await CapacityService(session, ctx).plan(horizon=horizon)
    cap.pop("_detail", None)
    peak = max((w["peak_load_pct"] for w in cap["work_centres"]), default=0.0)
    over_centres = [w for w in cap["work_centres"] if w["is_bottleneck"]]

    # ── Plan against actual ───────────────────────────────────────────────
    #
    # Real output, not a literal. Weekly buckets ending last week: what orders
    # were scheduled to finish, against what they actually produced. An empty
    # series means there is no completed history yet — which the screen must say
    # rather than drawing a flat line that looks like zero output.
    week_start = eng.monday_of(today) - timedelta(days=7 * attainment_weeks)
    planned_by_week: dict[date, Decimal] = defaultdict(Decimal)
    actual_by_week: dict[date, Decimal] = defaultdict(Decimal)
    on_time_num: dict[date, int] = defaultdict(int)
    on_time_den: dict[date, int] = defaultdict(int)

    for o in orders:
        if not o.planned_finish or o.planned_finish < week_start or o.planned_finish >= eng.monday_of(today):
            continue
        wk = eng.monday_of(o.planned_finish)
        planned_by_week[wk] += _d(o.qty)
        actual_by_week[wk] += _d(o.produced_qty)
        on_time_den[wk] += 1
        if o.status in ("COMPLETED", "CLOSED") and _d(o.produced_qty) >= _d(o.qty):
            on_time_num[wk] += 1

    attainment_series = []
    for i in range(attainment_weeks):
        wk = week_start + timedelta(days=7 * i)
        p, a = planned_by_week.get(wk, Decimal("0")), actual_by_week.get(wk, Decimal("0"))
        if p == 0 and a == 0:
            continue
        attainment_series.append(
            {
                "week_start": wk,
                "label": f"W-{attainment_weeks - i}",
                "planned": float(eng.r6(p)),
                "actual": float(eng.r6(a)),
                "on_time_pct": round(
                    (on_time_num.get(wk, 0) / on_time_den[wk]) * 100, 1
                ) if on_time_den.get(wk) else 0.0,
            }
        )

    total_planned = sum((Decimal(str(w["planned"])) for w in attainment_series), Decimal("0"))
    total_actual = sum((Decimal(str(w["actual"])) for w in attainment_series), Decimal("0"))
    attainment_pct = (
        float(eng.r2(total_actual / total_planned * Decimal("100"))) if total_planned > 0 else None
    )

    return {
        "as_of": today,
        "horizon": horizon,
        "mrp_run_no": run_no,
        "mrp_run_at": run_at,
        "kpis": {
            "open_demand_qty": float(eng.r6(open_demand_qty)),
            "open_demand_lines": len(demand_rows),
            "pending_mps": pending_mps,
            "pending_mrp": pending_mrp,
            "to_buy": to_buy,
            "to_make": to_make,
            "overdue_demand_lines": len(overdue_demand),
            "shortages": shortages,
            "unconverted_value": float(eng.r2(unconverted_value)),
            "peak_capacity_pct": peak,
            "overloaded_centres": len(over_centres),
            # Null, not zero, when there is no completed history to measure.
            "plan_attainment_pct": attainment_pct,
            "wip_value": float(eng.r2(wip_value)),
            "open_orders": len(open_orders),
            "orders_in_production": len(running),
        },
        "action_queue": [
            {"key": "shortages", "label": "Shortages that cannot be covered in time",
             "count": shortages, "to": "/planning/mrp", "tone": "danger"},
            {"key": "exceptions", "label": "MRP exceptions to review",
             "count": exceptions_to_review, "to": "/planning/mrp", "tone": "warning"},
            {"key": "planned", "label": "Planned orders waiting to be raised",
             "count": planned_waiting, "to": "/planning/mrp", "tone": "pending"},
            {"key": "capacity", "label": "Work centres over capacity",
             "count": len(over_centres), "to": "/planning/capacity", "tone": "danger"},
            {"key": "late", "label": "Orders past their finish date",
             "count": len(late_orders), "to": "/planning/orders", "tone": "danger"},
            {"key": "unreserved", "label": "Orders with material not fully reserved",
             "count": len(short_order_ids), "to": "/planning/orders", "tone": "warning"},
            {"key": "overdue_demand", "label": "Demand lines past the required date",
             "count": len(overdue_demand), "to": "/planning/demand", "tone": "warning"},
            {"key": "running", "label": "Orders in production now",
             "count": len(running), "to": "/planning/orders", "tone": "progress"},
        ],
        "attainment_series": attainment_series,
        "bottlenecks": [
            {
                "work_centre_code": w["work_centre_code"],
                "work_centre_name": w["work_centre_name"],
                "peak_load_pct": w["peak_load_pct"],
                "overloaded_buckets": w["overloaded_buckets"],
            }
            for w in over_centres[:5]
        ],
    }
