"""Referential integrity for EngineeringDocument.ProductCode.

`DocType` has had a foreign key to `DocumentType.Code` since 2026-09-07.
`ProductCode` never had one, so a document can name a product that does not exist,
and two currently do.

Why the key is `Item.Code` and not `Item.Id`
--------------------------------------------
`ERP_Master.Item.Code` is `varchar(20) NOT NULL UNIQUE` -- a real business key, and
already the key every sibling table uses: `EngineeringBom.ProductCode`,
`EngineeringBomLine.ItemCode`, `EngineeringRouting.ProductCode`, and the whole
costing and MRP layer. Introducing a surrogate `ProductId` on this one table would
leave documents keyed differently from the BOMs and routings for the same product,
and changing those is out of scope. The code IS the stable master key here; what was
missing is the constraint that enforces it.

Three steps, run separately on purpose:

  --report    which documents point at a product that does not exist. Read-only.
  --prepare   narrow ProductCode to varchar(20) and index it. No FK yet, so it
              cannot fail on existing data. Reversible.
  --add-fk    add the constraint. REFUSES while any orphan remains.

ON UPDATE CASCADE ON DELETE RESTRICT, matching fk_engdoc_doctype. RESTRICT, not
CASCADE: deleting a product must never delete the drawings that describe it.
Items are soft-deleted anyway, so RESTRICT should never fire in normal use.

Run:  python -m scripts.migrate_engdoc_product_fk --report
      python -m scripts.migrate_engdoc_product_fk --prepare
      python -m scripts.migrate_engdoc_product_fk --add-fk
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import text

from app.core.database import SessionFactory, dispose_engine

FK_NAME = "fk_engdoc_product"
IX_NAME = "ix_engdoc_productcode"

# Every physical row, soft-deleted included. A foreign key is validated against the
# whole table, so a retired document still holding a dangling code fails the ALTER
# just as a live one would. `product_exists` is deliberately looser than the
# application's notion of "active": the constraint only needs the Item row to be
# present, so an item retired with IsDeleted = 1 still satisfies it.
ORPHAN_SQL = text("""
    SELECT d.DocumentCode, d.Title, d.DocType, d.ProductCode, d.Status,
           d.DeletedAt, d.CreatedBy, d.CreatedDate,
           CASE WHEN m.Code IS NULL THEN 0 ELSE 1 END AS product_exists,
           CASE WHEN IFNULL(m.IsDeleted, 0) = 0 THEN 1 ELSE 0 END AS product_active
      FROM ERP_Product.EngineeringDocument d
      LEFT JOIN ERP_Master.Item m ON m.Code = d.ProductCode
     ORDER BY d.DocumentCode
""")


async def report(session) -> list[dict]:
    rows = [dict(r._mapping) for r in await session.execute(ORPHAN_SQL)]
    print(f"{'DOCUMENT':<11} {'PRODUCTCODE':<16} {'DOC':<9} {'PRODUCT':<12} TITLE")
    for r in rows:
        doc_state = "retired" if r["DeletedAt"] else "live"
        if not r["product_exists"]:
            prod = "MISSING"
        elif not r["product_active"]:
            prod = "retired"
        else:
            prod = "active"
        print(f"  {r['DocumentCode']:<9} {r['ProductCode']:<16} {doc_state:<9}"
              f" {prod:<12} {str(r['Title'])[:24]}")

    orphans = [r for r in rows if not r["product_exists"]]
    live = [r for r in rows if not r["DeletedAt"]]
    print(f"\n  {len(rows)} row(s) in the table ({len(live)} live),"
          f" {len(orphans)} with no product row at all.")
    if orphans:
        print("  These block the foreign key, retired documents included, because"
              " the constraint is validated against every physical row:")
        for r in orphans:
            state = "retired" if r["DeletedAt"] else "live"
            print(f"    {r['DocumentCode']} ({state}) -> {r['ProductCode']}")
    return orphans


async def prepare(session) -> None:
    longest = (await session.execute(text(
        "SELECT IFNULL(MAX(CHAR_LENGTH(ProductCode)), 0)"
        "  FROM ERP_Product.EngineeringDocument"))).scalar()
    print(f"  longest ProductCode in use: {longest} chars")
    if longest > 20:
        print("  REFUSING: a value would be truncated by varchar(20).")
        return

    col_type = (await session.execute(text(
        "SELECT COLUMN_TYPE FROM information_schema.columns"
        " WHERE TABLE_SCHEMA='ERP_Product' AND TABLE_NAME='EngineeringDocument'"
        "   AND COLUMN_NAME='ProductCode'"))).scalar()
    if col_type != "varchar(20)":
        # A foreign key needs the referencing column to match Item.Code exactly.
        await session.execute(text(
            "ALTER TABLE ERP_Product.EngineeringDocument"
            " MODIFY COLUMN ProductCode VARCHAR(20) NOT NULL"))
        await session.commit()
        print(f"  ProductCode narrowed {col_type} -> varchar(20)")
    else:
        print("  ProductCode is already varchar(20)")

    has_ix = (await session.execute(text(
        "SELECT COUNT(*) FROM information_schema.statistics"
        " WHERE TABLE_SCHEMA='ERP_Product' AND TABLE_NAME='EngineeringDocument'"
        "   AND INDEX_NAME=:i"), {"i": IX_NAME})).scalar()
    if not has_ix:
        await session.execute(text(
            f"ALTER TABLE ERP_Product.EngineeringDocument"
            f" ADD INDEX {IX_NAME} (ProductCode)"))
        await session.commit()
        print(f"  index {IX_NAME} added")
    else:
        print(f"  index {IX_NAME} already present")


async def add_fk(session) -> None:
    orphans = await report(session)
    if orphans:
        print("\n  REFUSING to add the foreign key while orphans exist.")
        print("  Resolve them first, then re-run with --add-fk.")
        return

    col_type = (await session.execute(text(
        "SELECT COLUMN_TYPE FROM information_schema.columns"
        " WHERE TABLE_SCHEMA='ERP_Product' AND TABLE_NAME='EngineeringDocument'"
        "   AND COLUMN_NAME='ProductCode'"))).scalar()
    if col_type != "varchar(20)":
        print(f"\n  REFUSING: ProductCode is {col_type}, must be varchar(20)"
              " to match Item.Code. Run --prepare first.")
        return

    exists = (await session.execute(text(
        "SELECT COUNT(*) FROM information_schema.table_constraints"
        " WHERE TABLE_SCHEMA='ERP_Product' AND TABLE_NAME='EngineeringDocument'"
        "   AND CONSTRAINT_NAME=:c"), {"c": FK_NAME})).scalar()
    if exists:
        print(f"\n  {FK_NAME} already exists.")
        return

    await session.execute(text(
        f"ALTER TABLE ERP_Product.EngineeringDocument"
        f"  ADD CONSTRAINT {FK_NAME}"
        f"  FOREIGN KEY (ProductCode) REFERENCES ERP_Master.Item (Code)"
        f"  ON UPDATE CASCADE ON DELETE RESTRICT"))
    await session.commit()
    print(f"\n  {FK_NAME} added: ProductCode -> ERP_Master.Item.Code"
          " ON UPDATE CASCADE ON DELETE RESTRICT")


async def main(args) -> None:
    async with SessionFactory() as session:
        if args.prepare:
            print("=== PREPARE ===")
            await prepare(session)
        elif args.add_fk:
            print("=== ADD FOREIGN KEY ===")
            await add_fk(session)
        else:
            print("=== ORPHAN REPORT (read-only) ===")
            await report(session)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--report", action="store_true", help="orphan report (default)")
    g.add_argument("--prepare", action="store_true", help="narrow the column and index it")
    g.add_argument("--add-fk", action="store_true", help="add the constraint")
    args = p.parse_args()
    try:
        asyncio.run(main(args))
    finally:
        asyncio.run(dispose_engine())
