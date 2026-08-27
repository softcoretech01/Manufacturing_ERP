"""Copy the flat SP-based master layer from ERP_Master into admin_erp.

The app connects to `admin_erp` and calls unqualified stored procedures, e.g.
`CALL SpShift(...)`. Those procedures and their tables only exist in `ERP_Master`,
so every SP-backed master endpoint 500s with, for example:
    (1305, 'PROCEDURE admin_erp.SpShift does not exist')

This makes `admin_erp` self-contained for the master layer by copying the missing
tables (with seed data) and the `Sp<Master>` / `SpGetNext<Master>Code` procedures.

Safety: ADDITIVE ONLY. Creates a table only when it is missing in admin_erp and
copies a procedure only when it is missing. Never drops, alters, or overwrites an
object that already exists in admin_erp (so live data there is untouched).

    python scripts/migrate_masters_to_admin_erp.py          # dry run (no writes)
    python scripts/migrate_masters_to_admin_erp.py --apply  # perform the copy

Run from the backend/ directory so it can read .env.
"""

from __future__ import annotations

import sys

import pymysql

SRC = "ERP_Master"
DST = "admin_erp"

# Master tables the app serves through Sp* procedures.
MASTERS = [
    "Uom", "Tax", "PaymentTerm", "ReasonCode", "Country", "State", "City",
    "Currency", "CostCentre", "BottleModel", "BottleCapacity", "BottleColour",
    "LidType", "Packaging", "SteelGrade", "SteelThickness", "Hsn", "Shift",
    "HolidayCalendar", "QualityParameter", "Defect", "Machine", "Bank",
    "ContactPerson", "Transporter", "Supplier", "Employee", "Item", "Customer",
]


def load_env(path: str = ".env") -> dict[str, str]:
    env: dict[str, str] = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main() -> int:
    apply = "--apply" in sys.argv
    env = load_env()
    conn = pymysql.connect(
        host=env["DB_HOST"], port=int(env["DB_PORT"]),
        user=env["DB_USER"], password=env["DB_PASSWORD"], autocommit=False,
    )
    cur = conn.cursor()

    def names(kind: str, db: str) -> set[str]:
        if kind == "table":
            cur.execute(
                "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s",
                (db,),
            )
        else:
            cur.execute(
                "SELECT ROUTINE_NAME FROM information_schema.ROUTINES "
                "WHERE ROUTINE_SCHEMA=%s AND ROUTINE_TYPE='PROCEDURE'",
                (db,),
            )
        return {r[0] for r in cur.fetchall()}

    src_t, dst_t = names("table", SRC), names("table", DST)
    src_p, dst_p = names("proc", SRC), names("proc", DST)

    created_t: list[str] = []
    created_p: list[str] = []
    skipped: list[str] = []

    for m in MASTERS:
        if m not in dst_t:
            if m not in src_t:
                skipped.append(f"{m}: not in {SRC} either")
            else:
                if apply:
                    cur.execute(f"CREATE TABLE `{DST}`.`{m}` LIKE `{SRC}`.`{m}`")
                    # CREATE ... LIKE keeps the source collation (utf8mb4_general_ci);
                    # convert to the admin_erp default so the recreated procedures'
                    # string comparisons don't raise "Illegal mix of collations" (1267).
                    cur.execute(
                        f"ALTER TABLE `{DST}`.`{m}` CONVERT TO CHARACTER SET utf8mb4 "
                        f"COLLATE utf8mb4_uca1400_ai_ci"
                    )
                    cur.execute(f"INSERT INTO `{DST}`.`{m}` SELECT * FROM `{SRC}`.`{m}`")
                cur.execute(f"SELECT COUNT(*) FROM `{SRC}`.`{m}`")
                created_t.append(f"{m} (+{cur.fetchone()[0]} rows)")
        for proc in (f"Sp{m}", f"SpGetNext{m}Code"):
            if proc in src_p and proc not in dst_p:
                if apply:
                    cur.execute(f"SHOW CREATE PROCEDURE `{SRC}`.`{proc}`")
                    body = cur.fetchone()[2]
                    cur.execute(f"USE `{DST}`")
                    cur.execute(f"DROP PROCEDURE IF EXISTS `{proc}`")
                    cur.execute(body)  # unqualified name -> created in DST
                created_p.append(proc)

    if apply:
        conn.commit()
    conn.close()

    tag = "APPLIED" if apply else "DRY RUN (no changes written)"
    print(f"=== Master migration {SRC} -> {DST} : {tag} ===")
    print(f"Tables to create+seed ({len(created_t)}): {created_t}")
    print(f"Procedures to create ({len(created_p)}): {created_p}")
    if skipped:
        print(f"Skipped: {skipped}")
    if not apply:
        print("\nRe-run with --apply to perform the copy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
