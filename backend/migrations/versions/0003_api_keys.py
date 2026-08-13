"""api keys — machine credentials for integrations

Revision ID: 0003_api_keys
Revises: 0002_inventory_storage
Create Date: 2026-08-12

Adds `sys_api_key`: an issue-once secret (only its SHA-256 hash is stored), scoped
to a role, with expiry and revocation. Created from the SQLAlchemy metadata so the
DDL matches the model exactly (same approach as 0001/0002).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.iam.infrastructure.models import SysApiKey

revision: str = "0003_api_keys"
down_revision: str | None = "0002_inventory_storage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[SysApiKey.__table__])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[SysApiKey.__table__])
