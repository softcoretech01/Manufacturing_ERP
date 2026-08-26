from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class SteelThicknessRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row: Any) -> Dict[str, Any]:
        return {
            "id": row.Id,
            "code": row.Code,
            "name": row.Name,
            "thicknessMm": float(row.ThicknessMm),
            "tolerancePlusMm": float(row.TolerancePlusMm) if row.TolerancePlusMm is not None else None,
            "toleranceMinusMm": float(row.ToleranceMinusMm) if row.ToleranceMinusMm is not None else None,
            "maxDrawRatio": float(row.MaxDrawRatio) if row.MaxDrawRatio is not None else None,
            "usedFor": row.UsedFor,
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
            CALL SpSteelThickness(
                'LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query)
        rows = result.fetchall()
        return [self._row_to_dict(row) for row in rows]

    async def get_by_id(self, record_id: int) -> Dict[str, Any]:
        query = text("""
            CALL SpSteelThickness(
                'READ', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query, {"p_Id": record_id})
        row = result.fetchone()
        if not row:
            return None
        return self._row_to_dict(row)

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextSteelThicknessCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def create(self, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        query = text("""
            CALL SpSteelThickness(
                'CREATE', NULL, :p_Code, :p_Name, :p_ThicknessMm, :p_TolerancePlusMm, :p_ToleranceMinusMm, 
                :p_MaxDrawRatio, :p_UsedFor, :p_Status, :p_EffectiveFrom, :p_EffectiveTo, 
                :p_Revision, :p_ModifiedBy
            )
        """)
        params = {
            "p_Code": data.get("code"),
            "p_Name": data.get("name"),
            "p_ThicknessMm": data.get("thicknessMm"),
            "p_TolerancePlusMm": data.get("tolerancePlusMm"),
            "p_ToleranceMinusMm": data.get("toleranceMinusMm"),
            "p_MaxDrawRatio": data.get("maxDrawRatio"),
            "p_UsedFor": data.get("usedFor"),
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
            CALL SpSteelThickness(
                'UPDATE', :p_Id, NULL, :p_Name, :p_ThicknessMm, :p_TolerancePlusMm, :p_ToleranceMinusMm, 
                :p_MaxDrawRatio, :p_UsedFor, :p_Status, :p_EffectiveFrom, :p_EffectiveTo, 
                :p_Revision, :p_ModifiedBy
            )
        """)
        params = {
            "p_Id": record_id,
            "p_Name": data.get("name"),
            "p_ThicknessMm": data.get("thicknessMm"),
            "p_TolerancePlusMm": data.get("tolerancePlusMm"),
            "p_ToleranceMinusMm": data.get("toleranceMinusMm"),
            "p_MaxDrawRatio": data.get("maxDrawRatio"),
            "p_UsedFor": data.get("usedFor"),
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
            CALL SpSteelThickness(
                'DELETE', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :p_ModifiedBy
            )
        """)
        await self.db.execute(query, {"p_Id": record_id, "p_ModifiedBy": user_id})
        await self.db.commit()
