"""Seed the Operations master from the operation codes already used in routings.

`ERP_Product.EngineeringOperation` was empty while every routing referenced
OP-010 ... OP-130, so the Routing page's operation picker had nothing to offer
even though the routings themselves worked. This backfills one master row per
distinct `OperationCode` found in `EngineeringRoutingOperation`.

Assumption (recorded in docs/srs/open-questions.md): where routings disagree on
setup or cycle time for the same operation code, the master takes the values from
the routing that uses that configuration most often, ties broken by the lowest
routing id. Every seeded row therefore holds numbers that a real routing actually
uses -- no averaging, nothing invented. The master is only a default; each routing
keeps its own product-specific times.

Idempotent: an operation code that already exists is left untouched.

Run:  python -m scripts.seed_engineering_operations
      python -m scripts.seed_engineering_operations --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

from sqlalchemy import text

from app.core.database import dispose_engine, session_scope

SEED_USER = "system-seed"

# Pick one configuration per operation code: the most-used, then the lowest
# routing id, so repeated runs always choose the same row.
CANDIDATES_SQL = text(
    """
    SELECT ro.OperationCode,
           ro.OperationName,
           ro.WorkCentreCode,
           ro.SetupMinutes,
           ro.CycleSeconds,
           ro.Operators,
           ro.Skill,
           ro.QcCheckpoint,
           COUNT(*)        AS uses,
           MIN(ro.RoutingId) AS first_routing
    FROM ERP_Product.EngineeringRoutingOperation ro
    GROUP BY ro.OperationCode, ro.OperationName, ro.WorkCentreCode,
             ro.SetupMinutes, ro.CycleSeconds, ro.Operators, ro.Skill,
             ro.QcCheckpoint
    ORDER BY ro.OperationCode, uses DESC, first_routing ASC
    """
)

INSERT_SQL = text(
    """
    INSERT INTO ERP_Product.EngineeringOperation
        (Code, Name, DefaultWorkCentre, SetupMinutes, CycleSeconds, Operators,
         Skill, QcCheckpoint, Instructions, IsActive, CreatedBy, CreatedDate)
    VALUES
        (:code, :name, :work_centre, :setup_minutes, :cycle_seconds, :operators,
         :skill, :qc_checkpoint, :instructions, 1, :user, CURRENT_TIMESTAMP)
    """
)


async def collect(session) -> list[dict[str, Any]]:
    """One master row per operation code, plus the work centres it needs."""
    existing = {
        row[0]
        for row in await session.execute(
            text("SELECT Code FROM ERP_Product.EngineeringOperation")
        )
    }
    known_centres = {
        row[0]
        for row in await session.execute(
            text("SELECT Code FROM ERP_Product.EngineeringWorkCentre")
        )
    }

    chosen: dict[str, dict[str, Any]] = {}
    for row in await session.execute(CANDIDATES_SQL):
        code = row[0]
        if code in chosen:
            continue  # ORDER BY already put the winning configuration first
        chosen[code] = {
            "code": code,
            "name": row[1] or code,
            "work_centre": row[2],
            "setup_minutes": row[3],
            "cycle_seconds": row[4],
            "operators": row[5] or 1,
            "skill": row[6] or "Operator",
            "qc_checkpoint": 1 if row[7] else 0,
            "instructions": None,
            "uses": row[8],
            "exists": code in existing,
            "orphan_centre": row[2] not in known_centres,
        }
    return [chosen[c] for c in sorted(chosen)]


async def main(dry_run: bool) -> None:
    async with session_scope() as session:
        rows = await collect(session)

        if not rows:
            print("No routing operations found - nothing to seed.")
            return

        to_insert = [r for r in rows if not r["exists"]]
        skipped = [r for r in rows if r["exists"]]
        orphans = [r for r in rows if r["orphan_centre"]]

        print(f"{'CODE':<9} {'NAME':<30} {'WC':<7} {'SETUP':>8}"
              f" {'CYCLE':>8} {'OPS':>5} STATUS")
        for r in rows:
            status = "exists, skipped" if r["exists"] else "seed"
            if r["orphan_centre"]:
                status += "  [work centre not in master]"
            print(f"{r['code']:<9} {r['name'][:30]:<30} {r['work_centre']:<7}"
                  f" {r['setup_minutes']:>8} {r['cycle_seconds']:>8}"
                  f" {r['operators']:>5} {status}")

        if orphans:
            print(f"\nWarning: {len(orphans)} operation(s) reference a work"
                  " centre that is not in EngineeringWorkCentre. They are still"
                  " seeded, but costing will treat those steps as zero-rate"
                  " until the work centre exists.")

        if dry_run:
            print(f"\n--dry-run: nothing written. {len(to_insert)} would be"
                  f" inserted, {len(skipped)} skipped.")
            return

        for r in to_insert:
            await session.execute(INSERT_SQL, {
                "code": r["code"],
                "name": r["name"],
                "work_centre": r["work_centre"],
                "setup_minutes": r["setup_minutes"],
                "cycle_seconds": r["cycle_seconds"],
                "operators": r["operators"],
                "skill": r["skill"],
                "qc_checkpoint": r["qc_checkpoint"],
                "instructions": r["instructions"],
                "user": SEED_USER,
            })

        print(f"\nInserted {len(to_insert)} operation(s), skipped"
              f" {len(skipped)} that already existed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="show what would be seeded without writing")
    args = parser.parse_args()
    try:
        asyncio.run(main(args.dry_run))
    finally:
        asyncio.run(dispose_engine())
