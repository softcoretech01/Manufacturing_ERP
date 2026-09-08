"""Data access for the document-type master (ERP_Product.DocumentType).

Plain SQL rather than a stored procedure: the `SpManageEngineering*` procedures in
this schema hard-delete and have no active filter on SELECT_ALL, and repeating that
shape for a new master would import the same bugs.
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.dbtypes import as_bool

_SELECT = """
SELECT dt.Id, dt.Code, dt.Name, dt.Description, dt.RetentionRule,
       dt.IsVersioned, dt.SortOrder, dt.IsActive,
       (SELECT COUNT(*) FROM ERP_Product.EngineeringDocument d
         WHERE d.DocType = dt.Code AND d.DeletedAt IS NULL) AS InUseCount
FROM ERP_Product.DocumentType dt
"""


def _row_to_dict(row) -> dict[str, Any]:
    return {
        "uid": str(row[0]),
        "code": row[1],
        "name": row[2],
        "description": row[3],
        "retentionRule": row[4],
        "isVersioned": as_bool(row[5]),
        "sortOrder": int(row[6]) if row[6] is not None else 0,
        "isActive": as_bool(row[7]),
        "inUseCount": int(row[8]) if row[8] is not None else 0,
    }


class DocumentTypeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_types(self, active_only: bool = False) -> list[dict[str, Any]]:
        sql = _SELECT + (" WHERE dt.IsActive = 1" if active_only else "")
        sql += " ORDER BY dt.SortOrder, dt.Code"
        rows = await self.session.execute(text(sql))
        return [_row_to_dict(r) for r in rows]

    async def get_by_uid(self, uid: str) -> dict[str, Any] | None:
        row = (
            await self.session.execute(
                text(_SELECT + " WHERE dt.Id = :uid"), {"uid": uid}
            )
        ).fetchone()
        return _row_to_dict(row) if row else None

    async def get_by_code(self, code: str) -> dict[str, Any] | None:
        row = (
            await self.session.execute(
                text(_SELECT + " WHERE dt.Code = :code"), {"code": code}
            )
        ).fetchone()
        return _row_to_dict(row) if row else None

    async def active_codes(self) -> set[str]:
        rows = await self.session.execute(
            text("SELECT Code FROM ERP_Product.DocumentType WHERE IsActive = 1")
        )
        return {r[0] for r in rows}

    async def create(self, data: dict, user: str) -> dict[str, Any]:
        await self.session.execute(
            text(
                "INSERT INTO ERP_Product.DocumentType"
                " (Code, Name, Description, RetentionRule, IsVersioned, SortOrder,"
                "  IsActive, CreatedBy)"
                " VALUES (:code, :name, :description, :retention, :versioned,"
                "         :sort_order, :is_active, :user)"
            ),
            {
                "code": data["code"],
                "name": data["name"],
                "description": data.get("description"),
                "retention": data.get("retentionRule"),
                "versioned": 1 if data.get("isVersioned") else 0,
                "sort_order": data.get("sortOrder", 0),
                "is_active": 1 if data.get("isActive", True) else 0,
                "user": user,
            },
        )
        await self.session.commit()
        # Re-read: the INSERT returns no row, and the endpoint's response model
        # needs the full record (same shape as the tax/engineering re-read fix).
        return await self.get_by_code(data["code"])

    async def update(self, uid: str, data: dict, user: str) -> dict[str, Any] | None:
        await self.session.execute(
            text(
                "UPDATE ERP_Product.DocumentType"
                " SET Name = :name,"
                "     Description = :description,"
                "     RetentionRule = :retention,"
                "     IsVersioned = :versioned,"
                "     SortOrder = :sort_order,"
                "     IsActive = :is_active,"
                "     ModifiedBy = :user"
                " WHERE Id = :uid"
            ),
            {
                "uid": uid,
                "name": data["name"],
                "description": data.get("description"),
                "retention": data.get("retentionRule"),
                "versioned": 1 if data.get("isVersioned") else 0,
                "sort_order": data.get("sortOrder", 0),
                "is_active": 1 if data.get("isActive", True) else 0,
                "user": user,
            },
        )
        await self.session.commit()
        return await self.get_by_uid(uid)

    async def retire(self, uid: str, user: str) -> dict[str, Any] | None:
        """Soft-retire. Masters are never hard-deleted (CLAUDE.md section 4.2)."""
        await self.session.execute(
            text(
                "UPDATE ERP_Product.DocumentType"
                " SET IsActive = 0, ModifiedBy = :user WHERE Id = :uid"
            ),
            {"uid": uid, "user": user},
        )
        await self.session.commit()
        return await self.get_by_uid(uid)
