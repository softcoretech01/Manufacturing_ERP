"""Align item categories with the Item Category master.

The problem
-----------
The Masters portal splits items into two groups, Product Items and Company
Items, by looking each item's `Category` up in the Item Category master and
reading that category's parent. The master defines twelve categories:

    Product Items   Raw Materials, Components, Semi-Finished Goods,
                    Finished Goods, Packing Materials, Production Consumables
    Company Items   Machines & Equipment, Maintenance Spares, Office Stationery,
                    IT & Electronics, Furniture & Fixtures, Housekeeping & Safety

The item data uses different words for five of the six manufacturing ones:

    data              master
    Raw Material  →   Raw Materials
    Component     →   Components
    Sub-assembly  →   Semi-Finished Goods
    Packing       →   Packing Materials
    Consumable    →   Production Consumables
    Finished Goods    (the only one that already matches)

A category that is not in the master has no parent, so the lookup returns
nothing and the item falls out of Product Items entirely. That is why the
Product Items screen shows three finished goods and none of the steel coil,
components, packing or consumables that production actually consumes — sixteen
of nineteen items were invisible.

The fix is to the data, not the screen: the Item Category master is a master,
configurable without code changes (CLAUDE.md §5.1), so it is the authority and
the items are renamed to match it.

    python scripts/fix_item_categories.py            # dry run
    python scripts/fix_item_categories.py --commit
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.database import session_scope  # noqa: E402

# data value → Item Category master name
RENAME = {
    "Raw Material": "Raw Materials",
    "Component": "Components",
    "Sub-assembly": "Semi-Finished Goods",
    "Packing": "Packing Materials",
    "Consumable": "Production Consumables",
}

# Every name the master recognises, so anything left over is reported rather
# than silently kept.
MASTER_CATEGORIES = {
    "Raw Materials",
    "Components",
    "Semi-Finished Goods",
    "Finished Goods",
    "Packing Materials",
    "Production Consumables",
    "Machines & Equipment",
    "Maintenance Spares",
    "Office Stationery",
    "IT & Electronics",
    "Furniture & Fixtures",
    "Housekeeping & Safety",
}


async def main(commit: bool) -> None:
    async with session_scope() as session:
        print("=== categories in use now ===")
        rows = (
            await session.execute(
                text(
                    "SELECT IFNULL(Category, '(none)') AS category, COUNT(*) AS n "
                    "FROM ERP_Master.Item WHERE IsDeleted = 0 "
                    "GROUP BY Category ORDER BY category"
                )
            )
        ).mappings().all()
        for r in rows:
            known = "ok" if r["category"] in MASTER_CATEGORIES else "NOT IN MASTER"
            arrow = f"  ->  {RENAME[r['category']]}" if r["category"] in RENAME else ""
            print(f"  {r['category']:24} {r['n']:>3}   {known}{arrow}")

        unmapped = [
            r["category"]
            for r in rows
            if r["category"] not in MASTER_CATEGORIES and r["category"] not in RENAME
        ]
        if unmapped:
            print(f"\n  no mapping for: {unmapped} — these stay as they are.")

        if not commit:
            print("\n--dry-run: nothing written. Re-run with --commit to apply.")
            return

        total = 0
        for old, new in RENAME.items():
            n = (
                await session.execute(
                    text(
                        "UPDATE ERP_Master.Item "
                        "   SET Category = :new, ModifiedBy = 'data-quality-fix', "
                        "       ModifiedDate = CURRENT_TIMESTAMP "
                        " WHERE Category = :old"
                    ).bindparams(old=old, new=new)
                )
            ).rowcount
            if n:
                print(f"  {old:24} -> {new:24} {n} item(s)")
            total += n
        await session.commit()
        print(f"\nrenamed {total} item categories.")

        print("\n=== categories after ===")
        for r in (
            await session.execute(
                text(
                    "SELECT IFNULL(Category, '(none)') AS category, COUNT(*) AS n "
                    "FROM ERP_Master.Item WHERE IsDeleted = 0 "
                    "GROUP BY Category ORDER BY category"
                )
            )
        ).mappings().all():
            known = "ok" if r["category"] in MASTER_CATEGORIES else "NOT IN MASTER"
            print(f"  {r['category']:24} {r['n']:>3}   {known}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", action="store_true", help="Actually write.")
    ap.add_argument("--dry-run", action="store_true", help="Default. Writes nothing.")
    asyncio.run(main(commit=ap.parse_args().commit))
