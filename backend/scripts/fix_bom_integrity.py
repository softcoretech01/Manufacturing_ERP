"""Retire phantom BOMs and enforce one default live BOM per product.

Two related defects in ERP_Product.EngineeringBom:

1. BOM-0001 and BOM-0002 are both ACTIVE, both marked default, and both raised
   against PRD-0001 -- a product that exists in no item master, whose only
   component (RM-AL-08) does not exist either. They are counted in the "Live"
   tab and are exploded by MRP.
2. Nothing stops a product having two default live BOMs. `defaultBomFor` picks
   with `.find(b => b.isDefault)`, so which one wins is array order.

This retires any BOM whose product is not in the item master (soft delete --
`SpManageEngineeringBom` already filters `DeletedAt IS NULL`, so a retired BOM
disappears from every read path without being destroyed), then adds a generated
column plus unique index so the second defect cannot recur.

The index is only added once the data is clean; a duplicate would make the ALTER
fail halfway.

Run:  python -m scripts.fix_bom_integrity --dry-run
      python -m scripts.fix_bom_integrity
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import text

from app.core.database import SessionFactory, dispose_engine

LIVE = ("ACTIVE", "APPROVED")

ADD_COLUMN = """
ALTER TABLE ERP_Product.EngineeringBom
  ADD COLUMN DefaultKey VARCHAR(50)
  GENERATED ALWAYS AS (
    IF(IsDefault = 1 AND DeletedAt IS NULL AND Status IN ('ACTIVE','APPROVED'),
       ProductCode, NULL)
  ) STORED
"""

ADD_INDEX = """
ALTER TABLE ERP_Product.EngineeringBom
  ADD UNIQUE KEY uk_engbom_default_per_product (DefaultKey)
"""


async def phantom_boms(session):
    """Live BOMs whose ProductCode is in neither item master."""
    master = {r[0] for r in await session.execute(
        text("SELECT Code FROM ERP_Master.Item"))}
    legacy = {r[0] for r in await session.execute(
        text("SELECT Code FROM admin_erp.Item"))}
    known = master | legacy

    rows = await session.execute(text(
        "SELECT Id, DocNo, ProductCode, Revision, Status, IsDefault"
        "  FROM ERP_Product.EngineeringBom"
        " WHERE DeletedAt IS NULL ORDER BY Id"))
    return [
        {"id": r[0], "docNo": r[1], "productCode": r[2],
         "revision": r[3], "status": r[4], "isDefault": bool(r[5])}
        for r in rows if r[2] not in known
    ]


async def duplicate_defaults(session):
    rows = await session.execute(text(
        "SELECT ProductCode, COUNT(*), GROUP_CONCAT(DocNo ORDER BY DocNo)"
        "  FROM ERP_Product.EngineeringBom"
        " WHERE IsDefault = 1 AND DeletedAt IS NULL"
        "   AND Status IN ('ACTIVE','APPROVED')"
        " GROUP BY ProductCode HAVING COUNT(*) > 1"))
    return [{"productCode": r[0], "count": r[1], "docNos": r[2]} for r in rows]


async def has_column(session, name: str) -> bool:
    return bool((await session.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns"
        " WHERE TABLE_SCHEMA='ERP_Product' AND TABLE_NAME='EngineeringBom'"
        "   AND COLUMN_NAME=:c"), {"c": name})).scalar())


async def has_index(session, name: str) -> bool:
    return bool((await session.execute(text(
        "SELECT COUNT(*) FROM information_schema.statistics"
        " WHERE TABLE_SCHEMA='ERP_Product' AND TABLE_NAME='EngineeringBom'"
        "   AND INDEX_NAME=:i"), {"i": name})).scalar())


async def main(dry_run: bool) -> None:
    async with SessionFactory() as session:
        phantoms = await phantom_boms(session)
        dupes = await duplicate_defaults(session)

        print("=== BOMs whose product is in no item master ===")
        if phantoms:
            for p in phantoms:
                print(f"  {p['docNo']:<16} product={p['productCode']:<14}"
                      f" rev{p['revision']} {p['status']} default={p['isDefault']}")
        else:
            print("  none")

        print("\n=== products with more than one default live BOM ===")
        if dupes:
            for d in dupes:
                print(f"  {d['productCode']}: {d['count']}  ({d['docNos']})")
        else:
            print("  none")

        col = await has_column(session, "DefaultKey")
        idx = await has_index(session, "uk_engbom_default_per_product")
        print(f"\nDefaultKey column: {'present' if col else 'missing'}"
              f" | unique index: {'present' if idx else 'missing'}")

        if dry_run:
            print(f"\n--dry-run: nothing written. Would retire {len(phantoms)} BOM(s)"
                  f" and {'add' if not idx else 'keep'} the unique index.")
            return

        # --- 1. retire the phantoms, after snapshotting them for rollback ---
        if phantoms:
            stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
            rollback = Path(f"rollback_bom_retire_{stamp}.sql")
            with rollback.open("w", encoding="utf-8") as fh:
                fh.write(f"-- Undo the BOM retirement of {stamp}\n")
                for p in phantoms:
                    fh.write("UPDATE ERP_Product.EngineeringBom SET DeletedAt = NULL"
                             f" WHERE Id = {p['id']};  -- {p['docNo']}\n")
            print(f"\nRollback snapshot written to {rollback.resolve()}")

            for p in phantoms:
                await session.execute(text(
                    "UPDATE ERP_Product.EngineeringBom"
                    "   SET DeletedAt = CURRENT_TIMESTAMP"
                    " WHERE Id = :id AND DeletedAt IS NULL"), {"id": p["id"]})
            await session.commit()
            print(f"Retired {len(phantoms)} BOM(s).")

        # --- 2. enforce one default live BOM per product ---
        remaining = await duplicate_defaults(session)
        if remaining:
            print("\nDuplicate defaults still present; refusing to add the unique"
                  " index. Resolve these first:")
            for d in remaining:
                print(f"  {d['productCode']}: {d['docNos']}")
            return

        if not await has_column(session, "DefaultKey"):
            await session.execute(text(ADD_COLUMN))
            await session.commit()
            print("Added generated column DefaultKey.")
        else:
            print("Generated column DefaultKey already present.")

        if not await has_index(session, "uk_engbom_default_per_product"):
            await session.execute(text(ADD_INDEX))
            await session.commit()
            print("Added unique index uk_engbom_default_per_product.")
        else:
            print("Unique index already present.")

        print("\n=== live BOMs after the fix ===")
        for r in await session.execute(text(
                "SELECT DocNo, ProductCode, Revision, Status, IsDefault"
                "  FROM ERP_Product.EngineeringBom"
                " WHERE DeletedAt IS NULL ORDER BY DocNo")):
            print(f"  {r[0]:<16} {r[1]:<16} rev{r[2]} {r[3]:<18} default={bool(r[4])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change without writing")
    args = parser.parse_args()
    try:
        asyncio.run(main(args.dry_run))
    finally:
        asyncio.run(dispose_engine())
