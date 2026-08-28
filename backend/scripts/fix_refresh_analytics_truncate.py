"""Fix ERP_Procurement.SpRefreshAnalytics: TRUNCATE TABLE -> DELETE FROM.

SpRefreshAnalytics is invoked by AFTER INSERT/UPDATE triggers on PurchaseOrder
(TRG_PO_Analytics_*). TRUNCATE causes an implicit COMMIT, which is illegal inside
a trigger — so any PO status transition to/from 'Approved' raised MySQL 1422
("Explicit or implicit commit is not allowed in stored function or trigger"),
breaking PO approval and any transactional PO update. DELETE FROM empties the
same (tiny) aggregate tables without an implicit commit.

Safe: validates under a temp name before replacing. Idempotent. Run:
  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/fix_refresh_analytics_truncate.py
"""

from __future__ import annotations

from sqlalchemy import create_engine

from app.core.config import settings

NAME = "SpRefreshAnalytics"


def main() -> None:
    eng = create_engine(settings.sync_database_url)
    raw = eng.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("USE ERP_Procurement")
        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        body = cur.fetchone()[2]
        if "TRUNCATE TABLE" not in body.upper():
            print("No TRUNCATE TABLE present — nothing to do.")
            return

        idx = body.upper().index("PROCEDURE")
        create = "CREATE " + body[idx:]  # strip DEFINER
        # Case-insensitive replace of the exact statement lead-in.
        import re
        new_create = re.sub(r"TRUNCATE\s+TABLE\s+", "DELETE FROM ", create, flags=re.IGNORECASE)

        temp_create = new_create.replace(f"`{NAME}`", f"`{NAME}_v2`", 1)
        cur.execute(f"DROP PROCEDURE IF EXISTS {NAME}_v2")
        try:
            cur.execute(temp_create)
        except Exception as exc:  # noqa: BLE001
            raw.rollback()
            print("VALIDATION FAILED — live procedure untouched. Error:")
            print(repr(exc)[:600])
            return
        cur.execute(f"DROP PROCEDURE IF EXISTS {NAME}_v2")

        cur.execute(f"DROP PROCEDURE IF EXISTS {NAME}")
        cur.execute(new_create)
        raw.commit()
        print("SpRefreshAnalytics patched: TRUNCATE -> DELETE")

        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        nb = cur.fetchone()[2]
        print("verify no TRUNCATE:", "TRUNCATE TABLE" not in nb.upper())
    finally:
        raw.close()


if __name__ == "__main__":
    main()
