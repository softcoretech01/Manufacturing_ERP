"""Master-data duplicate detection (Masters ▸ Governance ▸ Duplicate review).

Scans the master tables for records that look like the same real-world entity:
an exact match on a statutory identifier (GSTIN, PAN, serial, asset code) is a
near-certain duplicate; a close fuzzy match on the name is a candidate for a
human to review. Detection is read-only and computed live from the same rows
the master screens serve — nothing here is precomputed or stored.

The merge/dismiss actions are deliberately not implemented here: repointing
references on approved documents is a controlled, second-approval operation and
is out of scope for detection. The endpoint returns OPEN candidates only.
"""

from __future__ import annotations

import difflib
import re
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session

router = APIRouter(prefix="/masters/duplicates", tags=["Master Data Governance"])

# Company/legal-form noise words stripped before fuzzy name comparison, so
# "Jindal Stainless Limited" and "Jindal Stainless Ltd." normalise to the same
# stem instead of losing similarity to their suffixes.
_SUFFIX = re.compile(
    r"\b(private|pvt|public|limited|ltd|llp|inc|co|company|corp|corporation|"
    r"industries|industry|enterprises|enterprise|international|and|the)\b",
    re.IGNORECASE,
)
_NONWORD = re.compile(r"[^a-z0-9]+")

# Fuzzy name matches below this ratio are not reported. 0.80 keeps genuine
# near-duplicates ("... P Ltd" vs "... Private Limited") while dropping merely
# similar but distinct names.
_NAME_THRESHOLD = 0.80


def _norm(value: str | None) -> str:
    s = (value or "").lower()
    s = _SUFFIX.sub(" ", s)
    s = _NONWORD.sub(" ", s).strip()
    return s


def _ratio(a: str | None, b: str | None) -> float:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    return difflib.SequenceMatcher(None, na, nb).ratio()


# Per-master detection config. `statutory` fields, when equal and non-empty on
# two rows, are treated as a hard duplicate signal; otherwise names are fuzzed.
_MASTERS: list[dict[str, Any]] = [
    {
        "code": "SUPPLIER", "name": "Supplier", "table": "Supplier",
        "statutory": [("Gstin", "GSTIN"), ("Pan", "PAN")],
        "detail": ["Gstin", "Category"], "usage": "UsageCount",
        "created": "CreatedDate", "soft_delete": True,
    },
    {
        "code": "CUSTOMER", "name": "Customer", "table": "Customer",
        "statutory": [("Gstin", "GSTIN"), ("Pan", "PAN")],
        "detail": ["Gstin", "Territory"], "usage": "UsageCount",
        "created": "CreatedDate", "soft_delete": True,
    },
    {
        "code": "ITEM", "name": "Item", "table": "Item",
        "statutory": [],
        "detail": ["Category", "HsnCode"], "usage": None,
        "created": "CreatedDate", "soft_delete": True,
    },
    {
        "code": "EMPLOYEE", "name": "Employee", "table": "Employee",
        "statutory": [],
        "detail": ["Designation", "Department"], "usage": None,
        "created": "CreatedDate", "soft_delete": True,
    },
    {
        "code": "TRANSPORTER", "name": "Transporter", "table": "Transporter",
        "statutory": [("TransporterId", "Transporter ID")],
        "detail": ["Mode", "ContactMobile"], "usage": None,
        "created": "CreatedAt", "soft_delete": False,
    },
    {
        "code": "MACHINE", "name": "Machine", "table": "Machine",
        "statutory": [("SerialNumber", "Serial number"), ("AssetCode", "Asset code")],
        "detail": ["Manufacturer", "ModelNumber"], "usage": None,
        "created": "CreatedDate", "soft_delete": True,
    },
]


def _detail(row: dict[str, Any], fields: list[str]) -> str:
    parts = [str(row.get(f)).strip() for f in fields if row.get(f) not in (None, "")]
    return " · ".join(parts)


def _record(m: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    created = row.get(m["created"])
    return {
        "uid": f"{m['code'].lower()}-{row.get('Id')}",
        "code": row.get("Code") or "",
        "name": row.get("Name") or "",
        "detail": _detail(row, m["detail"]),
        "createdAt": created.isoformat() if created is not None else "",
        "usageCount": int(row.get(m["usage"]) or 0) if m["usage"] else 0,
    }


async def _scan_master(db: AsyncSession, m: dict[str, Any]) -> list[dict[str, Any]]:
    # Column set is fixed by config, never user input — safe to interpolate.
    cols = {"Id", "Code", "Name", m["created"]}
    if m["usage"]:
        cols.add(m["usage"])
    for f in m["detail"]:
        cols.add(f)
    for f, _label in m["statutory"]:
        cols.add(f)
    col_sql = ", ".join(f"`{c}`" for c in cols)
    where = "WHERE IsDeleted = 0" if m["soft_delete"] else ""
    result = await db.execute(text(f"SELECT {col_sql} FROM `{m['table']}` {where}"))
    rows = [dict(r._mapping) for r in result.fetchall()]

    candidates: list[dict[str, Any]] = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a, b = rows[i], rows[j]
            matched_on: list[str] = []
            score = 0.0

            for field, label in m["statutory"]:
                va, vb = (a.get(field) or "").strip(), (b.get(field) or "").strip()
                if va and vb and va.upper() == vb.upper():
                    matched_on.append(label)
            if matched_on:
                # A shared statutory id is near-certain; nudge score up with any
                # name agreement so identical GSTIN + identical name reads as 100.
                name_ratio = _ratio(a.get("Name"), b.get("Name"))
                score = min(100.0, 92.0 + name_ratio * 8.0)
                if name_ratio >= 0.6:
                    matched_on.append("Name (fuzzy)")
            else:
                name_ratio = _ratio(a.get("Name"), b.get("Name"))
                if name_ratio >= _NAME_THRESHOLD:
                    score = name_ratio * 100.0
                    matched_on.append("Name (fuzzy)")

            if not matched_on:
                continue

            ra, rb = _record(m, a), _record(m, b)
            candidates.append({
                "uid": f"dup-{m['code'].lower()}-{a.get('Id')}-{b.get('Id')}",
                "masterCode": m["code"],
                "masterName": m["name"],
                "matchScore": round(score),
                "matchedOn": matched_on,
                # Surface the more-referenced record first as the suggested survivor.
                "recordA": ra if ra["usageCount"] >= rb["usageCount"] else rb,
                "recordB": rb if ra["usageCount"] >= rb["usageCount"] else ra,
                "status": "OPEN",
            })
    return candidates


@router.get("")
async def list_duplicate_candidates(
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """Live scan of every configured master for probable duplicate records."""
    out: list[dict[str, Any]] = []
    for m in _MASTERS:
        try:
            out.extend(await _scan_master(db, m))
        except Exception:
            # A master table that is absent or shaped differently should not sink
            # the whole report; skip it and continue with the rest.
            continue
    out.sort(key=lambda c: c["matchScore"], reverse=True)
    return out
