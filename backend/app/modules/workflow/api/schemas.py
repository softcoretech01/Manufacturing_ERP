from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.schema import ApiModel, InModel


# ─────────────────────────── Approval matrix ────────────────────────────────
class RuleLevelIn(InModel):
    level_no: int = Field(..., ge=1, le=20)
    level_name: str | None = Field(default=None, max_length=100)
    approver_type: str = Field(default="ROLE")
    approver_role_uid: str | None = Field(default=None, max_length=26)
    approver_user_uid: str | None = Field(default=None, max_length=26)
    approver_expr: str | None = Field(default=None, max_length=500)
    approval_mode: str = Field(default="ANY_ONE")
    quorum_count: int | None = Field(default=None, ge=1, le=50)
    is_parallel_with_previous: bool = False
    sla_hours: float | None = Field(default=None, ge=0)
    escalation_action: str = Field(default="NOTIFY_ONLY")


class RuleLevelOut(ApiModel):
    level_no: int
    level_name: str | None
    approver_type: str
    approver_role_uid: str | None
    approver_role_code: str | None
    approval_mode: str
    quorum_count: int | None
    is_parallel_with_previous: bool
    sla_hours: float | None
    escalation_action: str


class RuleCreate(InModel):
    document_type: str = Field(..., min_length=1, max_length=50)
    sub_type: str | None = Field(default=None, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    scope_branch_id: int | None = None
    plant_id: int | None = None
    department_id: int | None = None
    cost_centre_id: int | None = None
    condition_type: str = Field(default="AMOUNT_BAND")
    min_amount: float | None = Field(default=None, ge=0)
    max_amount: float | None = Field(default=None, ge=0)
    currency_code: str = Field(default="INR", max_length=3)
    condition_expr: str | None = Field(default=None, max_length=1000)
    priority: int = Field(default=100, ge=1, le=9999)
    auto_approve_below: float | None = Field(default=None, ge=0)
    restart_on_change: bool = True
    material_change_fields: list[str] | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    levels: list[RuleLevelIn] = Field(default_factory=list)


class RuleUpdate(RuleCreate):
    version: int = Field(..., ge=1)


class RuleOut(ApiModel):
    uid: str
    document_type: str
    sub_type: str | None
    name: str
    condition_type: str
    min_amount: float | None
    max_amount: float | None
    currency_code: str
    condition_expr: str | None
    priority: int
    auto_approve_below: float | None
    restart_on_change: bool
    material_change_fields: list[str] | None
    is_active: bool
    version: int
    levels: list[RuleLevelOut] = Field(default_factory=list)


class SimulateRequest(InModel):
    document_type: str
    amount: float | None = None
    urgent: bool = False
    item_category: str | None = None
    po_type: str | None = None
    sub_type: str | None = None


class SimulateLevelOut(ApiModel):
    level_no: int
    level_name: str | None
    approver_type: str
    approver_label: str
    approval_mode: str
    sla_hours: float | None
    is_parallel_with_previous: bool
    resolved_user_count: int
    unresolved_reason: str | None


# ─────────────────────────── Inbox / instances ──────────────────────────────
class InboxTaskOut(ApiModel):
    task_uid: str
    instance_uid: str
    document_no: str | None
    document_label: str | None
    document_type: str
    subject: str | None
    requester: str | None
    department: str | None
    amount: float | None
    currency: str | None
    level_no: int
    level_name: str | None
    total_levels: int
    assigned_at: datetime
    due_at: datetime | None
    status: str
    on_behalf_of: str | None
    overdue: bool


class DecideRequest(InModel):
    action: str = Field(..., pattern="^(APPROVE|REJECT|RETURN|approve|reject|return)$")
    comments: str | None = Field(default=None, max_length=2000)
    reason_code: str | None = Field(default=None, max_length=50)


class ReassignRequest(InModel):
    to_user_uid: str = Field(..., min_length=1, max_length=26)
    reason: str = Field(..., min_length=1, max_length=500)


class AdminReassignRequest(ReassignRequest):
    task_uid: str = Field(..., min_length=1, max_length=26)


class InstanceOut(ApiModel):
    uid: str
    entity_type: str
    document_type: str
    document_no: str | None
    document_label: str | None
    subject: str | None
    amount: float | None
    currency: str | None
    status: str
    current_level: int | None
    current_level_name: str | None
    current_task_uid: str | None
    total_levels: int
    requester: str | None
    department: str | None
    initiated_at: datetime
    completed_at: datetime | None
    due_at: datetime | None
    overdue: bool


class HistoryEventOut(ApiModel):
    sequence_no: int
    event_type: str
    from_status: str | None
    to_status: str | None
    level_no: int | None
    level_name: str | None
    user_name: str | None
    comments: str | None
    created_at: datetime
