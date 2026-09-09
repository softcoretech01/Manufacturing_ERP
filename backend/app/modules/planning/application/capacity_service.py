"""Capacity requirements planning.

Answers the question the dashboard tile cannot: a work centre is at 103% — of
what, because of which orders, and is that already committed or only proposed?

Load comes from two places, and keeping them apart is the whole point:

* **Committed** — operations snapshotted onto real production orders. This work
  is going to happen; the routing it came from may since have changed and that
  does not matter, because the order carries its own copy.
* **Planned** — MRP's proposals that nobody has converted yet. Computed from the
  live routing, since no snapshot exists. Re-planning makes this disappear.

A planner seeing 103% needs to know which half it is. Committed overload means
move work or add a shift; planned overload means change the plan.

Available hours are the centre's shift hours across the working days the
calendar allows, derated by its OEE target. Planning against nameplate hours is
how a plan that reads 90% loaded turns out to be 115% loaded.
"""

from __future__ import annotations

import json

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.errors import NotFoundError
from app.core.time import utcnow
from app.modules.planning.domain import mrp_engine as eng
from app.modules.planning.infrastructure.models import PpCalendarDay, PpProductionOrder
from app.modules.planning.infrastructure.mrp_models import PpMrpPlannedOrder, PpMrpRun

# Orders whose work is done or abandoned no longer load a work centre.
CLOSED_ORDER_STATUSES = ("COMPLETED", "CLOSED", "CANCELLED")

DEFAULT_PLANT_HOURS = Decimal("16")


def _d(v: Any) -> Decimal:
    return Decimal("0") if v in (None, "") else Decimal(str(v))


def _demand_refs(raw: Any) -> set[str]:
    """The demand documents a production order serves.

    `pp_production_order.demand_refs` is a JSON column, and the driver hands it
    back as a list when MySQL decodes it and as a string when it does not — so
    both have to be handled or the attribution silently matches nothing.
    """
    if not raw:
        return set()
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return set()
    if isinstance(raw, dict):
        raw = list(raw.values())
    if not isinstance(raw, (list, tuple, set)):
        return set()
    return {str(x) for x in raw if x}


def _as_date(v: Any) -> date | None:
    """COALESCE over two DATE columns in raw SQL loses the type and comes back a
    string, which then cannot be compared with a date. Normalise once, here."""
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


class CapacityService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    # ─────────────────────────── calendar ───────────────────────────
    async def _calendar(self) -> dict[date, Decimal]:
        """Hours the plant is open, by date. Absent dates fall back to the
        default working pattern: Sunday closed, otherwise a normal shift."""
        rows = (
            await self.session.execute(
                select(PpCalendarDay.cal_date, PpCalendarDay.hours).where(
                    PpCalendarDay.company_id == self.ctx.company_id,
                    PpCalendarDay.deleted_at.is_(None),
                )
            )
        ).all()
        return {r[0]: _d(r[1]) for r in rows}

    def _working_days(self, bucket_start: date, calendar: dict[date, Decimal]) -> int:
        n = 0
        for i in range(eng.BUCKET_DAYS):
            d = bucket_start + timedelta(days=i)
            hours = calendar.get(d)
            if hours is None:
                # Not in the calendar: Sunday closed, everything else open.
                if d.weekday() != 6:
                    n += 1
            elif hours > 0:
                n += 1
        return n

    # ─────────────────────────── work centres ───────────────────────────
    async def _work_centres(self) -> list[dict[str, Any]]:
        """Work centres from Product Engineering, which owns the record."""
        rows = (
            await self.session.execute(
                text(
                    "SELECT Code, Name, Plant, IFNULL(HoursPerDay, 0), "
                    "       IFNULL(OeeTargetPct, 100), ShiftPattern, "
                    "       IFNULL(MachineRatePerHour, 0) "
                    "  FROM ERP_Product.EngineeringWorkCentre "
                    " WHERE IsActive = 1 ORDER BY Code"
                )
            )
        ).fetchall()
        return [
            {
                "code": r[0], "name": r[1], "plant": r[2],
                "hours_per_day": _d(r[3]), "oee_pct": _d(r[4]),
                "shift_pattern": r[5], "machine_rate": _d(r[6]),
            }
            for r in rows
        ]

    # ─────────────────────────── load ───────────────────────────
    async def _committed_load(
        self, starts: list[date], demand_doc_no: str | None = None
    ) -> tuple[
        dict[tuple[str, int], Decimal],
        list[dict[str, Any]],
        dict[tuple[str, int], Decimal],
    ]:
        """Hours from operations on live production orders.

        Bucketed by the operation's own planned start where it has one, falling
        back to the order's. An operation dated before the horizon is pulled into
        the current bucket — work that should already have happened still has to.

        The third return is the subset of those hours belonging to
        `demand_doc_no`. It is a subset, never a replacement: a work centre that
        looks 20% loaded by one order can still be full, and a planner deciding
        whether to accept that order has to see both numbers.
        """
        rows = (
            await self.session.execute(
                text(
                    "SELECT op.work_centre_code, op.operation_name, op.seq, "
                    "       IFNULL(op.setup_minutes,0), IFNULL(op.run_minutes,0), "
                    "       COALESCE(op.planned_start, o.planned_start), "
                    "       o.doc_no, o.product_code, o.status, o.qty, o.demand_refs "
                    "  FROM pp_prod_order_operation op "
                    "  JOIN pp_production_order o ON o.id = op.order_id "
                    " WHERE op.company_id = :cid AND op.deleted_at IS NULL "
                    "   AND o.deleted_at IS NULL "
                    "   AND o.status NOT IN ('COMPLETED','CLOSED','CANCELLED') "
                    "   AND op.status <> 'COMPLETED'"
                ),
                {"cid": self.ctx.company_id},
            )
        ).fetchall()

        load: dict[tuple[str, int], Decimal] = {}
        focus: dict[tuple[str, int], Decimal] = {}
        detail: list[dict[str, Any]] = []
        for (
            wc, op_name, seq, setup, run, start, doc_no, product, status, qty, refs
        ) in rows:
            if not wc:
                continue
            start_date = _as_date(start)
            b = eng.bucket_index(start_date, starts) if start_date else 0
            if b < 0:
                continue
            hours = (_d(setup) + _d(run)) / Decimal("60")
            key = (wc, b)
            load[key] = load.get(key, Decimal("0")) + hours
            mine = bool(demand_doc_no) and demand_doc_no in _demand_refs(refs)
            if mine:
                focus[key] = focus.get(key, Decimal("0")) + hours
            detail.append(
                {
                    "work_centre_code": wc, "bucket": b, "hours": float(eng.r6(hours)),
                    "source": "COMMITTED", "document_no": doc_no,
                    "product_code": product, "operation": f"{seq} {op_name}".strip(),
                    "quantity": float(_d(qty)), "status": status,
                    "is_selected_demand": mine,
                }
            )
        return load, detail, focus

    async def _planned_load(
        self, starts: list[date], run_id: int | None, demand_doc_no: str | None = None
    ) -> tuple[
        dict[tuple[str, int], Decimal],
        list[dict[str, Any]],
        dict[tuple[str, int], Decimal],
    ]:
        """Hours MRP's un-converted proposals would add, from the live routing.

        The third return is the share belonging to `demand_doc_no`, matched on
        the proposal's root demand — which is why the engine carries that down
        through the BOM rather than stopping at the parent item.
        """
        if run_id is None:
            return {}, [], {}

        orders = list(
            (
                await self.session.execute(
                    select(PpMrpPlannedOrder).where(
                        PpMrpPlannedOrder.run_id == run_id,
                        PpMrpPlannedOrder.company_id == self.ctx.company_id,
                        PpMrpPlannedOrder.deleted_at.is_(None),
                        PpMrpPlannedOrder.order_type == "PRODUCTION",
                        PpMrpPlannedOrder.converted_to_doc_no.is_(None),
                    )
                )
            ).scalars().all()
        )
        if not orders:
            return {}, [], {}

        codes = sorted({o.item_code for o in orders})
        placeholders = ", ".join(f":c{i}" for i in range(len(codes)))
        params: dict[str, Any] = {f"c{i}": c for i, c in enumerate(codes)}
        routing_ops = (
            await self.session.execute(
                text(
                    "SELECT r.ProductCode, op.Seq, op.OperationName, op.WorkCentreCode, "
                    "       IFNULL(op.SetupMinutes,0), IFNULL(op.CycleSeconds,0) "
                    "  FROM ERP_Product.EngineeringRouting r "
                    "  JOIN ERP_Product.EngineeringRoutingOperation op ON op.RoutingId = r.Id "
                    f" WHERE r.ProductCode IN ({placeholders}) AND r.DeletedAt IS NULL "
                    "   AND r.Status IN ('ACTIVE','APPROVED') "
                    " ORDER BY r.ProductCode, op.Seq"
                ),
                params,
            )
        ).fetchall()

        by_product: dict[str, list[Any]] = {}
        for row in routing_ops:
            by_product.setdefault(row[0], []).append(row)

        load: dict[tuple[str, int], Decimal] = {}
        focus: dict[tuple[str, int], Decimal] = {}
        detail: list[dict[str, Any]] = []
        for o in orders:
            mine = bool(demand_doc_no) and demand_doc_no in {
                d.strip() for d in (o.demand_doc_no or "").split(",") if d.strip()
            }
            ops = by_product.get(o.item_code, [])
            for _, seq, op_name, wc, setup, cycle_s in ops:
                if not wc:
                    continue
                # The order is scheduled to *start* when it is released, so the
                # load lands in the release bucket, not the due bucket.
                b = max(0, o.release_bucket)
                if b >= len(starts):
                    continue
                hours = _d(setup) / Decimal("60") + (_d(o.quantity) * _d(cycle_s)) / Decimal("3600")
                key = (wc, b)
                load[key] = load.get(key, Decimal("0")) + hours
                if mine:
                    focus[key] = focus.get(key, Decimal("0")) + hours
                detail.append(
                    {
                        "work_centre_code": wc, "bucket": b, "hours": float(eng.r6(hours)),
                        "source": "PLANNED", "document_no": None,
                        "product_code": o.item_code,
                        "operation": f"{seq} {op_name}".strip(),
                        "quantity": float(_d(o.quantity)), "status": "PLANNED",
                        "is_selected_demand": mine,
                    }
                )
        return load, detail, focus

    # ─────────────────────────── the grid ───────────────────────────
    async def plan(
        self, *, horizon: int = eng.DEFAULT_HORIZON, today: date | None = None,
        include_planned: bool = True, demand_doc_no: str | None = None,
    ) -> dict[str, Any]:
        """The load grid.

        `demand_doc_no` does not filter the grid — it *marks* it. Every bar keeps
        the full factory load, and `focus_hours` says how much of it belongs to
        that demand. Filtering would answer the wrong question: a planner asking
        "can we take this order" needs to see it against the work already
        committed, not on an empty plant.
        """
        today = today or utcnow().date()
        starts = eng.bucket_starts(horizon, today)
        calendar = await self._calendar()
        centres = await self._work_centres()

        run_id = None
        run_no = None
        if include_planned:
            latest = (
                await self.session.execute(
                    select(PpMrpRun)
                    .where(
                        PpMrpRun.company_id == self.ctx.company_id,
                        PpMrpRun.deleted_at.is_(None),
                    )
                    .order_by(PpMrpRun.run_at.desc(), PpMrpRun.id.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if latest is not None:
                run_id, run_no = latest.id, latest.run_no

        committed, committed_detail, committed_focus = await self._committed_load(
            starts, demand_doc_no
        )
        planned, planned_detail, planned_focus = await self._planned_load(
            starts, run_id, demand_doc_no
        )

        rows: list[dict[str, Any]] = []
        for wc in centres:
            code = wc["code"]
            cells = []
            total_req = total_avail = total_focus = Decimal("0")
            peak = Decimal("0")
            overloaded = 0

            for b, start in enumerate(starts):
                avail = (
                    Decimal(self._working_days(start, calendar))
                    * wc["hours_per_day"]
                    * (wc["oee_pct"] / Decimal("100"))
                )
                c_hours = committed.get((code, b), Decimal("0"))
                p_hours = planned.get((code, b), Decimal("0"))
                req = c_hours + p_hours
                f_hours = committed_focus.get((code, b), Decimal("0")) + planned_focus.get(
                    (code, b), Decimal("0")
                )
                if avail > 0:
                    load_pct = (req / avail) * Decimal("100")
                elif req > 0:
                    # Work scheduled into a week the plant is shut. Not "infinite
                    # load" — it is a scheduling error, and reads as one.
                    load_pct = Decimal("999")
                else:
                    load_pct = Decimal("0")

                cells.append(
                    {
                        "bucket": b, "start": start,
                        "committed_hours": float(eng.r6(c_hours)),
                        "planned_hours": float(eng.r6(p_hours)),
                        "required_hours": float(eng.r6(req)),
                        # The selected demand's share of `required_hours`, so the
                        # bar can shade it inside the total instead of replacing it.
                        "focus_hours": float(eng.r6(f_hours)),
                        "focus_pct": float(
                            eng.r2((f_hours / avail) * Decimal("100")) if avail > 0 else Decimal("0")
                        ),
                        "available_hours": float(eng.r6(avail)),
                        "load_pct": float(eng.r2(load_pct)),
                        "is_overloaded": load_pct > 100,
                        "working_days": self._working_days(start, calendar),
                    }
                )
                total_req += req
                total_focus += f_hours
                total_avail += avail
                peak = max(peak, load_pct)
                if load_pct > 100:
                    overloaded += 1

            rows.append(
                {
                    "work_centre_code": code,
                    "work_centre_name": wc["name"],
                    "plant": wc["plant"],
                    "shift_pattern": wc["shift_pattern"],
                    "hours_per_day": float(wc["hours_per_day"]),
                    "oee_target_pct": float(wc["oee_pct"]),
                    "cells": cells,
                    "total_required_hours": float(eng.r6(total_req)),
                    "total_focus_hours": float(eng.r6(total_focus)),
                    "total_available_hours": float(eng.r6(total_avail)),
                    "overall_load_pct": float(
                        eng.r2((total_req / total_avail * Decimal("100")) if total_avail > 0 else Decimal("0"))
                    ),
                    "peak_load_pct": float(eng.r2(peak)),
                    "overloaded_buckets": overloaded,
                    "is_bottleneck": peak > 100,
                }
            )

        rows.sort(key=lambda r: (-r["peak_load_pct"], r["work_centre_code"]))
        return {
            "horizon": horizon,
            "starts": starts,
            "mrp_run_no": run_no,
            "includes_planned": include_planned,
            "work_centres": rows,
            "bottlenecks": [r["work_centre_code"] for r in rows if r["is_bottleneck"]],
            "_detail": committed_detail + planned_detail,
        }

    async def load_detail(
        self, work_centre_code: str, *, horizon: int = eng.DEFAULT_HORIZON,
        bucket: int | None = None, today: date | None = None,
    ) -> dict[str, Any]:
        """Every operation loading one work centre — what makes the number.

        This is the traceability the dashboard's percentage lacks: a planner can
        see 103% and then see the four operations that add up to it.
        """
        result = await self.plan(horizon=horizon, today=today)
        row = next(
            (r for r in result["work_centres"] if r["work_centre_code"] == work_centre_code),
            None,
        )
        if row is None:
            raise NotFoundError(f"Work centre '{work_centre_code}' not found or inactive")

        items = [d for d in result["_detail"] if d["work_centre_code"] == work_centre_code]
        if bucket is not None:
            items = [d for d in items if d["bucket"] == bucket]
        items.sort(key=lambda d: (d["bucket"], -d["hours"]))

        return {
            "work_centre_code": work_centre_code,
            "work_centre_name": row["work_centre_name"],
            "starts": result["starts"],
            "cells": row["cells"] if bucket is None else [row["cells"][bucket]],
            "peak_load_pct": row["peak_load_pct"],
            "operations": items,
            "committed_hours": float(sum(d["hours"] for d in items if d["source"] == "COMMITTED")),
            "planned_hours": float(sum(d["hours"] for d in items if d["source"] == "PLANNED")),
        }
