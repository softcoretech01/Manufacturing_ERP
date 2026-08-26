"""Request/response contracts for Inventory storage structure (zones, bins).
`uid` is the only identifier exposed; `warehouse_uid` / `zone_uid` reference other
records by their public id (CLAUDE.md §6)."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.core.enums import BinStatus, BinType
from app.core.schema import ApiModel, InModel


class VersionedUpdate(InModel):
    version: int = Field(..., ge=1, description="Row version the client last saw (CLAUDE.md §4.5)")


class DeactivateRequest(InModel):
    version: int = Field(..., ge=1)
    reason: str | None = Field(default=None, max_length=500)


# ─────────────────────────── Zone ────────────────────────────────────────────
class ZoneCreate(InModel):
    warehouse_uid: str = Field(..., min_length=1, max_length=26)
    code: str | None = Field(default=None, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    zone_type: str | None = Field(default=None, max_length=40)
    pick_sequence: int = Field(default=0, ge=0, le=99999)


class ZoneUpdate(VersionedUpdate):
    name: str | None = Field(default=None, max_length=150)
    zone_type: str | None = Field(default=None, max_length=40)
    pick_sequence: int | None = Field(default=None, ge=0, le=99999)


class ZoneOut(ApiModel):
    uid: str
    code: str
    name: str
    zone_type: str | None
    pick_sequence: int
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime


# ─────────────────────────── Bin ─────────────────────────────────────────────
class BinCreate(InModel):
    warehouse_uid: str = Field(..., min_length=1, max_length=26)
    zone_uid: str | None = Field(default=None, max_length=26)
    code: str = Field(..., min_length=1, max_length=30)
    bin_type: BinType = BinType.RACK
    max_weight_kg: float | None = Field(default=None, ge=0)
    max_volume_m3: float | None = Field(default=None, ge=0)
    pick_sequence: int = Field(default=0, ge=0, le=99999)
    mixing_allowed: bool = True
    hazard_class: str | None = Field(default=None, max_length=40)


class BinUpdate(VersionedUpdate):
    code: str | None = Field(default=None, min_length=1, max_length=30)
    zone_uid: str | None = Field(default=None, max_length=26)
    bin_type: BinType | None = None
    max_weight_kg: float | None = Field(default=None, ge=0)
    max_volume_m3: float | None = Field(default=None, ge=0)
    pick_sequence: int | None = Field(default=None, ge=0, le=99999)
    mixing_allowed: bool | None = None
    hazard_class: str | None = Field(default=None, max_length=40)


class BinBlockRequest(InModel):
    version: int = Field(..., ge=1)
    reason: str = Field(..., min_length=1, max_length=200)


class BinOut(ApiModel):
    uid: str
    zone_uid: str | None
    code: str
    bin_type: str
    status: str
    max_weight_kg: float | None
    max_volume_m3: float | None
    pick_sequence: int
    mixing_allowed: bool
    block_reason: str | None
    hazard_class: str | None
    is_active: bool
    version: int


class BulkBinGenerate(InModel):
    warehouse_uid: str = Field(..., min_length=1, max_length=26)
    zone_uid: str | None = Field(default=None, max_length=26)
    aisles: int = Field(..., ge=1, le=26, description="A…Z — number of aisles")
    racks: int = Field(..., ge=1, le=99)
    levels: int = Field(..., ge=1, le=9)
    positions: int = Field(..., ge=1, le=9)
    bin_type: BinType = BinType.RACK


class BulkBinResult(ApiModel):
    requested: int
    created: int
    skipped: int


class BinStatusOut(ApiModel):
    """Enum reference for the frontend status filter."""

    statuses: list[str] = Field(default_factory=lambda: [s.value for s in BinStatus])
