"""Add a non-destructive SET_STATUS action to ERP_Procurement.SpManagePurchaseRequisition.

The existing UPDATE action rewrites every field and re-inserts PrLine rows, so it
cannot be used to flip only the workflow status without wiping data. SET_STATUS
updates Status / ModifiedBy / ModifiedDate / Version only, keyed by Id.

Idempotent: safe to re-run. Uses settings.sync_database_url (pymysql).
Run:  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/add_pr_set_status_action.py
"""

from __future__ import annotations

from sqlalchemy import create_engine, text

from app.core.config import settings

SET_STATUS_BRANCH = """        ELSEIF p_Action = 'SET_STATUS' THEN
            UPDATE PurchaseRequisition
               SET Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                   ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')),
                   ModifiedDate = v_CurrentDate,
                   Version = Version + 1
             WHERE Id = p_Id;
            SELECT JSON_OBJECT('uid', p_Id) AS Result;

"""


NAME = "SpManagePurchaseRequisition"


def main() -> None:
    eng = create_engine(settings.sync_database_url)
    raw = eng.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("USE ERP_Procurement")
        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        body = cur.fetchone()[2]
        if "'SET_STATUS'" in body:
            print("SET_STATUS already present — nothing to do.")
            return

        # Strip DEFINER so the recreate does not require that specific grant.
        idx = body.upper().index("PROCEDURE")
        create = "CREATE " + body[idx:]

        # Insert the new branch before the final closing "END IF;".
        if "END IF;" not in create:
            raise SystemExit("Could not locate closing 'END IF;' in procedure body.")
        head, tail = create.rstrip().rsplit("END IF;", 1)
        new_create = head + SET_STATUS_BRANCH + "        END IF;" + tail

        # 1) Validate the new body under a temp name FIRST — never drop the live
        #    procedure until we know the replacement compiles.
        temp_create = new_create.replace(f"`{NAME}`", f"`{NAME}_v2`", 1)
        cur.execute(f"DROP PROCEDURE IF EXISTS {NAME}_v2")
        try:
            cur.execute(temp_create)
        except Exception as exc:  # noqa: BLE001
            raw.rollback()
            print("VALIDATION FAILED — live procedure untouched. Error:")
            print(repr(exc)[:500])
            return
        cur.execute(f"DROP PROCEDURE IF EXISTS {NAME}_v2")

        # 2) Body compiles — safe to replace the real one.
        cur.execute(f"DROP PROCEDURE IF EXISTS {NAME}")
        cur.execute(new_create)
        raw.commit()
        print("SET_STATUS action added.")

        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        print("verify SET_STATUS present:", "'SET_STATUS'" in cur.fetchone()[2])
    finally:
        raw.close()


if __name__ == "__main__":
    main()
