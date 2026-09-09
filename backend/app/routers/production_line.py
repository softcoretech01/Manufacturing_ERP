"""Production line master — CRUD.

The line a production order is scheduled onto. The table has existed since the
first migration and carried three rows, but only a read-only lookup endpoint
served it (to fill the Machine form's plant/line dropdown), so no business user
could see or maintain a line.

There is no `SpProductionLine` in this schema, so these are plain statements
against the table, consistent with `ProductionLookupRepository`.

A line is never hard-deleted: production orders reference it, and destroying it
would orphan their history. `DELETE` marks `IsDeleted` and clears `IsActive`.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import require

# Mounted at /masters/production-lines, not /production-lines: the read-only
# lookup in `production_lookups.py` already owns that path and serves the Machine
# form's plant/line dropdown with a narrower shape. Two routers on one path would
# have silently shadowed this one's GET.
router = APIRouter(prefix="/masters/production-lines", tags=["Masters · Production Lines"])

LINE_TYPES = ("FORMING", "ASSEMBLY", "PACKING", "FINISHING", "OTHER")


class ProductionLineIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    plantId: int = Field(..., ge=1)
    lineType: str = Field(default="FORMING", max_length=30)
    ratedOutputPerHour: float = Field(default=0, ge=0)
    isActive: bool = True


class ProductionLineOut(ProductionLineIn):
    id: int


_SELECT = """
    SELECT Id AS id, Code AS code, Name AS name, PlantId AS plantId,
           LineType AS lineType,
           CAST(IFNULL(RatedOutputPerHour, 0) AS DECIMAL(18,3)) AS ratedOutputPerHour,
           IsActive AS isActive
      FROM ProductionLine
"""


def _row(r: Any) -> dict[str, Any]:
    d = dict(r._mapping)
    d["ratedOutputPerHour"] = float(d["ratedOutputPerHour"] or 0)
    d["isActive"] = bool(d["isActive"])
    return d


@router.get("", response_model=list[ProductionLineOut])
async def list_production_lines(
    session: AsyncSession = Depends(get_session),
    plantId: int | None = Query(None, ge=1),
    includeInactive: bool = Query(False),
    ctx: TenantContext = Depends(require("MASTERS.PRODUCTION_LINE.VIEW")),
) -> Any:
    sql = _SELECT + " WHERE IsDeleted = 0"
    if not includeInactive:
        sql += " AND IsActive = 1"
    sql += " AND (:plant_id IS NULL OR PlantId = :plant_id) ORDER BY Code ASC"
    rows = (await session.execute(text(sql), {"plant_id": plantId})).fetchall()
    return [_row(r) for r in rows]


@router.get("/next-code")
async def next_code(
    session: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("MASTERS.PRODUCTION_LINE.CREATE")),
) -> dict[str, str]:
    n = (
        await session.execute(
            text("SELECT COUNT(*) FROM ProductionLine WHERE Code LIKE 'LN-%'")
        )
    ).scalar_one()
    # LN-A, LN-B, … then LN-01 once the alphabet runs out.
    idx = int(n)
    code = f"LN-{chr(ord('A') + idx)}" if idx < 26 else f"LN-{idx + 1:02d}"
    return {"code": code, "nextCode": code}


@router.get("/{line_id}", response_model=ProductionLineOut)
async def get_production_line(
    line_id: int,
    session: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("MASTERS.PRODUCTION_LINE.VIEW")),
) -> Any:
    row = (
        await session.execute(
            text(_SELECT + " WHERE Id = :id AND IsDeleted = 0"), {"id": line_id}
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Production line not found")
    return _row(row)


async def _code_taken(session: AsyncSession, code: str, exclude_id: int | None = None) -> bool:
    row = (
        await session.execute(
            text(
                "SELECT Id FROM ProductionLine "
                " WHERE Code = :code AND IsDeleted = 0 "
                "   AND (:ex IS NULL OR Id <> :ex) LIMIT 1"
            ),
            {"code": code, "ex": exclude_id},
        )
    ).fetchone()
    return row is not None


@router.post("", response_model=ProductionLineOut, status_code=status.HTTP_201_CREATED)
async def create_production_line(
    body: ProductionLineIn,
    session: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("MASTERS.PRODUCTION_LINE.CREATE")),
) -> Any:
    if await _code_taken(session, body.code):
        raise HTTPException(status_code=409, detail=f"Line code '{body.code}' is already in use.")
    res = await session.execute(
        text(
            "INSERT INTO ProductionLine "
            "  (PlantId, Code, Name, LineType, RatedOutputPerHour, IsActive, IsDeleted, "
            "   CreatedBy, CreatedDate) "
            "VALUES (:plant_id, :code, :name, :line_type, :rated, :active, 0, :user, NOW())"
        ),
        {
            "plant_id": body.plantId, "code": body.code, "name": body.name,
            "line_type": body.lineType, "rated": body.ratedOutputPerHour,
            "active": int(body.isActive), "user": ctx.user_name or ctx.login_id,
        },
    )
    new_id = res.lastrowid
    row = (
        await session.execute(text(_SELECT + " WHERE Id = :id"), {"id": new_id})
    ).fetchone()
    return _row(row)


@router.put("/{line_id}", response_model=ProductionLineOut)
async def update_production_line(
    line_id: int,
    body: ProductionLineIn,
    session: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("MASTERS.PRODUCTION_LINE.EDIT")),
) -> Any:
    existing = (
        await session.execute(
            text("SELECT Id FROM ProductionLine WHERE Id = :id AND IsDeleted = 0"),
            {"id": line_id},
        )
    ).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail="Production line not found")
    if await _code_taken(session, body.code, exclude_id=line_id):
        raise HTTPException(status_code=409, detail=f"Line code '{body.code}' is already in use.")

    await session.execute(
        text(
            "UPDATE ProductionLine "
            "   SET PlantId = :plant_id, Code = :code, Name = :name, LineType = :line_type, "
            "       RatedOutputPerHour = :rated, IsActive = :active, "
            "       ModifiedBy = :user, ModifiedDate = NOW() "
            " WHERE Id = :id"
        ),
        {
            "id": line_id, "plant_id": body.plantId, "code": body.code, "name": body.name,
            "line_type": body.lineType, "rated": body.ratedOutputPerHour,
            "active": int(body.isActive), "user": ctx.user_name or ctx.login_id,
        },
    )
    row = (await session.execute(text(_SELECT + " WHERE Id = :id"), {"id": line_id})).fetchone()
    return _row(row)


@router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_production_line(
    line_id: int,
    session: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("MASTERS.PRODUCTION_LINE.DELETE")),
) -> None:
    """Soft delete — the row is never physically removed.

    The in-use check is deliberately provisional: `pp_production_order` has no
    production-line column yet, so the only place a line can appear is free text
    in `remarks`. That is matched here so the guard starts working the moment a
    real `line_id` lands on the order, but it is not currently strong protection
    and must not be described as such. Deactivating remains the safe route.
    """
    row = (
        await session.execute(
            text("SELECT Code FROM ProductionLine WHERE Id = :id AND IsDeleted = 0"),
            {"id": line_id},
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Production line not found")

    in_use = (
        await session.execute(
            text(
                "SELECT COUNT(*) FROM pp_production_order "
                " WHERE deleted_at IS NULL AND remarks LIKE :pat"
            ),
            {"pat": f"%{row[0]}%"},
        )
    ).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{row[0]}' cannot be deleted because {in_use} production order(s) "
                "reference it. Deactivate it instead — it will stop appearing on new "
                "orders and its history is kept."
            ),
        )

    await session.execute(
        text(
            "UPDATE ProductionLine "
            "   SET IsDeleted = 1, IsActive = 0, ModifiedBy = :user, ModifiedDate = NOW() "
            " WHERE Id = :id"
        ),
        {"id": line_id, "user": ctx.user_name or ctx.login_id},
    )
