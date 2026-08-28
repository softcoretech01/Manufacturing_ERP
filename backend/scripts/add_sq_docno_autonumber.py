"""Give ERP_Procurement.SpManageSupplierQuotation CREATE an auto-generated DocNo
('SQ/26-27/#####'), mirroring PR/PO/RFQ. Safe: validates under a temp name first.
Idempotent. Run:
  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/add_sq_docno_autonumber.py
"""

from __future__ import annotations

from sqlalchemy import create_engine

from app.core.config import settings

NAME = "SpManageSupplierQuotation"

DECLARE_ANCHOR = "            DECLARE v_DocNo VARCHAR(30);"
DECLARE_REPLACEMENT = (
    "            DECLARE v_DocNo VARCHAR(30);\n"
    "            DECLARE v_NextNum INT DEFAULT 0;"
)

SET_ANCHOR = "                SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));"
SET_REPLACEMENT = (
    "                SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));\n"
    "                IF v_DocNo IS NULL OR v_DocNo = '' OR v_DocNo = 'null' THEN\n"
    "                    SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 10) AS UNSIGNED)), 0) + 1 INTO v_NextNum\n"
    "                      FROM SupplierQuotation WHERE DocNo LIKE 'SQ/26-27/%';\n"
    "                    SET v_DocNo = CONCAT('SQ/26-27/', LPAD(v_NextNum, 5, '0'));\n"
    "                END IF;"
)


def main() -> None:
    eng = create_engine(settings.sync_database_url)
    raw = eng.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("USE ERP_Procurement")
        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        body = cur.fetchone()[2]
        if "v_NextNum" in body:
            print("Auto-numbering already present — nothing to do.")
            return
        for anchor in (DECLARE_ANCHOR, SET_ANCHOR):
            if body.count(anchor) != 1:
                raise SystemExit(f"Anchor not unique/found ({body.count(anchor)}x): {anchor!r} — aborting.")

        idx = body.upper().index("PROCEDURE")
        create = "CREATE " + body[idx:]
        create = create.replace(DECLARE_ANCHOR, DECLARE_REPLACEMENT, 1)
        create = create.replace(SET_ANCHOR, SET_REPLACEMENT, 1)

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
        print("SQ auto-numbering added.")
        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        print("verify v_NextNum present:", "v_NextNum" in cur.fetchone()[2])
    finally:
        raw.close()


if __name__ == "__main__":
    main()
