"""Shared Pydantic base schemas and response conventions (CLAUDE.md §6)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """Base for all response schemas. Reads straight off ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class InModel(BaseModel):
    """Base for request bodies: unknown fields are rejected, not silently dropped."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
