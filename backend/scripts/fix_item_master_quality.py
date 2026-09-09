"""Two data-quality corrections to the item master.

1. Retire four rows that are not real items
-------------------------------------------
    ITM-0001  "Vaccum Flask"   (misspelt, no price, no cost)
    ITM-0002  "Test"
    ITM-0003  "Test"
    ITM-0004  "Vaccum Flask"   (misspelt duplicate)

They are referenced by nothing — no BOM line, no BOM head, no routing, no
demand, no production order, no order component, no planning policy, no stock
balance and no ledger entry — so retiring them cannot orphan anything.

Retiring means two flags, because this table has two and they do different
things:

  Status = 'INACTIVE'   what the Masters screen's Deactivate button writes.
                        Cosmetic for list purposes.
  IsDeleted = 1         the table's actual soft delete, and the *only* thing
                        `ERP_Master.SpItem('LIST')` filters on. An item left at
                        IsDeleted = 0 keeps appearing in every item picker in
                        the application however inactive it is marked.

Setting only the first is the trap: the row reads as retired in the master and
is still offered to planners everywhere else. Both are set here. Nothing is
hard-deleted — a master never is (CLAUDE.md §4.2, §5.1).

Their cost is that every item picker in the application offers them. A planner
choosing "Vaccum Flask" instead of "Vacuum Flask 750 ml — Matte Black" gets a
product with no BOM, and MRP answers the resulting demand with a NO_BOM
exception rather than a plan.

2. One spelling for raw material
--------------------------------
`Item.ItemType` holds both `RAW` (the two real steel coils) and `RAW_MATERIAL`
(the two test rows above). A filter written against one silently misses the
other. The two test rows are moved to `RAW`, which is the spelling the live
data uses, leaving a single value in the column.

That makes the *data* consistent. It does not resolve the wider mismatch
between the data's vocabulary and the code's, which is reported rather than
changed here — see the note at the end of this file.

    python scripts/fix_item_master_quality.py            # dry run
    python scripts/fix_item_master_quality.py --commit
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.database import session_scope  # noqa: E402

RETIRE = ("ITM-0001", "ITM-0002", "ITM-0003", "ITM-0004")

# Every table that could hold a reference. Checked again at run time rather than
# trusted from a previous inspection — the data can change between the two.
REFERENCE_CHECKS = [
    ("BOM lines", "SELECT COUNT(*) FROM ERP_Product.EngineeringBomLine WHERE ItemCode IN :codes"),
    ("BOM heads", "SELECT COUNT(*) FROM ERP_Product.EngineeringBom WHERE ProductCode IN :codes"),
    ("routings", "SELECT COUNT(*) FROM ERP_Product.EngineeringRouting WHERE ProductCode IN :codes"),
    ("demand", "SELECT COUNT(*) FROM pp_demand WHERE product_code IN :codes"),
    ("master schedule", "SELECT COUNT(*) FROM pp_mps WHERE product_code IN :codes"),
    ("production orders", "SELECT COUNT(*) FROM pp_production_order WHERE product_code IN :codes"),
    ("order components", "SELECT COUNT(*) FROM pp_prod_order_component WHERE item_code IN :codes"),
    ("planning policies", "SELECT COUNT(*) FROM pp_planning_policy WHERE item_code IN :codes"),
    (
        "stock balances",
        "SELECT COUNT(*) FROM inv_stock_balance b "
        "JOIN ERP_Master.Item i ON i.Id = b.item_id WHERE i.Code IN :codes",
    ),
    (
        "stock ledger",
        "SELECT COUNT(*) FROM inv_stock_ledger l "
        "JOIN ERP_Master.Item i ON i.Id = l.item_id WHERE i.Code IN :codes",
    ),
]


async def main(commit: bool) -> None:
    async with session_scope() as session:
        print("=== items to retire ===")
        rows = (
            await session.execute(
                text(
                    "SELECT Code, Name, ItemType, Status, IsDeleted FROM ERP_Master.Item "
                    "WHERE Code IN :codes ORDER BY Code"
                ).bindparams(codes=RETIRE)
            )
        ).mappings().all()
        for r in rows:
            print(
                f"  {r['Code']:10} {r['Name']:20} {r['ItemType']:14} "
                f"{r['Status']:10} IsDeleted={r['IsDeleted']}"
            )
        if not rows:
            print("  (none found — already retired?)")

        print("\n=== references, which must all be zero ===")
        blocked = False
        for label, query in REFERENCE_CHECKS:
            try:
                n = (await session.execute(text(query).bindparams(codes=RETIRE))).scalar() or 0
            except Exception as exc:
                print(f"  {label:20} ERR {str(exc)[:60]}")
                blocked = True
                continue
            print(f"  {label:20} {n}")
            if n:
                blocked = True

        if blocked:
            raise SystemExit(
                "\nRefusing to retire: at least one item is still referenced, or a "
                "check could not run. A master may not be deactivated while an open "
                "transaction points at it (CLAUDE.md §5.1)."
            )

        print("\n=== item types before ===")
        for r in (
            await session.execute(
                text("SELECT ItemType, COUNT(*) n FROM ERP_Master.Item GROUP BY ItemType ORDER BY n DESC")
            )
        ).mappings().all():
            print(f"  {r['ItemType']:16} {r['n']}")

        if not commit:
            print("\n--dry-run: nothing written. Re-run with --commit to apply.")
            return

        retired = (
            await session.execute(
                text(
                    "UPDATE ERP_Master.Item "
                    "   SET Status = 'INACTIVE', IsDeleted = 1, "
                    "       ModifiedBy = 'data-quality-fix', "
                    "       ModifiedDate = CURRENT_TIMESTAMP "
                    " WHERE Code IN :codes AND (Status <> 'INACTIVE' OR IsDeleted = 0)"
                ).bindparams(codes=RETIRE)
            )
        ).rowcount
        renamed = (
            await session.execute(
                text("UPDATE ERP_Master.Item SET ItemType = 'RAW' WHERE ItemType = 'RAW_MATERIAL'")
            )
        ).rowcount
        await session.commit()

        print(f"\nretired {retired} item(s); normalised {renamed} item type(s) to RAW.")

        print("\n=== item types after ===")
        for r in (
            await session.execute(
                text("SELECT ItemType, COUNT(*) n FROM ERP_Master.Item GROUP BY ItemType ORDER BY n DESC")
            )
        ).mappings().all():
            print(f"  {r['ItemType']:16} {r['n']}")


# ── Reported, not changed ───────────────────────────────────────────────────
#
# The item master's vocabulary and the code's do not match, and this script
# deliberately does not reconcile them, because doing so touches live rows that
# MRP and Inventory both read:
#
#   data           FINISHED, COMPONENT, SEMI_FINISHED, RAW, PACKING, CONSUMABLE
#   core/enums.py  RAW_MATERIAL, FINISHED_GOODS, WIP, CONSUMABLE, PACKING, SPARE
#   frontend       FINISHED, SEMI_FINISHED, RAW_MATERIAL, PACKING, CONSUMABLE,
#                  SPARE, TOOLING, ACCESSORY
#
# Only Inventory bridges them, in `txn_doc_service._ITEM_TYPE_MAP`, which folds
# RAW / RAW_MATERIAL / COMPONENT all onto RAW_MATERIAL. Nothing else does, so a
# screen filtering on the enum's spelling finds none of the real items. Fixing
# it properly means choosing one vocabulary and migrating the other two — a
# decision with a migration behind it, not a data patch.

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", action="store_true", help="Actually write.")
    ap.add_argument("--dry-run", action="store_true", help="Default. Writes nothing.")
    asyncio.run(main(commit=ap.parse_args().commit))
