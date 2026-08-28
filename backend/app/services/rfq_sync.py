"""Keep an RFQ's invited-supplier rows in step with the quotations received.

``RfqSupplier`` records who was invited and whether they came back with a price.
Nothing on the quotation side used to write to it, so a supplier who had already
submitted a quotation stayed on ``PENDING`` forever — the RFQ detail screen
showed "Pending" for a supplier whose quote was sitting in the system, and the
RFQ could even be awarded to a supplier still shown as not having responded.

Rather than nudging a single row on each quotation event (which drifts the
moment a quotation is deleted, or an RFQ is edited and its supplier rows are
rewritten), the whole RFQ is recomputed from the quotations that actually exist.
That makes the operation idempotent and self-healing: running it on an RFQ that
is already correct changes nothing, and running it after any event — create,
update, delete, RFQ edit — always lands on the truth.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# One statement, so an RFQ can never be left half-synced. For each invited
# supplier: the most recent live quotation from that supplier on this RFQ
# decides the response status, the response timestamp and the quotation link.
# No live quotation → the row falls back to PENDING with both fields cleared,
# which is what makes deleting a quotation self-correcting.
_SYNC_SQL = text(
    """
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
     WHERE r.DocNo = :rfq_no
    """
)


async def sync_rfq_supplier_response(session: AsyncSession, rfq_no: str | None) -> None:
    """Recompute every invited supplier's response state on one RFQ.

    Call after anything that changes which quotations exist for an RFQ, or that
    rewrites the RFQ's supplier rows. Runs in the caller's transaction, so the
    quotation and the RFQ it belongs to always commit together. A blank or
    unknown RFQ number is a no-op — quotations are not required to cite an RFQ.
    """
    if not rfq_no:
        return
    await session.execute(_SYNC_SQL, {"rfq_no": rfq_no})


async def rfq_no_for_quotation(session: AsyncSession, uid: str) -> str | None:
    """The RFQ a quotation belongs to, looked up by its id or document number.

    Needed before a delete: once the row is gone the link back to the RFQ is
    gone with it, so the RFQ could never be resynced.
    """
    row = (
        await session.execute(
            text(
                "SELECT RfqNo FROM ERP_Procurement.SupplierQuotation "
                " WHERE Id = :uid OR DocNo = :uid LIMIT 1"
            ),
            {"uid": uid},
        )
    ).fetchone()
    return row[0] if row else None
