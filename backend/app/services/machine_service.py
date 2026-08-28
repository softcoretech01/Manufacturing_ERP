from typing import Any, Optional

from app.core.errors import NotFoundError, ValidationFailedError
from app.repositories.machine_repository import MachineRepository
from app.repositories.production_lookup_repository import ProductionLookupRepository

# Payload field -> (lookup table, human label). Checked before the proc runs so a
# stale dropdown value comes back as a 422 naming the field, not a raw FK 409.
_FK_FIELDS = {
    "machineGroupId": ("MachineGroup", "Machine group"),
    "plantId": ("sys_plant", "Plant"),
    "lineId": ("ProductionLine", "Production line"),
    "workCentreId": ("WorkCentre", "Work centre"),
}


class MachineService:
    def __init__(
        self,
        repository: MachineRepository,
        lookups: Optional[ProductionLookupRepository] = None,
    ):
        self.repository = repository
        self.lookups = lookups

    async def _validate_fks(self, data: dict[str, Any]) -> None:
        if self.lookups is None:
            return
        errors = []
        for field, (table, label) in _FK_FIELDS.items():
            value = data.get(field)
            if value is None:
                continue
            if not await self.lookups.fk_exists(table, int(value)):
                errors.append(
                    {
                        "field": field,
                        "code": "not_found",
                        "message": f"{label} {value} does not exist or is no longer active.",
                    }
                )
        if errors:
            raise ValidationFailedError(
                "Referenced records were not found", errors=errors
            )

    async def _validate_work_centre_placement(self, data: dict[str, Any]) -> None:
        """A work centre must belong to the line the machine is being placed on."""
        if self.lookups is None:
            return
        line_id, wc_id = data.get("lineId"), data.get("workCentreId")
        if not line_id or not wc_id:
            return
        matches = await self.lookups.get_work_centres(line_id=int(line_id))
        if not any(wc["id"] == int(wc_id) for wc in matches):
            raise ValidationFailedError(
                "Work centre does not belong to the selected line",
                errors=[
                    {
                        "field": "workCentreId",
                        "code": "mismatch",
                        "message": "This work centre is not on the selected production line.",
                    }
                ],
            )

    async def get_all(self) -> list[dict[str, Any]]:
        return await self.repository.get_all()

    async def get_by_id(self, record_id: int) -> dict[str, Any]:
        record = await self.repository.get_by_id(record_id)
        if not record:
            raise NotFoundError("Machine not found")
        return record

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def create(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        await self._validate_fks(data)
        await self._validate_work_centre_placement(data)
        if not data.get("code") or not str(data["code"]).strip():
            data["code"] = (await self.repository.get_next_code())["nextCode"]
        return await self.repository.create(data, user_id)

    async def update(self, record_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        existing = await self.get_by_id(record_id)
        await self._validate_fks(data)

        # Only the fields actually sent overwrite the stored row; the rest are
        # carried forward so a partial PUT cannot blank out unrelated columns.
        merged = {**existing, **{k: v for k, v in data.items() if v is not None}}
        await self._validate_work_centre_placement(merged)
        return await self.repository.update(record_id, merged, user_id)

    async def delete(self, record_id: int, user_id: str) -> None:
        await self.get_by_id(record_id)
        await self.repository.delete(record_id, user_id)
