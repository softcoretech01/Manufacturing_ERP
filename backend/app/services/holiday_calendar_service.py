import datetime
import uuid
from typing import Any, Dict, List, Optional

from app.core.errors import NotFoundError, ValidationFailedError

from app.repositories.holiday_calendar_repository import HolidayCalendarRepository
from app.repositories.production_lookup_repository import ProductionLookupRepository
from app.schemas.holiday_calendar import ALL_PLANTS


def _field_error(field: str, code: str, message: str) -> ValidationFailedError:
    return ValidationFailedError(
        message, errors=[{"field": field, "code": code, "message": message}]
    )


class HolidayCalendarService:
    def __init__(
        self,
        repository: HolidayCalendarRepository,
        lookups: Optional[ProductionLookupRepository] = None,
    ):
        self.repository = repository
        self.lookups = lookups

    async def _validate_plant(self, plant: Optional[str]) -> None:
        """`plant` is a plant code or the ALL sentinel — never free text."""
        if not plant or self.lookups is None or plant == ALL_PLANTS:
            return
        codes = {p["code"].upper() for p in await self.lookups.get_plants()}
        if plant.upper() not in codes:
            known = ", ".join(sorted(codes) + [ALL_PLANTS])
            raise _field_error(
                "plant", "not_found", f"Unknown plant '{plant}'. Expected one of: {known}."
            )

    async def _check_one_per_year(
        self, data: Dict[str, Any], *, exclude_uid: Optional[str] = None
    ) -> None:
        """Every plant has at most one active calendar per financial year."""
        plant, year = data.get("plant"), data.get("financialYear")
        if not plant or not year or not data.get("isActive", True):
            return
        for row in await self.repository.get_all():
            if exclude_uid and row.get("uid") == exclude_uid:
                continue
            if not row.get("isActive", True):
                continue
            if row.get("plant") == plant and row.get("financialYear") == year:
                raise _field_error(
                    "financialYear",
                    "duplicate",
                    f"{plant} already has an active calendar for {year} "
                    f"({row.get('code')}). Amend or deactivate it first.",
                )

    async def get_all(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all()

    async def get_next_code(self) -> Dict[str, str]:
        return await self.repository.get_next_code()

    async def get_by_id(self, uid: str) -> Dict[str, Any]:
        result = await self.repository.get_by_id(uid)
        if not result:
            raise NotFoundError("Holiday Calendar not found")
        return result

    async def create(self, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        await self._validate_plant(data.get("plant"))
        await self._check_one_per_year(data)
        # EffectiveFrom is NOT NULL in the table; default it rather than letting
        # the insert fail as an opaque constraint violation.
        if not data.get("effectiveFrom"):
            data["effectiveFrom"] = datetime.datetime.now()
        return await self.repository.create(str(uuid.uuid4()), data, current_user)

    async def update(self, uid: str, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        existing = await self.get_by_id(uid)
        await self._validate_plant(data.get("plant"))

        merged = {**existing, **{k: v for k, v in data.items() if v is not None}}
        await self._check_one_per_year(merged, exclude_uid=uid)
        if not merged.get("effectiveFrom"):
            merged["effectiveFrom"] = datetime.datetime.now()
        return await self.repository.update(uid, merged, current_user)

    async def delete(self, uid: str, current_user: str) -> None:
        existing = await self.get_by_id(uid)
        if (existing.get("usageCount") or 0) > 0:
            raise _field_error(
                "usageCount",
                "in_use",
                f"{existing.get('usageCount')} record(s) reference this calendar. "
                "Deactivate it instead of deleting it.",
            )
        await self.repository.delete(uid, current_user)
