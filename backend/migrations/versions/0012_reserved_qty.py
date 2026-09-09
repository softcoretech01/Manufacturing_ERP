"""Reserved quantity on the stock balance.

Adds `inv_stock_balance.reserved_qty` — stock committed to a production order but
not yet issued. Until now a reservation could only be recorded on the order line
(`pp_prod_order_component.reserved_qty`), so Inventory had no idea any of its
stock was spoken for and the Current Stock screen showed quarantined and blocked
material under a "Reserved" heading, which is a different thing entirely.

Also adds the four indexes the Inventory rebuild identified as missing. All
purely additive — no existing column is altered and no row is rewritten.

Revision ID: 0012_reserved_qty
Revises: 0011_pp_mrp_run
Create Date: 2026-09-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_reserved_qty"
down_revision: str | None = "0011_pp_mrp_run"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inv_stock_balance",
        sa.Column(
            "reserved_qty",
            sa.DECIMAL(18, 6),
            nullable=False,
            server_default="0",
        ),
    )
    # Ledger queries filter on these constantly and had no index for any of them.
    op.create_index("ix_ledger_batch", "inv_stock_ledger", ["batch_no"])
    op.create_index("ix_ledger_movement_type", "inv_stock_ledger", ["movement_type"])
    op.create_index(
        "ix_ledger_business_date", "inv_stock_ledger", ["company_id", "business_date"]
    )
    op.create_index("ix_balance_batch", "inv_stock_balance", ["batch_no"])


def downgrade() -> None:
    op.drop_index("ix_balance_batch", table_name="inv_stock_balance")
    op.drop_index("ix_ledger_business_date", table_name="inv_stock_ledger")
    op.drop_index("ix_ledger_movement_type", table_name="inv_stock_ledger")
    op.drop_index("ix_ledger_batch", table_name="inv_stock_ledger")
    op.drop_column("inv_stock_balance", "reserved_qty")
