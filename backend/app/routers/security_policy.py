"""Security policy persistence (Administration ▸ Security policy).

Stores the whole policy as one JSON document per company. The screen reads it on
load and saves the edited document back; if no row exists yet the read returns
null and the UI falls back to its built-in default, so first save creates the row.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session

router = APIRouter(prefix="/security-policy", tags=["Security Policy"])

_DEFAULT_SCOPE = "DEFAULT"


@router.get("")
async def get_security_policy(
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any] | None:
    """Return the stored policy document, or null if none has been saved yet."""
    result = await db.execute(
        text("SELECT PolicyJson, Version FROM sys_security_policy_doc WHERE CompanyUid = :c"),
        {"c": _DEFAULT_SCOPE},
    )
    row = result.fetchone()
    if not row:
        return None
    policy = json.loads(row.PolicyJson)
    policy["version"] = row.Version
    return policy


@router.put("")
async def save_security_policy(
    policy: dict[str, Any],
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upsert the policy document and bump its version."""
    now = datetime.now(timezone.utc)
    payload = json.dumps(policy)
    # Upsert on the unique company scope; bump Version on every save.
    await db.execute(
        text(
            "INSERT INTO sys_security_policy_doc (CompanyUid, PolicyJson, Version, UpdatedBy, UpdatedAt) "
            "VALUES (:c, :p, 1, :u, :t) "
            "ON DUPLICATE KEY UPDATE PolicyJson = :p, Version = Version + 1, "
            "UpdatedBy = :u, UpdatedAt = :t"
        ),
        {"c": _DEFAULT_SCOPE, "p": payload, "u": "system", "t": now},
    )
    await db.commit()
    result = await db.execute(
        text("SELECT Version FROM sys_security_policy_doc WHERE CompanyUid = :c"),
        {"c": _DEFAULT_SCOPE},
    )
    policy["version"] = result.fetchone().Version
    return policy
