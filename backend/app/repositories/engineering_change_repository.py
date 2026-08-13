import json
from typing import Any, List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

class EngineeringChangeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_next_code(self, type_prefix: str) -> str:
        # type_prefix will be either 'ECR' or 'ECN'
        sql = text(f"SELECT MAX(CAST(SUBSTRING(DocNo, 5) AS UNSIGNED)) FROM ERP_Product.EngineeringChange WHERE DocNo LIKE '{type_prefix}-%'")
        result = await self.session.execute(sql)
        max_id = result.scalar() or 0
        return f"{type_prefix}-{max_id + 1:04d}"

    async def create_change(self, data: dict, user: str) -> dict:
        payload = json.dumps(data)
        sql = text("CALL ERP_Product.SpManageEngineeringChange('INSERT', :payload, :user)")
        result = await self.session.execute(sql, {"payload": payload, "user": user})
        await self.session.commit()
        
        row = result.fetchone()
        if row:
            return {"uid": str(row[0]), "docNo": row[1]}
        return None

    async def update_change(self, uid: str, data: dict, user: str) -> str:
        data["uid"] = uid
        payload = json.dumps(data)
        sql = text("CALL ERP_Product.SpManageEngineeringChange('UPDATE', :payload, :user)")
        result = await self.session.execute(sql, {"payload": payload, "user": user})
        await self.session.commit()
        
        row = result.fetchone()
        if row:
            return str(row[0])
        return None

    async def delete_change(self, uid: str, user: str) -> str:
        payload = json.dumps({"uid": uid})
        sql = text("CALL ERP_Product.SpManageEngineeringChange('DELETE', :payload, :user)")
        result = await self.session.execute(sql, {"payload": payload, "user": user})
        await self.session.commit()
        
        row = result.fetchone()
        if row:
            return str(row[0])
        return None

    async def get_all_changes(self) -> List[Dict[str, Any]]:
        sql = text("CALL ERP_Product.SpManageEngineeringChange('SELECT_ALL', '{}', 'System')")
        result = await self.session.execute(sql)
        
        changes = []
        for row in result:
            lines = json.loads(row[20]) if row[20] else []
            approvals = json.loads(row[21]) if row[21] else []
            
            changes.append({
                "uid": str(row[0]),
                "docNo": row[1],
                "changeType": row[2],
                "title": row[3],
                "reason": row[4],
                "category": row[5],
                "priority": row[6],
                "productCode": row[7],
                "requestedBy": row[8],
                "requestedOn": row[9].isoformat() if row[9] else None,
                "effectiveFrom": row[10].isoformat() if row[10] else None,
                "impactNote": row[11],
                "status": row[12],
                "sourceEcr": row[13],
                "resultingBom": row[14],
                "changeLines": lines,
                "approvals": approvals,
                "createdAt": row[17].isoformat() if row[17] else None,
                "version": 1
            })
            
        return changes
