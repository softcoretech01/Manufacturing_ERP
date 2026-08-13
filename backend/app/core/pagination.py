"""Offset pagination, whitelisted sorting and filtering for master lists.

CLAUDE.md §6: pagination is offset-based for master lists; filtering uses a
documented, whitelisted grammar — user strings are never interpolated into SQL.
Every list endpoint declares which columns are sortable/filterable; anything
outside that whitelist is rejected with 400, never silently ignored.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field
from sqlalchemy import Select, asc, desc
from sqlalchemy.orm import InstrumentedAttribute

from app.core.config import settings
from app.core.errors import MalformedRequestError

T = TypeVar("T")


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=settings.default_page_size, ge=1, le=settings.max_page_size)
    sort: str | None = Field(default=None, description="e.g. 'code' or '-created_at'")
    q: str | None = Field(default=None, description="free-text search")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int
    sort: str | None = None


class Page(BaseModel, Generic[T]):
    data: list[T]
    meta: PageMeta


@dataclass(slots=True)
class ListSpec:
    """Per-endpoint whitelist: which columns may be sorted / free-text searched."""

    sortable: dict[str, InstrumentedAttribute[Any]]
    searchable: Sequence[InstrumentedAttribute[Any]] = ()
    default_sort: str = "code"

    def apply_sort(self, stmt: Select[Any], sort: str | None) -> Select[Any]:
        token = sort or self.default_sort
        direction = desc if token.startswith("-") else asc
        key = token[1:] if token[0] in "+-" else token
        col = self.sortable.get(key)
        if col is None:
            raise MalformedRequestError(
                f"Cannot sort by '{key}'.",
                errors=[
                    {
                        "field": "sort",
                        "code": "not_sortable",
                        "message": f"Unknown sort column '{key}'",
                    }
                ],
                extra={"allowed_sort": sorted(self.sortable)},
            )
        return stmt.order_by(direction(col), asc(self.sortable.get("id", col)))

    def apply_search(self, stmt: Select[Any], q: str | None) -> Select[Any]:
        if not q or not self.searchable:
            return stmt
        from sqlalchemy import or_

        needle = f"%{q.strip()}%"
        return stmt.where(or_(*[c.like(needle) for c in self.searchable]))


def build_meta(params: PageParams, total: int) -> PageMeta:
    total_pages = (total + params.page_size - 1) // params.page_size if total else 0
    return PageMeta(
        page=params.page,
        page_size=params.page_size,
        total=total,
        total_pages=total_pages,
        sort=params.sort,
    )
