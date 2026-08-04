"""ULID public identifiers (V0-DR-003).

ULIDs are used for every `uid` column because they are:
  * lexicographically sortable by creation time, so they cluster well as an index;
  * generatable offline on a mobile device without collision, which is what makes
    the offline outbox and idempotency keys work (V0-BR-054);
  * safe to expose in URLs — they leak neither row counts nor sequence.
"""

from __future__ import annotations

import re

from ulid import ULID

ULID_RE = re.compile(r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$")


def new_uid() -> str:
    """A fresh 26-character Crockford base32 ULID."""
    return str(ULID())


def is_valid_uid(value: str) -> bool:
    return bool(value) and bool(ULID_RE.match(value.upper()))


def uid_timestamp_ms(value: str) -> int:
    """Creation time embedded in a ULID, in epoch milliseconds."""
    return int(ULID.from_str(value).timestamp * 1000)
