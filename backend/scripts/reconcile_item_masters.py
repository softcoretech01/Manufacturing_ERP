"""Give every BOM component an inventory item, so production can consume it.

This system runs two item masters, and they are separate tables rather than two
views of one:

  ERP_Master.Item   engineering and planning. Bills, routings, costing and MRP
                    all reference its Code. 20 live rows.
  admin_erp.mst_item  inventory. The stock ledger and balances reference its
                    `id`, so nothing can be received, issued or valued without a
                    row here. 9 live rows.

Eleven components that live bills call for have no inventory row, so a material
issue for them cannot post at all. This script creates the missing rows — and
only those. It is deliberately narrow:

  * it creates, never updates and never deletes,
  * it copies only what is unambiguous: code, name, unit and type,
  * it touches only codes a live BOM actually uses, so engineering-only clutter
    is not dragged into inventory,
  * it leaves the four items whose names differ between the masters alone; a
    name is a judgement, not a reconciliation.

Run the dry run first. It prints exactly what would be created and changes
nothing:

    python scripts/reconcile_item_masters.py --dry-run
    python scripts/reconcile_item_masters.py
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import pymysql
from dotenv import load_dotenv

#: Engineering's vocabulary mapped to inventory's. Both are closed sets, and
#: every engineering type has one honest inventory equivalent.
TYPE_MAP = {
    "FINISHED": "FINISHED_GOODS",
    "SEMI_FINISHED": "WIP",
    "RAW": "RAW_MATERIAL",
    "RAW_MATERIAL": "RAW_MATERIAL",
    "COMPONENT": "RAW_MATERIAL",  # a bought-in part is stocked and issued like one
    "PACKING": "PACKING",
    "CONSUMABLE": "CONSUMABLE",
}


def connect():
    load_dotenv()
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "admin_erp"),
        autocommit=False,
    )


def new_uid() -> str:
    """A 26-character identifier in the same shape as the application's ULIDs."""
    import secrets
    import string

    alphabet = string.digits + "ABCDEFGHJKMNPQRSTVWXYZ"
    return "".join(secrets.choice(alphabet) for _ in range(26))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="report the plan and change nothing")
    ap.add_argument("--company-id", type=int, default=1, help="tenant the rows belong to")
    ap.add_argument(
        "--include-parents",
        action="store_true",
        help="also create rows for products that are BOM parents, so finished output can be received",
    )
    args = ap.parse_args()

    conn = connect()
    try:
        cur = conn.cursor()

        cur.execute(
            "SELECT DISTINCT l.ItemCode FROM ERP_Product.EngineeringBomLine l"
            " JOIN ERP_Product.EngineeringBom b ON b.Id = l.BomId"
            " WHERE b.DeletedAt IS NULL AND b.Status IN ('ACTIVE','APPROVED')"
        )
        wanted = {r[0] for r in cur.fetchall()}

        if args.include_parents:
            cur.execute(
                "SELECT DISTINCT ProductCode FROM ERP_Product.EngineeringBom"
                " WHERE DeletedAt IS NULL AND Status IN ('ACTIVE','APPROVED')"
            )
            wanted |= {r[0] for r in cur.fetchall()}

        cur.execute("SELECT code FROM mst_item WHERE deleted_at IS NULL")
        have = {r[0] for r in cur.fetchall()}

        missing = sorted(wanted - have)
        if not missing:
            print("Every code a live bill uses already exists in the inventory master.")
            return 0

        cur.execute("SELECT Code, Name, ItemType, BaseUom FROM ERP_Master.Item WHERE IsDeleted = 0")
        engineering = {r[0]: r[1:] for r in cur.fetchall()}

        plan, orphans = [], []
        for code in missing:
            source = engineering.get(code)
            if source is None:
                orphans.append(code)
                continue
            name, item_type, uom = source
            mapped = TYPE_MAP.get((item_type or "").upper())
            if mapped is None:
                orphans.append(f"{code} (unmapped type {item_type})")
                continue
            plan.append((code, name, mapped, uom or "NOS"))

        print(f"Live bills use {len(wanted)} codes; the inventory master holds {len(have)}.")
        print(f"\nWould create {len(plan)} inventory item(s):")
        for code, name, item_type, uom in plan:
            print(f"  {code:<18} {item_type:<14} {uom:<5} {name}")

        if orphans:
            print("\nRefusing to guess at these, so they are left for a person:")
            for code in orphans:
                print(f"  {code} — no engineering record, or a type this script will not map")

        if args.dry_run:
            print("\nDry run — nothing was created.")
            return 0

        now = datetime.now(timezone.utc)
        for code, name, item_type, uom in plan:
            cur.execute(
                "INSERT INTO mst_item (code, name, item_type, base_uom, is_batch_tracked,"
                " is_serial_tracked, valuation_method, qty_precision, is_active,"
                " is_blocked_for_movement, default_receipt_status, company_id, uid, version,"
                " created_at, created_by, updated_at, updated_by)"
                " VALUES (%s, %s, %s, %s, 0, 0, 'MOVING_AVERAGE', 6, 1, 0, 'AVAILABLE', %s, %s, 1,"
                " %s, 1, %s, 1)",
                (code, name, item_type, uom, args.company_id, new_uid(), now, now),
            )
        conn.commit()

        cur.execute("SELECT COUNT(*) FROM mst_item WHERE deleted_at IS NULL")
        print(f"\nCreated {len(plan)} item(s). The inventory master now holds {cur.fetchone()[0]}.")
        print("No existing row was updated and nothing was deleted.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
