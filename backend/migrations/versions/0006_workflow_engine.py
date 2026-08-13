"""workflow & approval engine

Revision ID: 0006_workflow_engine
Revises: 0005_delegations
Create Date: 2026-08-12

Adds the approval matrix (core_approval_rule + core_approval_rule_level) and the
runtime tables (core_workflow_instance, core_workflow_task, core_workflow_history).
Created from the SQLAlchemy metadata (same approach as 0001-0005).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.workflow.infrastructure.models import (
    CoreApprovalRule,
    CoreApprovalRuleLevel,
    CoreWorkflowHistory,
    CoreWorkflowInstance,
    CoreWorkflowTask,
)

revision: str = "0006_workflow_engine"
down_revision: str | None = "0005_delegations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [
    CoreApprovalRule.__table__,
    CoreApprovalRuleLevel.__table__,
    CoreWorkflowInstance.__table__,
    CoreWorkflowTask.__table__,
    CoreWorkflowHistory.__table__,
]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(_TABLES)))
