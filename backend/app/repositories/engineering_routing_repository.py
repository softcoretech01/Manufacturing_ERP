from typing import List, Dict, Any, Optional
import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.engineering_routing import EngRoutingSchema

class EngineeringRoutingRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_next_code(self) -> str:
        sql = text("SELECT MAX(Id) FROM ERP_Product.EngineeringRouting")
        result = await self.session.execute(sql)
        max_id = result.scalar()
        next_id = 1 if max_id is None else max_id + 1
        return f"RTG-{next_id:04d}"

    async def _execute_sp(self, action: str, data: EngRoutingSchema, user: str = "System"):
        ops_json = None
        if data.operations is not None:
            ops_json = json.dumps([op.model_dump() for op in data.operations])
            
        sql = text("""
            CALL ERP_Product.SpManageEngineeringRouting(
                :p_Action, :p_Uid, :p_ProductCode, :p_ProductName, :p_Revision, 
                :p_Status, :p_EffectiveFrom, :p_EffectiveTo, :p_IsDefault, :p_CostingLotSize, 
                :p_User, :p_SourceEcn, :p_ChangeReason, :p_OperationsJson,
                NULL, NULL
            )
        """)
        
        result = await self.session.execute(sql, {
            "p_Action": action,
            "p_Uid": data.uid,
            "p_ProductCode": data.productCode,
            "p_ProductName": data.productName,
            "p_Revision": data.revision,
            "p_Status": data.status,
            "p_EffectiveFrom": data.effectiveFrom,
            "p_EffectiveTo": data.effectiveTo,
            "p_IsDefault": data.isDefault,
            "p_CostingLotSize": data.costingLotSize,
            "p_User": user,
            "p_SourceEcn": data.sourceEcn,
            "p_ChangeReason": data.changeReason,
            "p_OperationsJson": ops_json
        })
        
        row = result.fetchone()
        await self.session.commit()
        if row:
            return row[0]
        return None

    async def create_routing(self, data: EngRoutingSchema) -> str:
        return await self._execute_sp("INSERT", data)

    async def update_routing(self, uid: str, data: EngRoutingSchema) -> str:
        data.uid = uid
        return await self._execute_sp("UPDATE", data)

    async def delete_routing(self, uid: str) -> str:
        sql = text("CALL ERP_Product.SpManageEngineeringRouting('DELETE', :p_Uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'System', NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(sql, {"p_Uid": uid})
        row = result.fetchone()
        await self.session.commit()
        if row:
            return row[0]
        return None

    async def get_all_routings(self) -> List[Dict[str, Any]]:
        sql = text("CALL ERP_Product.SpManageEngineeringRouting('SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'System', NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(sql)
        routings = []
        for row in result:
            ops_str = row[17] if row[17] else '[]'
            ops = json.loads(ops_str)
            routings.append({
                "uid": row[0],
                "docNo": row[1],
                "productCode": row[2],
                "productName": row[3],
                "revision": row[4],
                "status": row[5],
                "effectiveFrom": row[6],
                "effectiveTo": row[7],
                "isDefault": bool(row[8]),
                "costingLotSize": row[9],
                "createdBy": row[10],
                "createdAt": row[11],
                "approvedBy": row[12],
                "approvedAt": row[13],
                "sourceEcn": row[14],
                "changeReason": row[15],
                "version": row[16],
                "operations": ops,
                "ops": ops
            })
        return routings
