"""Add a non-destructive SET_STATUS action to SpManageSupplierQuotation and SpManageRfq.

Supplier selection has to move three documents at once (winning quotation ->
SELECTED, losing quotations -> REJECTED, RFQ -> COMPLETED). The generic UPDATE
action rewrites a document and deletes its child lines, so it can never be used
for a status change. This gives both procedures the same safe SET_STATUS action
that PR, PO and GRN already have.

For the RFQ, SET_STATUS also accepts an optional `awardedTo` so the awarded
supplier is recorded on the same write.

Safe: validates under a temp name before replacing the live procedure.
Idempotent. Run:
  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/add_sq_rfq_set_status.py
"""

from __future__ import annotations

from sqlalchemy import create_engine

from app.core.config import settings

SQ_ANCHOR = """            ELSEIF p_Action = 'DELETE' THEN"""

SQ_BRANCH = """            ELSEIF p_Action = 'SET_STATUS' THEN
                UPDATE SupplierQuotation
                   SET Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                       ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')),
                       ModifiedDate = v_CurrentDate
                 WHERE Id = p_Id;
                SELECT JSON_OBJECT('uid', p_Id) AS Result;

            ELSEIF p_Action = 'DELETE' THEN"""

RFQ_BRANCH = """            ELSEIF p_Action = 'SET_STATUS' THEN
                UPDATE Rfq
                   SET Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                       AwardedTo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardedTo')), AwardedTo),
                       ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')),
                       ModifiedDate = v_CurrentDate
                 WHERE Id = p_Id;
                SELECT JSON_OBJECT('uid', p_Id) AS Result;

            ELSEIF p_Action = 'DELETE' THEN"""


def patch(cur, name: str, anchor: str, replacement: str) -> None:
    cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{name}")
    body = cur.fetchone()[2]
    if "'SET_STATUS'" in body:
        print(f"{name}: SET_STATUS already present — skipped.")
        return
    if body.count(anchor) != 1:
        raise SystemExit(f"{name}: anchor not unique ({body.count(anchor)}x) — aborting, untouched.")

    idx = body.upper().index("PROCEDURE")
    create = "CREATE " + body[idx:]
    create = create.replace(anchor, replacement, 1)

    temp = create.replace(f"`{name}`", f"`{name}_v2`", 1)
    cur.execute(f"DROP PROCEDURE IF EXISTS {name}_v2")
    try:
        cur.execute(temp)
    except Exception as exc:  # noqa: BLE001
        print(f"{name}: VALIDATION FAILED — live procedure untouched:\n{repr(exc)[:400]}")
        raise SystemExit(1)
    cur.execute(f"DROP PROCEDURE IF EXISTS {name}_v2")

    cur.execute(f"DROP PROCEDURE IF EXISTS {name}")
    cur.execute(create)
    print(f"{name}: SET_STATUS added.")


def main() -> None:
    eng = create_engine(settings.sync_database_url)
    raw = eng.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("USE ERP_Procurement")
        patch(cur, "SpManageSupplierQuotation", SQ_ANCHOR, SQ_BRANCH)
        patch(cur, "SpManageRfq", SQ_ANCHOR, RFQ_BRANCH)
        raw.commit()
        for n in ("SpManageSupplierQuotation", "SpManageRfq"):
            cur.execute(f"SHOW CREATE PROCEDURE ERP_Procurement.{n}")
            print(f"verify {n}:", "'SET_STATUS'" in cur.fetchone()[2])
    finally:
        raw.close()


if __name__ == "__main__":
    main()
