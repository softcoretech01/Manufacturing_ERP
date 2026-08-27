import json
from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class MachineRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row: Any) -> Dict[str, Any]:
        operations = []
        if row.Operations:
            try:
                operations = json.loads(row.Operations)
            except json.JSONDecodeError:
                operations = [op.strip() for op in row.Operations.split(',') if op.strip()]
        
        return {
            "id": row.Id,
            "code": row.Code,
            "name": row.Name,
            # FK ids (source of truth) + joined display fields (not stored)
            "machineGroupId": row.MachineGroupId,
            "machineGroup": row.MachineGroup,          # group name
            "machineGroupCode": row.MachineGroupCode,
            "plantId": row.PlantId,
            "plantCode": row.PlantCode,
            "plantName": row.PlantName,
            "lineId": row.LineId,
            "lineCode": row.LineCode,
            "lineName": row.LineName,
            "workCentreId": row.WorkCentreId,
            "workCentreCode": row.WorkCentreCode,
            "workCentreName": row.WorkCentreName,
            "manufacturer": row.Manufacturer,
            "modelNumber": row.ModelNumber,
            "serialNumber": row.SerialNumber,
            "yearOfManufacture": row.YearOfManufacture,
            "assetCode": row.AssetCode,
            "capacityPerHour": float(row.CapacityPerHour),
            "capacityUom": row.CapacityUom,
            "powerKw": float(row.PowerKw) if row.PowerKw is not None else None,
            "operatorsRequired": row.OperatorsRequired,
            "installedOn": row.InstalledOn,
            "warrantyUntil": row.WarrantyUntil,
            "pmFrequencyDays": row.PmFrequencyDays,
            "lastPmOn": row.LastPmOn,
            "nextPmOn": row.NextPmOn,
            "criticality": row.Criticality,
            "currentState": row.CurrentState,
            "oeePct": float(row.OeePct),
            "operations": operations,
            "status": row.Status,
            "createdBy": row.CreatedBy,
            "createdDate": row.CreatedDate,
            "modifiedBy": row.ModifiedBy,
            "modifiedDate": row.ModifiedDate,
        }

    async def get_all(self) -> list[Dict[str, Any]]:
        query = text("""
            CALL SpMachine(
                'LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query)
        rows = result.fetchall()
        return [self._row_to_dict(row) for row in rows]

    async def get_by_id(self, record_id: int) -> Dict[str, Any]:
        query = text("""
            CALL SpMachine(
                'READ', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.db.execute(query, {"p_Id": record_id})
        row = result.fetchone()
        if not row:
            return None
        return self._row_to_dict(row)

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextMachineCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def _resolve_plant_id(self, plant_uid: Any) -> Any:
        """Machine.PlantId is an integer FK to sys_plant.id; the API carries the
        plant's public uid, so resolve it here. Pass-through if already numeric."""
        if plant_uid is None or isinstance(plant_uid, int):
            return plant_uid
        row = (await self.db.execute(
            text("SELECT id FROM sys_plant WHERE uid = :uid AND deleted_at IS NULL"),
            {"uid": plant_uid},
        )).fetchone()
        return int(row[0]) if row else None

    async def create(self, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        operations_str = json.dumps(data.get("operations", [])) if data.get("operations") else None
        plant_id = await self._resolve_plant_id(data.get("plantId") or data.get("plantUid"))

        query = text("""
            CALL SpMachine(
                'CREATE', NULL, :p_Code, :p_Name, :p_MachineGroupId, :p_PlantId, :p_LineId, :p_WorkCentreId,
                :p_Manufacturer, :p_ModelNumber, :p_SerialNumber, :p_YearOfManufacture, :p_AssetCode,
                :p_CapacityPerHour, :p_CapacityUom, :p_PowerKw, :p_OperatorsRequired, :p_InstalledOn,
                :p_WarrantyUntil, :p_PmFrequencyDays, :p_LastPmOn, :p_NextPmOn, :p_Criticality,
                :p_CurrentState, :p_OeePct, :p_Operations, :p_Status, :p_ModifiedBy
            )
        """)
        params = {
            "p_Code": data.get("code"),
            "p_Name": data.get("name"),
            "p_MachineGroupId": data.get("machineGroupId"),
            "p_PlantId": plant_id,
            "p_LineId": data.get("lineId"),
            "p_WorkCentreId": data.get("workCentreId"),
            "p_Manufacturer": data.get("manufacturer"),
            "p_ModelNumber": data.get("modelNumber"),
            "p_SerialNumber": data.get("serialNumber"),
            "p_YearOfManufacture": data.get("yearOfManufacture"),
            "p_AssetCode": data.get("assetCode"),
            "p_CapacityPerHour": data.get("capacityPerHour"),
            "p_CapacityUom": data.get("capacityUom"),
            "p_PowerKw": data.get("powerKw"),
            "p_OperatorsRequired": data.get("operatorsRequired"),
            "p_InstalledOn": data.get("installedOn"),
            "p_WarrantyUntil": data.get("warrantyUntil"),
            "p_PmFrequencyDays": data.get("pmFrequencyDays"),
            "p_LastPmOn": data.get("lastPmOn"),
            "p_NextPmOn": data.get("nextPmOn"),
            "p_Criticality": data.get("criticality"),
            "p_CurrentState": data.get("currentState"),
            "p_OeePct": data.get("oeePct"),
            "p_Operations": operations_str,
            "p_Status": data.get("status"),
            "p_ModifiedBy": user_id,
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def update(self, record_id: int, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        operations_str = json.dumps(data.get("operations", [])) if data.get("operations") is not None else None
        
        plant_id = await self._resolve_plant_id(data.get("plantId") or data.get("plantUid"))
        query = text("""
            CALL SpMachine(
                'UPDATE', :p_Id, NULL, :p_Name, :p_MachineGroupId, :p_PlantId, :p_LineId, :p_WorkCentreId,
                :p_Manufacturer, :p_ModelNumber, :p_SerialNumber, :p_YearOfManufacture, :p_AssetCode,
                :p_CapacityPerHour, :p_CapacityUom, :p_PowerKw, :p_OperatorsRequired, :p_InstalledOn,
                :p_WarrantyUntil, :p_PmFrequencyDays, :p_LastPmOn, :p_NextPmOn, :p_Criticality,
                :p_CurrentState, :p_OeePct, :p_Operations, :p_Status, :p_ModifiedBy
            )
        """)
        params = {
            "p_Id": record_id,
            "p_Name": data.get("name"),
            "p_MachineGroupId": data.get("machineGroupId"),
            "p_PlantId": plant_id,
            "p_LineId": data.get("lineId"),
            "p_WorkCentreId": data.get("workCentreId"),
            "p_Manufacturer": data.get("manufacturer"),
            "p_ModelNumber": data.get("modelNumber"),
            "p_SerialNumber": data.get("serialNumber"),
            "p_YearOfManufacture": data.get("yearOfManufacture"),
            "p_AssetCode": data.get("assetCode"),
            "p_CapacityPerHour": data.get("capacityPerHour"),
            "p_CapacityUom": data.get("capacityUom"),
            "p_PowerKw": data.get("powerKw"),
            "p_OperatorsRequired": data.get("operatorsRequired"),
            "p_InstalledOn": data.get("installedOn"),
            "p_WarrantyUntil": data.get("warrantyUntil"),
            "p_PmFrequencyDays": data.get("pmFrequencyDays"),
            "p_LastPmOn": data.get("lastPmOn"),
            "p_NextPmOn": data.get("nextPmOn"),
            "p_Criticality": data.get("criticality"),
            "p_CurrentState": data.get("currentState"),
            "p_OeePct": data.get("oeePct"),
            "p_Operations": operations_str,
            "p_Status": data.get("status"),
            "p_ModifiedBy": user_id,
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def delete(self, record_id: int, user_id: str) -> None:
        query = text("""
            CALL SpMachine(
                'DELETE', :p_Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
                NULL, NULL, NULL, NULL, NULL, :p_ModifiedBy
            )
        """)
        await self.db.execute(query, {"p_Id": record_id, "p_ModifiedBy": user_id})
        await self.db.commit()
