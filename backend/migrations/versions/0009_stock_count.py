"""physical inventory — stock count

Revision ID: 0009_stock_count
Revises: 0008_item_and_stock
Create Date: 2026-08-13

Adds `inv_stock_count` + `inv_stock_count_line` (SRS Vol 4 Ch 8).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.inventory.infrastructure.models import InvStockCount, InvStockCountLine

revision: str = "0009_stock_count"
down_revision: str | None = "0008_item_and_stock"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [InvStockCount.__table__, InvStockCountLine.__table__]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(_TABLES)))
