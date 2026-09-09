"""Turn MySQL integrity errors into messages a user can act on.

A unique index is the only reliable place to enforce "one live default BOM per
product" -- MariaDB has no filtered indexes, so the rule lives in a generated
column plus `UNIQUE KEY`. The cost is that a violation surfaces as

    (1062, "Duplicate entry 'FG-SS-750-BLK' for key 'uk_engbom_default_per_product'")

which reaches the client as a 500 and tells a planner nothing. This maps the
index name back to the rule it enforces and raises `DuplicateError`, which the
app's global handler already renders as a 409 problem+json.

Add an entry here whenever you add a unique index a user can collide with.
"""

import re
from collections.abc import Mapping

from app.core.errors import DuplicateError

MYSQL_DUPLICATE_ENTRY = 1062

_DUPLICATE = re.compile(r"Duplicate entry '(?P<value>.*)' for key '(?P<key>[^']+)'")


def duplicate_key(exc: BaseException) -> tuple[str, str] | None:
    """`(index_name, offending_value)` if `exc` is a MySQL 1062, else None.

    Accepts either the SQLAlchemy wrapper or the driver error underneath.
    """
    orig = getattr(exc, "orig", exc)
    args = getattr(orig, "args", ())
    if not args or args[0] != MYSQL_DUPLICATE_ENTRY:
        return None

    detail = str(args[1]) if len(args) > 1 else str(orig)
    match = _DUPLICATE.search(detail)
    if not match:
        return None

    # Some servers report the key as `table.index`; the index name is what we key on.
    index = match.group("key").rsplit(".", 1)[-1]
    return index, match.group("value")


def raise_for_duplicate(exc: BaseException, messages: Mapping[str, str]) -> None:
    """Raise `DuplicateError` if `exc` is a duplicate on an index we can explain.

    Returns normally when the error is something else, so the caller can re-raise
    the original rather than swallowing an unrelated failure.

    `messages` maps index name to a template taking `{value}`.
    """
    found = duplicate_key(exc)
    if found is None:
        return
    index, value = found
    template = messages.get(index)
    if template is None:
        return
    raise DuplicateError(template.format(value=value)) from exc
