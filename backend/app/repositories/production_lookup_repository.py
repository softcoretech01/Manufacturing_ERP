"""Lookup reads for the production masters.

These tables have no stored procedures in this schema (the `SpProductionLine` /
`SpWorkCentre` procs the previous implementation called do not exist here), so
the lookups are plain parameter-free SELECTs against the tables themselves.
"""

from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ProductionLookupRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _rows(self, sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        result = await self.db.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result.fetchall()]

    async def get_machine_groups(self) -> List[Dict[str, Any]]:
        return await self._rows(
            """
            SELECT Id AS id, Code AS code, Name AS name
              FROM MachineGroup
             WHERE IsDeleted = 0 AND IsActive = 1
             ORDER BY Name ASC
            """
        )

    async def get_plants(self) -> List[Dict[str, Any]]:
        return await self._rows(
            """
            SELECT id AS id, code AS code, name AS name
              FROM sys_plant
             WHERE deleted_at IS NULL AND is_active = 1
             ORDER BY code ASC
            """
        )

    async def get_production_lines(self, plant_id: Optional[int] = None) -> List[Dict[str, Any]]:
        return await self._rows(
            """
            SELECT Id AS id, Code AS code, Name AS name,
                   PlantId AS plantId, LineType AS lineType
              FROM ProductionLine
             WHERE IsDeleted = 0 AND IsActive = 1
               AND (:plant_id IS NULL OR PlantId = :plant_id)
             ORDER BY Code ASC
            """,
            {"plant_id": plant_id},
        )

    async def get_work_centres(
        self, plant_id: Optional[int] = None, line_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return await self._rows(
            """
            SELECT Id AS id, Code AS code, Name AS name,
                   PlantId AS plantId, LineId AS lineId, Type AS type
              FROM WorkCentre
             WHERE IsDeleted = 0 AND IsActive = 1
               AND (:plant_id IS NULL OR PlantId = :plant_id)
               AND (:line_id IS NULL OR LineId = :line_id)
             ORDER BY Code ASC
            """,
            {"plant_id": plant_id, "line_id": line_id},
        )

    async def fk_exists(self, table: str, record_id: int) -> bool:
        """Confirm a foreign key target is live before the proc hits the constraint."""
        specs = {
            "MachineGroup": ("MachineGroup", "Id", "IsDeleted = 0"),
            "ProductionLine": ("ProductionLine", "Id", "IsDeleted = 0"),
            "WorkCentre": ("WorkCentre", "Id", "IsDeleted = 0"),
            "sys_plant": ("sys_plant", "id", "deleted_at IS NULL"),
        }
        if table not in specs:
            raise KeyError(f"Unknown lookup table: {table}")
        tbl, pk, alive = specs[table]
        result = await self.db.execute(
            text(f"SELECT 1 FROM `{tbl}` WHERE `{pk}` = :rid AND {alive} LIMIT 1"),
            {"rid": record_id},
        )
        return result.fetchone() is not None
