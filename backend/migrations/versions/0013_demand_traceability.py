"""Trace a plan back to the demand that caused it.

Make-to-order planning needs one question answered at every step: *which
customer demand is this for?* Today the chain breaks in two places.

`pp_mps` records what will be built in a week but not what it was built for, so
a schedule cannot be shown next to the order it serves. And while
`pp_mrp_planned_order.pegged_to` carries a peg, the BOM explosion overwrites it
at the first level — a component's peg reads "FG-SS-750-BLK order wk 3", naming
the parent item rather than the demand document at the root of the tree. So a
purchase proposal for steel coil cannot be traced to the order that needs it.

This adds an explicit root-demand column at each step, plus a scope column on
the run header so a run made for a single demand is distinguishable from an
aggregate one. `pegged_to` is left exactly as it is — it answers a different and
still useful question (which *parent order* consumes this), and losing it would
cost the multi-level picture.

Purely additive: three nullable columns and three indexes. No existing column is
altered, no row is rewritten, and every existing row stays valid with NULL
meaning "aggregate plan, no single demand".

Revision ID: 0013_demand_traceability
Revises: 0012_reserved_qty
Create Date: 2026-09-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_demand_traceability"
down_revision: str | None = "0012_reserved_qty"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── The schedule remembers what it schedules for ────────────────────────
    op.add_column(
        "pp_mps",
        sa.Column(
            "demand_doc_no",
            sa.String(40),
            nullable=True,
            comment="Demand document this bucket was scheduled for. NULL for an "
            "aggregate schedule not tied to one order.",
        ),
    )
    op.create_index("ix_pp_mps_demand", "pp_mps", ["company_id", "demand_doc_no"])

    # ── The run remembers its scope ─────────────────────────────────────────
    op.add_column(
        "pp_mrp_run",
        sa.Column(
            "demand_doc_no",
            sa.String(40),
            nullable=True,
            comment="Set when the run was scoped to a single demand document. "
            "NULL for a full aggregate run across all demand.",
        ),
    )
    op.create_index(
        "ix_mrp_run_demand", "pp_mrp_run", ["company_id", "demand_doc_no"]
    )

    # ── Every proposal remembers the demand at the root of its tree ─────────
    op.add_column(
        "pp_mrp_planned_order",
        sa.Column(
            "demand_doc_no",
            sa.String(200),
            nullable=False,
            server_default="",
            comment="Comma-separated demand documents at the root of this "
            "proposal's requirement, carried down through every BOM level. "
            "Empty when the requirement came from a source with no demand "
            "document, such as a safety-stock top-up.",
        ),
    )
    op.create_index(
        "ix_mrp_po_demand", "pp_mrp_planned_order", ["run_id", "demand_doc_no"]
    )


def downgrade() -> None:
    op.drop_index("ix_mrp_po_demand", table_name="pp_mrp_planned_order")
    op.drop_column("pp_mrp_planned_order", "demand_doc_no")
    op.drop_index("ix_mrp_run_demand", table_name="pp_mrp_run")
    op.drop_column("pp_mrp_run", "demand_doc_no")
    op.drop_index("ix_pp_mps_demand", table_name="pp_mps")
    op.drop_column("pp_mps", "demand_doc_no")
