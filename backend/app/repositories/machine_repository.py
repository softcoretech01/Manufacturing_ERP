import json
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

# SpMachine takes 28 positional params. Building the CALL from this list keeps the
# parameter *order* in one place, so a signature change is a one-line edit here
# instead of four hand-counted NULL runs.
_SP_PARAMS = (
    "p_Action", "p_Id", "p_Code", "p_Name", "p_MachineGroupId", "p_PlantId",
    "p_LineId", "p_WorkCentreId", "p_Manufacturer", "p_ModelNumber",
    "p_SerialNumber", "p_YearOfManufacture", "p_AssetCode", "p_CapacityPerHour",
    "p_CapacityUom", "p_PowerKw", "p_OperatorsRequired", "p_InstalledOn",
    "p_WarrantyUntil", "p_PmFrequencyDays", "p_LastPmOn", "p_NextPmOn",
    "p_Criticality", "p_CurrentState", "p_OeePct", "p_Operations", "p_Status",
    "p_ModifiedBy",
)

_CALL = "CALL SpMachine(" + ", ".join(f":{p}" for p in _SP_PARAMS) + ")"


def _call_params(action: str, **overrides: Any) -> Dict[str, Any]:
    """Every SpMachine param defaulted to NULL, with the given ones filled in."""
    params: Dict[str, Any] = {p: None for p in _SP_PARAMS}
    params["p_Action"] = action
    for key, value in overrides.items():
        name = key if key.startswith("p_") else f"p_{key}"
        if name not in params:
            raise KeyError(f"Unknown SpMachine parameter: {name}")
        params[name] = value
    return params


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
        if not isinstance(operations, list):
            operations = []

        return {
            "id": row.Id,
            "code": row.Code,
            "name": row.Name,
            # Foreign keys, plus the joined code/name the UI displays.
            "machineGroupId": row.MachineGroupId,
            "machineGroupCode": row.MachineGroupCode,
            "machineGroup": row.MachineGroup,
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

    @staticmethod
    def _write_params(data: Dict[str, Any]) -> Dict[str, Any]:
        """Map the API payload onto SpMachine's write parameters."""
        operations = data.get("operations")
        return {
            "Name": data.get("name"),
            "MachineGroupId": data.get("machineGroupId"),
            "PlantId": data.get("plantId"),
            "LineId": data.get("lineId"),
            "WorkCentreId": data.get("workCentreId"),
            "Manufacturer": data.get("manufacturer"),
            "ModelNumber": data.get("modelNumber"),
            "SerialNumber": data.get("serialNumber"),
            "YearOfManufacture": data.get("yearOfManufacture"),
            "AssetCode": data.get("assetCode"),
            "CapacityPerHour": data.get("capacityPerHour"),
            "CapacityUom": data.get("capacityUom"),
            "PowerKw": data.get("powerKw"),
            "OperatorsRequired": data.get("operatorsRequired"),
            "InstalledOn": data.get("installedOn"),
            "WarrantyUntil": data.get("warrantyUntil"),
            "PmFrequencyDays": data.get("pmFrequencyDays"),
            "LastPmOn": data.get("lastPmOn"),
            "NextPmOn": data.get("nextPmOn"),
            "Criticality": data.get("criticality"),
            "CurrentState": data.get("currentState"),
            "OeePct": data.get("oeePct"),
            "Operations": json.dumps(operations) if operations is not None else None,
            "Status": data.get("status"),
        }

    async def get_all(self) -> list[Dict[str, Any]]:
        result = await self.db.execute(text(_CALL), _call_params("LIST"))
        return [self._row_to_dict(row) for row in result.fetchall()]

    async def get_by_id(self, record_id: int) -> Optional[Dict[str, Any]]:
        result = await self.db.execute(text(_CALL), _call_params("READ", Id=record_id))
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def get_next_code(self) -> Dict[str, str]:
        result = await self.db.execute(text("CALL SpGetNextMachineCode()"))
        return {"nextCode": result.fetchone().nextCode}

    async def create(self, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        params = _call_params(
            "CREATE",
            Code=data.get("code"),
            ModifiedBy=user_id,
            **self._write_params(data),
        )
        result = await self.db.execute(text(_CALL), params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def update(self, record_id: int, data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        params = _call_params(
            "UPDATE",
            Id=record_id,
            ModifiedBy=user_id,
            **self._write_params(data),
        )
        result = await self.db.execute(text(_CALL), params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row)

    async def delete(self, record_id: int, user_id: str) -> None:
        await self.db.execute(
            text(_CALL), _call_params("DELETE", Id=record_id, ModifiedBy=user_id)
        )
        await self.db.commit()
