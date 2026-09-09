"""Copy an item from the legacy admin_erp.Item into ERP_Master.Item, retired.

Written for ITM-0006. DOC-0004 was filed against it on 2026-09-08, while the
/items endpoint still read admin_erp.Item. The endpoint was later repointed to
ERP_Master.Item, where ITM-0006 has no row, so the document became an orphan and
blocked the EngineeringDocument.ProductCode foreign key.

The row is copied verbatim from the legacy master and inserted with
`IsDeleted = 1`. That distinction matters:

  * a foreign key only requires the referenced row to EXIST, so a retired item
    satisfies it;
  * the application filters on `IsDeleted = 0`, so a retired item never appears
    in a product dropdown.

The document therefore keeps its real, original reference, nothing is invented to
satisfy the constraint, and no new product becomes selectable.

`Id` is not copied. ERP_Master.Item already uses the legacy id, and nothing in
engineering keys an item by id -- BOMs, routings, documents and costing all use
`Code`. AUTO_INCREMENT assigns a fresh one.

Run:  python -m scripts.migrate_item_to_master ITM-0006 --dry-run
      python -m scripts.migrate_item_to_master ITM-0006
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import text

from app.core.database import SessionFactory, dispose_engine

SOURCE = "admin_erp"
TARGET = "ERP_Master"
SHOW = ("Code", "Name", "ShortName", "ItemType", "Category", "BaseUom",
        "StandardCost", "IsDeleted")


async def column_names(session, schema: str) -> list[str]:
    return [r[0] for r in await session.execute(text(
        "SELECT COLUMN_NAME FROM information_schema.columns"
        " WHERE TABLE_SCHEMA = :s AND TABLE_NAME = 'Item'"
        " ORDER BY ORDINAL_POSITION"), {"s": schema})]


async def main(code: str, dry_run: bool, user: str) -> None:
    async with SessionFactory() as s:
        src_cols = await column_names(s, SOURCE)
        tgt_cols = await column_names(s, TARGET)
        shared = [c for c in src_cols if c in tgt_cols and c != "Id"]
        dropped = sorted(set(src_cols) ^ set(tgt_cols))
        if dropped:
            print(f"  columns not common to both tables (skipped): {dropped}")

        existing = (await s.execute(text(
            f"SELECT Id, IsDeleted FROM {TARGET}.Item WHERE Code = :c"),
            {"c": code})).fetchone()
        if existing:
            print(f"  {code} already exists in {TARGET}.Item"
                  f" (Id={existing[0]}, IsDeleted={existing[1]}). Nothing to do.")
            return

        row = (await s.execute(text(
            f"SELECT {', '.join(shared)} FROM {SOURCE}.Item WHERE Code = :c"),
            {"c": code})).fetchone()
        if row is None:
            print(f"  {code} has no row in {SOURCE}.Item either. Cannot migrate.")
            return

        data = dict(row._mapping)
        data["IsDeleted"] = 1                 # arrives retired, never selectable
        data["CreatedBy"] = user
        data["ModifiedBy"] = user
        data["ModifiedDate"] = datetime.now(UTC).replace(tzinfo=None)

        print(f"=== {code}: {SOURCE}.Item -> {TARGET}.Item ===")
        for k in SHOW:
            if k in data:
                note = "  <- forced" if k == "IsDeleted" else ""
                print(f"  {k:<16} {data[k]}{note}")
        print(f"  {len(shared)} column(s) copied verbatim, Id reassigned by the table")

        blockers = [r[0] for r in await s.execute(text(
            "SELECT DocumentCode FROM ERP_Product.EngineeringDocument"
            " WHERE ProductCode = :c"), {"c": code})]
        print(f"  documents this unblocks: {blockers or 'none'}")

        if dry_run:
            print("\n  --dry-run: nothing written.")
            return

        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        rollback = Path(f"rollback_migrate_item_{code}_{stamp}.sql")
        rollback.write_text(
            f"-- Undo the migration of {code} at {stamp}.\n"
            f"-- Drop the foreign key first if it has been added, or this is refused.\n"
            f"DELETE FROM {TARGET}.Item WHERE Code = '{code}' AND IsDeleted = 1;\n",
            encoding="utf-8")
        print(f"\n  rollback written to {rollback.resolve()}")

        cols = ", ".join(shared)
        binds = ", ".join(f":{c}" for c in shared)
        await s.execute(text(f"INSERT INTO {TARGET}.Item ({cols}) VALUES ({binds})"),
                        data)
        await s.commit()

        made = (await s.execute(text(
            f"SELECT Id, Code, Name, IsDeleted FROM {TARGET}.Item WHERE Code = :c"),
            {"c": code})).fetchone()
        print(f"  inserted: Id={made[0]} Code={made[1]} Name={made[2]!r}"
              f" IsDeleted={made[3]}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("code", help="item code, e.g. ITM-0006")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--user", default="migrate-script")
    args = p.parse_args()
    try:
        asyncio.run(main(args.code, args.dry_run, args.user))
    finally:
        asyncio.run(dispose_engine())
