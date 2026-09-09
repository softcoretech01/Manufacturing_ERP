"""Seed the planning module with demand a planner can actually work with.

Why this exists
---------------
`pp_demand`, `pp_forecast`, `pp_mps`, `pp_planning_policy` and
`pp_production_order` were found empty, with orphaned
`pp_prod_order_component` / `pp_prod_order_operation` rows left behind — the
signature of a hard delete on the parent tables. Without demand, nothing
downstream can be exercised: MRP plans nothing, capacity shows an idle plant,
and the MPS grid is all dashes.

What it seeds
-------------
Demand against the **real** item-master codes (`FG-SS-750-BLK`,
`FG-SS-1000-STL`), which is what the live BOMs in
`ERP_Product.EngineeringBom` are built on. Seeding against the `PRD-00nn`
codes from the mock master registry would look right on screen and explode into
nothing, because no BOM references them.

`FG-SS-500-BLU` is deliberately left out: its BOM is still PENDING_APPROVAL, so
MRP would answer demand for it with a NO_BOM exception rather than a plan.

Also seeds planning policies, so lot sizing and safety stock have something to
apply, and clears the orphaned component/operation rows.

Safety
------
- Idempotent: re-running replaces only the rows this script created, matched on
  their `SEED/` document-number prefix. Anything a person entered is untouched.
- `--dry-run` (the default) prints what it would do and writes nothing.
- Refuses to run when non-seed demand already exists, unless `--force` is given,
  so it can never quietly bury real data.

    python scripts/seed_planning_demo.py --dry-run
    python scripts/seed_planning_demo.py --commit
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.database import session_scope  # noqa: E402
from app.core.time import utcnow  # noqa: E402

SEED_PREFIX = "SEED/"

# Products that have a live, ACTIVE bill of material. Anything else would seed
# demand that MRP can only answer with a NO_BOM exception.
PRODUCTS = [
    ("FG-SS-750-BLK", "Vacuum Flask 750 ml — Matte Black", "NOS"),
    ("FG-SS-1000-STL", "Vacuum Flask 1000 ml — Brushed Steel", "NOS"),
]

CUSTOMERS = [
    ("Hydrate Retail Pvt Ltd", "DOMESTIC"),
    ("Corporate Gifting Co", "OEM"),
    ("Gift Bazaar Retail", "DOMESTIC"),
    ("Nordwind Handels GmbH", "EXPORT"),
]

# (product index, qty, weeks from today, customer index, firm?)
DEMAND_PLAN = [
    (0, 8000, 3, 0, True),
    (0, 5000, 5, 1, True),
    (0, 12000, 8, 2, False),
    (1, 6000, 4, 3, True),
    (1, 9000, 7, 0, False),
    (1, 4000, 10, 1, True),
]

POLICIES = [
    # code, rule, min order, multiple, safety stock, lead time, frozen days
    ("FG-SS-750-BLK", "MIN_ORDER_QTY", 2000, 500, 1000, None, 7),
    ("FG-SS-1000-STL", "MIN_ORDER_QTY", 2000, 500, 800, None, 7),
    ("SF-BODY-750", "LOT_FOR_LOT", 0, 0, 500, None, 0),
    ("SF-BODY-1000", "LOT_FOR_LOT", 0, 0, 500, None, 0),
    ("RM-SS304-050", "FIXED_ORDER_QTY", 5000, 1000, 2000, 21, 0),
    ("RM-SS316-060", "FIXED_ORDER_QTY", 5000, 1000, 2000, 21, 0),
]


async def _company_and_user(session) -> tuple[int, int]:
    """Seed into the company that already owns the planning data."""
    row = (
        await session.execute(
            text(
                "SELECT company_id, MAX(created_by) FROM pp_mrp_run "
                "GROUP BY company_id ORDER BY COUNT(*) DESC LIMIT 1"
            )
        )
    ).first()
    if row:
        return int(row[0]), int(row[1] or 1)
    row = (
        await session.execute(text("SELECT id FROM core_company ORDER BY id LIMIT 1"))
    ).first()
    if not row:
        raise SystemExit("No company found — cannot seed.")
    return int(row[0]), 1


async def main(commit: bool, force: bool) -> None:
    today = utcnow().date()
    # Monday of the current week, so buckets line up with the planning horizon.
    monday = today - timedelta(days=today.weekday())

    async with session_scope() as session:
        company_id, user_id = await _company_and_user(session)
        print(f"company_id={company_id}  user_id={user_id}  week of {monday}")

        existing = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM pp_demand "
                    "WHERE company_id = :c AND deleted_at IS NULL "
                    "AND doc_no NOT LIKE :p"
                ),
                {"c": company_id, "p": f"{SEED_PREFIX}%"},
            )
        ).scalar()
        if existing and not force:
            raise SystemExit(
                f"{existing} demand rows already exist that this script did not "
                "create. Refusing to run — pass --force only if you are certain "
                "they should be left alone."
            )

        orphan_components = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM pp_prod_order_component c "
                    "LEFT JOIN pp_production_order o ON o.id = c.order_id "
                    "WHERE o.id IS NULL"
                )
            )
        ).scalar()
        orphan_operations = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM pp_prod_order_operation p "
                    "LEFT JOIN pp_production_order o ON o.id = p.order_id "
                    "WHERE o.id IS NULL"
                )
            )
        ).scalar()
        print(f"orphaned rows to clear: {orphan_components} components, "
              f"{orphan_operations} operations")

        now = utcnow()
        demand_rows = []
        for seq, (pi, qty, weeks, ci, firm) in enumerate(DEMAND_PLAN, start=1):
            code, name, uom = PRODUCTS[pi]
            customer, market = CUSTOMERS[ci]
            demand_rows.append(
                {
                    "doc_no": f"{SEED_PREFIX}DEM/{today:%Y%m}/{seq:03d}",
                    "source": "SALES_ORDER" if firm else "FORECAST",
                    "product_code": code,
                    "product_name": name,
                    "uom": uom,
                    "qty": qty,
                    "required_on": monday + timedelta(weeks=weeks),
                    "customer": customer,
                    "market": market,
                    "is_firm": firm,
                    "status": "OPEN",
                }
            )

        print("\ndemand to create:")
        for d in demand_rows:
            print(f"  {d['doc_no']}  {d['product_code']:16} {d['qty']:>7,} "
                  f"by {d['required_on']}  {d['customer']}")
        print(f"\npolicies to create: {len(POLICIES)}")

        if not commit:
            print("\n--dry-run: nothing written. Re-run with --commit to apply.")
            return

        await session.execute(
            text("DELETE FROM pp_demand WHERE company_id = :c AND doc_no LIKE :p"),
            {"c": company_id, "p": f"{SEED_PREFIX}%"},
        )
        await session.execute(
            text(
                "DELETE c FROM pp_prod_order_component c "
                "LEFT JOIN pp_production_order o ON o.id = c.order_id "
                "WHERE o.id IS NULL"
            )
        )
        await session.execute(
            text(
                "DELETE p FROM pp_prod_order_operation p "
                "LEFT JOIN pp_production_order o ON o.id = p.order_id "
                "WHERE o.id IS NULL"
            )
        )

        for d in demand_rows:
            await session.execute(
                text(
                    "INSERT INTO pp_demand (uid, company_id, doc_no, source, "
                    "  product_code, product_name, uom, qty, qty_planned, required_on, "
                    "  customer, market, is_firm, status, remarks, version, "
                    "  created_at, created_by, updated_at, updated_by) "
                    "VALUES (:uid, :c, :doc_no, :source, :product_code, :product_name, "
                    "  :uom, :qty, 0, :required_on, :customer, :market, :is_firm, "
                    "  :status, 'Seeded demo demand.', 1, :now, :u, :now, :u)"
                ),
                {**d, "c": company_id, "u": user_id, "now": now,
                 "uid": _ulid(f"{d['doc_no']}")},
            )

        for code, rule, moq, mult, ss, lt, frozen in POLICIES:
            await session.execute(
                text(
                    "INSERT INTO pp_planning_policy (uid, company_id, item_code, "
                    "  item_name, lot_size_rule, min_order_qty, order_multiple, "
                    "  safety_stock_override, lead_time_override, frozen_days, "
                    "  is_active, version, created_at, created_by, updated_at, updated_by) "
                    "VALUES (:uid, :c, :code, :code, :rule, :moq, :mult, :ss, :lt, "
                    "  :frozen, 1, 1, :now, :u, :now, :u) "
                    "ON DUPLICATE KEY UPDATE lot_size_rule = VALUES(lot_size_rule), "
                    "  min_order_qty = VALUES(min_order_qty), "
                    "  order_multiple = VALUES(order_multiple), "
                    "  safety_stock_override = VALUES(safety_stock_override), "
                    "  lead_time_override = VALUES(lead_time_override), "
                    "  frozen_days = VALUES(frozen_days), updated_at = VALUES(updated_at)"
                ),
                {"c": company_id, "code": code, "rule": rule, "moq": moq,
                 "mult": mult, "ss": ss, "lt": lt, "frozen": frozen,
                 "u": user_id, "now": now, "uid": _ulid(f"POL{code}")},
            )

        await session.commit()
        print(f"\nwritten: {len(demand_rows)} demand rows, {len(POLICIES)} policies, "
              f"{orphan_components + orphan_operations} orphaned rows cleared.")


def _ulid(seed: str) -> str:
    """A stable 26-char identifier derived from the document number.

    Deterministic on purpose — re-seeding the same document reuses its uid, so a
    bookmarked link keeps working across re-runs.
    """
    import hashlib

    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    digest = hashlib.sha256(seed.encode()).digest()
    n = int.from_bytes(digest[:16], "big")
    out = []
    for _ in range(26):
        n, rem = divmod(n, 32)
        out.append(alphabet[rem])
    return "".join(reversed(out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", action="store_true", help="Actually write.")
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be written and stop. This is the default.",
    )
    ap.add_argument(
        "--force", action="store_true",
        help="Proceed even though non-seed demand exists.",
    )
    args = ap.parse_args()
    asyncio.run(main(commit=args.commit, force=args.force))
