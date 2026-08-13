"""Pure domain-rule unit tests (no DB, no framework) — CLAUDE.md §8."""

from __future__ import annotations

from datetime import date

import pytest

from app.modules.organisation.domain import rules


# ─────────────────────────── PAN ────────────────────────────────────────────
@pytest.mark.parametrize("pan", ["AABCS1429B", "ZZZZZ0001A"])
def test_valid_pan(pan: str) -> None:
    assert rules.validate_pan(pan) is None


@pytest.mark.parametrize("pan", ["AABCS1429", "aabcs1429b", "12345ABCDE", "AABC1429BX"])
def test_invalid_pan(pan: str) -> None:
    err = rules.validate_pan(pan)
    assert err is not None and err.rule_code == "V1-ORG-BR-005"


# ─────────────────────────── GSTIN ──────────────────────────────────────────
def test_valid_gstin_all_three_checks() -> None:
    # 33 = Tamil Nadu; embedded PAN AABCS1429B
    gstin = "33AABCS1429B1ZP"
    assert rules.validate_gstin(gstin, expected_pan="AABCS1429B", expected_state_code="33") is None


def test_gstin_pan_mismatch_is_rejected() -> None:
    gstin = "33AABCS1429B1ZP"
    err = rules.validate_gstin(gstin, expected_pan="ZZZZZ9999Z", expected_state_code="33")
    assert err is not None and err.rule_code == "V1-ORG-BR-005"
    assert "PAN" in err.message


def test_gstin_state_mismatch_is_rejected() -> None:
    gstin = "33AABCS1429B1ZP"
    err = rules.validate_gstin(gstin, expected_pan="AABCS1429B", expected_state_code="29")
    assert err is not None and err.rule_code == "V1-ORG-BR-009"


def test_gstin_bad_format() -> None:
    err = rules.validate_gstin("NOTAGSTIN", expected_pan=None, expected_state_code=None)
    assert err is not None


# ─────────────────────────── Financial year ─────────────────────────────────
def test_fy_dates_end_after_start() -> None:
    assert rules.validate_fy_dates(rules.FyInterval(date(2025, 4, 1), date(2026, 3, 31))) is None
    bad = rules.validate_fy_dates(rules.FyInterval(date(2026, 3, 31), date(2025, 4, 1)))
    assert bad is not None


def test_fy_overlap_detection() -> None:
    existing = [rules.FyInterval(date(2025, 4, 1), date(2026, 3, 31))]
    overlapping = rules.FyInterval(date(2026, 1, 1), date(2026, 12, 31))
    contiguous = rules.FyInterval(date(2026, 4, 1), date(2027, 3, 31))
    assert rules.fy_overlaps(overlapping, existing) is True
    assert rules.fy_overlaps(contiguous, existing) is False


def test_month_periods_covers_indian_fy() -> None:
    periods = rules.month_periods(date(2025, 4, 1), date(2026, 3, 31))
    assert len(periods) == 12
    assert periods[0][1] == date(2025, 4, 1)
    assert periods[0][2] == date(2025, 4, 30)
    assert periods[-1][2] == date(2026, 3, 31)


# ─────────────────────────── Hierarchy cycles ───────────────────────────────
def test_cycle_detection() -> None:
    # 1 -> 2 -> 3 ; making 1's parent 3 would close a loop
    parent_of = {1: None, 2: 1, 3: 2}
    assert rules.would_create_cycle(1, 3, parent_of) is True
    assert rules.would_create_cycle(3, 1, parent_of) is False
    assert rules.would_create_cycle(2, 2, parent_of) is True  # self-parent
    assert rules.would_create_cycle(4, None, parent_of) is False
