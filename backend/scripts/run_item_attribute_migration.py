# -*- coding: utf-8 -*-
"""Execute the approved item-attribute migration and prove its blast radius.

Runs the ten UPDATE statements in `migrate_item_attributes.sql` inside a single
transaction, after checking every precondition, and diffs the whole Item table
plus every downstream table against a snapshot taken beforehand.

    python scripts/run_item_attribute_migration.py --check    # verify only
    python scripts/run_item_attribute_migration.py --apply    # verify + execute
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import re
import sys
from pathlib import Path

from sqlalchemy import text

from app.core.database import SessionFactory, dispose_engine

SQL_FILE = Path(__file__).with_name("migrate_item_attributes.sql")

# The ten approved cells. Nothing outside this mapping may change.
APPROVED: dict[str, dict[str, object]] = {
    "FG-SS-750-BLK":  {"CapacityMl": 750,  "Colour": "COL-0002",
                       "LidType": "LID-0002", "SteelGrade": "GRD-0001"},
    "FG-SS-1000-STL": {"CapacityMl": 1000, "LidType": "LID-0004"},
    "SF-BODY-750":    {"CapacityMl": 750,  "SteelGrade": "GRD-0001"},
    "SF-BODY-1000":   {"CapacityMl": 1000},
    "SF-LID-ASSY-SS": {"LidType": "LID-0002"},
}

# Which master backs each textual attribute, in the schema the application uses.
MASTER_FOR = {"Colour": "BottleColour", "LidType": "LidType",
              "SteelGrade": "SteelGrade"}

# Tables that must be byte-identical before and after.
UNTOUCHED = [
    ("ERP_Product", "EngineeringBom"),
    ("ERP_Product", "EngineeringBomLine"),
    ("ERP_Product", "EngineeringRouting"),
    ("ERP_Product", "EngineeringRoutingOperation"),
    ("ERP_Product", "EngineeringDocument"),
    ("admin_erp", "pp_mps"),
    ("admin_erp", "pp_demand"),
    ("admin_erp", "pp_planning_policy"),
]

ok = True


def check(label: str, passed: bool, detail: str = "") -> bool:
    global ok
    ok = ok and passed
    print(f"  [{'PASS' if passed else 'FAIL'}] {label}"
          + (f"  {detail}" if detail else ""))
    return passed


def rule(title: str) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def statements() -> list[str]:
    """The UPDATEs from the reviewed file, with comments and the wrapper removed."""
    body = SQL_FILE.read_text(encoding="utf-8")
    body = re.sub(r"--[^\n]*", "", body)
    out = []
    for raw in body.split(";"):
        s = " ".join(raw.split())
        if s.upper().startswith("UPDATE"):
            out.append(s)
    return out


async def snapshot(session) -> tuple[dict, dict]:
    """Every Item row, plus a digest of each table that must not move."""
    items = {}
    for r in await session.execute(text(
            "SELECT * FROM ERP_Master.Item ORDER BY Id")):
        m = dict(r._mapping)
        items[m["Code"]] = m
    digests = {}
    for schema, table in UNTOUCHED:
        rows = [tuple(str(v) for v in r) for r in await session.execute(
            text(f"SELECT * FROM `{schema}`.`{table}`"))]
        blob = "\x1e".join("\x1f".join(t) for t in sorted(rows))
        digests[f"{schema}.{table}"] = (
            len(rows), hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16])
    return items, digests


async def preflight(session, expect_empty: bool = True) -> None:
    rule("PRE-FLIGHT 1 -- the exact statements to be executed")
    stmts = statements()
    for i, s in enumerate(stmts, 1):
        print(f"  {i:>2}. {s}")
    check("the file holds exactly 10 UPDATE statements",
          len(stmts) == 10, f"{len(stmts)} found")
    check("every statement is guarded by a single item code",
          all(re.search(r"WHERE Code = '[A-Z0-9-]+'", s) for s in stmts))
    check("every statement is guarded on the cell being empty",
          all("IS NULL" in s for s in stmts))
    approved_cells = sum(len(v) for v in APPROVED.values())
    check("statement count matches the approved cell count",
          len(stmts) == approved_cells == 10, f"approved={approved_cells}")

    rule("PRE-FLIGHT 2 -- target rows exist, are live, and are empty")
    for code, attrs in APPROVED.items():
        row = (await session.execute(text(
            "SELECT Id, Code, ItemType, Category, BaseUom, Status, IsDeleted,"
            "       CapacityMl, Colour, LidType, SteelGrade, BottleModel"
            "  FROM ERP_Master.Item WHERE Code = :c"), {"c": code})).mappings().first()
        if not check(f"{code} exists", row is not None):
            continue
        check(f"{code} is not deleted", row["IsDeleted"] == 0,
              f"IsDeleted={row['IsDeleted']}")
        for attr in attrs:
            cur = row[attr]
            empty = cur is None or (isinstance(cur, str) and not cur.strip())
            if expect_empty:
                check(f"{code}.{attr} is currently empty", empty,
                      f"current={cur!r}")
            else:
                check(f"{code}.{attr} holds the approved value or is empty",
                      empty or cur == attrs[attr], f"current={cur!r}")

    rule("PRE-FLIGHT 3 -- referenced master codes are valid and active")
    for code, attrs in APPROVED.items():
        for attr, value in attrs.items():
            if attr not in MASTER_FOR:
                continue
            m = (await session.execute(text(
                f"SELECT Code, Name, Status, IsDeleted"
                f"  FROM admin_erp.{MASTER_FOR[attr]} WHERE Code = :v"),
                {"v": value})).mappings().first()
            if not check(f"{value} exists in admin_erp.{MASTER_FOR[attr]}",
                         m is not None):
                continue
            deleted = m["IsDeleted"] in (1, b"\x01", True)
            check(f"{value} is active and not deleted",
                  m["Status"] == "ACTIVE" and not deleted,
                  f"{m['Name']!r} status={m['Status']} deleted={deleted}")

    rule("PRE-FLIGHT 4 -- capacity values agree with the capacity master")
    for code, attrs in APPROVED.items():
        if "CapacityMl" not in attrs:
            continue
        want = attrs["CapacityMl"]
        n = (await session.execute(text(
            "SELECT COUNT(*) FROM admin_erp.BottleCapacity"
            " WHERE NominalMl = :v AND Status = 'ACTIVE'"), {"v": want})).scalar()
        check(f"{code}: {want} ml matches an active capacity master row", n == 1,
              f"{n} matching row(s)")

    rule("PRE-FLIGHT 5 -- rows explicitly excluded from this migration")
    itm = (await session.execute(text(
        "SELECT Colour, LidType, SteelGrade, BottleModel FROM ERP_Master.Item"
        " WHERE Code = 'ITM-0004'"))).mappings().first()
    check("ITM-0004 is not a target", "ITM-0004" not in APPROVED)
    print(f"        its current values stay as-is: {dict(itm)}")
    check("no statement mentions ITM-0004",
          not any("ITM-0004" in s for s in stmts))
    check("no statement writes BottleModel",
          not any("BottleModel" in s for s in stmts))
    check("no statement touches ItemType, Category, BaseUom or IsDeleted",
          not any(re.search(r"SET\s+(ItemType|Category|BaseUom|IsDeleted)", s)
                  for s in stmts))
    check("no statement targets a table other than ERP_Master.Item",
          all(s.startswith("UPDATE ERP_Master.Item ") for s in stmts))


async def verify(session, before_items: dict, before_digests: dict) -> None:
    rule("VERIFY 1 -- the ten cells now hold the approved values")
    for code, attrs in APPROVED.items():
        row = (await session.execute(text(
            "SELECT CapacityMl, Colour, LidType, SteelGrade"
            "  FROM ERP_Master.Item WHERE Code = :c"), {"c": code})).mappings().first()
        for attr, want in attrs.items():
            got = row[attr]
            check(f"{code}.{attr} = {want!r}", got == want, f"read back {got!r}")

    rule("VERIFY 2 -- codes resolve to the intended master rows")
    for code, attrs in APPROVED.items():
        parts = []
        for attr, value in attrs.items():
            if attr in MASTER_FOR:
                name = (await session.execute(text(
                    f"SELECT Name FROM admin_erp.{MASTER_FOR[attr]}"
                    f" WHERE Code = :v"), {"v": value})).scalar()
                parts.append(f"{attr}={value} ({name})")
            else:
                parts.append(f"{attr}={value}")
        print(f"    {code:<16} " + "  ".join(parts))

    rule("VERIFY 3 -- nothing else in ERP_Master.Item moved")
    after_items, after_digests = await snapshot(session)
    check("item count unchanged",
          len(after_items) == len(before_items),
          f"{len(before_items)} -> {len(after_items)}")
    check("the set of item codes is unchanged",
          set(after_items) == set(before_items))
    # ModifiedDate is declared `on update current_timestamp()`, so MariaDB moves
    # it on any UPDATE. Our SQL never names it. It is expected on the five rows
    # we were approved to touch, and forbidden anywhere else.
    unexpected, touched_stamps = [], []
    for code, before in before_items.items():
        after = after_items.get(code, {})
        for col, was in before.items():
            now = after.get(col)
            if was == now:
                continue
            if col == "ModifiedDate" and code in APPROVED:
                touched_stamps.append(code)
                continue
            allowed = code in APPROVED and col in APPROVED[code] \
                and now == APPROVED[code][col]
            if not allowed:
                unexpected.append(f"{code}.{col}: {was!r} -> {now!r}")
    check("no column changed outside the ten approved cells",
          not unexpected, "; ".join(unexpected) if unexpected else "clean")
    # Only meaningful straight after an apply; a verify-only pass writes nothing.
    check("ModifiedDate moved on the 5 approved rows and nowhere else",
          sorted(touched_stamps) in ([], sorted(APPROVED)),
          f"{len(touched_stamps)} row(s), auto-set by the column default")
    check("ModifiedBy was not rewritten",
          all(before_items[c]["ModifiedBy"] == after_items[c]["ModifiedBy"]
              for c in before_items))

    fin = (await session.execute(text(
        "SELECT COUNT(*) FROM ERP_Master.Item"
        " WHERE IsDeleted=0 AND ItemType='FINISHED'"))).scalar()
    semi = (await session.execute(text(
        "SELECT COUNT(*) FROM ERP_Master.Item"
        " WHERE IsDeleted=0 AND ItemType='SEMI_FINISHED'"))).scalar()
    check("FINISHED count still 4", fin == 4, str(fin))
    check("SEMI_FINISHED count still 3", semi == 3, str(semi))

    itm = (await session.execute(text(
        "SELECT Colour, LidType, SteelGrade, BottleModel, Status, IsDeleted"
        "  FROM ERP_Master.Item WHERE Code='ITM-0004'"))).mappings().first()
    check("ITM-0004 untouched",
          dict(itm) == {k: before_items["ITM-0004"][k] for k in itm.keys()},
          str(dict(itm)))

    rule("VERIFY 4 -- BOM, routing, MPS and document tables are byte-identical")
    for key, before in before_digests.items():
        after = after_digests[key]
        check(f"{key} unchanged", after == before,
              f"{before[0]} rows, digest {before[1]}")

    rule("VERIFY 5 -- BottleModel is still empty on every real item")
    rows = [r[0] for r in await session.execute(text(
        "SELECT Code FROM ERP_Master.Item"
        " WHERE IsDeleted=0 AND ItemType IN ('FINISHED','SEMI_FINISHED')"
        " AND BottleModel IS NOT NULL AND BottleModel <> ''"))]
    check("no bottle model was populated", not rows, str(rows))

    rule("VERIFY 6 -- values withheld for confirmation are still NULL")
    for code, attr in (("FG-SS-1000-STL", "Colour"),
                       ("FG-SS-1000-STL", "SteelGrade"),
                       ("SF-BODY-1000", "SteelGrade"),
                       ("FG-SS-500-BLU", "CapacityMl"),
                       ("FG-SS-500-BLU", "Colour"),
                       ("FG-SS-500-BLU", "LidType"),
                       ("FG-SS-500-BLU", "SteelGrade"),
                       ("SF-LID-ASSY-SS", "SteelGrade")):
        v = (await session.execute(text(
            f"SELECT {attr} FROM ERP_Master.Item WHERE Code = :c"),
            {"c": code})).scalar()
        check(f"{code}.{attr} still NULL", v is None, f"got {v!r}")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="execute the migration (otherwise checks only)")
    ap.add_argument("--check", action="store_true", help="run checks only")
    ap.add_argument("--verify", action="store_true",
                    help="re-verify an already applied migration, and prove "
                         "re-running it is a no-op")
    args = ap.parse_args()

    async with SessionFactory() as session:
        before_items, before_digests = await snapshot(session)
        await preflight(session, expect_empty=not args.verify)

        if not ok:
            print("\n  Pre-flight failed. Nothing was executed.")
            return 1
        if not (args.apply or args.verify):
            print("\n  Checks only. Re-run with --apply to execute.")
            return 0

        stmts = statements()
        if args.apply:
            rule("EXECUTE -- one transaction, ten statements")
            changed = 0
            # The snapshot reads above opened an implicit transaction; close it
            # so the migration runs in a transaction of its own.
            await session.rollback()
            async with session.begin():
                for i, s in enumerate(stmts, 1):
                    res = await session.execute(text(s))
                    changed += res.rowcount
                    target = re.search(r"WHERE Code = '([A-Z0-9-]+)'", s).group(1)
                    col = re.search(r"SET (\w+)", s).group(1)
                    print(f"  {i:>2}. {target:<16} {col:<12} {res.rowcount} row(s)")
            print(f"\n  committed: {changed} row update(s)")
            check("exactly 10 row updates applied", changed == 10, str(changed))

        rule("IDEMPOTENCY -- run the same file a second time")
        second = 0
        await session.rollback()
        async with session.begin():
            for s in stmts:
                second += (await session.execute(text(s))).rowcount
        print(f"  second run changed {second} row(s)")
        check("second execution is a no-op", second == 0, f"{second} rows")

        await verify(session, before_items, before_digests)

    print("\n" + "=" * 78)
    print("  ALL CHECKS PASSED" if ok else "  SOME CHECKS FAILED")
    print("=" * 78)
    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    finally:
        asyncio.run(dispose_engine())
