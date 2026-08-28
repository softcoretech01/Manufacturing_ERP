import uuid
from typing import Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class AdminPlantsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # Helper to convert Row to dict
    def _row_to_dict(self, row: Any) -> Dict[str, Any]:
        d = dict(row._mapping)
        return d

    # BRANCH
    async def get_branches(self) -> List[Dict[str, Any]]:
        query = text("CALL SpBranch('LIST', NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(r) for r in result.fetchall()]

    # PLANT
    async def get_next_plant_code(self) -> str:
        query = text("CALL SpGetNextPlantCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return row.NextCode if row else "P1"

    async def get_plants(self) -> List[Dict[str, Any]]:
        query = text("""
            CALL SpPlant(
                'LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query)
        return [self._row_to_dict(r) for r in result.fetchall()]

    async def get_plant_by_id(self, uid: str) -> Dict[str, Any]:
        query = text("""
            CALL SpPlant(
                'READ', :p_Uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query, {"p_Uid": uid})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def create_plant(self, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        new_uid = f"plt-{uuid.uuid4().hex[:8]}"
        query = text("""
            CALL SpPlant(
                'CREATE', :p_Uid, :p_CompanyUid, :p_BranchUid, :p_Code, :p_Name, 
                :p_PlantHead, :p_FactoryLicence, :p_FactoryLicenceValidTo, :p_City, 
                :p_State, :p_InstalledCapacityPerDay, :p_CapacityUom, :p_ShiftPattern, 
                :p_IsActive, :p_ModifiedBy
            )
        """)
        params = {
            "p_Uid": new_uid,
            "p_CompanyUid": data.get("companyUid"),
            "p_BranchUid": data.get("branchUid"),
            "p_Code": data.get("code"),
            "p_Name": data.get("name"),
            "p_PlantHead": data.get("plantHead"),
            "p_FactoryLicence": data.get("factoryLicence"),
            "p_FactoryLicenceValidTo": data.get("factoryLicenceValidTo"),
            "p_City": data.get("city"),
            "p_State": data.get("state"),
            "p_InstalledCapacityPerDay": data.get("installedCapacityPerDay"),
            "p_CapacityUom": data.get("capacityUom"),
            "p_ShiftPattern": data.get("shiftPattern"),
            "p_IsActive": data.get("isActive", True),
            "p_ModifiedBy": user_id
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def update_plant(self, uid: str, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        query = text("""
            CALL SpPlant(
                'UPDATE', :p_Uid, :p_CompanyUid, :p_BranchUid, :p_Code, :p_Name, 
                :p_PlantHead, :p_FactoryLicence, :p_FactoryLicenceValidTo, :p_City, 
                :p_State, :p_InstalledCapacityPerDay, :p_CapacityUom, :p_ShiftPattern, 
                :p_IsActive, :p_ModifiedBy
            )
        """)
        params = {
            "p_Uid": uid,
            "p_CompanyUid": data.get("companyUid"),
            "p_BranchUid": data.get("branchUid"),
            "p_Code": data.get("code"),
            "p_Name": data.get("name"),
            "p_PlantHead": data.get("plantHead"),
            "p_FactoryLicence": data.get("factoryLicence"),
            "p_FactoryLicenceValidTo": data.get("factoryLicenceValidTo"),
            "p_City": data.get("city"),
            "p_State": data.get("state"),
            "p_InstalledCapacityPerDay": data.get("installedCapacityPerDay"),
            "p_CapacityUom": data.get("capacityUom"),
            "p_ShiftPattern": data.get("shiftPattern"),
            "p_IsActive": data.get("isActive"),
            "p_ModifiedBy": user_id
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def delete_plant(self, uid: str, user_id: str) -> None:
        query = text("""
            CALL SpPlant(
                'DELETE', :p_Uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, :p_ModifiedBy
            )
        """)
        await self.db.execute(query, {"p_Uid": uid, "p_ModifiedBy": user_id})
        await self.db.commit()

    # WAREHOUSE
    async def get_warehouses(self) -> List[Dict[str, Any]]:
        query = text("CALL SpWarehouse('LIST', NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(r) for r in result.fetchall()]
