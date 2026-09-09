"""Un-delete a soft-deleted item in ERP_Master.Item.

Written for ITM-0004, which a data-quality pass soft-deleted on 2026-09-09 while
DOC-0002 (created 2026-08-28) still referenced it, turning that document into an
orphan and blocking the EngineeringDocument.ProductCode foreign key.

Restores `IsDeleted = 0` and nothing else. Category, name and costs are left
exactly as they were, so this cannot quietly become a data edit.

Writes a rollback file before touching anything, and refuses to run against an
item that is not soft-deleted.

Run:  python -m scripts.restore_item ITM-0004 --dry-run
      python -m scripts.restore_item ITM-0004
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import text

from app.core.database import SessionFactory, dispose_engine

FIELDS = ("Id", "Code", "Name", "ItemType", "Category", "BaseUom",
          "StandardCost", "IsDeleted", "ModifiedBy", "ModifiedDate")

# Categories the item-category master recognises. An item outside this set is
# invisible on both master pages even when it is active.
KNOWN_CATEGORIES = {
    "Raw Materials", "Components", "Semi-Finished Goods", "Finished Goods",
    "Packing Materials", "Production Consumables", "Machines & Equipment",
    "Maintenance Spares", "Office Stationery", "IT & Electronics",
    "Furniture & Fixtures", "Housekeeping & Safety",
}


async def main(code: str, dry_run: bool, user: str) -> None:
    async with SessionFactory() as s:
        row = (await s.execute(text(
            f"SELECT {', '.join(FIELDS)} FROM ERP_Master.Item WHERE Code = :c"),
            {"c": code})).fetchone()

        if row is None:
            print(f"  {code} has no row in ERP_Master.Item. Nothing to restore.")
            return

        data = dict(row._mapping)
        print(f"=== {code} ===")
        for k, v in data.items():
            print(f"  {k:<14} {v}")

        if not data["IsDeleted"]:
            print(f"\n  {code} is already active. Nothing to do.")
            return

        # Which documents this unblocks.
        docs = [r[0] for r in await s.execute(text(
            "SELECT DocumentCode FROM ERP_Product.EngineeringDocument"
            " WHERE ProductCode = :c AND DeletedAt IS NULL"), {"c": code})]
        print(f"\n  documents referencing it: {docs or 'none'}")

        if data["Category"] not in KNOWN_CATEGORIES:
            print(f"\n  NOTE: category {data['Category']!r} is not in the item-category"
                  " master, so this item will be active but hidden on both master"
                  " pages. Recategorising it is a separate decision.")

        if dry_run:
            print("\n  --dry-run: nothing written.")
            return

        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        rollback = Path(f"rollback_restore_item_{code}_{stamp}.sql")
        rollback.write_text(
            f"-- Undo the restore of {code} at {stamp}\n"
            f"UPDATE ERP_Master.Item SET IsDeleted = 1 WHERE Code = '{code}';\n",
            encoding="utf-8")
        print(f"\n  rollback written to {rollback.resolve()}")

        await s.execute(text(
            "UPDATE ERP_Master.Item"
            "   SET IsDeleted = 0, ModifiedBy = :u, ModifiedDate = CURRENT_TIMESTAMP"
            " WHERE Code = :c"), {"c": code, "u": user})
        await s.commit()

        now = (await s.execute(text(
            "SELECT IsDeleted FROM ERP_Master.Item WHERE Code = :c"),
            {"c": code})).scalar()
        print(f"  {code} restored. IsDeleted is now {now}.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("code", help="item code, e.g. ITM-0004")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--user", default="restore-script")
    args = p.parse_args()
    try:
        asyncio.run(main(args.code, args.dry_run, args.user))
    finally:
        asyncio.run(dispose_engine())
