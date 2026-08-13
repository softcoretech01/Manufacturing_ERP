"""segregation-of-duties rules

Revision ID: 0004_sod_rules
Revises: 0003_api_keys
Create Date: 2026-08-12

Adds `sys_sod_rule`: a conflicting permission pair that no single user should hold.
Created from the SQLAlchemy metadata (same approach as 0001-0003).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.iam.infrastructure.models import SysSodRule

revision: str = "0004_sod_rules"
down_revision: str | None = "0003_api_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[SysSodRule.__table__])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[SysSodRule.__table__])
