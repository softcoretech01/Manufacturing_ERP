"""Make a routing's identity RouteCode + Revision instead of RouteCode alone.

A routing revision is a new row that keeps the document number and increments the
revision, so `RTG/26-27/0001` R1..R4 are four rows of one document. The unique
index on RouteCode made that impossible, which is why "Create next revision"
silently minted a new document number instead.

What this changes, and nothing else:

  1. UNIQUE KEY `RouteCode`           → dropped
     UNIQUE KEY (RouteCode, Revision) → added
     Soft-deleted rows are included deliberately: the next revision is derived
     from MAX(Revision) over every row of the document, deleted ones included,
     so a revision number is never reused and can never collide.

  2. A generated `DefaultKey` column holding ProductCode only while the row is a
     live default, with a unique index on it. That makes "one default routing per
     live product" a database rule rather than a hope — the same pattern the BOM
     master already uses for `uk_engbom_default_per_product`.

No row is inserted, updated, renamed, merged or deleted. Existing routings keep
their codes and revision numbers exactly as they are; this script does not invent
revision history for rows that merely look related.

    python scripts/migrate_routing_revisions.py --dry-run
    python scripts/migrate_routing_revisions.py
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import pymysql
from dotenv import load_dotenv

SCHEMA = os.getenv("ERP_PRODUCT_SCHEMA", "ERP_Product")
TABLE = "EngineeringRouting"

OLD_UNIQUE = "RouteCode"
NEW_UNIQUE = "uk_engrouting_code_revision"
DEFAULT_COL = "DefaultKey"
DEFAULT_UNIQUE = "uk_engrouting_default_per_product"

DEFAULT_EXPR = (
    "IF(IsDefault = 1 AND DeletedAt IS NULL AND Status IN ('ACTIVE','APPROVED'), ProductCode, NULL)"
)


def connect():
    load_dotenv()
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=SCHEMA,
        autocommit=False,
    )


def indexes(cur) -> dict[str, list[str]]:
    cur.execute(f"SHOW INDEX FROM {TABLE}")
    found: dict[str, list[str]] = {}
    for row in cur.fetchall():
        found.setdefault(row[2], []).append(row[4])
    return found


def has_column(cur, column: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) FROM information_schema.COLUMNS"
        " WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s",
        (SCHEMA, TABLE, column),
    )
    return cur.fetchone()[0] > 0


def blockers(cur) -> list[str]:
    """Anything that would make the new constraints unsatisfiable."""
    problems: list[str] = []

    cur.execute(
        f"SELECT RouteCode, Revision, COUNT(*) FROM {TABLE}"
        " GROUP BY RouteCode, Revision HAVING COUNT(*) > 1"
    )
    for code, rev, n in cur.fetchall():
        problems.append(f"{n} rows already share {code} R{rev} — the new unique key would reject them")

    cur.execute(
        f"SELECT ProductCode, COUNT(*) FROM {TABLE}"
        " WHERE IsDefault = 1 AND DeletedAt IS NULL AND UPPER(Status) IN ('ACTIVE','APPROVED')"
        " GROUP BY ProductCode HAVING COUNT(*) > 1"
    )
    for product, n in cur.fetchall():
        problems.append(f"{product} already has {n} live default routings — resolve before adding the index")

    return problems


def report_state(cur, heading: str) -> None:
    print(f"\n{heading}")
    for name, cols in indexes(cur).items():
        print(f"  index {name:<36} ({', '.join(cols)})")
    cur.execute(f"SELECT COUNT(*) FROM {TABLE}")
    print(f"  rows: {cur.fetchone()[0]}")


def write_rollback() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = f"rollback_routing_revisions_{stamp}.sql"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(
            "-- Undo migrate_routing_revisions.py.\n"
            "-- Only works while no document has more than one revision row; that is\n"
            "-- what the old unique key on RouteCode meant.\n"
            f"ALTER TABLE {SCHEMA}.{TABLE} DROP INDEX {DEFAULT_UNIQUE};\n"
            f"ALTER TABLE {SCHEMA}.{TABLE} DROP COLUMN {DEFAULT_COL};\n"
            f"ALTER TABLE {SCHEMA}.{TABLE} DROP INDEX {NEW_UNIQUE};\n"
            f"ALTER TABLE {SCHEMA}.{TABLE} ADD UNIQUE KEY `{OLD_UNIQUE}` (RouteCode);\n"
        )
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="report the plan and change nothing")
    args = ap.parse_args()

    conn = connect()
    try:
        cur = conn.cursor()
        report_state(cur, f"Before — {SCHEMA}.{TABLE}")

        found = indexes(cur)
        steps: list[tuple[str, str]] = []

        if NEW_UNIQUE not in found:
            drop = f", DROP INDEX `{OLD_UNIQUE}`" if OLD_UNIQUE in found else ""
            steps.append((
                f"identity becomes (RouteCode, Revision){' and the RouteCode-only key goes' if drop else ''}",
                f"ALTER TABLE {TABLE} ADD UNIQUE KEY `{NEW_UNIQUE}` (RouteCode, Revision){drop}",
            ))

        if not has_column(cur, DEFAULT_COL):
            steps.append((
                "one live default routing per product, enforced by the database",
                f"ALTER TABLE {TABLE}"
                f" ADD COLUMN `{DEFAULT_COL}` VARCHAR(50)"
                f" GENERATED ALWAYS AS ({DEFAULT_EXPR}) STORED,"
                f" ADD UNIQUE KEY `{DEFAULT_UNIQUE}` (`{DEFAULT_COL}`)",
            ))

        if not steps:
            print("\nNothing to do — the schema already carries both rules.")
            return 0

        problems = blockers(cur)
        if problems:
            print("\nRefusing to migrate:")
            for p in problems:
                print(f"  - {p}")
            return 1

        print("\nPlan")
        for why, sql in steps:
            print(f"  - {why}\n      {sql}")

        if args.dry_run:
            print("\nDry run — nothing was changed.")
            return 0

        rollback = write_rollback()
        print(f"\nRollback written to {rollback}")

        cur.execute(f"SELECT COUNT(*) FROM {TABLE}")
        before = cur.fetchone()[0]
        for _, sql in steps:
            print(f"  running: {sql[:70]}…")
            cur.execute(sql)
        conn.commit()

        cur.execute(f"SELECT COUNT(*) FROM {TABLE}")
        after = cur.fetchone()[0]
        if before != after:  # pragma: no cover - a DDL that loses rows is a bug
            print(f"\nROW COUNT CHANGED: {before} → {after}. Investigate immediately.")
            return 1

        report_state(cur, f"After — {SCHEMA}.{TABLE}")
        print(f"\nDone. {after} rows preserved.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
