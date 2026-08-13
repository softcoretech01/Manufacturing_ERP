"""Workflow & approval engine endpoints. Every endpoint declares its permission
(CLAUDE.md §5.4); inbox/decide are gated on authentication and enforce per-task
assignment at the data level (V1-WFL §4.9).

Routers do not manage transactions — `get_session` commits on success
(V0-NFR-003)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.context import TenantContext
from app.core.deps import ContextDep, SessionDep, require
from app.modules.workflow.api import schemas as s
from app.modules.workflow.application.constants import DOCUMENT_TYPES, REJECT_REASON_CODES
from app.modules.workflow.application.engine import WorkflowService
from app.modules.workflow.application.rule_service import ApprovalRuleService

router = APIRouter(tags=["Workflow"])


def _rule_out(entry: dict[str, Any]) -> s.RuleOut:
    r = entry["rule"]
    roles: dict[int, tuple[str, str]] = entry.get("roles", {})
    return s.RuleOut(
        uid=r.uid,
        document_type=r.document_type,
        sub_type=r.sub_type,
        name=r.name,
        condition_type=r.condition_type,
        min_amount=float(r.min_amount) if r.min_amount is not None else None,
        max_amount=float(r.max_amount) if r.max_amount is not None else None,
        currency_code=r.currency_code,
        condition_expr=r.condition_expr,
        priority=r.priority,
        auto_approve_below=(
            float(r.auto_approve_below) if r.auto_approve_below is not None else None
        ),
        restart_on_change=r.restart_on_change,
        material_change_fields=r.material_change_fields,
        is_active=r.is_active,
        version=r.version,
        levels=[
            s.RuleLevelOut(
                level_no=lv.level_no,
                level_name=lv.level_name,
                approver_type=lv.approver_type,
                approver_role_uid=(roles.get(lv.approver_role_id) or (None, None))[0]
                if lv.approver_role_id
                else None,
                approver_role_code=(roles.get(lv.approver_role_id) or (None, None))[1]
                if lv.approver_role_id
                else None,
                approval_mode=lv.approval_mode,
                quorum_count=lv.quorum_count,
                is_parallel_with_previous=lv.is_parallel_with_previous,
                sla_hours=float(lv.sla_hours) if lv.sla_hours is not None else None,
                escalation_action=lv.escalation_action,
            )
            for lv in entry["levels"]
        ],
    )


def _inbox_out(row: dict[str, Any], on_behalf_name: str | None = None) -> s.InboxTaskOut:
    t, i = row["task"], row["instance"]
    return s.InboxTaskOut(
        task_uid=t.uid,
        instance_uid=i.uid,
        document_no=i.document_no,
        document_label=i.document_label,
        document_type=i.entity_type,
        subject=i.subject,
        requester=i.requester_name,
        department=i.department,
        amount=float(i.document_amount) if i.document_amount is not None else None,
        currency=i.currency_code,
        level_no=t.level_no,
        level_name=t.level_name,
        total_levels=i.total_levels,
        assigned_at=t.assigned_at,
        due_at=t.due_at,
        status=t.status,
        on_behalf_of=on_behalf_name,
        overdue=row["overdue"],
    )


def _instance_out(inst: Any, cur: Any = None, overdue: bool = False) -> s.InstanceOut:
    return s.InstanceOut(
        uid=inst.uid,
        entity_type=inst.entity_type,
        document_type=inst.entity_type,
        document_no=inst.document_no,
        document_label=inst.document_label,
        subject=inst.subject,
        amount=float(inst.document_amount) if inst.document_amount is not None else None,
        currency=inst.currency_code,
        status=inst.status,
        current_level=inst.current_level,
        current_level_name=cur.level_name if cur else None,
        current_task_uid=cur.uid if cur else None,
        total_levels=inst.total_levels,
        requester=inst.requester_name,
        department=inst.department,
        initiated_at=inst.initiated_at,
        completed_at=inst.completed_at,
        due_at=cur.due_at if cur else None,
        overdue=overdue,
    )


# ═══════════════════════════ Approval matrix ════════════════════════════════
@router.get("/approval-rules/document-types")
async def rule_document_types(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.VIEW")),
) -> list[dict[str, str]]:
    return [{"code": c, "label": lbl} for c, lbl in DOCUMENT_TYPES.items()]


@router.get("/approval-rules/reason-codes")
async def rule_reason_codes(ctx: ContextDep) -> list[dict[str, str]]:
    return REJECT_REASON_CODES


@router.get("/approval-rules/coverage")
async def rule_coverage(
    document_type: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.VIEW")),
) -> dict[str, Any]:
    return await ApprovalRuleService(session, ctx).coverage(document_type)


@router.get("/approval-rules", response_model=list[s.RuleOut])
async def list_rules(
    session: SessionDep,
    document_type: str | None = None,
    active_only: bool = False,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.VIEW")),
):
    entries = await ApprovalRuleService(session, ctx).list_rules(
        document_type=document_type, active_only=active_only
    )
    return [_rule_out(e) for e in entries]


@router.post("/approval-rules", response_model=s.RuleOut, status_code=201)
async def create_rule(
    body: s.RuleCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.EDIT")),
):
    svc = ApprovalRuleService(session, ctx)
    rule = await svc.create(body.model_dump())
    return _rule_out(await svc.get_detail(rule.uid))


@router.get("/approval-rules/{uid}", response_model=s.RuleOut)
async def get_rule(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.VIEW")),
):
    return _rule_out(await ApprovalRuleService(session, ctx).get_detail(uid))


@router.patch("/approval-rules/{uid}", response_model=s.RuleOut)
async def update_rule(
    uid: str,
    body: s.RuleUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.EDIT")),
):
    svc = ApprovalRuleService(session, ctx)
    data = body.model_dump()
    version = data.pop("version")
    await svc.update(uid, data, expected_version=version)
    return _rule_out(await svc.get_detail(uid))


@router.post("/approval-rules/{uid}/deactivate", response_model=s.RuleOut)
async def deactivate_rule(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.EDIT")),
):
    svc = ApprovalRuleService(session, ctx)
    await svc.set_active(uid, False)
    return _rule_out(await svc.get_detail(uid))


@router.post("/approval-rules/{uid}/restore", response_model=s.RuleOut)
async def restore_rule(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.EDIT")),
):
    svc = ApprovalRuleService(session, ctx)
    await svc.set_active(uid, True)
    return _rule_out(await svc.get_detail(uid))


@router.post("/approval-rules/simulate")
async def simulate_rule(
    body: s.SimulateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.APPROVAL_MATRIX.VIEW")),
) -> dict[str, Any]:
    attrs: dict[str, Any] = {
        "urgent": body.urgent,
        "priority": "URGENT" if body.urgent else "NORMAL",
    }
    if body.item_category:
        attrs["item_category"] = body.item_category
    if body.po_type:
        attrs["po_type"] = body.po_type
    if body.sub_type:
        attrs["sub_type"] = body.sub_type
    return await ApprovalRuleService(session, ctx).simulate(
        document_type=body.document_type, amount=body.amount, attrs=attrs
    )


# ═══════════════════════════ Approvals inbox ════════════════════════════════
@router.get("/approvals/inbox", response_model=list[s.InboxTaskOut])
async def approvals_inbox(session: SessionDep, ctx: ContextDep, include_done: bool = False):
    svc = WorkflowService(session, ctx)
    rows = await svc.inbox(include_done=include_done)
    out = []
    for r in rows:
        obo = await svc._user_name(r["task"].on_behalf_of_user_id)
        out.append(_inbox_out(r, obo))
    return out


@router.get("/approvals/inbox/count")
async def approvals_inbox_count(session: SessionDep, ctx: ContextDep) -> dict[str, int]:
    return {"count": await WorkflowService(session, ctx).inbox_count()}


@router.post("/approvals/tasks/{uid}/decide", response_model=s.InstanceOut)
async def decide_task(uid: str, body: s.DecideRequest, session: SessionDep, ctx: ContextDep):
    inst = await WorkflowService(session, ctx).decide(
        task_uid=uid, action=body.action, comments=body.comments, reason_code=body.reason_code
    )
    return _instance_out(inst)


@router.post("/approvals/tasks/{uid}/reassign", response_model=s.InstanceOut)
async def reassign_task(uid: str, body: s.ReassignRequest, session: SessionDep, ctx: ContextDep):
    svc = WorkflowService(session, ctx)
    new_task = await svc.reassign(task_uid=uid, to_user_uid=body.to_user_uid, reason=body.reason)
    inst = await svc._instance(new_task.workflow_instance_id)
    return _instance_out(inst, new_task)


# ═══════════════════════════ Workflow monitor ═══════════════════════════════
@router.get("/workflow-instances", response_model=list[s.InstanceOut])
async def list_instances(
    session: SessionDep,
    status: str | None = Query(default=None),
    overdue: bool | None = Query(default=None),
    ctx: TenantContext = Depends(require("SYSTEM.WORKFLOW.VIEW")),
):
    rows = await WorkflowService(session, ctx).instances(status=status, overdue=overdue)
    return [
        _instance_out(r["instance"], r.get("current_task"), r.get("overdue", False))
        for r in rows
    ]


@router.get("/workflow-instances/{uid}")
async def instance_detail(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.WORKFLOW.VIEW")),
) -> dict[str, Any]:
    svc = WorkflowService(session, ctx)
    d = await svc.instance_detail(uid)
    i = d["instance"]
    return {
        "instance": _instance_out(i).model_dump(),
        "tasks": [
            {
                "uid": t.uid,
                "level_no": t.level_no,
                "level_name": t.level_name,
                "assignee": await svc._user_name(t.assigned_to_user_id),
                "on_behalf_of": await svc._user_name(t.on_behalf_of_user_id),
                "status": t.status,
                "assigned_at": t.assigned_at,
                "due_at": t.due_at,
                "acted_at": t.acted_at,
                "comments": t.comments,
                "reason_code": t.reason_code,
            }
            for t in d["tasks"]
        ],
        "history": [
            s.HistoryEventOut(
                sequence_no=h.sequence_no,
                event_type=h.event_type,
                from_status=h.from_status,
                to_status=h.to_status,
                level_no=h.level_no,
                level_name=h.level_name,
                user_name=h.user_name,
                comments=h.comments,
                created_at=h.created_at,
            ).model_dump()
            for h in d["history"]
        ],
    }


@router.post("/workflow-instances/{uid}/recall", response_model=s.InstanceOut)
async def recall_instance(uid: str, session: SessionDep, ctx: ContextDep):
    inst = await WorkflowService(session, ctx).recall(uid)
    return _instance_out(inst)


@router.post("/workflow-instances/{uid}/admin-reassign", response_model=s.InstanceOut)
async def admin_reassign(
    uid: str,
    body: s.AdminReassignRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.WORKFLOW.VIEW")),
):
    svc = WorkflowService(session, ctx)
    new_task = await svc.reassign(
        task_uid=body.task_uid, to_user_uid=body.to_user_uid, reason=body.reason, admin=True
    )
    inst = await svc._instance(new_task.workflow_instance_id)
    return _instance_out(inst, new_task)
