"""SQLAlchemy declarative base and the standard-column mixins (CLAUDE.md §4.1).

Every business table carries the same audit, versioning and soft-delete columns.
They are provided here as mixins so a model declares only its own fields:

    class SysBranch(CompanyEntity):
        __tablename__ = "sys_branch"
        code: Mapped[str] = mapped_column(String(20))
        ...

`deleted_key` is a MySQL *generated* column (`IFNULL(deleted_at, sentinel)`) so a
unique business key can include it and still treat two live rows with the same
code — but different delete times — as distinct (CLAUDE.md §4.2).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Computed, String
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, INTEGER
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import SOFT_DELETE_SENTINEL
from app.core.ids import new_uid


def big_uint(**kw: object) -> Mapped[int]:
    return mapped_column(BIGINT(unsigned=True), **kw)  # type: ignore[arg-type]


class Base(DeclarativeBase):
    """Root declarative base. `metadata` here is what Alembic autogenerates from."""


class Entity(Base):
    """Standard columns shared by every table, minus tenant scope.

    Global masters (e.g. currency) inherit from this directly; company-scoped
    tables inherit from :class:`CompanyEntity`.
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)

    version: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=1)

    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    created_by: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    updated_by: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)

    deleted_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    deleted_by: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    # Generated companion column so unique keys can include it (CLAUDE.md §4.2).
    # Declared nullable for DDL portability (MariaDB rejects `STORED NOT NULL`);
    # the IFNULL expression always yields the sentinel, so it is never actually
    # NULL and the soft-delete-aware unique keys behave identically.
    deleted_key: Mapped[datetime | None] = mapped_column(
        DATETIME(fsp=6),
        Computed(f"IFNULL(deleted_at, '{SOFT_DELETE_SENTINEL}')", persisted=True),
        nullable=True,
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class CompanyEntity(Entity):
    """A tenant-scoped table. `company_id` is mandatory and always filtered."""

    __abstract__ = True

    company_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, index=True)
    branch_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True, index=True)
