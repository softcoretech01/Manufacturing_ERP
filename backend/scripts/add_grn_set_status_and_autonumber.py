"""Add SET_STATUS + DocNo auto-numbering to ERP_Procurement.SpManageGrn.

Two changes, both mirroring what PR/PO/RFQ/Quotation already have:

* **SET_STATUS** — a non-destructive status action. The generic UPDATE action
  deletes and re-inserts GrnLine rows, so it can never be used to flip a GRN to
  POSTED. GRN posting depends on this: the posted flag is the idempotency guard
  that stops stock being counted twice.
* **DocNo auto-numbering** — 'GRN/26-27/#####', generated in the database so a
  document number is never supplied (or duplicated) by the client.

Safe: validates the rewritten procedure under a temp name before dropping the
live one. Idempotent. Run:
  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/add_grn_set_status_and_autonumber.py
"""

from __future__ import annotations

from sqlalchemy import create_engine

from app.core.config import settings

NAME = "SpManageGrn"

DECLARE_ANCHOR = "            DECLARE v_NewId INT;"
DECLARE_REPLACEMENT = (
    "            DECLARE v_NewId INT;\n"
    "            DECLARE v_DocNo VARCHAR(30);\n"
    "            DECLARE v_NextNum INT DEFAULT 0;"
)

# Unique to the CREATE branch.
SET_ANCHOR = (
    "                SET v_CreatedBy = IFNULL(JSON_UNQUOTE("
    "JSON_EXTRACT(p_JsonPayload, '$.createdBy')), 'System');"
)
SET_REPLACEMENT = (
    SET_ANCHOR + "\n"
    "                SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));\n"
    "                IF v_DocNo IS NULL OR v_DocNo = '' OR v_DocNo = 'null' THEN\n"
    "                    SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 11) AS UNSIGNED)), 0) + 1\n"
    "                      INTO v_NextNum FROM Grn WHERE DocNo LIKE 'GRN/26-27/%';\n"
    "                    SET v_DocNo = CONCAT('GRN/26-27/', LPAD(v_NextNum, 5, '0'));\n"
    "                END IF;"
)

DOCNO_VALUE_ANCHOR = "                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo')),"
DOCNO_VALUE_REPLACEMENT = "                    v_DocNo,"

DELETE_ANCHOR = (
    "            ELSEIF p_Action = 'DELETE' THEN\n"
    "                DELETE FROM Grn WHERE Id = p_Id;\n"
    "                SELECT JSON_OBJECT('success', true) AS Result;\n"
    "            END IF;"
)
DELETE_REPLACEMENT = (
    "            ELSEIF p_Action = 'SET_STATUS' THEN\n"
    "                UPDATE Grn\n"
    "                   SET Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),\n"
    "                       ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')),\n"
    "                       ModifiedDate = v_CurrentDate,\n"
    "                       Version = IFNULL(Version, 1) + 1\n"
    "                 WHERE Id = p_Id;\n"
    "                SELECT JSON_OBJECT('uid', p_Id) AS Result;\n"
    "\n"
    "            ELSEIF p_Action = 'DELETE' THEN\n"
    "                DELETE FROM Grn WHERE Id = p_Id;\n"
    "                SELECT JSON_OBJECT('success', true) AS Result;\n"
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

        if "'SET_STATUS'" in body and "v_NextNum" in body:
            print("SET_STATUS and auto-numbering already present — nothing to do.")
            return

        for anchor in (DECLARE_ANCHOR, SET_ANCHOR, DOCNO_VALUE_ANCHOR, DELETE_ANCHOR):
            if body.count(anchor) != 1:
                raise SystemExit(
                    f"Anchor not unique/found ({body.count(anchor)}x) — aborting, live proc untouched:\n{anchor[:90]}"
                )

        idx = body.upper().index("PROCEDURE")
        create = "CREATE " + body[idx:]  # strip DEFINER
        create = create.replace(DECLARE_ANCHOR, DECLARE_REPLACEMENT, 1)
        create = create.replace(SET_ANCHOR, SET_REPLACEMENT, 1)
        create = create.replace(DOCNO_VALUE_ANCHOR, DOCNO_VALUE_REPLACEMENT, 1)
        create = create.replace(DELETE_ANCHOR, DELETE_REPLACEMENT, 1)

        temp_create = create.replace(f"`{NAME}`", f"`{NAME}_v2`", 1)
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
        cur.execute(create)
        raw.commit()
        print("GRN: SET_STATUS + auto-numbering added.")

        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        nb = cur.fetchone()[2]
        print("verify SET_STATUS:", "'SET_STATUS'" in nb, "| verify auto-number:", "v_NextNum" in nb)
    finally:
        raw.close()


if __name__ == "__main__":
    main()
