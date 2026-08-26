"""Pure Organisation business rules (no I/O). Traceable to SRS rule codes.

Kept free of SQLAlchemy/FastAPI so they are unit-testable in isolation
(CLAUDE.md §3.2: the domain layer imports nothing from the frameworks).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


@dataclass(frozen=True, slots=True)
class RuleError:
    field: str
    message: str
    rule_code: str


def validate_pan(pan: str) -> RuleError | None:
    if not PAN_RE.match(pan):
        return RuleError("pan", "PAN must match AAAAA9999A.", "V1-ORG-BR-005")
    return None


def validate_gstin(
    gstin: str, *, expected_pan: str | None, expected_state_code: str | None
) -> RuleError | None:
    """All three checks are mandatory (V1-ORG-BR-005): format, embedded PAN, state code."""
    if not GSTIN_RE.match(gstin):
        return RuleError("gstin", "GSTIN format is invalid.", "V1-ORG-BR-005")
    embedded_pan = gstin[2:12]
    if expected_pan and embedded_pan != expected_pan.upper():
        return RuleError(
            "gstin",
            f"GSTIN's embedded PAN ({embedded_pan}) does not match "
            f"the PAN on file ({expected_pan.upper()}).",
            "V1-ORG-BR-005",
        )
    state_code = gstin[0:2]
    if expected_state_code and state_code != expected_state_code:
        return RuleError(
            "gstin",
            f"GSTIN state code ({state_code}) does not match "
            f"the address state's GST code ({expected_state_code}).",
            "V1-ORG-BR-009",
        )
    return None


# ─────────────────────────── Financial year rules ───────────────────────────
@dataclass(frozen=True, slots=True)
class FyInterval:
    start: date
    end: date


def validate_fy_dates(new: FyInterval) -> RuleError | None:
    if new.end <= new.start:
        return RuleError("end_date", "Financial year end must be after its start.", "V1-ORG-FR-026")
    return None


def fy_overlaps(new: FyInterval, existing: list[FyInterval]) -> bool:
    """Financial years MUST NOT overlap (V1-ORG-BR-024)."""
    return any(new.start <= e.end and e.start <= new.end for e in existing)


def month_periods(start: date, end: date) -> list[tuple[int, date, date]]:
    """Split an FY into calendar-month accounting periods (V1-ORG-FR-027, default monthly)."""
    periods: list[tuple[int, date, date]] = []
    cur = start
    n = 1
    while cur <= end:
        nxt = date(cur.year + 1, 1, 1) if cur.month == 12 else date(cur.year, cur.month + 1, 1)
        period_end = min(nxt, end + _one_day()) - _one_day()
        periods.append((n, cur, period_end))
        cur = nxt
        n += 1
    return periods


def _one_day():
    from datetime import timedelta

    return timedelta(days=1)


# ─────────────────────────── Hierarchy rules ────────────────────────────────
def would_create_cycle(
    node_id: int, new_parent_id: int | None, parent_of: dict[int, int | None]
) -> bool:
    """Walking up from the proposed parent must never reach the node itself
    (V1-ORG-BR-019 for cost centres; same shape for departments)."""
    if new_parent_id is None:
        return False
    if new_parent_id == node_id:
        return True
    seen: set[int] = set()
    cur: int | None = new_parent_id
    while cur is not None:
        if cur == node_id:
            return True
        if cur in seen:
            return True  # pre-existing cycle, refuse anyway
        seen.add(cur)
        cur = parent_of.get(cur)
    return False
