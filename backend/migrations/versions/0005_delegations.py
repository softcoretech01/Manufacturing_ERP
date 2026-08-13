"""delegation of approval authority

Revision ID: 0005_delegations
Revises: 0004_sod_rules
Create Date: 2026-08-12

Adds `sys_delegation`: a user delegating approval authority to another for a date
range. Created from the SQLAlchemy metadata (same approach as 0001-0004).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.iam.infrastructure.models import SysDelegation

revision: str = "0005_delegations"
down_revision: str | None = "0004_sod_rules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[SysDelegation.__table__])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[SysDelegation.__table__])
