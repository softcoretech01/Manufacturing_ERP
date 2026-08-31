import json
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.utils.dbtypes import as_bool

class EngineeringWorkCentreRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _execute_sp(self, action: str, data: dict, user: str) -> Optional[str]:
        machine_codes_json = json.dumps(data.get("machineCodes", [])) if data.get("machineCodes") else '[]'
        
        sql = text("""
            CALL ERP_Product.SpManageEngineeringWorkCentre(
                :action, :id, :code, :name, :plant, :machineRatePerHour, 
                :labourRatePerHour, :overheadPct, :shiftPattern, :hoursPerDay, 
                :oeeTargetPct, :machineCodes, :isActive, :user
            )
        """)
        
        params = {
            "action": action,
            "id": int(data.get("uid")) if data.get("uid") else None,
            "code": data.get("code"),
            "name": data.get("name"),
            "plant": data.get("plant"),
            "machineRatePerHour": data.get("machineRatePerHour", 0),
            "labourRatePerHour": data.get("labourRatePerHour", 0),
            "overheadPct": data.get("overheadPct", 0),
            "shiftPattern": data.get("shiftPattern"),
            "hoursPerDay": data.get("hoursPerDay", 0),
            "oeeTargetPct": data.get("oeeTargetPct", 0),
            "machineCodes": machine_codes_json,
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
        sql = text("SELECT MAX(CAST(SUBSTRING(Code, 5) AS UNSIGNED)) FROM ERP_Product.EngineeringWorkCentre WHERE Code LIKE 'EWC-%'")
        result = await self.session.execute(sql)
        max_id = result.scalar() or 0
        return f"EWC-{max_id + 1:04d}"

    async def create_workcentre(self, data: dict, user: str) -> str:
        if not data.get("code"):
            data["code"] = await self.get_next_code()
        return await self._execute_sp("INSERT", data, user)

    async def update_workcentre(self, uid: str, data: dict, user: str) -> str:
        data["uid"] = uid
        return await self._execute_sp("UPDATE", data, user)

    async def count_references(self, uid: str) -> int:
        """How many active operations still run on this work centre.

        Resolved in two steps on purpose: EngineeringOperation and
        EngineeringWorkCentre carry different collations, so joining their text
        columns directly raises "Illegal mix of collations".
        """
        code = (
            await self.session.execute(
                text("SELECT Code FROM ERP_Product.EngineeringWorkCentre WHERE Id = :uid"),
                {"uid": uid},
            )
        ).scalar()
        if not code:
            return 0
        return int(
            (
                await self.session.execute(
                    text(
                        "SELECT COUNT(*) FROM ERP_Product.EngineeringOperation"
                        " WHERE DefaultWorkCentre = :code AND IsActive = 1"
                    ),
                    {"code": code},
                )
            ).scalar()
            or 0
        )

    async def delete_workcentre(self, uid: str, user: str) -> str:
        """Retire a work centre without destroying it.

        `SpManageEngineeringWorkCentre`'s DELETE branch runs a physical
        `DELETE FROM EngineeringWorkCentre`, which silently orphans every
        operation and routing step that references the code — and contradicts the
        soft-delete rule the rest of the system follows (CLAUDE.md §4.2). Until
        that procedure is corrected, retire the row here instead.
        """
        sql = text(
            "UPDATE ERP_Product.EngineeringWorkCentre"
            " SET IsActive = 0, ModifiedBy = :user, ModifiedDate = CURRENT_TIMESTAMP"
            " WHERE Id = :uid"
        )
        await self.session.execute(sql, {"uid": uid, "user": user})
        await self.session.commit()
        return uid

    async def get_all_workcentres(self) -> List[Dict[str, Any]]:
        sql = text("""
            CALL ERP_Product.SpManageEngineeringWorkCentre(
                'SELECT_ALL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, 'System'
            )
        """)
        result = await self.session.execute(sql)
        workcentres = []
        for row in result:
            workcentres.append({
                "uid": str(row[0]), # Map Id to uid
                "code": row[1],
                "name": row[2],
                "plant": row[3],
                "machineRatePerHour": float(row[4]) if row[4] is not None else 0.0,
                "labourRatePerHour": float(row[5]) if row[5] is not None else 0.0,
                "overheadPct": float(row[6]) if row[6] is not None else 0.0,
                "shiftPattern": row[7],
                "hoursPerDay": int(row[8]) if row[8] is not None else 0,
                "oeeTargetPct": float(row[9]) if row[9] is not None else 0.0,
                "machineCodes": json.loads(row[10]) if row[10] else [],
                "isActive": as_bool(row[11])
            })
        return workcentres
