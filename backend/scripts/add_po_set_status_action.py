"""Add a non-destructive SET_STATUS action to ERP_Procurement.SpManagePurchaseOrder.

Mirrors add_pr_set_status_action.py: the SP's UPDATE action rewrites lines, so it
cannot be used to flip only the workflow status. SET_STATUS updates
Status / ModifiedBy / ModifiedDate / Version only, keyed by Id.

Safe: validates the new body under a temp name (_v2) BEFORE dropping the live one.
Idempotent. Run:
  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/add_po_set_status_action.py
"""

from __future__ import annotations

from sqlalchemy import create_engine

from app.core.config import settings

NAME = "SpManagePurchaseOrder"

# Anchor = the DELETE branch's result + its closing END IF (unique in this SP).
ANCHOR = (
    "                SELECT JSON_OBJECT('success', true) AS Result;\n"
    "            END IF;"
)

REPLACEMENT = (
    "                SELECT JSON_OBJECT('success', true) AS Result;\n"
    "\n"
    "            ELSEIF p_Action = 'SET_STATUS' THEN\n"
    "                UPDATE PurchaseOrder\n"
    "                   SET Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),\n"
    "                       ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')),\n"
    "                       ModifiedDate = v_CurrentDate,\n"
    "                       Version = Version + 1\n"
    "                 WHERE Id = p_Id AND IsDeleted = 0;\n"
    "                SELECT JSON_OBJECT('uid', p_Id) AS Result;\n"
    "            END IF;"
)


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
        if ANCHOR not in body:
            raise SystemExit("Anchor (DELETE branch) not found — aborting, live proc untouched.")

        idx = body.upper().index("PROCEDURE")
        create = "CREATE " + body[idx:]  # strip DEFINER
        new_create = create.replace(ANCHOR, REPLACEMENT, 1)

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
        print("SET_STATUS action added to", NAME)

        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        print("verify SET_STATUS present:", "'SET_STATUS'" in cur.fetchone()[2])
    finally:
        raw.close()


if __name__ == "__main__":
    main()
