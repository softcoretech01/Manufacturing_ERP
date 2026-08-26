"""System parameters — company-scoped, typed configuration values grouped by
area (Workflow, Inventory, Finance, …). A generic key/value master so behaviour
is configurable without code changes (CLAUDE.md §5.1)."""

from __future__ import annotations

from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.dialects.mysql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import CompanyEntity


class SysParameter(CompanyEntity):
    __tablename__ = "sys_parameter"
    __table_args__ = (
        UniqueConstraint("company_id", "param_key", "deleted_key", name="uk_parameter_key"),
    )

    param_key: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    param_group: Mapped[str] = mapped_column(String(50), nullable=False, default="General")
    # value_type: STRING | NUMBER | BOOLEAN | JSON
    value_type: Mapped[str] = mapped_column(String(20), nullable=False, default="STRING")
    value: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    default_value: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # scope: COMPANY | INSTALLATION
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="COMPANY")
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)  # enum choices, if any
