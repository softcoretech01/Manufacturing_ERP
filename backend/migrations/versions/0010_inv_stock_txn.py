"""Inventory transaction document migration (Phase 1).

Revision ID: 0010_inv_stock_txn
Revises: 0009_stock_count
Create Date: 2026-08-31

Creates:
  - inv_stock_txn        Document header for Stock Out / Return / Transfer
  - inv_stock_txn_line   Line items within a transaction document
  - inv_batch_master     Batch expiry / manufacture date metadata

These tables are ADDITIVE — no existing table is altered.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.core.base import Base
from app.modules.inventory.infrastructure.txn_models import (
    InvBatchMaster,
    InvStockTxn,
    InvStockTxnLine,
)

revision: str = "0010_inv_stock_txn"
down_revision: str | None = "0009_stock_count"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [InvStockTxn.__table__, InvStockTxnLine.__table__, InvBatchMaster.__table__]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(_TABLES)))
