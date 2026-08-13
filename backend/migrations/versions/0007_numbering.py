"""document numbering engine

Revision ID: 0007_numbering
Revises: 0006_workflow_engine
Create Date: 2026-08-12

Adds `core_number_series` + `core_number_allocation` (SRS V1-NUM §3).
Created from the SQLAlchemy metadata (same approach as 0001-0006).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.numbering.infrastructure.models import (
    CoreNumberAllocation,
    CoreNumberSeries,
)

revision: str = "0007_numbering"
down_revision: str | None = "0006_workflow_engine"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [CoreNumberSeries.__table__, CoreNumberAllocation.__table__]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(_TABLES)))
