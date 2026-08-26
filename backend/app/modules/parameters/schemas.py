from __future__ import annotations

from pydantic import Field

from app.core.schema import ApiModel, InModel


class ParameterOut(ApiModel):
    uid: str
    version: int
    param_key: str
    name: str
    param_group: str
    value_type: str
    value: str
    default_value: str
    description: str | None = None
    scope: str
    is_sensitive: bool
    options: list[str] | None = None


class ParameterChange(InModel):
    param_key: str = Field(..., max_length=80)
    value: str = Field(..., max_length=500)


class ParametersUpdate(InModel):
    changes: list[ParameterChange] = Field(default_factory=list)
