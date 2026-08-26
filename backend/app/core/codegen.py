"""Sequential business-code generation for masters.

Produces the next `<PREFIX><zero-padded-number>` code (e.g. BR0001, BR0002) from
the current maximum for that entity, scoped to the company where the entity is
company-scoped. The code is generated server-side and is read-only in the UI
(the client only previews it) so it can never be edited or collided by the user.

This is a pragmatic auto-number, not the full document-numbering engine
(SRS V0 §11 — series, formats, reset frequency). The DB unique key on
`(company_id, code, deleted_key)` is the final guard against races; callers
retry once on the rare duplicate.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# One prefix per master. Codes are unique per company (installation-wide for company).
CODE_PREFIX = {
    "sys_company": "CO",
    "sys_branch": "BR",
    "sys_plant": "PL",
    "sys_warehouse": "WH",
    "sys_department": "DP",
    "mst_cost_centre": "CC",
    "inv_zone": "ZN",
}


async def next_code(
    session: AsyncSession,
    model: type,
    prefix: str,
    *,
    company_id: int | None = None,
    width: int = 4,
) -> str:
    """The next free `<prefix><n>` code. Considers every row (incl. soft-deleted)
    so a number is never handed out twice."""
    stmt = select(model.code).where(model.code.like(f"{prefix}%"))  # type: ignore[attr-defined]
    if company_id is not None and hasattr(model, "company_id"):
        stmt = stmt.where(model.company_id == company_id)  # type: ignore[attr-defined]

    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    highest = 0
    for code in (await session.execute(stmt)).scalars().all():
        match = pattern.match(code or "")
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{prefix}{highest + 1:0{width}d}"
