"""Request bodies for shop-floor execution.

Responses are plain dictionaries built by the services, matching the camelCase
the existing engineering and planning endpoints already return.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class StartRequest(BaseModel):
    machine_code: str = Field(default="", max_length=30, alias="machineCode")
    shift_code: str = Field(default="", max_length=20, alias="shiftCode")

    model_config = {"populate_by_name": True}


class ReasonRequest(BaseModel):
    reason: str = Field(default="", max_length=300)


class ProductionEntryRequest(BaseModel):
    good_qty: float = Field(..., ge=0, alias="goodQty")
    scrap_qty: float = Field(default=0, ge=0, alias="scrapQty")
    rework_qty: float = Field(default=0, ge=0, alias="reworkQty")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    ended_at: datetime | None = Field(default=None, alias="endedAt")
    business_date: date | None = Field(default=None, alias="businessDate")
    machine_code: str = Field(default="", max_length=30, alias="machineCode")
    shift_code: str = Field(default="", max_length=20, alias="shiftCode")
    scrap_reason: str = Field(default="", max_length=300, alias="scrapReason")
    defect_code: str = Field(default="", max_length=30, alias="defectCode")
    remarks: str = Field(default="", max_length=400)

    model_config = {"populate_by_name": True}


class QcDecisionRequest(BaseModel):
    result: str = Field(..., max_length=20)
    inspection_doc_no: str = Field(default="", max_length=50, alias="inspectionDocNo")
    note: str = Field(default="", max_length=300)

    model_config = {"populate_by_name": True}


class MaterialIssueRequest(BaseModel):
    warehouse: str = Field(..., min_length=1, max_length=80)
    work_order_uid: str = Field(default="", max_length=26, alias="workOrderUid")
    remarks: str = Field(default="", max_length=300)

    model_config = {"populate_by_name": True}
