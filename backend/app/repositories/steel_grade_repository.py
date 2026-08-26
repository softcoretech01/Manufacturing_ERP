from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class SteelGradeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row: Any) -> Dict[str, Any]:
        return {
            "id": row.Id,
            "code": row.Code,
            "name": row.Name,
            "standard": row.Standard,
            "chromiumPct": row.ChromiumPct,
            "nickelPct": row.NickelPct,
            "carbonMaxPct": float(row.CarbonMaxPct) if row.CarbonMaxPct is not None else None,
            "foodContact": bool(row.FoodContact),
            "application": row.Application,
            "status": row.Status,
            "effectiveFrom": row.EffectiveFrom,
            "effectiveTo": row.EffectiveTo,
            "revision": row.Revision,
            "usageCount": row.UsageCount,
            "createdBy": row.CreatedBy,
            "createdDate": row.CreatedDate,
            "modifiedBy": row.ModifiedBy,
            "modifiedDate": row.ModifiedDate,
        }

    async def get_all(self) -> list[Dict[str, Any]]:
        query = text("""
            CALL SpSteelGrade(
                'LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query)
        rows = result.fetchall()
        return [self._row_to_dict(row) for row in rows]

    async def get_by_id(self, record_id: int) -> Dict[str, Any]:
        query = text("""
            CALL SpSteelGrade(
                'READ', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query, {"p_Id": record_id})
        row = result.fetchone()
        if not row:
            return None
        return self._row_to_dict(row)

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextSteelGradeCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def create(self, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        query = text("""
            CALL SpSteelGrade(
                'CREATE', NULL, :p_Code, :p_Name, :p_Standard, :p_ChromiumPct, :p_NickelPct, :p_CarbonMaxPct, 
                :p_FoodContact, :p_Application, :p_Status, :p_EffectiveFrom, :p_EffectiveTo, 
                :p_Revision, :p_ModifiedBy
            )
        """)
        params = {
            "p_Code": data.get("code"),
            "p_Name": data.get("name"),
            "p_Standard": data.get("standard"),
            "p_ChromiumPct": data.get("chromiumPct"),
            "p_NickelPct": data.get("nickelPct"),
            "p_CarbonMaxPct": data.get("carbonMaxPct"),
            "p_FoodContact": data.get("foodContact", False),
            "p_Application": data.get("application"),
            "p_Status": data.get("status"),
            "p_EffectiveFrom": data.get("effectiveFrom"),
            "p_EffectiveTo": data.get("effectiveTo"),
            "p_Revision": data.get("revision"),
            "p_ModifiedBy": user_id,
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def update(self, record_id: int, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        query = text("""
            CALL SpSteelGrade(
                'UPDATE', :p_Id, NULL, :p_Name, :p_Standard, :p_ChromiumPct, :p_NickelPct, :p_CarbonMaxPct, 
                :p_FoodContact, :p_Application, :p_Status, :p_EffectiveFrom, :p_EffectiveTo, 
                :p_Revision, :p_ModifiedBy
            )
        """)
        params = {
            "p_Id": record_id,
            "p_Name": data.get("name"),
            "p_Standard": data.get("standard"),
            "p_ChromiumPct": data.get("chromiumPct"),
            "p_NickelPct": data.get("nickelPct"),
            "p_CarbonMaxPct": data.get("carbonMaxPct"),
            "p_FoodContact": data.get("foodContact", False),
            "p_Application": data.get("application"),
            "p_Status": data.get("status"),
            "p_EffectiveFrom": data.get("effectiveFrom"),
            "p_EffectiveTo": data.get("effectiveTo"),
            "p_Revision": data.get("revision"),
            "p_ModifiedBy": user_id,
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def delete(self, record_id: int, user_id: str) -> None:
        query = text("""
            CALL SpSteelGrade(
                'DELETE', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :p_ModifiedBy
            )
        """)
        await self.db.execute(query, {"p_Id": record_id, "p_ModifiedBy": user_id})
        await self.db.commit()
