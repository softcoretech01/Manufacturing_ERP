"""Data access for applying an engineering change to a bill of material.

Applying a change writes three things: the next revision of each bill it touches,
the supersession of the revision it replaces, and the change's own closure. They
have to succeed or fail together, which is why the statements live here as plain
SQL on one session rather than behind `SpManageEngineeringBom`, whose branches
commit on their own.

Nothing here commits. The service owns the transaction.
"""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

#: Env override so the apply can be exercised against a throwaway copy of the
#: schema instead of production tables.
SCHEMA = os.getenv("ERP_PRODUCT_SCHEMA", "ERP_Product")

BOM = f"{SCHEMA}.EngineeringBom"
BOM_LINE = f"{SCHEMA}.EngineeringBomLine"
CHANGE = f"{SCHEMA}.EngineeringChange"
CHANGE_LINE = f"{SCHEMA}.EngineeringChangeLine"

LIVE_STATUS_SQL = "('ACTIVE', 'APPROVED')"


def _date(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, date):
        return value.isoformat()
    return None if value is None else str(value)[:10]


class EngineeringChangeApplyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── The change ──────────────────────────────────────────────────────────

    async def get_change(self, uid: str, *, lock: bool = False) -> Optional[Dict[str, Any]]:
        row = (
            await self.session.execute(
                text(
                    "SELECT Id, DocNo, Title, Status, EffectiveFrom, ProductCode, RequestedBy,"
                    f" ResultingBom FROM {CHANGE} WHERE Id = :id" + (" FOR UPDATE" if lock else "")
                ),
                {"id": uid},
            )
        ).fetchone()
        if row is None:
            return None
        return {
            "uid": str(row[0]),
            "docNo": row[1],
            "title": row[2],
            "status": row[3],
            "effectiveFrom": _date(row[4]),
            "productCode": row[5],
            "requestedBy": row[6],
            "resultingBom": row[7],
        }

    async def get_change_lines(self, change_id: str) -> List[Dict[str, Any]]:
        rows = (
            await self.session.execute(
                text(
                    "SELECT BomDocNo, Action, ItemCode, NewItemCode, NewQtyPer, NewScrapPct, Note"
                    f" FROM {CHANGE_LINE} WHERE ChangeId = :id ORDER BY Id"
                ),
                {"id": change_id},
            )
        ).fetchall()
        return [
            {
                "bomDocNo": row[0],
                "action": row[1],
                "itemCode": row[2],
                "newItemCode": row[3],
                "newQtyPer": float(row[4] or 0),
                "newScrapPct": float(row[5] or 0),
                "note": row[6],
            }
            for row in rows
        ]

    async def mark_implemented(self, change_id: str, *, resulting: Optional[str], user: str) -> None:
        await self.session.execute(
            text(
                f"UPDATE {CHANGE} SET Status = 'IMPLEMENTED', ResultingBom = :resulting,"
                " ModifiedBy = :user, ModifiedDate = NOW() WHERE Id = :id"
            ),
            {"id": change_id, "resulting": resulting, "user": user},
        )

    # ── The bill ────────────────────────────────────────────────────────────

    async def get_live_revision(self, doc_no: str, *, lock: bool = False) -> Optional[Dict[str, Any]]:
        """The revision a change is applied to: the live one, highest revision."""
        row = (
            await self.session.execute(
                text(
                    "SELECT Id, DocNo, ProductCode, ProductName, BomType, Revision, BaseQty, Uom,"
                    f" IsDefault, AlternateFor FROM {BOM}"
                    " WHERE DocNo = :doc AND DeletedAt IS NULL"
                    f" AND UPPER(Status) IN {LIVE_STATUS_SQL}"
                    " ORDER BY Revision DESC LIMIT 1" + (" FOR UPDATE" if lock else "")
                ),
                {"doc": doc_no},
            )
        ).fetchone()
        if row is None:
            return None
        return {
            "id": row[0],
            "docNo": row[1],
            "productCode": row[2],
            "productName": row[3],
            "bomType": row[4],
            "revision": row[5],
            "baseQty": float(row[6] or 0),
            "uom": row[7],
            "isDefault": bool(row[8]),
            "alternateFor": row[9],
        }

    async def get_lines(self, bom_id: int) -> List[Dict[str, Any]]:
        rows = (
            await self.session.execute(
                text(
                    "SELECT Seq, ItemCode, ItemName, Uom, QtyPer, ScrapPct, IsPhantom, OperationSeq,"
                    f" Notes FROM {BOM_LINE} WHERE BomId = :id ORDER BY Seq"
                ),
                {"id": bom_id},
            )
        ).fetchall()
        return [
            {
                "seq": row[0],
                "itemCode": row[1],
                "itemName": row[2],
                "uom": row[3],
                "qtyPer": float(row[4] or 0),
                "scrapPct": float(row[5] or 0),
                "isPhantom": bool(row[6]),
                "operationSeq": row[7],
                "notes": row[8],
            }
            for row in rows
        ]

    async def next_revision_for(self, doc_no: str) -> int:
        """One past the highest revision this bill has ever had, deleted included."""
        highest = (
            await self.session.execute(
                text(f"SELECT MAX(Revision) FROM {BOM} WHERE DocNo = :doc"), {"doc": doc_no}
            )
        ).scalar()
        return int(highest or 0) + 1

    async def supersede(self, bom_id: int, *, effective_to: Any) -> None:
        """Step the previous revision down, default flag included.

        The flag has to go here rather than later: `uk_engbom_default_per_product`
        allows one live default per product, and the successor is about to claim it.

        EngineeringBom carries no modified-by columns; who did this is recorded on
        the successor, which names both the approver and the change that caused it.
        """
        await self.session.execute(
            text(
                f"UPDATE {BOM} SET Status = 'SUPERSEDED', EffectiveTo = :effectiveTo, IsDefault = 0,"
                " Version = Version + 1 WHERE Id = :id"
            ),
            {"id": bom_id, "effectiveTo": effective_to},
        )

    async def clear_default_for_product(self, product_code: str, *, exclude_id: int) -> List[str]:
        rows = (
            await self.session.execute(
                text(
                    f"SELECT Id, DocNo, Revision FROM {BOM}"
                    " WHERE ProductCode = :product AND Id <> :id AND DeletedAt IS NULL"
                    f" AND IsDefault = 1 AND UPPER(Status) IN {LIVE_STATUS_SQL}"
                ),
                {"product": product_code, "id": exclude_id},
            )
        ).fetchall()
        for row in rows:
            await self.session.execute(
                text(f"UPDATE {BOM} SET IsDefault = 0, Version = Version + 1 WHERE Id = :id"),
                {"id": row[0]},
            )
        return [f"{row[1]} R{row[2]}" for row in rows]

    async def insert_revision(
        self,
        *,
        base: Dict[str, Any],
        revision: int,
        effective_from: Any,
        source_ecn: str,
        change_reason: Optional[str],
        user: str,
    ) -> int:
        result = await self.session.execute(
            text(
                f"INSERT INTO {BOM}"
                " (DocNo, ProductCode, ProductName, BomType, Revision, Status, BaseQty, Uom,"
                "  EffectiveFrom, EffectiveTo, IsDefault, AlternateFor, CreatedBy, CreatedAt,"
                "  ApprovedBy, ApprovedAt, SourceEcn, ChangeReason, Version)"
                " VALUES (:doc, :product, :productName, :bomType, :revision, 'ACTIVE', :baseQty,"
                "  :uom, :effectiveFrom, NULL, 1, :alternateFor, :user, NOW(), :user, NOW(),"
                "  :sourceEcn, :changeReason, 1)"
            ),
            {
                "doc": base["docNo"],
                "product": base["productCode"],
                "productName": base["productName"],
                "bomType": base["bomType"],
                "revision": revision,
                "baseQty": base["baseQty"],
                "uom": base["uom"],
                "effectiveFrom": effective_from,
                "alternateFor": base["alternateFor"],
                "user": user,
                "sourceEcn": source_ecn,
                "changeReason": change_reason,
            },
        )
        return int(result.lastrowid)

    async def insert_lines(self, bom_id: int, lines: Sequence[Dict[str, Any]]) -> None:
        for line in lines:
            await self.session.execute(
                text(
                    f"INSERT INTO {BOM_LINE}"
                    " (BomId, Seq, ItemCode, ItemName, Uom, QtyPer, ScrapPct, IsPhantom,"
                    "  OperationSeq, Notes)"
                    " VALUES (:bomId, :seq, :itemCode, :itemName, :uom, :qtyPer, :scrapPct,"
                    "  :isPhantom, :operationSeq, :notes)"
                ),
                {
                    "bomId": bom_id,
                    "seq": line["seq"],
                    "itemCode": line["itemCode"],
                    "itemName": line.get("itemName"),
                    "uom": line.get("uom") or "NOS",
                    "qtyPer": line.get("qtyPer") or 0,
                    "scrapPct": line.get("scrapPct") or 0,
                    "isPhantom": 1 if line.get("isPhantom") else 0,
                    "operationSeq": line.get("operationSeq"),
                    "notes": line.get("notes"),
                },
            )
