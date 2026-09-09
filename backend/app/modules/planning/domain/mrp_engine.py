"""The MRP calculation.

A direct port of `frontend/src/lib/planFlow.ts` — same algorithm, same ordering,
same exception vocabulary — moved to the server so a run can be persisted,
audited, scheduled and compared. The port is deliberately faithful rather than
improved: the two can be diffed against each other to prove nothing changed, and
only then is the browser copy deleted.

The calculation, level by level, earliest bucket first:

    projected on hand = previous + scheduled receipts - gross requirement
    net requirement   = safety stock - projected on hand, when that is positive
    planned receipt   = net requirement, sized to the item's lot rule
    planned release   = receipt bucket - lead time in buckets

A manufactured item's planned release becomes gross requirement on its
components in the release bucket. That is why low-level code ordering matters:
by the time a shell is planned, every flask that needs one has already said so.

Quantities are Decimal throughout. The browser did this in float; money and
quantity must not (CLAUDE.md §4.4), and the rounding is applied once, at the
point of persistence.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

BUCKET_DAYS = 7
DEFAULT_HORIZON = 12
MAX_BOM_DEPTH = 20

Q6 = Decimal("0.000001")
Q2 = Decimal("0.01")

# Raised at most once per item, because twelve identical messages about one item
# is not twelve pieces of information — and a list a planner scrolls past is a
# list a planner stops reading.
ONCE_PER_ITEM = {
    "LOT_SIZE_ROUNDING",
    "INSIDE_FROZEN_WINDOW",
    "NO_BOM",
    "EXCESS_STOCK",
    "MPS_IN_THE_PAST",
    "MPS_UNDER_DEMAND",
}

LIVE_BOM_STATUSES = {"ACTIVE", "APPROVED"}
OPEN_PO_STATUSES = {"APPROVED", "IN_PROGRESS", "PARTIALLY_EXECUTED"}
CLOSED_WO_STATUSES = {"COMPLETED", "CLOSED", "CANCELLED"}
CLOSED_DEMAND_STATUSES = {"CLOSED", "CANCELLED"}


def _d(v: Any) -> Decimal:
    if v is None or v == "":
        return Decimal("0")
    return Decimal(str(v))


def r6(v: Decimal) -> Decimal:
    return v.quantize(Q6, rounding=ROUND_HALF_UP)


def r2(v: Decimal) -> Decimal:
    return v.quantize(Q2, rounding=ROUND_HALF_UP)


def _fmt(v: Decimal) -> str:
    """Quantities inside exception text read as whole numbers where they are."""
    q = r6(v).normalize()
    return f"{q:f}" if q % 1 else f"{int(q):,}"


# ═══════════════════════════ Time buckets ═══════════════════════════
def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def bucket_starts(count: int, frm: date) -> list[date]:
    first = monday_of(frm)
    return [first + timedelta(days=BUCKET_DAYS * i) for i in range(count)]


def bucket_index(d: date | None, starts: list[date]) -> int:
    """Bucket a date falls in. Anything before the horizon lands in bucket 0 —
    an overdue requirement is needed now, not never."""
    if d is None or not starts:
        return -1
    if d < starts[0]:
        return 0
    delta = (d - starts[0]).days // BUCKET_DAYS
    return delta if 0 <= delta < len(starts) else -1


# ═══════════════════════════ Inputs ═══════════════════════════
@dataclass
class BomLine:
    item_code: str
    qty_per: Decimal
    scrap_pct: Decimal


@dataclass
class Bom:
    doc_no: str
    product_code: str
    base_qty: Decimal
    status: str
    revision: int
    is_default: bool
    lines: list[BomLine] = field(default_factory=list)

    @property
    def is_live(self) -> bool:
        return self.status in LIVE_BOM_STATUSES


@dataclass
class Policy:
    item_code: str
    lot_size_rule: str
    min_order_qty: Decimal
    order_multiple: Decimal
    safety_stock_override: Decimal | None
    lead_time_override: int | None
    frozen_days: int


@dataclass
class ItemInfo:
    """What planning knows about an item, from stock first and the item master
    as the fallback. A component never yet stocked has no stock row; planning
    still has to be able to order it."""

    code: str
    name: str = ""
    uom: str = "NOS"
    available: Decimal = Decimal("0")
    safety_stock: Decimal = Decimal("0")
    lead_time_days: int = 7
    rate: Decimal = Decimal("0")
    max_level: Decimal = Decimal("0")
    is_manufactured: bool = False
    has_bom: bool = False
    policy: Policy | None = None


@dataclass
class DemandLine:
    doc_no: str
    product_code: str
    product_name: str
    uom: str
    qty: Decimal
    qty_planned: Decimal
    required_on: date | None
    status: str
    # Firm demand is a commitment — a sales order, an export contract, a
    # customer schedule. Forecast demand is a guess that a firm order will
    # arrive. The two must never simply be added together.
    source: str = "SALES_ORDER"
    is_firm: bool = True

    @property
    def is_forecast(self) -> bool:
        return not self.is_firm or self.source.upper() == "FORECAST"


@dataclass
class MpsLine:
    doc_no: str
    product_code: str
    bucket: int
    planned_qty: Decimal
    status: str
    # The week this line was scheduled for. Authoritative — `bucket` is the
    # index it had when the schedule was written, which stops meaning anything
    # the moment the planning horizon rolls forward.
    bucket_start: date | None = None
    demand_qty: Decimal = Decimal("0")
    is_firm: bool = False
    # The demand this bucket was scheduled for, when the schedule was built for
    # one order rather than by smoothing a product's whole demand stream.
    demand_doc_no: str | None = None


@dataclass
class ScheduledReceipt:
    item_code: str
    qty: Decimal
    due_date: date | None


# ═══════════════════════════ Outputs ═══════════════════════════
@dataclass
class PlanCell:
    bucket: int
    start: date
    gross_requirement: Decimal
    scheduled_receipts: Decimal
    projected_on_hand: Decimal
    net_requirement: Decimal
    planned_receipt: Decimal
    release_bucket: int | None
    release_date: date | None


@dataclass
class ItemPlan:
    item_code: str
    item_name: str
    uom: str
    llc: int
    is_manufactured: bool
    opening_stock: Decimal
    safety_stock: Decimal
    lead_time_days: int
    rate: Decimal
    cells: list[PlanCell]


@dataclass
class PlannedOrder:
    item_code: str
    item_name: str
    uom: str
    llc: int
    order_type: str
    quantity: Decimal
    net_requirement: Decimal
    unit_rate: Decimal
    value: Decimal
    bucket: int
    due_date: date
    release_bucket: int
    release_date: date
    is_late: bool
    days_late: int
    pegged_to: str
    lead_time_days: int
    # The customer demand at the root of this requirement. `pegged_to` names the
    # parent order one level up; after a four-level explosion that is a
    # sub-assembly code and tells a buyer nothing about which order is waiting.
    demand_doc_no: str = ""




@dataclass
class Exception_:
    severity: str
    exception_type: str
    item_code: str
    item_name: str
    message: str
    suggested_action: str


@dataclass
class MrpResult:
    first_bucket_start: date
    horizon: int
    starts: list[date]
    plans: list[ItemPlan]
    planned_orders: list[PlannedOrder]
    exceptions: list[Exception_]

    @property
    def stats(self) -> dict[str, Any]:
        purchases = [o for o in self.planned_orders if o.order_type == "PURCHASE"]
        return {
            "items_planned": len({p.item_code for p in self.plans}),
            "purchase_orders": len(purchases),
            "production_orders": len(self.planned_orders) - len(purchases),
            "purchase_value": r2(sum((o.value for o in purchases), Decimal("0"))),
            "late_orders": len([o for o in self.planned_orders if o.is_late]),
            "exception_count": len(self.exceptions),
        }


# ═══════════════════════════ Helpers ═══════════════════════════
def default_bom_for(product_code: str, boms: list[Bom]) -> Bom | None:
    """The BOM planning uses when nothing else is specified: the highest live
    revision flagged default, falling back to the highest live revision."""
    live = sorted(
        (b for b in boms if b.product_code == product_code and b.is_live),
        key=lambda b: b.revision,
        reverse=True,
    )
    if not live:
        return None
    for b in live:
        if b.is_default:
            return b
    return live[0]


def low_level_codes(boms: list[Bom]) -> dict[str, int]:
    """An item's deepest position in any structure.

    MRP must plan a component only after every parent that consumes it, or the
    shell is netted before the flask has told it how many are needed.
    """
    children: dict[str, list[str]] = {}
    for b in boms:
        if not b.is_live:
            continue
        children.setdefault(b.product_code, []).extend(l.item_code for l in b.lines)

    llc: dict[str, int] = {}

    def assign(code: str, level: int, path: tuple[str, ...]) -> None:
        # A cycle in the structure would recurse forever; stop and let the
        # depth cap catch anything pathological.
        if code in path or level > MAX_BOM_DEPTH:
            return
        current = llc.get(code, 0)
        if level > current or code not in llc:
            llc[code] = max(current, level)
        for child in children.get(code, []):
            assign(child, max(current, level) + 1, path + (code,))

    all_children = {c for kids in children.values() for c in kids}
    roots = [c for c in children if c not in all_children]
    for r in roots:
        assign(r, 0, ())
    # An orphan structure — reachable from no root — still gets planned.
    for c in list(children):
        if c not in llc:
            assign(c, 0, ())
    for c in all_children:
        llc.setdefault(c, 1)
    return llc


def apply_lot_size(net: Decimal, policy: Policy | None) -> Decimal:
    """Rounds a net requirement to something the supplier or the line accepts."""
    if net <= 0:
        return Decimal("0")
    if policy is None:
        return net
    q = net
    if policy.lot_size_rule == "FIXED_ORDER_QTY" and policy.min_order_qty > 0:
        q = Decimal(math.ceil(net / policy.min_order_qty)) * policy.min_order_qty
    elif policy.lot_size_rule == "MIN_ORDER_QTY":
        q = max(net, policy.min_order_qty)
    if policy.order_multiple > 0:
        q = Decimal(math.ceil(q / policy.order_multiple)) * policy.order_multiple
    return q


# ═══════════════════════════ The run ═══════════════════════════
def run_mrp(
    *,
    demand: list[DemandLine],
    mps: list[MpsLine],
    scheduled_receipts: list[ScheduledReceipt],
    boms: list[Bom],
    items: dict[str, ItemInfo],
    today: date,
    horizon: int = DEFAULT_HORIZON,
    use_mps: bool = True,
    consume_forecast: bool = True,
    demand_doc_no: str | None = None,
) -> MrpResult:
    """Plan the demand.

    `demand_doc_no` scopes the run to a single demand document — make-to-order,
    where the planner asks "what do I need to buy and make for *this* order".
    Everything downstream is unchanged: stock and open purchase orders still net
    off, because material already in the building is available to this order
    like any other. What changes is only which independent demand is loaded.
    """
    if demand_doc_no:
        demand = [d for d in demand if d.doc_no == demand_doc_no]
        # A schedule only replaces demand it was built for; an aggregate MPS row
        # covering the same product belongs to other orders and must not be
        # pulled into a single-order plan.
        mps = [m for m in mps if getattr(m, "demand_doc_no", None) == demand_doc_no]

    starts = bucket_starts(horizon, today)
    plans: list[ItemPlan] = []
    planned_orders: list[PlannedOrder] = []
    exceptions: list[Exception_] = []
    seen_once: set[str] = set()

    def raise_(severity: str, code: str, name: str, type_: str, message: str, action: str) -> None:
        if type_ in ONCE_PER_ITEM:
            key = f"{type_}:{code}"
            if key in seen_once:
                return
            seen_once.add(key)
        exceptions.append(Exception_(severity, type_, code, name, message, action))

    def item_of(code: str) -> ItemInfo:
        info = items.get(code)
        if info is None:
            # Never seen in stock or the item master, but a BOM references it.
            info = ItemInfo(code=code, name=code)
        info.has_bom = default_bom_for(code, boms) is not None
        # An item the master calls manufactured is planned as production even
        # with no BOM — otherwise MRP quietly proposes buying something the
        # plant makes, and nobody notices until purchasing asks who supplies it.
        info.is_manufactured = info.has_bom or info.is_manufactured
        return info

    blank = lambda: [Decimal("0")] * horizon  # noqa: E731

    # ── 1. Independent demand, bucketed ──────────────────────────────
    gross: dict[str, list[Decimal]] = {}
    pegs: dict[str, list[list[str]]] = {}
    # The demand documents at the root of each requirement. Kept separately from
    # `pegs` because they answer different questions: a peg names the parent one
    # level up, a root names the customer order the whole branch exists for.
    roots: dict[str, list[list[str]]] = {}

    def add_gross(
        code: str,
        bucket: int,
        qty: Decimal,
        peg: str,
        root_docs: tuple[str, ...] = (),
    ) -> None:
        if qty <= 0 or bucket < 0 or bucket >= horizon:
            return
        gross.setdefault(code, blank())
        pegs.setdefault(code, [[] for _ in range(horizon)])
        roots.setdefault(code, [[] for _ in range(horizon)])
        gross[code][bucket] += qty
        if peg not in pegs[code][bucket]:
            pegs[code][bucket].append(peg)
        for doc in root_docs:
            if doc and doc not in roots[code][bucket]:
                roots[code][bucket].append(doc)

    def roots_for(code: str, bucket: int) -> tuple[str, ...]:
        """Which demand documents this item's requirement in `bucket` serves.

        Falls back to every root recorded for the item. A planned receipt covers
        a net requirement that can carry across buckets, so a bucket with no
        root of its own is being built to cover a neighbouring one; naming the
        item's whole demand set is then honest, where naming nothing would lose
        the trail entirely.
        """
        per = roots.get(code)
        if not per:
            return ()
        if per[bucket]:
            return tuple(per[bucket])
        seen: list[str] = []
        for entry in per:
            for doc in entry:
                if doc not in seen:
                    seen.append(doc)
        return tuple(seen)

    mps_products = {m.product_code for m in mps if m.status != "DRAFT"}
    # Demand set aside because an MPS covers the product, so the two can be
    # compared once every line has been seen.
    mps_skipped: dict[str, Decimal] = {}

    if use_mps:
        for m in mps:
            if m.status == "DRAFT":
                continue
            # Place the line by its date. Using the stored `bucket` index instead
            # silently time-shifts the whole schedule as soon as the horizon
            # moves on: a line written for 10 Aug with index 0 would be planned
            # into whatever week is index 0 today. On live data that was a
            # four-week shift, with no warning anywhere.
            if m.bucket_start is not None:
                b = bucket_index(m.bucket_start, starts)
                if m.bucket_start < starts[0]:
                    # Past-dated lines are pulled into the current week rather
                    # than dropped — the quantity is still wanted. But a schedule
                    # whose weeks have already gone by has not been re-cut, and
                    # the planner needs to know that before trusting the plan.
                    raise_(
                        "WARNING", m.product_code, m.product_code, "MPS_IN_THE_PAST",
                        f"{m.doc_no} still schedules weeks before {starts[0]} — the "
                        f"earliest is {m.bucket_start}. Those quantities were pulled "
                        "into the current week.",
                        "Re-cut the master schedule from the current week.",
                    )
                elif b < 0:
                    continue
            else:
                b = m.bucket
            add_gross(
                m.product_code,
                b,
                _d(m.planned_qty),
                f"{m.doc_no} wk of {starts[b] if 0 <= b < horizon else '?'}",
                (m.demand_doc_no,) if m.demand_doc_no else (),
            )

    # ── Forecast consumption ─────────────────────────────────────────────
    #
    # A forecast is a guess that a firm order will arrive. When the order does
    # arrive, planning both is planning the same demand twice.
    #
    # Sales Forecast already nets at *release* time — `sf_consumption` records
    # which order consumed which forecast line, and the released quantity in
    # `pp_demand` is already net of it. But that is a point-in-time batch: an
    # order raised after the release still lands in `pp_demand` beside a
    # forecast line that has not been reduced. This applies the same rule again
    # at run time, so the plan is right regardless of when the release last ran.
    #
    # Consumption is keyed on the calendar month, not the weekly bucket, because
    # that is the period a forecast is stated in — a monthly forecast dated the
    # 1st would otherwise never meet an order dated the 14th.
    consumed: dict[tuple[str, str], Decimal] = {}
    if consume_forecast:
        firm_by_period: dict[tuple[str, str], Decimal] = {}
        for dl in demand:
            if dl.status in CLOSED_DEMAND_STATUSES or dl.is_forecast or not dl.required_on:
                continue
            open_qty = max(Decimal("0"), _d(dl.qty) - _d(dl.qty_planned))
            if open_qty <= 0:
                continue
            key = (dl.product_code, dl.required_on.strftime("%Y-%m"))
            firm_by_period[key] = firm_by_period.get(key, Decimal("0")) + open_qty
        consumed = dict(firm_by_period)

    for dl in demand:
        if dl.status in CLOSED_DEMAND_STATUSES:
            continue
        # A product with a committed MPS is planned from the MPS, not twice.
        # That makes the schedule the only thing standing between the customer
        # and the plan, so a schedule that covers less than the demand it
        # replaced has to be said out loud — otherwise the demand simply
        # disappears from the plan with nothing to show for it.
        if use_mps and dl.product_code in mps_products:
            # Only demand that falls inside the horizon is comparable with a
            # schedule that only covers the horizon.
            if bucket_index(dl.required_on, starts) >= 0:
                mps_skipped[dl.product_code] = mps_skipped.get(
                    dl.product_code, Decimal("0")
                ) + max(Decimal("0"), _d(dl.qty) - _d(dl.qty_planned))
            continue
        open_qty = max(Decimal("0"), _d(dl.qty) - _d(dl.qty_planned))
        if open_qty <= 0:
            continue

        if consume_forecast and dl.is_forecast and dl.required_on:
            key = (dl.product_code, dl.required_on.strftime("%Y-%m"))
            pool = consumed.get(key, Decimal("0"))
            if pool > 0:
                eaten = min(pool, open_qty)
                consumed[key] = pool - eaten
                open_qty -= eaten
                raise_(
                    "INFO", dl.product_code, dl.product_name, "FORECAST_CONSUMED",
                    f"{_fmt(eaten)} {dl.uom} of the {dl.required_on:%b %Y} forecast for "
                    f"{dl.product_code} is already covered by firm orders, so only "
                    f"{_fmt(open_qty)} was planned.",
                    "None — this is the forecast being consumed as intended.",
                )
                if open_qty <= 0:
                    continue

        b = bucket_index(dl.required_on, starts)
        if b < 0:
            continue
        if dl.required_on and dl.required_on < today:
            raise_(
                "WARNING", dl.product_code, dl.product_name, "PAST_DUE_DEMAND",
                f"{dl.doc_no} was required on {dl.required_on} and is still open "
                f"for {_fmt(open_qty)} {dl.uom}.",
                "Confirm the new date with the customer, or expedite.",
            )
        add_gross(dl.product_code, b, open_qty, dl.doc_no, (dl.doc_no,))

    # Compare the schedule against the demand it displaced.
    if use_mps:
        mps_planned: dict[str, Decimal] = {}
        for m in mps:
            if m.status == "DRAFT":
                continue
            if m.bucket_start is not None and bucket_index(m.bucket_start, starts) < 0:
                continue
            mps_planned[m.product_code] = mps_planned.get(
                m.product_code, Decimal("0")
            ) + _d(m.planned_qty)
        for code, skipped in mps_skipped.items():
            scheduled = mps_planned.get(code, Decimal("0"))
            if skipped > scheduled:
                raise_(
                    "WARNING", code, code, "MPS_UNDER_DEMAND",
                    f"The master schedule plans {_fmt(scheduled)} for {code} inside the "
                    f"horizon, against {_fmt(skipped)} of open demand it replaced — "
                    f"{_fmt(skipped - scheduled)} of demand is not covered by the schedule.",
                    "Re-cut the master schedule, or plan this product from demand.",
                )

    # ── 2. Scheduled receipts already on the books ───────────────────
    receipts: dict[str, list[Decimal]] = {}
    for sr in scheduled_receipts:
        b = bucket_index(sr.due_date, starts)
        if sr.qty <= 0 or b < 0:
            continue
        receipts.setdefault(sr.item_code, blank())
        receipts[sr.item_code][b] += _d(sr.qty)

    # ── 3. Net, level by level ───────────────────────────────────────
    llc = low_level_codes(boms)
    for code in set(gross) | set(receipts):
        llc.setdefault(code, 0)

    level = 0
    while True:
        max_level = max(llc.values(), default=0)
        if level > max_level:
            break
        codes = sorted(
            c for c, l in list(llc.items())
            if l == level and (c in gross or c in receipts)
        )

        for code in codes:
            item = item_of(code)
            g = gross.get(code, blank())
            r = receipts.get(code, blank())
            peg = pegs.get(code, [[] for _ in range(horizon)])

            # Lead time in whole buckets, always rounded up — half a week of
            # lead time still means the order goes out a week earlier.
            lead_buckets = math.ceil(item.lead_time_days / BUCKET_DAYS)
            cells: list[PlanCell] = []
            running = item.available

            for b in range(horizon):
                projected_before = running + r[b] - g[b]
                net = Decimal("0")
                planned_receipt = Decimal("0")
                release_bucket: int | None = None
                release_date: date | None = None

                if projected_before < item.safety_stock:
                    net = item.safety_stock - projected_before
                    planned_receipt = apply_lot_size(net, item.policy)
                    release_bucket = b - lead_buckets
                    release_date = starts[0] + timedelta(days=release_bucket * BUCKET_DAYS)

                    is_production = item.is_manufactured
                    days_late = -release_bucket * BUCKET_DAYS if release_bucket < 0 else 0

                    planned_orders.append(
                        PlannedOrder(
                            item_code=code, item_name=item.name, uom=item.uom, llc=level,
                            order_type="PRODUCTION" if is_production else "PURCHASE",
                            quantity=r6(planned_receipt),
                            net_requirement=r6(net),
                            unit_rate=r6(item.rate),
                            value=r2(planned_receipt * item.rate),
                            bucket=b, due_date=starts[b],
                            release_bucket=release_bucket, release_date=release_date,
                            is_late=release_bucket < 0, days_late=days_late,
                            pegged_to=", ".join(peg[b][:3]) or "—",
                            demand_doc_no=", ".join(roots_for(code, b)[:5]),
                            lead_time_days=item.lead_time_days,
                        )
                    )

                    if release_bucket < 0:
                        raise_(
                            "ERROR", code, item.name, "RELEASE_IN_THE_PAST",
                            f"{_fmt(planned_receipt)} {item.uom} is needed by {starts[b]}, "
                            f"but at {item.lead_time_days} days' lead time it had to be "
                            f"released on {release_date}.",
                            "Split the lot, or pull the due date out."
                            if is_production
                            else "Expedite with the supplier, or re-time the demand.",
                        )

                    if item.policy and item.policy.frozen_days > 0 and release_bucket >= 0:
                        frozen_until = today + timedelta(days=item.policy.frozen_days)
                        if starts[b] <= frozen_until:
                            raise_(
                                "WARNING", code, item.name, "INSIDE_FROZEN_WINDOW",
                                f"A new order lands on {starts[b]}, inside the "
                                f"{item.policy.frozen_days}-day frozen window.",
                                "Planner approval is required before this is released.",
                            )

                    if net > 0 and planned_receipt > net * Decimal("1.5"):
                        raise_(
                            "INFO", code, item.name, "LOT_SIZE_ROUNDING",
                            f"Net requirement is {_fmt(net)} {item.uom} but the lot rule "
                            f"raises the order to {_fmt(planned_receipt)}.",
                            "Expected — the excess carries into the following weeks.",
                        )

                    # A manufactured item's release is its components' requirement.
                    if is_production:
                        bom = default_bom_for(code, boms) if item.has_bom else None
                        if bom and bom.base_qty > 0:
                            child_bucket = max(0, release_bucket)
                            for line in bom.lines:
                                need = (
                                    (line.qty_per / bom.base_qty)
                                    * (Decimal("1") + line.scrap_pct / Decimal("100"))
                                    * planned_receipt
                                )
                                add_gross(
                                    line.item_code,
                                    child_bucket,
                                    need,
                                    f"{code} order wk {b + 1}",
                                    roots_for(code, b),
                                )
                                llc.setdefault(line.item_code, level + 1)
                        else:
                            raise_(
                                "ERROR", code, item.name, "NO_BOM",
                                f"{code} is planned for production but has no live bill of "
                                "material, so nothing was raised for its components.",
                                "Approve a BOM in engineering before this can be built.",
                            )

                running = projected_before + planned_receipt
                cells.append(
                    PlanCell(
                        bucket=b, start=starts[b],
                        gross_requirement=r6(g[b]),
                        scheduled_receipts=r6(r[b]),
                        projected_on_hand=r6(running),
                        net_requirement=r6(net),
                        planned_receipt=r6(planned_receipt),
                        release_bucket=release_bucket,
                        release_date=release_date,
                    )
                )

            if item.max_level > 0 and running > item.max_level:
                raise_(
                    "WARNING", code, item.name, "EXCESS_STOCK",
                    f"Projected stock at the end of the horizon is {_fmt(running)} "
                    f"{item.uom} against a maximum of {_fmt(item.max_level)}.",
                    "Review the lot size or defer the last order.",
                )

            plans.append(
                ItemPlan(
                    item_code=code, item_name=item.name, uom=item.uom, llc=level,
                    is_manufactured=item.is_manufactured,
                    opening_stock=r6(item.available),
                    safety_stock=r6(item.safety_stock),
                    lead_time_days=item.lead_time_days,
                    rate=r6(item.rate),
                    cells=cells,
                )
            )
        level += 1

    plans.sort(key=lambda p: (p.llc, p.item_code))
    planned_orders.sort(key=lambda o: (o.release_date, o.item_code))

    return MrpResult(
        first_bucket_start=starts[0],
        horizon=horizon,
        starts=starts,
        plans=plans,
        planned_orders=planned_orders,
        exceptions=exceptions,
    )
