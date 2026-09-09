"""Demand netting — what MRP will actually plan, and why.

The Demand screen lists documents. This endpoint answers the question the screen
cannot: for this product in this month, how much is firm, how much is forecast,
how much of the forecast is already covered by firm orders, and what is left to
plan.

Getting that wrong is the most expensive mistake in the portal. A forecast is a
guess that a firm order will arrive; once it does, planning both is planning the
same demand twice, and every level of the BOM below it is inflated with it.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.core.time import utcnow
from app.modules.planning.domain import mrp_engine as eng
from app.modules.planning.infrastructure.models import PpDemand

router = APIRouter(prefix="/planning", tags=["Planning · Demand"])


def _d(v: Any) -> Decimal:
    return Decimal("0") if v is None else Decimal(str(v))


@router.get("/demand-summary")
async def demand_summary(
    session: SessionDep,
    months: int = Query(6, ge=1, le=24),
    product: str | None = None,
    ctx: TenantContext = Depends(require("PLANNING.DEMAND.VIEW")),
) -> list[dict[str, Any]]:
    """One row per product per month: firm, forecast, consumed, net.

    `net_demand` is what MRP plans — firm in full, plus only the part of the
    forecast that firm orders have not already covered. Consumption is keyed on
    the calendar month because that is the period a forecast is stated in; a
    monthly forecast dated the 1st would never meet an order dated the 14th if
    it were keyed on the weekly planning bucket.
    """
    rows = (
        await session.execute(
            select(PpDemand).where(
                PpDemand.company_id == ctx.company_id,
                PpDemand.deleted_at.is_(None),
                PpDemand.status.notin_(list(eng.CLOSED_DEMAND_STATUSES)),
            )
        )
    ).scalars().all()

    today = utcnow().date()
    horizon_end = date(
        today.year + (today.month - 1 + months) // 12,
        (today.month - 1 + months) % 12 + 1,
        1,
    )

    firm: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    forecast: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    names: dict[str, str] = {}
    uoms: dict[str, str] = {}
    docs: dict[tuple[str, str], list[str]] = defaultdict(list)

    for r in rows:
        if not r.required_on or r.required_on >= horizon_end:
            continue
        if product and r.product_code != product:
            continue
        key = (r.product_code, r.required_on.strftime("%Y-%m"))
        open_qty = max(Decimal("0"), _d(r.qty) - _d(r.qty_planned))
        if open_qty <= 0:
            continue
        names.setdefault(r.product_code, r.product_name or r.product_code)
        uoms.setdefault(r.product_code, r.uom or "NOS")
        is_forecast = not r.is_firm or (r.source or "").upper() == "FORECAST"
        if is_forecast:
            forecast[key] += open_qty
        else:
            firm[key] += open_qty
            docs[key].append(r.doc_no)

    out: list[dict[str, Any]] = []
    for key in sorted(set(firm) | set(forecast), key=lambda k: (k[1], k[0])):
        code, period = key
        f = firm.get(key, Decimal("0"))
        fc = forecast.get(key, Decimal("0"))
        consumed = min(f, fc)
        remaining_forecast = fc - consumed
        out.append(
            {
                "product_code": code,
                "product_name": names.get(code, code),
                "uom": uoms.get(code, "NOS"),
                "period": period,
                "firm_qty": float(eng.r6(f)),
                "forecast_qty": float(eng.r6(fc)),
                # How much of the forecast firm orders already cover.
                "consumed_qty": float(eng.r6(consumed)),
                "remaining_forecast_qty": float(eng.r6(remaining_forecast)),
                # What MRP plans. Not firm + forecast.
                "net_demand": float(eng.r6(f + remaining_forecast)),
                # What it would have planned without the netting — kept so the
                # screen can show the difference rather than assert it.
                "gross_if_not_netted": float(eng.r6(f + fc)),
                "over_forecast": bool(f > fc and fc > 0),
                "firm_documents": docs.get(key, []),
            }
        )
    return out
