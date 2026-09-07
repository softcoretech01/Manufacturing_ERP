"""Conversions for MariaDB column types that do not map cleanly onto Python.

`BIT(1)` comes back from the driver as ``b'\\x00'`` or ``b'\\x01'``. Both are
non-empty bytes, so a plain ``bool()`` is always ``True`` — an inactive row reads
as active. `TINYINT(1)` comes back as an ``int`` and converts correctly, but the
same helper handles it, so callers need not know which the column is.
"""

from typing import Any


def as_bool(value: Any) -> bool:
    """Truthiness of a MariaDB boolean column, whether BIT(1) or TINYINT(1)."""
    if value is None:
        return False
    if isinstance(value, (bytes, bytearray)):
        return value != b"\x00" and value != b""
    return bool(value)
