"""Apply procurement_invoice.sql to the ERP_Procurement database.

Splits the script on lines reading exactly ``-- @@GO`` and executes each segment
as a single statement, so the stored procedure body (which contains semicolons)
goes through the driver in one piece without a client-side DELIMITER.

Idempotent: tables use ``CREATE TABLE IF NOT EXISTS`` and the procedure is
dropped and recreated. Run from the backend directory with the venv python:

    .venv/Scripts/python.exe scripts/apply_procurement_invoice.py [path/to/procurement_invoice.sql]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pymysql
from app.core.config import settings


def main() -> None:
    sql_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("procurement_invoice.sql")
    script = sql_path.read_text(encoding="utf-8")

    segments = [s.strip() for s in script.split("\n-- @@GO")]
    segments = [s for s in segments if s and not all(ln.strip().startswith("--") or not ln.strip() for ln in s.splitlines())]

    conn = pymysql.connect(
        host=settings.db_host, port=settings.db_port,
        user=settings.db_user, password=settings.db_password,
        database="ERP_Procurement", autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            for i, seg in enumerate(segments, 1):
                head = next((ln for ln in seg.splitlines() if ln.strip() and not ln.strip().startswith("--")), "")[:60]
                cur.execute(seg)
                print(f"[{i}/{len(segments)}] OK  {head}")
    finally:
        conn.close()
    print("procurement_invoice.sql applied to ERP_Procurement")


if __name__ == "__main__":
    main()
