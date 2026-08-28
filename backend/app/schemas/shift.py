"""Shift master contracts.

Two shapes, deliberately: `ShiftWriteSchema` is strict and guards what may enter
the database, `ShiftResponseSchema` is permissive and only describes what comes
back. Rows written before these rules existed must still be readable — enforcing
business rules on the way *out* would turn a legacy row into a 500 on every list.

`Shift.StartTime` / `EndTime` are VARCHAR(5) in MariaDB, so anything that is not
`HH:MM` used to reach the database and surface as "Data too long". `NetHours` is
DECIMAL(5,2) and a shift cannot outlast a day, so it is capped at 24.
"""

import re
from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

Time = Annotated[str, Field(min_length=5, max_length=5, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")]

MINUTES_PER_DAY = 24 * 60


def _minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


class ShiftWriteSchema(BaseModel):
    """Create / update payload — every rule is enforced here."""

    uid: Optional[str] = None
    code: Annotated[str, Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9][A-Za-z0-9/_-]*$")]
    name: Annotated[str, Field(min_length=2, max_length=150)]
    startTime: Time
    endTime: Time
    breakMinutes: Optional[Annotated[int, Field(ge=0, le=MINUTES_PER_DAY)]] = None
    netHours: Optional[Annotated[float, Field(ge=0, le=24)]] = None
    crossesMidnight: Optional[bool] = None
    nightAllowance: Optional[bool] = False
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    isActive: Optional[bool] = None

    @field_validator("code", "name", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("startTime", "endTime", mode="before")
    @classmethod
    def _normalise_time(cls, v: object) -> object:
        """Accept `H:MM` and `HH:MM:SS` from pickers, store `HH:MM`."""
        if not isinstance(v, str):
            return v
        v = v.strip()
        parts = v.split(":")
        if len(parts) >= 2 and all(p.isdigit() for p in parts[:2]):
            return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
        return v

    @model_validator(mode="after")
    def _check_span(self):
        start, end = _minutes(self.startTime), _minutes(self.endTime)
        if start == end:
            raise ValueError("startTime and endTime cannot be the same")

        # A shift whose end is at or before its start wraps past midnight.
        wraps = end < start
        if self.crossesMidnight is None:
            self.crossesMidnight = wraps
        elif bool(self.crossesMidnight) != wraps:
            raise ValueError(
                "crossesMidnight must be true only when endTime is earlier than startTime"
            )

        span = (end - start) if not wraps else (MINUTES_PER_DAY - start + end)
        if self.breakMinutes is not None and self.breakMinutes >= span:
            raise ValueError("breakMinutes must be less than the shift span")

        worked = (span - (self.breakMinutes or 0)) / 60
        if self.netHours is None:
            self.netHours = round(worked, 2)
        elif abs(self.netHours - worked) > 0.02:
            raise ValueError(
                f"netHours must equal the shift span minus breaks ({worked:.2f})"
            )

        if self.effectiveTo and self.effectiveFrom and self.effectiveTo < self.effectiveFrom:
            raise ValueError("effectiveTo cannot be before effectiveFrom")
        return self


class ShiftResponseSchema(BaseModel):
    """What the API returns. Permissive on purpose — see the module docstring."""

    id: Optional[str] = None
    uid: Optional[str] = None
    code: str
    name: str
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    breakMinutes: Optional[int] = None
    netHours: Optional[float] = None
    crossesMidnight: Optional[bool] = False
    nightAllowance: Optional[bool] = False
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    usageCount: Optional[int] = 0
    isActive: Optional[bool] = True
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None

    class Config:
        from_attributes = True


# Backwards-compatible alias for callers that imported the old single schema.
ShiftSchema = ShiftResponseSchema
