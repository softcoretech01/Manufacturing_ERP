"""Make a BOM's identity DocNo + Revision instead of DocNo alone.

Applying an engineering change creates the next revision of the bill it changes:
`BOM/26-27/0005` R1 and R2 are two rows of one document, R1 superseded and R2
live. The unique index on DocNo made that impossible — the insert was refused
with "BOM number BOM/26-27/0005 already exists", and the Apply button appeared
to do nothing.

What this changes, and nothing else:

  1. UNIQUE KEY `DocNo`           -> dropped
     UNIQUE KEY (DocNo, Revision) -> added
     Soft-deleted rows are included deliberately: the next revision is derived
     from MAX(Revision) over every row of the document, deleted ones included,
     so a revision number is never reused and can never collide.

`uk_engbom_default_per_product` already exists and is left exactly as it is: one
live default bill per product stays a database rule.

No row is inserted, updated, renamed, merged or deleted. This script does not
invent revision history for bills that merely look related.

    python scripts/migrate_bom_revisions.py --dry-run
    python scripts/migrate_bom_revisions.py
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import pymysql
from dotenv import load_dotenv

SCHEMA = os.getenv("ERP_PRODUCT_SCHEMA", "ERP_Product")
TABLE = "EngineeringBom"

OLD_UNIQUE = "DocNo"
NEW_UNIQUE = "uk_engbom_docno_revision"


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
        f"SELECT DocNo, Revision, COUNT(*) FROM {TABLE}"
        " GROUP BY DocNo, Revision HAVING COUNT(*) > 1"
    )
    for code, rev, n in cur.fetchall():
        problems.append(f"{n} rows already share {code} R{rev} — the new unique key would reject them")

    return problems


def report_state(cur, heading: str) -> None:
    print(f"\n{heading}")
    for name, cols in indexes(cur).items():
        print(f"  index {name:<36} ({', '.join(cols)})")
    cur.execute(f"SELECT COUNT(*) FROM {TABLE}")
    print(f"  rows: {cur.fetchone()[0]}")


def write_rollback() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = f"rollback_bom_revisions_{stamp}.sql"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(
            "-- Undo migrate_bom_revisions.py.\n"
            "-- Only works while no bill has more than one revision row; that is\n"
            "-- what the old unique key on DocNo meant.\n"
            f"ALTER TABLE {SCHEMA}.{TABLE} DROP INDEX {NEW_UNIQUE};\n"
            f"ALTER TABLE {SCHEMA}.{TABLE} ADD UNIQUE KEY `{OLD_UNIQUE}` (DocNo);\n"
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
                f"identity becomes (DocNo, Revision){' and the DocNo-only key goes' if drop else ''}",
                f"ALTER TABLE {TABLE} ADD UNIQUE KEY `{NEW_UNIQUE}` (DocNo, Revision){drop}",
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
