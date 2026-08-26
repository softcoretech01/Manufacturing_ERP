"""item master + stock model (balance + ledger)

Revision ID: 0008_item_and_stock
Revises: 0007_numbering
Create Date: 2026-08-13

Adds `mst_item` (item master) and the stock foundation `inv_stock_balance` +
`inv_stock_ledger` (SRS Vol 4 Ch 2). Created from the SQLAlchemy metadata
(same approach as 0001-0007).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.inventory.infrastructure.models import InvStockBalance, InvStockLedger
from app.modules.masters.infrastructure.models import MstItem

revision: str = "0008_item_and_stock"
down_revision: str | None = "0007_numbering"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [MstItem.__table__, InvStockBalance.__table__, InvStockLedger.__table__]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(_TABLES)))
