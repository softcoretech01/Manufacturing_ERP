"""Make-to-order planning rules — CLAUDE.md §8.

Two behaviours are covered, both of which the demand-driven workflow depends on
and neither of which is visible from the aggregate plan:

1. Scoping a run to one demand document plans that demand and nothing else, but
   still nets against stock — material already in the building is available to
   this order like any other.
2. The demand at the root of a requirement survives the BOM explosion. Pegging
   alone does not: it names the parent one level up, so four levels down a steel
   coil proposal is pegged to a sub-assembly and the buyer cannot tell which
   customer order is waiting on it.

Pure domain — no database, no framework.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.modules.planning.domain import mrp_engine as eng

TODAY = date(2026, 9, 7)  # a Monday, so buckets start cleanly


def _demand(doc_no: str, code: str, qty: int, weeks: int) -> eng.DemandLine:
    return eng.DemandLine(
        doc_no=doc_no,
        product_code=code,
        product_name=code,
        uom="NOS",
        qty=Decimal(qty),
        qty_planned=Decimal("0"),
        required_on=TODAY + timedelta(weeks=weeks),
        status="OPEN",
        is_firm=True,
    )


def _item(code: str, *, made: bool = False, bom: bool = False,
          available: int = 0) -> eng.ItemInfo:
    return eng.ItemInfo(
        code=code,
        name=code,
        available=Decimal(available),
        lead_time_days=7,
        rate=Decimal("10"),
        is_manufactured=made,
        has_bom=bom,
    )


# A two-level tree: the finished bottle is built from a body, which is cut from
# a steel coil. Three levels is the minimum that shows pegging losing the root.
BOMS = [
    eng.Bom(
        doc_no="BOM/FG",
        product_code="FG",
        base_qty=Decimal("1"),
        revision=1,
        status="ACTIVE",
        is_default=True,
        lines=[eng.BomLine(item_code="BODY", qty_per=Decimal("1"), scrap_pct=Decimal("0"))],
    ),
    eng.Bom(
        doc_no="BOM/BODY",
        product_code="BODY",
        base_qty=Decimal("1"),
        revision=1,
        status="ACTIVE",
        is_default=True,
        lines=[eng.BomLine(item_code="COIL", qty_per=Decimal("2"), scrap_pct=Decimal("0"))],
    ),
]

ITEMS = {
    "FG": _item("FG", made=True, bom=True),
    "BODY": _item("BODY", made=True, bom=True),
    "COIL": _item("COIL"),
}


def _run(demand: list[eng.DemandLine], **kw):
    return eng.run_mrp(
        demand=demand, mps=[], scheduled_receipts=[], boms=BOMS,
        items=dict(ITEMS), today=TODAY, horizon=12, **kw,
    )


def _qty(result, code: str) -> Decimal:
    return sum(
        (o.quantity for o in result.planned_orders if o.item_code == code),
        Decimal("0"),
    )


# ── scoping ─────────────────────────────────────────────────────────────────
def test_scoped_run_plans_only_the_named_demand() -> None:
    both = [_demand("DEM-1", "FG", 100, 4), _demand("DEM-2", "FG", 400, 6)]

    aggregate = _run(both)
    scoped = _run(both, demand_doc_no="DEM-1")

    assert _qty(aggregate, "FG") == Decimal("500")
    assert _qty(scoped, "FG") == Decimal("100")


def test_scoped_run_still_nets_against_stock() -> None:
    """Stock on hand belongs to the plant, not to a demand document.

    The alternative — planning gross for the selected order — would re-buy
    material already sitting in the store every time a planner scoped a run.
    """
    items = dict(ITEMS)
    items["FG"] = _item("FG", made=True, bom=True, available=30)

    result = eng.run_mrp(
        demand=[_demand("DEM-1", "FG", 100, 4)], mps=[], scheduled_receipts=[],
        boms=BOMS, items=items, today=TODAY, horizon=12, demand_doc_no="DEM-1",
    )
    assert _qty(result, "FG") == Decimal("70")


def test_unknown_demand_scope_plans_nothing() -> None:
    result = _run([_demand("DEM-1", "FG", 100, 4)], demand_doc_no="DEM-NOPE")
    assert result.planned_orders == []


# ── root-demand traceability ────────────────────────────────────────────────
def test_root_demand_survives_every_bom_level() -> None:
    """The coil proposal must name the customer order, not the sub-assembly."""
    result = _run([_demand("DEM-1", "FG", 100, 4)], demand_doc_no="DEM-1")

    by_item = {o.item_code: o for o in result.planned_orders}
    assert set(by_item) == {"FG", "BODY", "COIL"}
    for code, order in by_item.items():
        assert order.demand_doc_no == "DEM-1", f"{code} lost its root demand"

    # `pegged_to` still answers the other question — who consumes this — and the
    # two must not be confused: below the top level it names the parent item.
    assert "DEM-1" in by_item["FG"].pegged_to
    assert "FG" in by_item["BODY"].pegged_to


def test_root_demand_lists_every_contributing_order() -> None:
    result = _run([_demand("DEM-1", "FG", 100, 4), _demand("DEM-2", "FG", 100, 4)])

    coil = next(o for o in result.planned_orders if o.item_code == "COIL")
    assert "DEM-1" in coil.demand_doc_no
    assert "DEM-2" in coil.demand_doc_no


def test_aggregate_run_is_unchanged_by_the_new_argument() -> None:
    """The demand-scoped path must not alter the plan everyone already relies on."""
    demand = [_demand("DEM-1", "FG", 100, 4), _demand("DEM-2", "FG", 400, 6)]

    before = _run(demand)
    after = _run(demand, demand_doc_no=None)

    assert [(o.item_code, o.quantity, o.bucket) for o in before.planned_orders] == [
        (o.item_code, o.quantity, o.bucket) for o in after.planned_orders
    ]


# ── MPS scoping ─────────────────────────────────────────────────────────────
def test_scoped_run_ignores_a_schedule_built_for_another_demand() -> None:
    """An aggregate MPS row covers other orders and must not be pulled in.

    Without this, scoping to DEM-1 would plan DEM-2's schedule as well and the
    'what do I need for this order' answer would silently include someone else's.
    """
    mps = [
        eng.MpsLine(
            doc_no="MPS-2", product_code="FG", bucket=4,
            planned_qty=Decimal("999"), status="FIRM",
            bucket_start=TODAY + timedelta(weeks=4), demand_doc_no="DEM-2",
        )
    ]
    result = eng.run_mrp(
        demand=[_demand("DEM-1", "FG", 100, 4)], mps=mps, scheduled_receipts=[],
        boms=BOMS, items=dict(ITEMS), today=TODAY, horizon=12,
        demand_doc_no="DEM-1",
    )
    assert _qty(result, "FG") == Decimal("100")


def test_scoped_run_uses_a_schedule_built_for_its_own_demand() -> None:
    mps = [
        eng.MpsLine(
            doc_no="MPS-1", product_code="FG", bucket=4,
            planned_qty=Decimal("150"), status="FIRM",
            bucket_start=TODAY + timedelta(weeks=4), demand_doc_no="DEM-1",
        )
    ]
    result = eng.run_mrp(
        demand=[_demand("DEM-1", "FG", 100, 4)], mps=mps, scheduled_receipts=[],
        boms=BOMS, items=dict(ITEMS), today=TODAY, horizon=12,
        demand_doc_no="DEM-1",
    )
    # The schedule replaces the raw demand for the product it covers, so the
    # plan follows the smoothed 150, not the raw 100.
    assert _qty(result, "FG") == Decimal("150")
    fg = next(o for o in result.planned_orders if o.item_code == "FG")
    assert fg.demand_doc_no == "DEM-1"


@pytest.mark.parametrize("scope", [None, "DEM-1"])
def test_component_quantities_follow_the_bom_multiplier(scope: str | None) -> None:
    """Two coils per body, one body per bottle — 100 bottles is 200 coils."""
    result = _run([_demand("DEM-1", "FG", 100, 4)], demand_doc_no=scope)
    assert _qty(result, "BODY") == Decimal("100")
    assert _qty(result, "COIL") == Decimal("200")
