from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

class EngineeringToolRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _execute_sp(self, action: str, data: dict, user: str) -> Optional[str]:
        sql = text("""
            CALL ERP_Product.SpManageEngineeringTool(
                :action, :id, :code, :name, :toolType, :machineCode,
                :lifeStrokes, :usedStrokes, :lastMaintenanceOn, :nextCalibrationOn,
                :replacementCost, :location, :status, :isActive, :user
            )
        """)
        
        params = {
            "action": action,
            "id": int(data.get("uid")) if data.get("uid") else None,
            "code": data.get("code"),
            "name": data.get("name"),
            "toolType": data.get("toolType"),
            "machineCode": data.get("machineCode") or None,
            "lifeStrokes": data.get("lifeStrokes", 0),
            "usedStrokes": data.get("usedStrokes", 0),
            "lastMaintenanceOn": data.get("lastMaintenanceOn") or None,
            "nextCalibrationOn": data.get("nextCalibrationOn") or None,
            "replacementCost": data.get("replacementCost", 0.0),
            "location": data.get("location") or None,
            "status": data.get("status", "AVAILABLE"),
            "isActive": 1 if data.get("isActive", True) else 0,
            "user": user
        }
        
        result = await self.session.execute(sql, params)
        await self.session.commit()
        
        row = result.fetchone()
        if row:
            return str(row[0])
        return None

    async def get_next_code(self) -> str:
        sql = text("SELECT MAX(CAST(SUBSTRING(Code, 4) AS UNSIGNED)) FROM ERP_Product.EngineeringTool WHERE Code LIKE 'TL-%'")
        result = await self.session.execute(sql)
        max_id = result.scalar() or 0
        return f"TL-{max_id + 1:04d}"

    async def create_tool(self, data: dict, user: str) -> str:
        if not data.get("code"):
            data["code"] = await self.get_next_code()
        return await self._execute_sp("INSERT", data, user)

    async def update_tool(self, uid: str, data: dict, user: str) -> str:
        data["uid"] = uid
        return await self._execute_sp("UPDATE", data, user)

    async def delete_tool(self, uid: str, user: str) -> str:
        return await self._execute_sp("DELETE", {"uid": uid}, user)

    async def get_all_tools(self) -> List[Dict[str, Any]]:
        sql = text("""
            CALL ERP_Product.SpManageEngineeringTool(
                'SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL, 'System'
            )
        """)
        result = await self.session.execute(sql)
        tools = []
        for row in result:
            tools.append({
                "uid": str(row[0]),
                "code": row[1],
                "name": row[2],
                "toolType": row[3],
                "machineCode": row[4] if row[4] else "",
                "lifeStrokes": int(row[5]) if row[5] is not None else 0,
                "usedStrokes": int(row[6]) if row[6] is not None else 0,
                "lastMaintenanceOn": row[7].isoformat() if row[7] else None,
                "nextCalibrationOn": row[8].isoformat() if row[8] else None,
                "replacementCost": float(row[9]) if row[9] is not None else 0.0,
                "location": row[10] if row[10] else "",
                "status": row[11],
                "isActive": bool(row[12])
            })
        return tools
