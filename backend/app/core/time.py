"""UTC clock. Timestamps are stored in UTC (CLAUDE.md §4.4); business dates are
local and handled separately. Centralised so tests can freeze it if needed."""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Timezone-naive UTC, matching the DATETIME(6) columns which store UTC."""
    return datetime.now(UTC).replace(tzinfo=None)
