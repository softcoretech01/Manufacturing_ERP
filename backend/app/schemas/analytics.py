from pydantic import BaseModel, constr
from typing import List, Optional

class SpendByCategory(BaseModel):
    category: constr(max_length=100)
    value: float
    poCount: int
    suppliers: int
    savingsPct: float

class SpendTrendPoint(BaseModel):
    month: constr(max_length=20)
    spend: float
    budget: float
    poCount: int

class SupplierSpend(BaseModel):
    supplierName: constr(max_length=100)
    value: float
    sharePct: float
    onTimePct: float
    rejectionPct: float
    grade: constr(max_length=5)

class PriceTrendPoint(BaseModel):
    month: constr(max_length=20)
    ss304: float
    ss316: float
    lid: float

class CycleTimeStage(BaseModel):
    stage: constr(max_length=100)
    avgDays: float
    targetDays: float

class AnalyticsPayload(BaseModel):
    spendByCategory: Optional[List[SpendByCategory]] = None
    spendTrend: Optional[List[SpendTrendPoint]] = None
    supplierSpend: Optional[List[SupplierSpend]] = None
    priceTrend: Optional[List[PriceTrendPoint]] = None
    cycleTimes: Optional[List[CycleTimeStage]] = None
