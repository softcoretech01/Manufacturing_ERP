"""Server-side recalculation of every money field on a procurement document.

Money that arrives in a request body is a *claim*, not a fact. A client can send
a grand total that does not match its own lines — by mistake or deliberately — so
the backend recomputes every amount from quantity, rate and tax before anything
is persisted. Whatever the browser sent is overwritten, never merged.

Tax percentage is resolved in order of authority:

1. the percentage on the line, when the document legitimately carries one (a
   supplier quotes their own tax, and a purchase order inherits it);
2. otherwise the item's GST rate from the Item master;
3. otherwise the company default.

Rounding follows CLAUDE.md §4.4 — half-up, applied once, at the declared scale
of the field (2dp for amounts).
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Used only when neither the line nor the item master states a rate.
DEFAULT_TAX_PCT = Decimal("0")

_Q2 = Decimal("0.01")


def _d(v: Any) -> Decimal:
    if v in (None, "", "null"):
        return Decimal("0")
    try:
        return Decimal(str(v))
    except Exception:  # noqa: BLE001 - any unparseable money is zero, not a crash
        return Decimal("0")


def _money(v: Decimal) -> float:
    """Round half-up to 2dp, once, at the point of persistence."""
    return float(v.quantize(_Q2, rounding=ROUND_HALF_UP))


async def item_tax_rates(session: AsyncSession, item_codes: list[str]) -> dict[str, Decimal]:
    """GST rate per item code, from the Item master."""
    codes = [c for c in {str(c or "").strip() for c in item_codes} if c]
    if not codes:
        return {}
    placeholders = ",".join(f":c{i}" for i in range(len(codes)))
    rows = (
        await session.execute(
            text(
                f"SELECT Code, GstRate FROM Item "
                f" WHERE Code IN ({placeholders}) AND IFNULL(IsDeleted, 0) = 0"
            ),
            {f"c{i}": c for i, c in enumerate(codes)},
        )
    ).fetchall()
    return {str(r[0]): _d(r[1]) for r in rows if r[1] is not None}


def _tax_pct(line: Any, master_rates: dict[str, Decimal]) -> Decimal:
    val = getattr(line, "taxPct", None)
    if val is not None:
        return _d(val)
    from_master = master_rates.get(str(getattr(line, "itemCode", "") or ""))
    if from_master and from_master > 0:
        return from_master
    return DEFAULT_TAX_PCT


# ─────────────────────────── per document ────────────────────────────


async def recalc_requisition(session: AsyncSession, req: Any) -> None:
    """A requisition is an estimate: value = Σ qty × estimated rate."""
    total = Decimal("0")
    for l in req.lines or []:
        total += _d(l.qty) * _d(l.estimatedRate)
    req.estimatedValue = _money(total)


async def recalc_quotation(session: AsyncSession, req: Any) -> None:
    """Supplier prices: basic, tax and landed value, all derived from the lines."""
    rates = await item_tax_rates(session, [l.itemCode for l in req.lines or []])
    basic = tax = freight = landed = Decimal("0")

    for l in req.lines or []:
        qty, rate = _d(l.qty), _d(l.rate)
        pct = _tax_pct(l, rates)
        l.taxPct = float(pct)

        line_basic = qty * rate
        line_tax = line_basic * pct / Decimal("100")
        line_freight = qty * _d(l.freight)

        # Landed rate is per unit, so it carries freight per unit too.
        l.landedRate = _money(rate + (rate * pct / Decimal("100")) + _d(l.freight))

        basic += line_basic
        tax += line_tax
        freight += line_freight
        landed += line_basic + line_tax + line_freight

    req.basicValue = _money(basic)
    req.taxValue = _money(tax)
    req.freightValue = _money(freight)
    req.landedValue = _money(landed)


async def recalc_purchase_order(session: AsyncSession, req: Any) -> None:
    """Order value: every line amount and the header totals are recomputed."""
    rates = await item_tax_rates(session, [l.itemCode for l in req.lines or []])
    basic = tax = Decimal("0")

    for l in req.lines or []:
        qty, rate = _d(l.qty), _d(l.rate)
        pct = _tax_pct(l, rates)
        l.taxPct = float(pct)

        amount = qty * rate
        discount = amount * _d(l.discountPct) / Decimal("100")
        net = amount - discount
        line_tax = net * pct / Decimal("100")

        l.amount = _money(net)
        l.taxAmount = _money(line_tax)
        l.lineTotal = _money(net + line_tax)

        basic += net
        tax += line_tax

    req.basicValue = _money(basic)
    req.taxValue = _money(tax)
    req.totalValue = _money(basic + tax + _d(req.freightValue) - _d(req.discountValue))


async def recalc_grn(session: AsyncSession, req: Any) -> None:
    """Receipt value follows the *accepted* quantity — rejected goods are not bought."""
    received = accepted = rejected = value = Decimal("0")

    for l in req.lines or []:
        acc = _d(l.acceptedQty)
        received += _d(l.receivedQty)
        accepted += acc
        rejected += _d(l.rejectedQty)
        value += acc * _d(l.rate)

    req.totalReceived = _money(received)
    req.totalAccepted = _money(accepted)
    req.totalRejected = _money(rejected)
    req.grnValue = _money(value)
