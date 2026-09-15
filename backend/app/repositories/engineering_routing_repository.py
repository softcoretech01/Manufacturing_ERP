"""Routing persistence.

A routing's identity is **RouteCode + Revision**: `RTG/26-27/0001` R3 and R4 are
two rows of one document, and the unique key `uk_engrouting_code_revision` holds
that. `uid` in the API is therefore the row id, not the document number — the
document number identifies the document, not the revision of it.

The statements are written here rather than delegated to
`SpManageEngineeringRouting` because the procedure commits internally, and
approving a revision has to supersede the previous one, move the default flag and
activate the new row in a **single** transaction. The procedure is left in the
database untouched for the setup scripts that still create it; the application no
longer calls it.
"""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.engineering_routing import EngRoutingOperationSchema

#: Where the engineering tables live. An env override exists so the revision
#: flow can be exercised against a throwaway copy of the schema without pointing
#: a test at production rows.
SCHEMA = os.getenv("ERP_PRODUCT_SCHEMA", "ERP_Product")

ROUTING = f"{SCHEMA}.EngineeringRouting"
ROUTING_OP = f"{SCHEMA}.EngineeringRoutingOperation"

#: Statuses that hold capacity and cost: the live ones.
LIVE_STATUSES = ("ACTIVE", "APPROVED")
LIVE_STATUS_SQL = "('ACTIVE', 'APPROVED')"

_HEADER_COLUMNS = (
    "Id, RouteCode, ProductCode, ProductName, Revision, Status, EffectiveFrom,"
    " EffectiveTo, IsDefault, CostingLotSize, CreatedBy, CreatedDate, ApprovedBy,"
    " ApprovedAt, SourceEcn, ChangeReason, Version"
)


def _date(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def _stamp(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    return str(value)


class EngineeringRoutingRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Reads ───────────────────────────────────────────────────────────────

    def _header(self, row: Sequence[Any]) -> Dict[str, Any]:
        return {
            # The row, not the document: two revisions share a docNo.
            "uid": str(row[0]),
            "docNo": row[1],
            "productCode": row[2],
            "productName": row[3],
            "revision": row[4],
            "status": row[5],
            "effectiveFrom": _date(row[6]),
            "effectiveTo": _date(row[7]),
            "isDefault": bool(row[8]),
            "costingLotSize": row[9],
            "createdBy": row[10],
            "createdAt": _stamp(row[11]),
            "approvedBy": row[12],
            "approvedAt": _stamp(row[13]),
            "sourceEcn": row[14],
            "changeReason": row[15],
            "version": row[16],
            "operations": [],
        }

    async def get_all_routings(self) -> List[Dict[str, Any]]:
        rows = (
            await self.session.execute(
                text(
                    f"SELECT {_HEADER_COLUMNS} FROM {ROUTING}"
                    " WHERE DeletedAt IS NULL"
                    " ORDER BY RouteCode, Revision"
                )
            )
        ).fetchall()
        by_id = {row[0]: self._header(row) for row in rows}
        if not by_id:
            return []

        ops = (
            await self.session.execute(
                text(
                    "SELECT RoutingId, Seq, OperationCode, OperationName, WorkCentreCode,"
                    " MachineCode, SetupMinutes, CycleSeconds, Operators, Skill, ToolCode,"
                    f" QcCheckpoint, Instructions FROM {ROUTING_OP}"
                    " WHERE RoutingId IN :ids ORDER BY RoutingId, Seq"
                ).bindparams(bindparam("ids", expanding=True)),
                {"ids": list(by_id)},
            )
        ).fetchall()
        for op in ops:
            by_id[op[0]]["operations"].append(
                {
                    "uid": f"{op[0]}-{op[1]}",
                    "seq": op[1],
                    "operationCode": op[2],
                    "operationName": op[3],
                    "workCentreCode": op[4],
                    "machineCode": op[5],
                    "setupMinutes": float(op[6] or 0),
                    "cycleSeconds": float(op[7] or 0),
                    "operators": op[8],
                    "skill": op[9],
                    "toolCode": op[10],
                    # A real boolean, so the UI never has to render 0/1 itself.
                    "qcCheckpoint": bool(op[11]),
                    "instructions": op[12],
                }
            )
        # ops arrive per routing already sorted by Seq.
        return list(by_id.values())

    async def get_routing(self, uid: str, *, lock: bool = False) -> Optional[Dict[str, Any]]:
        row = (
            await self.session.execute(
                text(
                    f"SELECT {_HEADER_COLUMNS} FROM {ROUTING}"
                    " WHERE Id = :id AND DeletedAt IS NULL"
                    + (" FOR UPDATE" if lock else "")
                ),
                {"id": uid},
            )
        ).fetchone()
        return self._header(row) if row else None

    # ── Numbering ───────────────────────────────────────────────────────────

    async def get_next_code(self) -> str:
        """The next document number for a genuinely new routing.

        Revisions never come through here: they keep the number of the document
        they revise (see `EngineeringRoutingService.create_revision`).
        """
        highest = (
            await self.session.execute(
                text(
                    "SELECT MAX(CAST(SUBSTRING(RouteCode, 5) AS UNSIGNED))"
                    f" FROM {ROUTING} WHERE RouteCode REGEXP '^RTG-[0-9]+$'"
                )
            )
        ).scalar()
        return f"RTG-{int(highest or 0) + 1:04d}"

    async def next_revision_for(self, route_code: str) -> int:
        """One past the highest revision this document has ever had.

        Soft-deleted rows count, so a revision number is never reused — reusing
        one would collide with `uk_engrouting_code_revision`.
        """
        highest = (
            await self.session.execute(
                text(f"SELECT MAX(Revision) FROM {ROUTING} WHERE RouteCode = :code"),
                {"code": route_code},
            )
        ).scalar()
        return int(highest or 0) + 1

    # ── Writes (no commit — the service owns the transaction) ───────────────

    async def insert_routing(
        self,
        *,
        route_code: str,
        revision: int,
        data: Any,
        status: str,
        is_default: bool,
        user: str,
    ) -> int:
        result = await self.session.execute(
            text(
                f"INSERT INTO {ROUTING}"
                " (RouteCode, ProductCode, ProductName, Revision, Status, EffectiveFrom,"
                "  EffectiveTo, IsDefault, CostingLotSize, CreatedBy, CreatedDate,"
                "  SourceEcn, ChangeReason)"
                " VALUES (:code, :product, :productName, :revision, :status, :effectiveFrom,"
                "  :effectiveTo, :isDefault, :lot, :user, NOW(), :sourceEcn, :changeReason)"
            ),
            {
                "code": route_code,
                "product": data.productCode,
                "productName": data.productName,
                "revision": revision,
                "status": status,
                "effectiveFrom": data.effectiveFrom,
                "effectiveTo": data.effectiveTo,
                "isDefault": 1 if is_default else 0,
                "lot": data.costingLotSize or 1,
                "user": user,
                "sourceEcn": data.sourceEcn,
                "changeReason": data.changeReason,
            },
        )
        return int(result.lastrowid)

    async def update_header(self, uid: str, *, data: Any, status: str, user: str) -> None:
        await self.session.execute(
            text(
                f"UPDATE {ROUTING} SET"
                "  ProductCode = :product, ProductName = :productName,"
                "  Status = :status, EffectiveFrom = :effectiveFrom, EffectiveTo = :effectiveTo,"
                "  IsDefault = :isDefault, CostingLotSize = :lot, ChangeReason = :changeReason,"
                "  SourceEcn = :sourceEcn, ModifiedBy = :user, ModifiedDate = NOW(),"
                "  Version = Version + 1"
                " WHERE Id = :id AND DeletedAt IS NULL"
            ),
            {
                "id": uid,
                "product": data.productCode,
                "productName": data.productName,
                "status": status,
                "effectiveFrom": data.effectiveFrom,
                "effectiveTo": data.effectiveTo,
                "isDefault": 1 if data.isDefault else 0,
                "lot": data.costingLotSize or 1,
                "changeReason": data.changeReason,
                "sourceEcn": data.sourceEcn,
                "user": user,
            },
        )

    async def replace_operations(
        self, routing_id: int, operations: Optional[Sequence[EngRoutingOperationSchema]]
    ) -> None:
        """Lines are held as a set, so a save replaces them wholesale."""
        if operations is None:
            return
        await self.session.execute(
            text(f"DELETE FROM {ROUTING_OP} WHERE RoutingId = :id"), {"id": routing_id}
        )
        for op in operations:
            await self.session.execute(
                text(
                    f"INSERT INTO {ROUTING_OP}"
                    " (RoutingId, Seq, OperationCode, OperationName, WorkCentreCode, MachineCode,"
                    "  SetupMinutes, CycleSeconds, Operators, Skill, ToolCode, QcCheckpoint, Instructions)"
                    " VALUES (:routingId, :seq, :operationCode, :operationName, :workCentreCode,"
                    "  :machineCode, :setupMinutes, :cycleSeconds, :operators, :skill, :toolCode,"
                    "  :qcCheckpoint, :instructions)"
                ),
                {
                    "routingId": routing_id,
                    "seq": op.seq,
                    "operationCode": op.operationCode,
                    "operationName": op.operationName,
                    "workCentreCode": op.workCentreCode,
                    "machineCode": op.machineCode,
                    "setupMinutes": op.setupMinutes,
                    "cycleSeconds": op.cycleSeconds,
                    "operators": op.operators,
                    "skill": op.skill,
                    "toolCode": op.toolCode,
                    "qcCheckpoint": 1 if op.qcCheckpoint else 0,
                    "instructions": op.instructions,
                },
            )

    async def soft_delete(self, uid: str, user: str) -> None:
        await self.session.execute(
            text(
                f"UPDATE {ROUTING} SET DeletedAt = NOW(), ModifiedBy = :user,"
                " ModifiedDate = NOW(), Version = Version + 1"
                " WHERE Id = :id AND DeletedAt IS NULL"
            ),
            {"id": uid, "user": user},
        )

    # ── Approval steps ──────────────────────────────────────────────────────

    async def live_revisions_of(self, route_code: str, *, exclude_id: int) -> List[Dict[str, Any]]:
        rows = (
            await self.session.execute(
                text(
                    f"SELECT {_HEADER_COLUMNS} FROM {ROUTING}"
                    " WHERE RouteCode = :code AND Id <> :id AND DeletedAt IS NULL"
                    f" AND UPPER(Status) IN {LIVE_STATUS_SQL}"
                    " ORDER BY Revision"
                ),
                {"code": route_code, "id": exclude_id},
            )
        ).fetchall()
        return [self._header(row) for row in rows]

    async def supersede(self, uid: int, *, effective_to: Any, user: str) -> None:
        await self.session.execute(
            text(
                f"UPDATE {ROUTING} SET Status = 'SUPERSEDED', EffectiveTo = :effectiveTo,"
                "  IsDefault = 0, ModifiedBy = :user, ModifiedDate = NOW(), Version = Version + 1"
                " WHERE Id = :id"
            ),
            {"id": uid, "effectiveTo": effective_to, "user": user},
        )

    async def clear_default_for_product(
        self, product_code: str, *, exclude_id: int, user: str
    ) -> List[str]:
        """Drop the default flag from the product's other live routings.

        Returns what was cleared, so the caller can say so. Runs before the new
        revision is flagged, because `uk_engrouting_default_per_product` allows
        exactly one live default per product at any instant.
        """
        rows = (
            await self.session.execute(
                text(
                    f"SELECT Id, RouteCode, Revision FROM {ROUTING}"
                    " WHERE ProductCode = :product AND Id <> :id AND DeletedAt IS NULL"
                    f" AND IsDefault = 1 AND UPPER(Status) IN {LIVE_STATUSES}"
                ),
                {"product": product_code, "id": exclude_id},
            )
        ).fetchall()
        for row in rows:
            await self.session.execute(
                text(
                    f"UPDATE {ROUTING} SET IsDefault = 0, ModifiedBy = :user,"
                    " ModifiedDate = NOW(), Version = Version + 1 WHERE Id = :id"
                ),
                {"id": row[0], "user": user},
            )
        return [f"{row[1]} R{row[2]}" for row in rows]

    async def set_default(self, uid: int, *, user: str) -> None:
        await self.session.execute(
            text(
                f"UPDATE {ROUTING} SET IsDefault = 1, ModifiedBy = :user,"
                " ModifiedDate = NOW(), Version = Version + 1 WHERE Id = :id"
            ),
            {"id": uid, "user": user},
        )

    async def activate(self, uid: int, *, approver: str) -> None:
        await self.session.execute(
            text(
                f"UPDATE {ROUTING} SET Status = 'ACTIVE', IsDefault = 1,"
                "  ApprovedBy = :approver, ApprovedAt = NOW(), ModifiedBy = :approver,"
                "  ModifiedDate = NOW(), Version = Version + 1"
                " WHERE Id = :id"
            ),
            {"id": uid, "approver": approver},
        )
