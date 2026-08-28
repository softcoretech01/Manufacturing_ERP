"""Holiday-calendar master contracts.

Counts are day counts inside one financial year, so they are bounded by 366 and
cross-checked against each other: national holidays are a subset of all
holidays, and holidays plus working days cannot exceed the year.
"""

from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

DAYS_IN_YEAR = 366

# Accepts `2027`, `2026-27` and `FY26-27` — all three appear in existing data.
FINANCIAL_YEAR_PATTERN = r"^(FY)?\d{2,4}(-\d{2})?$"

# Sentinel meaning "applies to every plant".
ALL_PLANTS = "ALL"

DayCount = Annotated[int, Field(ge=0, le=DAYS_IN_YEAR)]


class HolidayCalendarWriteSchema(BaseModel):
    """Create / update payload - every rule is enforced here."""

    uid: Optional[str] = None
    code: Annotated[str, Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9][A-Za-z0-9/_-]*$")]
    name: Annotated[str, Field(min_length=2, max_length=150)]
    financialYear: Annotated[str, Field(min_length=4, max_length=10, pattern=FINANCIAL_YEAR_PATTERN)]
    plant: Annotated[str, Field(min_length=1, max_length=10)]
    holidayCount: Optional[DayCount] = 0
    nationalCount: Optional[DayCount] = 0
    workingDays: Optional[DayCount] = 0
    effectiveFrom: Optional[datetime] = None
    effectiveTo: Optional[datetime] = None
    isActive: Optional[bool] = None

    @field_validator("code", "name", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("financialYear", "plant", mode="before")
    @classmethod
    def _strip_upper(cls, v: object) -> object:
        return v.strip().upper() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _check_counts(self):
        holidays = self.holidayCount or 0
        national = self.nationalCount or 0
        working = self.workingDays or 0

        if national > holidays:
            raise ValueError("nationalCount cannot exceed holidayCount")
        if holidays + working > DAYS_IN_YEAR:
            raise ValueError(
                f"holidayCount plus workingDays cannot exceed {DAYS_IN_YEAR} days"
            )
        if self.effectiveTo and self.effectiveFrom and self.effectiveTo < self.effectiveFrom:
            raise ValueError("effectiveTo cannot be before effectiveFrom")
        return self


class HolidayCalendarResponseSchema(BaseModel):
    """What the API returns. Permissive on purpose so rows written before these
    rules existed stay readable instead of turning every list into a 500."""

    id: Optional[str] = None
    uid: Optional[str] = None
    code: str
    name: str
    financialYear: Optional[str] = None
    plant: Optional[str] = None
    holidayCount: Optional[int] = 0
    nationalCount: Optional[int] = 0
    workingDays: Optional[int] = 0
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
HolidayCalendarSchema = HolidayCalendarResponseSchema
