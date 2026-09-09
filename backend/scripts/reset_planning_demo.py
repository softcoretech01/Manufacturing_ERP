"""Clear the planning module's transactional data for a clean walkthrough.

Scope — what this touches
-------------------------
Only the documents planning *produces*:

    pp_demand, pp_mps, pp_forecast
    pp_mrp_run, pp_mrp_plan_line, pp_mrp_planned_order, pp_mrp_exception
    pp_production_order, pp_prod_order_component, pp_prod_order_operation

Scope — what it must never touch
--------------------------------
Masters and engineering data, because they are the inputs planning reads and
losing them would make the module unusable rather than empty:

    ERP_Master.Item                      the item master
    ERP_Product.EngineeringBom(+Line)    bills of material
    ERP_Product.EngineeringRouting       routings
    WorkCentre                           capacity
    pp_planning_policy                   lot sizing and safety stock rules
    pp_calendar_day                      the working calendar
    pp_stock, pp_scheduled_receipt       stock and inbound orders

`pp_planning_policy` is deliberately kept: it is configuration maintained on a
Masters screen, not a document raised by a planner, and MRP without it silently
falls back to lot-for-lot with no safety stock.

This is a hard delete, unlike the application's soft delete (CLAUDE.md §4.2).
That is the point — a reset must leave the tables genuinely empty, not full of
rows the screens hide but MRP still has to reason about. It is therefore for
demo and development data only.

    python scripts/reset_planning_demo.py            # dry run, writes nothing
    python scripts/reset_planning_demo.py --commit
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.database import session_scope  # noqa: E402

# Children before parents, so nothing is orphaned midway if a statement fails.
CLEAR_IN_ORDER = [
    "pp_prod_order_operation",
    "pp_prod_order_component",
    "pp_production_order",
    "pp_mrp_exception",
    "pp_mrp_plan_line",
    "pp_mrp_planned_order",
    "pp_mrp_run",
    "pp_mps",
    "pp_forecast",
    "pp_demand",
]

PROTECTED = [
    ("ERP_Master.Item", "item master"),
    ("ERP_Product.EngineeringBom", "bills of material"),
    ("ERP_Product.EngineeringBomLine", "BOM lines"),
    ("ERP_Product.EngineeringRouting", "routings"),
    ("WorkCentre", "work centres"),
    ("pp_planning_policy", "planning policies"),
    ("pp_calendar_day", "working calendar"),
    ("pp_stock", "stock positions"),
    ("pp_scheduled_receipt", "inbound receipts"),
]


async def main(commit: bool) -> None:
    async with session_scope() as session:
        print("will clear:")
        total = 0
        for table in CLEAR_IN_ORDER:
            n = (await session.execute(text(f"SELECT COUNT(*) FROM `{table}`"))).scalar() or 0
            total += n
            print(f"  {table:30} {n:>6}")

        print("\nwill keep untouched:")
        for table, label in PROTECTED:
            try:
                n = (await session.execute(text(f"SELECT COUNT(*) FROM {table}"))).scalar()
                print(f"  {table:34} {n:>6}  ({label})")
            except Exception as exc:  # a protected table missing is worth seeing
                print(f"  {table:34}   ERR  {str(exc)[:60]}")

        if not commit:
            print(f"\n--dry-run: {total} rows would be deleted. Re-run with --commit.")
            return

        for table in CLEAR_IN_ORDER:
            await session.execute(text(f"DELETE FROM `{table}`"))
        await session.commit()
        print(f"\ncleared {total} rows across {len(CLEAR_IN_ORDER)} tables.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", action="store_true", help="Actually delete.")
    ap.add_argument("--dry-run", action="store_true", help="Default. Writes nothing.")
    asyncio.run(main(commit=ap.parse_args().commit))
