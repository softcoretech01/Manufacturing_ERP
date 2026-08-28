"""Backfill RfqSupplier.ResponseStatus from the quotations already recorded.

Quotation creation never wrote back to the RFQ, so every invited supplier is
stuck on 'PENDING' regardless of whether they quoted — including on RFQs that
have already been awarded. The application now keeps the two in step
(app/services/rfq_sync.py); this repairs the rows written before that.

Idempotent — it recomputes rather than toggles, so it is safe to re-run. Run:
  PYTHONPATH="$PWD" venv/Scripts/python.exe scripts/backfill_rfq_supplier_response.py
"""

from __future__ import annotations

from sqlalchemy import create_engine, text

from app.core.config import settings

# Same recompute the application performs, applied to every RFQ at once.
BACKFILL = """
UPDATE ERP_Procurement.RfqSupplier s
  JOIN ERP_Procurement.Rfq r ON r.Id = s.RfqId
   SET s.ResponseStatus = IF(
           EXISTS (SELECT 1 FROM ERP_Procurement.SupplierQuotation q
                    WHERE q.RfqNo = r.DocNo
                      AND q.SupplierUid = s.SupplierUid
                      AND q.IsDeleted = 0),
           'RESPONDED', 'PENDING'),
       s.RespondedAt = (SELECT q.CreatedDate FROM ERP_Procurement.SupplierQuotation q
                         WHERE q.RfqNo = r.DocNo
                           AND q.SupplierUid = s.SupplierUid
                           AND q.IsDeleted = 0
                         ORDER BY q.Id DESC LIMIT 1),
       s.QuotationUid = (SELECT CAST(q.Id AS CHAR) FROM ERP_Procurement.SupplierQuotation q
                          WHERE q.RfqNo = r.DocNo
                            AND q.SupplierUid = s.SupplierUid
                            AND q.IsDeleted = 0
                          ORDER BY q.Id DESC LIMIT 1),
       s.ModifiedDate = CURRENT_TIMESTAMP
"""

REPORT = """
SELECT r.DocNo, s.SupplierName, s.ResponseStatus, s.QuotationUid
  FROM ERP_Procurement.RfqSupplier s
  JOIN ERP_Procurement.Rfq r ON r.Id = s.RfqId
 ORDER BY r.DocNo, s.Id
"""


def main() -> None:
    engine = create_engine(settings.sync_database_url)
    with engine.begin() as conn:
        result = conn.execute(text(BACKFILL))
        print(f"RfqSupplier rows recomputed: {result.rowcount}")
        print("\n RFQ                 Supplier        Response     Quotation")
        for doc_no, supplier, status, quote in conn.execute(text(REPORT)):
            print(f" {doc_no:<20}{supplier:<16}{status:<13}{quote or '-'}")


if __name__ == "__main__":
    main()
