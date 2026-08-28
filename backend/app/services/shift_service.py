import datetime
import uuid
from typing import Any, Dict, List, Optional

from app.core.errors import NotFoundError, ValidationFailedError

from app.repositories.shift_repository import ShiftRepository


def _field_error(field: str, code: str, message: str) -> ValidationFailedError:
    return ValidationFailedError(
        message, errors=[{"field": field, "code": code, "message": message}]
    )


class ShiftService:
    def __init__(self, repository: ShiftRepository):
        self.repository = repository

    async def _check_code_unique(self, code: Optional[str], *, exclude_uid: Optional[str] = None) -> None:
        if not code:
            return
        for row in await self.repository.get_shifts():
            if exclude_uid and row.get("uid") == exclude_uid:
                continue
            if (row.get("code") or "").upper() == code.upper():
                raise _field_error(
                    "code", "duplicate", f"Shift code '{code}' is already in use."
                )

    async def get_shifts(self) -> List[Dict[str, Any]]:
        return await self.repository.get_shifts()

    async def get_next_code(self) -> Dict[str, str]:
        return await self.repository.get_next_code()

    async def get_shift_by_id(self, uid: str) -> Dict[str, Any]:
        record = await self.repository.get_shift_by_id(uid)
        if not record:
            raise NotFoundError("Shift not found")
        return record

    async def create_shift(self, shift_data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        await self._check_code_unique(shift_data.get("code"))
        if not shift_data.get("uid"):
            shift_data["uid"] = str(uuid.uuid4())
        if not shift_data.get("effectiveFrom"):
            shift_data["effectiveFrom"] = datetime.datetime.now()
        if shift_data.get("isActive") is None:
            shift_data["isActive"] = True
        return await self.repository.create_shift(shift_data, current_user)

    async def update_shift(self, uid: str, shift_data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        existing = await self.get_shift_by_id(uid)
        await self._check_code_unique(shift_data.get("code"), exclude_uid=uid)

        merged = {**existing, **{k: v for k, v in shift_data.items() if v is not None}}
        if not merged.get("effectiveFrom"):
            merged["effectiveFrom"] = datetime.datetime.now()
        return await self.repository.update_shift(uid, merged, current_user)

    async def delete_shift(self, uid: str, current_user: str) -> None:
        existing = await self.get_shift_by_id(uid)
        if (existing.get("usageCount") or 0) > 0:
            raise _field_error(
                "usageCount",
                "in_use",
                f"{existing.get('usageCount')} record(s) reference this shift. "
                "Deactivate it instead of deleting it.",
            )
        await self.repository.delete_shift(uid, current_user)
