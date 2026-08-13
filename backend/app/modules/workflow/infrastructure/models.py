"""Workflow & approval-engine persistence (SRS V1-WFL §4.7).

Five tables: the two configuration tables (`core_approval_rule` +
`core_approval_rule_level`) and the three runtime tables (`core_workflow_instance`,
`core_workflow_task`, `core_workflow_history`). History is append-only.

Designer tables (`core_workflow`, `core_workflow_node_state`) and `core_out_of_office`
are intentionally omitted — the visual designer is deferred to a later slice.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, DECIMAL, INTEGER, JSON, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, CompanyEntity
from app.core.enums import (
    ApprovalMode,
    ConditionType,
    EscalationAction,
    WorkflowInstanceStatus,
    WorkflowTaskStatus,
)
from app.core.ids import new_uid


# ─────────────────────── Configuration: approval matrix ──────────────────────
class CoreApprovalRule(CompanyEntity):
    """One rule for a document type, scoped optionally to branch/plant/dept/CC and
    gated by a condition (amount band, expression, or always). Ordered levels hang
    off it. Most-specific-first, ties broken by `priority` (lower first)."""

    __tablename__ = "core_approval_rule"
    __table_args__ = (
        Index(
            "ix_rule_lookup",
            "company_id",
            "document_type",
            "sub_type",
            "is_active",
            "priority",
        ),
    )

    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    sub_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    # scope — all NULL means "applies to every branch/plant/dept/cost centre"
    scope_branch_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    plant_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    department_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    cost_centre_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    condition_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default=ConditionType.AMOUNT_BAND.value
    )
    min_amount: Mapped[float | None] = mapped_column(DECIMAL(18, 2), nullable=True)
    max_amount: Mapped[float | None] = mapped_column(DECIMAL(18, 2), nullable=True)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    condition_expr: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    priority: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=100)
    auto_approve_below: Mapped[float | None] = mapped_column(DECIMAL(18, 2), nullable=True)
    restart_on_change: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    material_change_fields: Mapped[list | None] = mapped_column(JSON, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)


class CoreApprovalRuleLevel(CompanyEntity):
    """One ordered level of an approval rule: who approves, in what mode, the SLA
    and what happens on breach. `is_parallel_with_previous` groups a level to run
    alongside the one before it (V1-WFL-FR-004)."""

    __tablename__ = "core_approval_rule_level"
    __table_args__ = (
        UniqueConstraint(
            "approval_rule_id", "level_no", "deleted_key", name="uk_rule_level"
        ),
    )

    approval_rule_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), nullable=False, index=True
    )
    level_no: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False)
    level_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    approver_type: Mapped[str] = mapped_column(String(30), nullable=False)
    approver_role_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    approver_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    approver_expr: Mapped[str | None] = mapped_column(String(500), nullable=True)

    approval_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ApprovalMode.ANY_ONE.value
    )
    quorum_count: Mapped[int | None] = mapped_column(TINYINT(unsigned=True), nullable=True)
    is_parallel_with_previous: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    skip_condition_expr: Mapped[str | None] = mapped_column(String(500), nullable=True)

    sla_hours: Mapped[float | None] = mapped_column(DECIMAL(8, 2), nullable=True)
    reminder_pct: Mapped[list | None] = mapped_column(JSON, nullable=True)
    escalation_action: Mapped[str] = mapped_column(
        String(30), nullable=False, default=EscalationAction.NOTIFY_ONLY.value
    )
    escalation_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    escalation_role_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    can_edit_document: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    editable_fields: Mapped[list | None] = mapped_column(JSON, nullable=True)


# ─────────────────────────── Runtime: instances ─────────────────────────────
class CoreWorkflowInstance(CompanyEntity):
    """One approval run over one document version. Generic over `entity_type` so
    the engine never imports a module (V1-WFL-BR-014)."""

    __tablename__ = "core_workflow_instance"
    __table_args__ = (
        Index("ix_wfi_entity", "company_id", "entity_type", "entity_id"),
        Index("ix_wfi_status", "company_id", "status", "initiated_at"),
    )

    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    entity_uid: Mapped[str] = mapped_column(String(26), nullable=False)
    document_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    document_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    document_version: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=1)
    document_amount: Mapped[float | None] = mapped_column(DECIMAL(18, 2), nullable=True)
    currency_code: Mapped[str | None] = mapped_column(String(3), nullable=True)

    approval_rule_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    status: Mapped[str] = mapped_column(
        String(25), nullable=False, default=WorkflowInstanceStatus.IN_PROGRESS.value
    )
    current_level: Mapped[int | None] = mapped_column(TINYINT(unsigned=True), nullable=True)
    total_levels: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=1)

    requester_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    initiated_by: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    initiated_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)

    total_sla_hours: Mapped[float | None] = mapped_column(DECIMAL(10, 2), nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(DECIMAL(10, 2), nullable=True)
    is_overdue: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class CoreWorkflowTask(CompanyEntity):
    """A single approver's task at one level of an instance. `on_behalf_of_user_id`
    records a delegation redirect (V1-WFL-FR-016)."""

    __tablename__ = "core_workflow_task"
    __table_args__ = (
        Index("ix_task_inbox", "company_id", "assigned_to_user_id", "status", "due_at"),
        Index("ix_task_instance", "workflow_instance_id", "level_no"),
    )

    workflow_instance_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    level_no: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False)
    level_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    assigned_to_user_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    assigned_role_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    on_behalf_of_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    delegation_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    approval_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(25), nullable=False, default=WorkflowTaskStatus.PENDING.value
    )

    assigned_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    first_viewed_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)
    acted_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)

    action: Mapped[str | None] = mapped_column(String(30), nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    reassigned_to_user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    reassign_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reminder_count: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, default=0)
    escalated_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6), nullable=True)


class CoreWorkflowHistory(Base):
    """Append-only narrative of everything that happened to an instance. No
    UPDATE, no DELETE — matches the audit-log discipline (CLAUDE.md §5.3)."""

    __tablename__ = "core_workflow_history"
    __table_args__ = (Index("ix_wfh", "workflow_instance_id", "sequence_no"),)

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(26), nullable=False, unique=True, default=new_uid)
    company_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True, index=True)
    workflow_instance_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False)
    task_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)

    sequence_no: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(25), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(25), nullable=True)
    level_no: Mapped[int | None] = mapped_column(TINYINT(unsigned=True), nullable=True)
    level_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True), nullable=True)
    user_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), nullable=False)
