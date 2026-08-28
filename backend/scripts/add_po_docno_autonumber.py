"""Give ERP_Procurement.SpManagePurchaseOrder CREATE an auto-generated DocNo.

The PO SP inserted the raw payload docNo; when the client omits it (JSON null),
JSON_UNQUOTE yields the literal string 'null', so the first PO stored DocNo='null'
and the second collided on the unique index. The PR SP already auto-numbers
('PR/26-27/#####'); this mirrors that for PO ('PO/26-27/#####') so document
numbers are backend-generated, never client-supplied.

Safe: validates under a temp name before replacing. Idempotent. Run:
  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/add_po_docno_autonumber.py
"""

from __future__ import annotations

from sqlalchemy import create_engine

from app.core.config import settings

NAME = "SpManagePurchaseOrder"

DECLARE_ANCHOR = "            DECLARE v_NewId INT;"
DECLARE_REPLACEMENT = (
    "            DECLARE v_NewId INT;\n"
    "            DECLARE v_NextNum INT DEFAULT 0;"
)

DOCNO_ANCHOR = "                SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));"
DOCNO_REPLACEMENT = (
    "                SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));\n"
    "                IF v_DocNo IS NULL OR v_DocNo = '' OR v_DocNo = 'null' THEN\n"
    "                    SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 10) AS UNSIGNED)), 0) + 1 INTO v_NextNum\n"
    "                      FROM PurchaseOrder WHERE DocNo LIKE 'PO/26-27/%';\n"
    "                    SET v_DocNo = CONCAT('PO/26-27/', LPAD(v_NextNum, 5, '0'));\n"
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
        for anchor in (DECLARE_ANCHOR, DOCNO_ANCHOR):
            if anchor not in body:
                raise SystemExit(f"Anchor not found: {anchor!r} — aborting, live proc untouched.")

        idx = body.upper().index("PROCEDURE")
        create = "CREATE " + body[idx:]  # strip DEFINER
        new_create = create.replace(DECLARE_ANCHOR, DECLARE_REPLACEMENT, 1)
        new_create = new_create.replace(DOCNO_ANCHOR, DOCNO_REPLACEMENT, 1)

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
        print("PO auto-numbering added.")

        cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{NAME}")
        print("verify v_NextNum present:", "v_NextNum" in cur.fetchone()[2])
    finally:
        raw.close()


if __name__ == "__main__":
    main()
