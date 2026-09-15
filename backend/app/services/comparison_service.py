"""Quotation comparison engine (Vol 3 Ch 5).

Builds a scored comparison from the quotations an RFQ received and snapshots it as
a persisted document. The scoring is deliberately here, in Python, not in the SP:
the SP only stores the frozen result.

Method (SRS §5.3–5.4):
* **Landed cost for comparison excludes creditable GST** (BR-002): base = basic +
  freight. Tax is shown in the display total but never scored.
* **Weighted RATIO_MIN scoring**: for each criterion, the best vendor gets the full
  weight and the rest get `best/theirs × weight`, so a cheaper/faster vendor scores
  higher. Weights (price/delivery/quality) must sum to 100 (BR-004) and are frozen.
* Delivery uses quoted lead time (a zero/unknown lead time is treated as best, not
  worst). Quality is neutral until supplier ratings feed in — it adds the same
  weight to every vendor rather than inventing a score.
* The top-ranked vendor is the **recommendation** — advisory only (BR-005).
Rejected/regretted quotations are kept in the snapshot for the audit trail but are
not ranked or recommended.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.errors import NotFoundError, ValidationFailedError

DEFAULT_WEIGHTS = {"price": 60.0, "delivery": 25.0, "quality": 15.0}
_EXCLUDED = {"REJECTED", "REGRET", "REGRETTED", "NO_QUOTE"}


def _f(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


async def _quotations_for_rfq(session: AsyncSession, rfq_no: str) -> list[dict]:
    row = (
        await session.execute(
            text("CALL ERP_Procurement.SpManageSupplierQuotation('READ_ALL', NULL, NULL)")
        )
    ).fetchone()
    allq = json.loads(row[0]) if row and row[0] else []
    return [q for q in allq if q.get("rfqNo") == rfq_no]


async def _rfq_header(session: AsyncSession, rfq_no: str) -> dict | None:
    row = (
        await session.execute(text("CALL ERP_Procurement.SpManageRfq('READ_ALL', NULL, NULL)"))
    ).fetchone()
    allr = json.loads(row[0]) if row and row[0] else []
    return next((r for r in allr if r.get("docNo") == rfq_no), None)


def _vendor_row(q: dict) -> dict:
    """Reduce a quotation to a comparison vendor (pre-scoring)."""
    basic = _f(q.get("basicValue"))
    freight = _f(q.get("freightValue"))
    landed = _f(q.get("landedValue")) or (basic + _f(q.get("taxValue")) + freight)
    base = (basic + freight) or landed  # ex creditable GST (BR-002)
    by_item: dict[str, Any] = {}
    lead = _f(q.get("leadTimeDays"))
    for ln in q.get("lines") or []:
        qty = _f(ln.get("qty"))
        rate = _f(ln.get("rate"))
        tax = _f(ln.get("taxPct"))
        landed_rate = _f(ln.get("landedRate")) or rate * (1 + tax / 100)
        by_item[str(ln.get("itemCode"))] = {
            "rate": rate, "taxPct": tax, "landedRate": landed_rate,
            "qty": qty, "lineTotal": round(qty * landed_rate, 2),
        }
        lead = max(lead, _f(ln.get("leadTimeDays")))
    return {
        "quotationUid": str(q.get("uid") or q.get("id") or ""),
        "quotationNo": q.get("docNo"),
        "supplierUid": str(q.get("supplierUid") or ""),
        "supplierName": q.get("supplierName") or q.get("supplierUid"),
        "quotationStatus": q.get("status"),
        "landedValue": round(landed, 2),
        "comparisonBase": round(base, 2),
        "leadTimeDays": int(lead),
        "byItem": by_item,
    }


def score_vendors(vendors: list[dict], weights: dict) -> None:
    """Assign price/delivery/quality/total scores and rank, in place."""
    live = [v for v in vendors if str(v["quotationStatus"]).upper() not in _EXCLUDED and v["comparisonBase"] > 0]
    for v in vendors:
        v.update(priceScore=0.0, deliveryScore=0.0, qualityScore=0.0, totalScore=0.0, rank=0, isRecommended=False)
    if not live:
        return
    min_base = min(v["comparisonBase"] for v in live)
    leads = [v["leadTimeDays"] for v in live if v["leadTimeDays"] > 0]
    min_lead = min(leads) if leads else 0
    for v in live:
        price = (min_base / v["comparisonBase"]) * weights["price"] if v["comparisonBase"] else 0.0
        delivery = weights["delivery"] if (min_lead == 0 or v["leadTimeDays"] == 0) else (min_lead / v["leadTimeDays"]) * weights["delivery"]
        quality = weights["quality"]  # neutral until supplier ratings feed in
        v["priceScore"] = round(price, 4)
        v["deliveryScore"] = round(delivery, 4)
        v["qualityScore"] = round(quality, 4)
        v["totalScore"] = round(price + delivery + quality, 4)
    # rank: highest total wins; tie-break on lower landed base
    ranked = sorted(live, key=lambda v: (-v["totalScore"], v["comparisonBase"]))
    for i, v in enumerate(ranked, start=1):
        v["rank"] = i
    ranked[0]["isRecommended"] = True


async def build_comparison(
    session: AsyncSession, ctx: TenantContext, rfq_no: str, weights: dict | None = None
) -> dict:
    weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    total_w = round(weights["price"] + weights["delivery"] + weights["quality"], 4)
    if abs(total_w - 100.0) > 0.01:
        raise ValidationFailedError(
            f"Scoring weights must sum to 100 (got {total_w}).",
            errors=[{"field": "weights", "code": "sum", "message": "price + delivery + quality must be 100"}],
        )

    quotations = await _quotations_for_rfq(session, rfq_no)
    if not quotations:
        raise NotFoundError(f"No quotations found for RFQ {rfq_no}.")

    vendors = [_vendor_row(q) for q in quotations]
    score_vendors(vendors, weights)

    live = [v for v in vendors if v["rank"] > 0]
    recommended = next((v for v in vendors if v["isRecommended"]), None)
    highest = max((v["landedValue"] for v in live), default=0.0)
    lowest = min((v["landedValue"] for v in live), default=0.0)
    savings = round(highest - (recommended["landedValue"] if recommended else 0.0), 2)

    rfq = await _rfq_header(session, rfq_no)
    rationale = None
    if recommended:
        rationale = (
            f"{recommended['supplierName']} recommended — best weighted score "
            f"{recommended['totalScore']} at landed cost {recommended['landedValue']:.2f} "
            f"(ex-GST base {recommended['comparisonBase']:.2f}), saving {savings:.2f} against the highest quote."
        )

    payload = {
        "docDate": (rfq or {}).get("docDate") or __import__("datetime").date.today().isoformat(),
        "rfqNo": rfq_no,
        "title": (rfq or {}).get("title") or (rfq or {}).get("category"),
        "buyer": (rfq or {}).get("buyer") or (ctx.user_name or None),
        "weights": weights,
        "status": "RECOMMENDED",
        "recommendedQuotationUid": recommended["quotationUid"] if recommended else None,
        "recommendedSupplier": recommended["supplierName"] if recommended else None,
        "rationale": rationale,
        "highestValue": highest,
        "lowestValue": lowest,
        "savingsVsHighest": savings,
        "createdBy": ctx.user_name or "System",
        "vendors": [{**v, "isRecommended": "1" if v["isRecommended"] else "0"} for v in vendors],
    }
    created = (
        await session.execute(
            text("CALL ERP_Procurement.SpManageComparison('CREATE', NULL, :p)"),
            {"p": json.dumps(payload)},
        )
    ).fetchone()
    if not (created and created[0]):
        raise ValidationFailedError("Failed to build the comparison.")
    new = json.loads(created[0])
    full = (
        await session.execute(
            text("CALL ERP_Procurement.SpManageComparison('READ', :id, NULL)"), {"id": new["uid"]}
        )
    ).fetchone()
    return json.loads(full[0]) if full and full[0] else new
