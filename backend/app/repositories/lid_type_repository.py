from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class LidTypeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row: Any) -> Dict[str, Any]:
        return {
            "id": row.Id,
            "code": row.Code,
            "name": row.Name,
            "closureType": row.ClosureType,
            "material": row.Material,
            "threadSpec": row.ThreadSpec,
            "sealMaterial": row.SealMaterial,
            "leakTestBar": float(row.LeakTestBar) if row.LeakTestBar is not None else None,
            "foodGradeCert": row.FoodGradeCert,
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
            CALL SpLidType(
                'LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query)
        rows = result.fetchall()
        return [self._row_to_dict(row) for row in rows]

    async def get_by_id(self, record_id: int) -> Dict[str, Any]:
        query = text("""
            CALL SpLidType(
                'READ', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query, {"p_Id": record_id})
        row = result.fetchone()
        if not row:
            return None
        return self._row_to_dict(row)

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextLidTypeCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def create(self, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        query = text("""
            CALL SpLidType(
                'CREATE', NULL, :p_Code, :p_Name, :p_ClosureType, :p_Material, :p_ThreadSpec, :p_SealMaterial, 
                :p_LeakTestBar, :p_FoodGradeCert, :p_Status, :p_EffectiveFrom, :p_EffectiveTo, 
                :p_Revision, :p_ModifiedBy
            )
        """)
        params = {
            "p_Code": data.get("code"),
            "p_Name": data.get("name"),
            "p_ClosureType": data.get("closureType"),
            "p_Material": data.get("material"),
            "p_ThreadSpec": data.get("threadSpec"),
            "p_SealMaterial": data.get("sealMaterial"),
            "p_LeakTestBar": data.get("leakTestBar"),
            "p_FoodGradeCert": data.get("foodGradeCert"),
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
            CALL SpLidType(
                'UPDATE', :p_Id, NULL, :p_Name, :p_ClosureType, :p_Material, :p_ThreadSpec, :p_SealMaterial, 
                :p_LeakTestBar, :p_FoodGradeCert, :p_Status, :p_EffectiveFrom, :p_EffectiveTo, 
                :p_Revision, :p_ModifiedBy
            )
        """)
        params = {
            "p_Id": record_id,
            "p_Name": data.get("name"),
            "p_ClosureType": data.get("closureType"),
            "p_Material": data.get("material"),
            "p_ThreadSpec": data.get("threadSpec"),
            "p_SealMaterial": data.get("sealMaterial"),
            "p_LeakTestBar": data.get("leakTestBar"),
            "p_FoodGradeCert": data.get("foodGradeCert"),
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
            CALL SpLidType(
                'DELETE', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :p_ModifiedBy
            )
        """)
        await self.db.execute(query, {"p_Id": record_id, "p_ModifiedBy": user_id})
        await self.db.commit()
