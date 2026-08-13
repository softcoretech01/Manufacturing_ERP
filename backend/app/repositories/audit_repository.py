import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

class AuditRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _execute_sp(self, action: str, data: dict, user_id: str = "System") -> str:
        sql = text("""
            CALL ERP_Product.SpManageAuditEntry(
                :p_Action, :p_Uid, :p_EntityType, :p_EntityLabel, :p_DocumentNo, :p_EntryAction,
                :p_Changes, :p_ReasonCode, :p_Comments, :p_UserName, :p_RoleCode, :p_IpAddress,
                :p_UserAgent, :p_Channel, :p_CorrelationId, :p_At, :p_UserId
            )
        """)
        
        changes_json = json.dumps(data.get("changes", [])) if data.get("changes") is not None else None

        params = {
            "p_Action": action,
            "p_Uid": data.get("uid"),
            "p_EntityType": data.get("entityType"),
            "p_EntityLabel": data.get("entityLabel"),
            "p_DocumentNo": data.get("documentNo"),
            "p_EntryAction": data.get("action"),
            "p_Changes": changes_json,
            "p_ReasonCode": data.get("reasonCode"),
            "p_Comments": data.get("comments"),
            "p_UserName": data.get("userName"),
            "p_RoleCode": data.get("roleCode"),
            "p_IpAddress": data.get("ipAddress"),
            "p_UserAgent": data.get("userAgent"),
            "p_Channel": data.get("channel"),
            "p_CorrelationId": data.get("correlationId"),
            "p_At": data.get("at"),
            "p_UserId": user_id
        }
        
        result = await self.session.execute(sql, params)
        await self.session.commit()
        
        if action == 'INSERT':
            row = result.fetchone()
            if row:
                return str(row[0])
        return ""

    async def create_audit_entry(self, data: dict, user: str = "System") -> str:
        return await self._execute_sp("INSERT", data, user)

    async def get_all_audit_entries(self) -> List[Dict[str, Any]]:
        sql = text("""
            CALL ERP_Product.SpManageAuditEntry(
                'SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'System'
            )
        """)
        result = await self.session.execute(sql)
        entries = []
        for row in result:
            changes_data = row[5]
            if isinstance(changes_data, str):
                changes_list = json.loads(changes_data)
            elif changes_data is None:
                changes_list = []
            else:
                changes_list = changes_data # It might already be parsed by asyncmy/aiomysql

            entries.append({
                "uid": str(row[0]),
                "entityType": row[1],
                "entityLabel": row[2],
                "documentNo": row[3],
                "action": row[4],
                "changes": changes_list,
                "reasonCode": row[6],
                "comments": row[7],
                "userName": row[8],
                "roleCode": row[9],
                "ipAddress": row[10],
                "userAgent": row[11],
                "channel": row[12],
                "correlationId": row[13],
                "at": row[14].isoformat() if row[14] else None
            })
        return entries
