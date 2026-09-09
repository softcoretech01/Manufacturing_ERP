"""MRP run persistence (Planning Phase 1).

Creates:
  - pp_mrp_run            one row per MRP run: parameters, who, when, the stats
  - pp_mrp_plan_line      the time-phased grid, one row per item per bucket
  - pp_mrp_planned_order  what the run proposes to buy or make
  - pp_mrp_exception      what a planner has to decide about

Purely additive — no existing table is altered. Before this, an MRP run existed
only in a browser tab and died on refresh.

Revision ID: 0011_pp_mrp_run
Revises: 0010_inv_stock_txn
Create Date: 2026-09-08
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.core.base import Base
from app.modules.planning.infrastructure.mrp_models import (
    PpMrpException,
    PpMrpPlanLine,
    PpMrpPlannedOrder,
    PpMrpRun,
)

revision: str = "0011_pp_mrp_run"
down_revision: str | None = "0010_inv_stock_txn"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [
    PpMrpRun.__table__,
    PpMrpPlanLine.__table__,
    PpMrpPlannedOrder.__table__,
    PpMrpException.__table__,
]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(_TABLES)))
