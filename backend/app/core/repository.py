"""Base repository: the single place that enforces tenant scope and soft delete.

CLAUDE.md §4.2/§4.3: every query filters `deleted_at IS NULL` and injects
`company_id` — callers never remember to. Repositories do not commit; the
application service owns the transaction (CLAUDE.md §3, V0-NFR-003).
"""

from __future__ import annotations

from typing import Generic, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base import CompanyEntity, Entity
from app.core.context import TenantContext
from app.core.errors import ConcurrentModificationError, NotFoundError
from app.core.time import utcnow

E = TypeVar("E", bound=Entity)


class BaseRepository(Generic[E]):
    """CRUD with automatic soft-delete filtering and (for company-scoped models)
    automatic company injection. Optimistic locking on update."""

    model: type[E]
    company_scoped: bool = True

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    # ─── query building ─────────────────────────────────────────────────────
    def _scoped(self, *, include_deleted: bool = False) -> Select[tuple[E]]:
        stmt: Select[tuple[E]] = select(self.model)
        if not include_deleted:
            stmt = stmt.where(self.model.deleted_at.is_(None))
        if self.company_scoped and not self.ctx.is_system:
            # Reads are limited to the caller's in-scope companies (V0-BR-008).
            company_ids = self.ctx.company_ids or frozenset({self.ctx.company_id})
            stmt = stmt.where(self.model.company_id.in_(company_ids))  # type: ignore[attr-defined]
        return stmt

    def base_query(self, *, include_deleted: bool = False) -> Select[tuple[E]]:
        return self._scoped(include_deleted=include_deleted)

    # ─── reads ──────────────────────────────────────────────────────────────
    async def get_by_uid(self, uid: str, *, include_deleted: bool = False) -> E | None:
        stmt = self._scoped(include_deleted=include_deleted).where(self.model.uid == uid)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_uid_or_404(self, uid: str, *, include_deleted: bool = False) -> E:
        row = await self.get_by_uid(uid, include_deleted=include_deleted)
        if row is None:
            # A row outside the caller's scope is indistinguishable from absent (V0-IR-011).
            raise NotFoundError(f"{self.model.__name__} '{uid}' not found")
        return row

    async def count(self, stmt: Select[tuple[E]]) -> int:
        count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
        return int((await self.session.execute(count_stmt)).scalar_one())

    async def list_page(self, stmt: Select[tuple[E]], *, offset: int, limit: int) -> list[E]:
        rows = await self.session.execute(stmt.offset(offset).limit(limit))
        return list(rows.scalars().all())

    async def exists_code(
        self, code: str, *, company_id: int, exclude_uid: str | None = None
    ) -> bool:
        stmt = self._scoped().where(
            func.lower(self.model.code) == code.lower(),  # type: ignore[attr-defined]
        )
        if self.company_scoped:
            stmt = stmt.where(self.model.company_id == company_id)  # type: ignore[attr-defined]
        if exclude_uid:
            stmt = stmt.where(self.model.uid != exclude_uid)
        return (await self.session.execute(select(stmt.exists()))).scalar() or False

    # ─── writes ─────────────────────────────────────────────────────────────
    def stamp_new(self, entity: E) -> E:
        now = utcnow()
        entity.created_at = now
        entity.updated_at = now
        entity.created_by = self.ctx.user_id
        entity.updated_by = self.ctx.user_id
        entity.version = 1
        if isinstance(entity, CompanyEntity) and not entity.company_id:
            entity.company_id = self.ctx.company_id
        self.session.add(entity)
        return entity

    def stamp_update(self, entity: E, *, expected_version: int | None) -> E:
        if expected_version is not None and entity.version != expected_version:
            raise ConcurrentModificationError(
                f"{self.model.__name__} was modified by another user.",
                extra={"current_version": entity.version, "your_version": expected_version},
            )
        entity.version += 1
        entity.updated_at = utcnow()
        entity.updated_by = self.ctx.user_id
        return entity

    def soft_delete(self, entity: E, *, expected_version: int | None = None) -> E:
        if expected_version is not None and entity.version != expected_version:
            raise ConcurrentModificationError(
                f"{self.model.__name__} was modified by another user.",
                extra={"current_version": entity.version, "your_version": expected_version},
            )
        entity.deleted_at = utcnow()
        entity.deleted_by = self.ctx.user_id
        entity.version += 1
        entity.updated_at = utcnow()
        entity.updated_by = self.ctx.user_id
        return entity

    def restore(self, entity: E) -> E:
        entity.deleted_at = None
        entity.deleted_by = None
        entity.version += 1
        entity.updated_at = utcnow()
        entity.updated_by = self.ctx.user_id
        return entity

    async def flush(self) -> None:
        await self.session.flush()


def resolve_write_company(ctx: TenantContext) -> int:
    """The single company a write lands in — the active company in context."""
    return ctx.company_id


def assert_in_write_scope(ctx: TenantContext, company_id: int) -> None:
    """A caller may only create/reference rows inside a company they hold."""
    from app.core.errors import ForbiddenError

    if not ctx.in_company_scope(company_id):
        raise ForbiddenError(
            "Cannot operate on data belonging to another company.",
            rule_code="V0-BR-008",
        )
