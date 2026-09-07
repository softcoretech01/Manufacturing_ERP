from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PpDemandBase(BaseModel):
    doc_no: str
    source: str
    product_code: str
    product_name: str
    uom: str
    qty: float = Field(..., gt=0)
    qty_planned: float = 0
    required_on: date
    customer: str
    market: str
    is_firm: bool
    status: str
    remarks: str = ""

class PpDemandCreate(PpDemandBase):
    pass

class PpDemandUpdate(BaseModel):
    qty: Optional[float] = None
    required_on: Optional[date] = None
    is_firm: Optional[bool] = None
    status: Optional[str] = None
    remarks: Optional[str] = None

class PpDemandSchema(PpDemandBase):
    uid: str
    version: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PpMpsBase(BaseModel):
    doc_no: str
    product_code: str
    product_name: str
    uom: str
    bucket: int
    bucket_start: Optional[date] = None
    demand_qty: float = Field(..., ge=0)
    planned_qty: float = Field(..., ge=0)
    is_firm: bool
    status: str
    remarks: str = ""

class PpMpsCreate(PpMpsBase):
    pass

class PpMpsUpdate(BaseModel):
    planned_qty: Optional[float] = None
    is_firm: Optional[bool] = None
    status: Optional[str] = None
    remarks: Optional[str] = None

class PpMpsSchema(PpMpsBase):
    uid: str
    version: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PpPlanningPolicyBase(BaseModel):
    item_code: str
    item_name: str
    lot_size_rule: str
    min_order_qty: float = Field(..., ge=0)
    order_multiple: float
    safety_stock_override: Optional[float] = None
    lead_time_override: Optional[int] = None
    frozen_days: int = 0
    is_active: bool = True

class PpPlanningPolicyCreate(PpPlanningPolicyBase):
    pass

class PpPlanningPolicyUpdate(BaseModel):
    lot_size_rule: Optional[str] = None
    min_order_qty: Optional[float] = None
    order_multiple: Optional[float] = None
    safety_stock_override: Optional[float] = None
    lead_time_override: Optional[int] = None
    frozen_days: Optional[int] = None
    is_active: Optional[bool] = None

class PpPlanningPolicySchema(PpPlanningPolicyBase):
    uid: str
    version: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PpProdOrderComponentBase(BaseModel):
    item_code: str
    item_name: str
    uom: str
    required_qty: float = Field(..., gt=0)
    reserved_qty: float = Field(0, gt=-1)
    issued_qty: float = Field(0, gt=-1)
    available_at_planning: float = 0

class PpProdOrderComponentSchema(PpProdOrderComponentBase):
    uid: str
    model_config = ConfigDict(from_attributes=True)


class PpProdOrderOperationBase(BaseModel):
    seq: int
    operation_code: str
    operation_name: str
    work_centre_code: str
    machine_code: str
    operators: int = 1
    skill: str
    tool_code: Optional[str] = None
    qc_checkpoint: bool = False
    setup_minutes: float = 0
    run_minutes: float = 0
    planned_start: str
    planned_finish: str
    status: str

class PpProdOrderOperationSchema(PpProdOrderOperationBase):
    uid: str
    model_config = ConfigDict(from_attributes=True)


class PpProductionOrderBase(BaseModel):
    doc_no: str
    order_type: str
    product_code: str
    product_name: str
    uom: str
    qty: float = Field(..., gt=0)
    produced_qty: float = Field(0, gt=-1)
    rejected_qty: float = Field(0, gt=-1)
    plant: str
    warehouse: str
    priority: str
    planned_start: Optional[date] = None
    planned_finish: Optional[date] = None
    status: str
    bom_doc_no: str
    bom_revision: int
    routing_doc_no: str
    routing_revision: int
    demand_refs: List[str] = Field(default_factory=list)
    estimated_unit_cost: float = 0
    cancel_reason: str = ""
    remarks: str = ""

class PpProductionOrderCreate(PpProductionOrderBase):
    components: List[PpProdOrderComponentBase]
    operations: List[PpProdOrderOperationBase]

class PpProductionOrderUpdate(BaseModel):
    status: Optional[str] = None
    cancel_reason: Optional[str] = None
    remarks: Optional[str] = None

class PpProductionOrderSchema(PpProductionOrderBase):
    uid: str
    version: int
    created_at: datetime
    components: List[PpProdOrderComponentSchema]
    operations: List[PpProdOrderOperationSchema]
    model_config = ConfigDict(from_attributes=True)


class PpCalendarDayBase(BaseModel):
    cal_date: date
    day_type: str
    hours: float
    shifts: int
    reason: str = ""
    plant: str

class PpCalendarDayCreate(PpCalendarDayBase):
    pass

class PpCalendarDayUpdate(BaseModel):
    day_type: Optional[str] = None
    hours: Optional[float] = None
    shifts: Optional[int] = None
    reason: Optional[str] = None

class PpCalendarDaySchema(PpCalendarDayBase):
    uid: str
    version: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PpForecastBase(BaseModel):
    doc_no: str
    product_code: str
    product_name: str
    uom: str
    period: str
    method: str
    base_qty: float
    factor_pct: float
    forecast_qty: float
    confidence_pct: float
    actual_qty: Optional[float] = None
    market: str
    status: str
    remarks: str = ""

class PpForecastCreate(PpForecastBase):
    pass

class PpForecastUpdate(BaseModel):
    base_qty: Optional[float] = None
    factor_pct: Optional[float] = None
    forecast_qty: Optional[float] = None
    confidence_pct: Optional[float] = None
    actual_qty: Optional[float] = None
    status: Optional[str] = None
    remarks: Optional[str] = None

class PpForecastSchema(PpForecastBase):
    uid: str
    version: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
