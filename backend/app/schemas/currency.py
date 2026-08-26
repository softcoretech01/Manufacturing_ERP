from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

class CurrencySchema(BaseModel):
    code: str = Field(..., max_length=10)
    name: str = Field(..., max_length=100)
    symbol: Optional[str] = Field(None, max_length=10)
    decimals: Optional[int] = 2
    isBase: Optional[bool] = False
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None

class ExchangeRateSchema(BaseModel):
    id: Optional[int] = None
    uid: Optional[str] = None
    fromCurrency: str = Field(..., max_length=10)
    toCurrency: str = Field(..., max_length=10)
    rateType: str = Field(..., max_length=20)
    rate: float
    effectiveDate: date
    source: Optional[str] = Field(None, max_length=100)
    isDeleted: Optional[bool] = False
    createdBy: Optional[str] = None
    createdDate: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedDate: Optional[datetime] = None
