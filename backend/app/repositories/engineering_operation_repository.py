from typing import List, Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.engineering_operation import EngOperationSchema

class EngineeringOperationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_next_code(self) -> str:
        sql = text("SELECT MAX(Id) FROM ERP_Product.EngineeringOperation")
        result = await self.session.execute(sql)
        max_id = result.scalar()
        next_id = 1 if max_id is None else max_id + 1
        return f"OPR-{next_id:04d}"

    async def _execute_sp(self, action: str, data: dict, user: str = "System"):
        sql = text("""
            CALL ERP_Product.SpManageEngineeringOperation(
                :p_Action, :p_Id, :p_Code, :p_Name, :p_DefaultWorkCentre, 
                :p_SetupMinutes, :p_CycleSeconds, :p_Operators, :p_Skill, 
                :p_QcCheckpoint, :p_Instructions, :p_IsActive, :p_User
            )
        """)
        
        result = await self.session.execute(sql, {
            "p_Action": action,
            "p_Id": data.get("uid"),  # Frontend passes uid which maps to Id
            "p_Code": data.get("code"),
            "p_Name": data.get("name"),
            "p_DefaultWorkCentre": data.get("defaultWorkCentre"),
            "p_SetupMinutes": data.get("setupMinutes"),
            "p_CycleSeconds": data.get("cycleSeconds"),
            "p_Operators": data.get("operators"),
            "p_Skill": data.get("skill"),
            "p_QcCheckpoint": data.get("qcCheckpoint"),
            "p_Instructions": data.get("instructions"),
            "p_IsActive": data.get("isActive", True),
            "p_User": user
        })
        
        row = result.fetchone()
        await self.session.commit()
        if row:
            return str(row[0]) # Return Id as string for uid
        return None

    async def create_operation(self, data: dict, user: str) -> str:
        if not data.get("code"):
            data["code"] = await self.get_next_code()
        return await self._execute_sp("INSERT", data, user)

    async def update_operation(self, uid: str, data: dict, user: str) -> str:
        data["uid"] = uid
        return await self._execute_sp("UPDATE", data, user)

    async def delete_operation(self, uid: str, user: str) -> str:
        return await self._execute_sp("DELETE", {"uid": uid}, user)

    async def get_all_operations(self) -> List[Dict[str, Any]]:
        sql = text("""
            CALL ERP_Product.SpManageEngineeringOperation(
                'SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, 'System'
            )
        """)
        result = await self.session.execute(sql)
        operations = []
        for row in result:
            operations.append({
                "uid": str(row[0]), # Map Id to uid
                "code": row[1],
                "name": row[2],
                "defaultWorkCentre": row[3],
                "setupMinutes": float(row[4]) if row[4] is not None else 0.0,
                "cycleSeconds": float(row[5]) if row[5] is not None else 0.0,
                "operators": row[6],
                "skill": row[7],
                "qcCheckpoint": bool(row[8]),
                "instructions": row[9],
                "isActive": bool(row[10]),
                "createdBy": row[11],
                "createdAt": row[12].isoformat() if row[12] else None,
                "modifiedBy": row[13],
                "modifiedDate": row[14].isoformat() if row[14] else None,
            })
        return operations
