"""Reusable request-field format validators (CLAUDE.md §6 — validation is
server-side, never only in the UI).

Length and type limits live on the Pydantic `Field` and the DB column; these add
the *format* rules, so a value like an e-mail or a pincode can only be accepted if
it is actually well-formed. Exposed as `Annotated` types so a schema field reads
`email: EmailStr | None` and gets the check for free. `None` short-circuits (the
union's None branch is taken), so optional fields stay optional.
"""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator

# Indian pincode: 6 digits, no leading zero. E-mail: pragmatic single-@ check.
# Phone: digits, spaces and hyphens with an optional leading +, 7-20 chars total.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
_PINCODE_RE = re.compile(r"^[1-9][0-9]{5}$")
_PHONE_RE = re.compile(r"^\+?[0-9][0-9\s-]{6,19}$")
# Login id: letters, digits and . _ - @ only — no spaces or other punctuation.
_LOGIN_RE = re.compile(r"^[A-Za-z0-9._@-]{3,80}$")


def _email(v: str) -> str:
    if not _EMAIL_RE.match(v):
        raise ValueError("Enter a valid e-mail address, e.g. name@company.com.")
    return v


def _login_id(v: str) -> str:
    if not _LOGIN_RE.match(v):
        raise ValueError(
            "Login id may use letters, digits and . _ - @ only (no spaces), 3-80 chars."
        )
    return v


def _pincode(v: str) -> str:
    if not _PINCODE_RE.match(v):
        raise ValueError("Pincode must be 6 digits.")
    return v


def _phone(v: str) -> str:
    if not _PHONE_RE.match(v):
        raise ValueError("Phone may contain digits, spaces and hyphens (7-20 chars).")
    return v


EmailStr = Annotated[str, AfterValidator(_email)]
PincodeStr = Annotated[str, AfterValidator(_pincode)]
PhoneStr = Annotated[str, AfterValidator(_phone)]
LoginIdStr = Annotated[str, AfterValidator(_login_id)]
