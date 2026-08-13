"""The approval engine: submit a document, assign approvers, record decisions.

Generic over ``entity_type`` — it never imports a document module. Post-approval
side effects are the module's job, triggered by subscribing to
``workflow.approval.completed`` (V1-WFL-BR-014). This class is what every other
module will call to make a document approvable.

Scope of this slice: sequential + parallel levels with ANY_ONE / ALL / QUORUM_N
modes; approve, reject, return, reassign, recall; delegation applied at assignment
(V1-WFL-FR-016); fail-closed (BR-001), self-approval blocked (BR-002), decisions
immutable (BR-007), reject reason mandatory (BR-005). Deferred and flagged:
working-hours SLA (needs the plant calendar master), escalation jobs, quorum on
parallel org-role levels.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.context import TenantContext
from app.core.enums import (
    ApprovalMode,
    AuditAction,
    WorkflowEventType,
    WorkflowInstanceStatus,
    WorkflowTaskStatus,
)
from app.core.errors import (
    ForbiddenError,
    InvalidStateTransitionError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.outbox import emit_event
from app.core.time import utcnow
from app.modules.iam.infrastructure.models import SysUser
from app.modules.workflow.application import resolver
from app.modules.workflow.application.constants import is_valid_reason
from app.modules.workflow.application.rule_service import ApprovalRuleService
from app.modules.workflow.infrastructure.models import (
    CoreApprovalRuleLevel,
    CoreWorkflowHistory,
    CoreWorkflowInstance,
    CoreWorkflowTask,
)

_INST = "core_workflow_instance"
_APPROVED = {WorkflowTaskStatus.APPROVED.value, WorkflowTaskStatus.AUTO_APPROVED.value}


def _f(v: Any) -> float | None:
    return None if v is None else float(v)


class WorkflowService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.rules = ApprovalRuleService(session, ctx)

    # ─── helpers ─────────────────────────────────────────────────────────────
    async def _user_name(self, user_id: int | None) -> str | None:
        if not user_id:
            return None
        return (
            await self.session.execute(select(SysUser.full_name).where(SysUser.id == user_id))
        ).scalar_one_or_none()

    async def _next_seq(self, instance_id: int) -> int:
        n = (
            await self.session.execute(
                select(func.max(CoreWorkflowHistory.sequence_no)).where(
                    CoreWorkflowHistory.workflow_instance_id == instance_id
                )
            )
        ).scalar()
        return int(n or 0) + 1

    async def _history(
        self,
        inst: CoreWorkflowInstance,
        *,
        event_type: WorkflowEventType,
        task: CoreWorkflowTask | None = None,
        from_status: str | None = None,
        to_status: str | None = None,
        comments: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.session.add(
            CoreWorkflowHistory(
                company_id=self.ctx.company_id,
                workflow_instance_id=inst.id,
                task_id=task.id if task else None,
                sequence_no=await self._next_seq(inst.id),
                event_type=event_type.value,
                from_status=from_status,
                to_status=to_status,
                level_no=task.level_no if task else inst.current_level,
                level_name=task.level_name if task else None,
                user_id=self.ctx.user_id or None,
                user_name=self.ctx.user_name,
                comments=comments,
                event_metadata=metadata,
                created_at=utcnow(),
            )
        )

    def _stamp_new(self, entity: Any) -> None:
        now = utcnow()
        entity.company_id = self.ctx.company_id
        entity.created_at = now
        entity.updated_at = now
        entity.created_by = self.ctx.user_id
        entity.updated_by = self.ctx.user_id
        entity.version = 1

    def _touch(self, entity: Any) -> None:
        entity.version += 1
        entity.updated_at = utcnow()
        entity.updated_by = self.ctx.user_id

    @staticmethod
    def _stages(levels: list[CoreApprovalRuleLevel]) -> list[list[CoreApprovalRuleLevel]]:
        stages: list[list[CoreApprovalRuleLevel]] = []
        for lv in levels:
            if not stages or not lv.is_parallel_with_previous:
                stages.append([lv])
            else:
                stages[-1].append(lv)
        return stages

    async def _rule_levels(self, rule_id: int) -> list[CoreApprovalRuleLevel]:
        return await self.rules._levels(rule_id)

    # ─── assignment ──────────────────────────────────────────────────────────
    async def _assign_stage(
        self, inst: CoreWorkflowInstance, stage: list[CoreApprovalRuleLevel]
    ) -> None:
        today = utcnow().date()
        for lv in stage:
            users, unresolved = await resolver.resolve_level_users(
                self.session, lv, company_id=self.ctx.company_id, exclude_user_id=inst.initiated_by
            )
            if not users:
                # Fail closed rather than assign nobody (V1-WFL-BR-003).
                raise ValidationFailedError(
                    f"Level {lv.level_no} has no eligible approver "
                    f"({unresolved or 'none resolved'}). Fix the matrix before submitting.",
                    errors=[{"field": f"level.{lv.level_no}", "code": "no_approver",
                             "message": unresolved or "no approver resolved"}],
                )
            due = None
            if lv.sla_hours is not None:
                # NOTE: wall-clock. Working-hours SLA (V1-WFL-BR-012) needs the
                # plant/branch calendar master, which is not built yet.
                due = utcnow() + timedelta(hours=float(lv.sla_hours))
            for uid in users:
                assignee = uid
                on_behalf = None
                deleg_id = None
                deleg = await resolver.active_delegation(
                    self.session, from_user_id=uid, company_id=self.ctx.company_id, on_date=today
                )
                if deleg and deleg.to_user_id != inst.initiated_by:
                    assignee = int(deleg.to_user_id)
                    on_behalf = uid
                    deleg_id = deleg.id
                task = CoreWorkflowTask(
                    workflow_instance_id=inst.id,
                    level_no=lv.level_no,
                    level_name=lv.level_name,
                    assigned_to_user_id=assignee,
                    assigned_role_id=lv.approver_role_id,
                    on_behalf_of_user_id=on_behalf,
                    delegation_id=deleg_id,
                    approval_mode=lv.approval_mode,
                    status=WorkflowTaskStatus.PENDING.value,
                    assigned_at=utcnow(),
                    due_at=due,
                    channel=self.ctx.channel.value,
                )
                self._stamp_new(task)
                self.session.add(task)
                await self.session.flush()
                await self._history(
                    inst,
                    event_type=WorkflowEventType.ASSIGNED,
                    task=task,
                    to_status=WorkflowTaskStatus.PENDING.value,
                    metadata={"on_behalf_of": on_behalf} if on_behalf else None,
                )
        inst.current_level = stage[0].level_no

    # ─── submit (V1-WFL-FR-008) ──────────────────────────────────────────────
    async def submit(
        self,
        *,
        entity_type: str,
        entity_uid: str,
        entity_id: int = 0,
        document_no: str | None = None,
        document_label: str | None = None,
        subject: str | None = None,
        document_version: int = 1,
        amount: float | None = None,
        currency: str = "INR",
        sub_type: str | None = None,
        attrs: dict[str, Any] | None = None,
        requester_name: str | None = None,
        department: str | None = None,
        initiated_by: int | None = None,
    ) -> CoreWorkflowInstance:
        attrs = attrs or {}
        initiated_by = initiated_by or self.ctx.user_id
        rule = await self.rules.resolve_rule(
            document_type=entity_type, sub_type=sub_type, amount=amount, attrs=attrs
        )
        if rule is None:
            # V1-WFL-BR-001: fail closed, never auto-approve on missing config.
            raise ValidationFailedError(
                f"No approval rule matches {entity_type} "
                f"for amount {amount}. The document cannot be submitted.",
                errors=[{"field": "document_type", "code": "no_rule",
                         "message": f"Configure an approval rule for {entity_type}."}],
            )
        levels = await self._rule_levels(rule.id)
        stages = self._stages(levels)
        inst = CoreWorkflowInstance(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_uid=entity_uid,
            document_no=document_no,
            document_label=document_label,
            subject=subject,
            document_version=document_version,
            document_amount=Decimal(str(amount)) if amount is not None else None,
            currency_code=currency,
            approval_rule_id=rule.id,
            total_levels=len(levels),
            requester_name=requester_name or await self._user_name(initiated_by),
            department=department,
            initiated_by=initiated_by,
            initiated_at=utcnow(),
            total_sla_hours=sum((_f(lv.sla_hours) or 0) for lv in levels) or None,
            status=WorkflowInstanceStatus.IN_PROGRESS.value,
        )
        self._stamp_new(inst)
        self.session.add(inst)
        await self.session.flush()
        await self._history(
            inst, event_type=WorkflowEventType.SUBMITTED,
            to_status=WorkflowInstanceStatus.IN_PROGRESS.value,
            metadata={"rule": rule.name},
        )

        # Auto-approve threshold (V1-WFL-FR-021)
        if (
            rule.auto_approve_below is not None
            and amount is not None
            and amount < float(rule.auto_approve_below)
        ):
            inst.status = WorkflowInstanceStatus.AUTO_APPROVED.value
            inst.current_level = None
            inst.completed_at = utcnow()
            await self._history(
                inst, event_type=WorkflowEventType.AUTO_APPROVED,
                from_status=WorkflowInstanceStatus.IN_PROGRESS.value,
                to_status=WorkflowInstanceStatus.AUTO_APPROVED.value,
                comments=f"Below auto-approve threshold ₹{rule.auto_approve_below}",
            )
            self._emit(inst, "auto_approved")
            self._emit(inst, "completed")
            await self.session.flush()
            return inst

        await self._assign_stage(inst, stages[0])
        self._emit(inst, "requested")
        await self.session.flush()
        return inst

    def _emit(self, inst: CoreWorkflowInstance, verb: str) -> None:
        emit_event(
            self.session, self.ctx,
            aggregate_type="workflow.instance",
            aggregate_uid=inst.uid,
            event_type=f"workflow.approval.{verb}",
            payload={
                "instance_uid": inst.uid,
                "entity_type": inst.entity_type,
                "entity_uid": inst.entity_uid,
                "document_no": inst.document_no,
                "status": inst.status,
                "current_level": inst.current_level,
            },
        )

    # ─── decide (V1-WFL-FR-009) ──────────────────────────────────────────────
    async def _task_or_404(self, task_uid: str) -> CoreWorkflowTask:
        row = (
            await self.session.execute(
                select(CoreWorkflowTask).where(
                    CoreWorkflowTask.uid == task_uid,
                    CoreWorkflowTask.company_id == self.ctx.company_id,
                    CoreWorkflowTask.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Approval task '{task_uid}' not found")
        return row

    async def _instance(self, instance_id: int) -> CoreWorkflowInstance:
        row = (
            await self.session.execute(
                select(CoreWorkflowInstance).where(CoreWorkflowInstance.id == instance_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError("Workflow instance not found")
        return row

    async def _stage_tasks(self, instance_id: int, level_no: int) -> list[CoreWorkflowTask]:
        rows = await self.session.execute(
            select(CoreWorkflowTask).where(
                CoreWorkflowTask.workflow_instance_id == instance_id,
                CoreWorkflowTask.level_no == level_no,
                CoreWorkflowTask.deleted_at.is_(None),
            )
        )
        return list(rows.scalars().all())

    def _level_complete(self, level: CoreApprovalRuleLevel, tasks: list[CoreWorkflowTask]) -> bool:
        approved = [t for t in tasks if t.status in _APPROVED]
        if level.approval_mode == ApprovalMode.ALL.value:
            return bool(tasks) and all(t.status in _APPROVED for t in tasks)
        if level.approval_mode == ApprovalMode.QUORUM_N.value:
            return len(approved) >= (level.quorum_count or 1)
        return len(approved) >= 1  # ANY_ONE

    async def decide(
        self,
        *,
        task_uid: str,
        action: str,
        comments: str | None = None,
        reason_code: str | None = None,
    ) -> CoreWorkflowInstance:
        task = await self._task_or_404(task_uid)
        inst = await self._instance(task.workflow_instance_id)

        if task.assigned_to_user_id != self.ctx.user_id:
            raise ForbiddenError("This approval task is assigned to another user.")
        if task.status != WorkflowTaskStatus.PENDING.value:
            raise InvalidStateTransitionError(
                "This task has already been decided.", current_status=task.status
            )
        if inst.status != WorkflowInstanceStatus.IN_PROGRESS.value:
            raise InvalidStateTransitionError(
                "This document's workflow is no longer in progress.",
                current_status=inst.status,
            )

        action = action.upper()
        if action == "APPROVE":
            return await self._approve(inst, task, comments)
        if action in ("REJECT", "RETURN"):
            if not is_valid_reason(reason_code):
                raise ValidationFailedError(
                    "A reason code is required to reject or return.",
                    errors=[{"field": "reason_code", "code": "required",
                             "message": "Choose a reason"}],
                )
            assert reason_code is not None  # guaranteed by is_valid_reason above
            return await self._reject_or_return(inst, task, action, comments, reason_code)
        raise ValidationFailedError(f"Unknown action '{action}'.")

    async def _mark(
        self, task: CoreWorkflowTask, status: str, action: str, comments, reason=None
    ) -> None:
        task.status = status
        task.action = action
        task.acted_at = utcnow()
        task.comments = comments
        task.reason_code = reason
        task.channel = self.ctx.channel.value
        task.ip_address = self.ctx.ip_address
        self._touch(task)

    async def _approve(
        self, inst: CoreWorkflowInstance, task: CoreWorkflowTask, comments: str | None
    ) -> CoreWorkflowInstance:
        await self._mark(task, WorkflowTaskStatus.APPROVED.value, "APPROVE", comments)
        await self._history(
            inst, event_type=WorkflowEventType.APPROVED, task=task,
            to_status=WorkflowTaskStatus.APPROVED.value, comments=comments,
        )
        await record_audit(
            self.session, self.ctx, action=AuditAction.APPROVE,
            entity_type=_INST, entity_id=inst.id, entity_uid=inst.uid,
            document_no=inst.document_no, reason=comments,
        )

        levels = await self._rule_levels(inst.approval_rule_id or 0)
        by_no = {lv.level_no: lv for lv in levels}
        stages = self._stages(levels)
        cur_stage = next(
            (s for s in stages if any(lv.level_no == inst.current_level for lv in s)), None
        )
        if cur_stage is None:
            await self.session.flush()
            return inst

        level_def = by_no.get(task.level_no)
        if level_def and self._level_complete(
            level_def, await self._stage_tasks(inst.id, task.level_no)
        ):
            # ANY_ONE / quorum reached → cancel the still-pending siblings at this level.
            for sib in await self._stage_tasks(inst.id, task.level_no):
                if sib.id != task.id and sib.status == WorkflowTaskStatus.PENDING.value:
                    sib.status = WorkflowTaskStatus.CANCELLED.value
                    self._touch(sib)

        stage_done = True
        for lv in cur_stage:
            if not self._level_complete(lv, await self._stage_tasks(inst.id, lv.level_no)):
                stage_done = False
                break
        if not stage_done:
            self._emit(inst, "approved")
            await self.session.flush()
            return inst

        await self._history(
            inst, event_type=WorkflowEventType.LEVEL_COMPLETED, task=task,
            metadata={"level": task.level_no},
        )
        idx = stages.index(cur_stage)
        if idx + 1 < len(stages):
            await self._assign_stage(inst, stages[idx + 1])
            self._emit(inst, "approved")
        else:
            inst.status = WorkflowInstanceStatus.APPROVED.value
            inst.current_level = None
            inst.completed_at = utcnow()
            inst.actual_hours = round(
                (inst.completed_at - inst.initiated_at).total_seconds() / 3600, 2
            )
            self._touch(inst)
            await self._history(
                inst, event_type=WorkflowEventType.APPROVED,
                from_status=WorkflowInstanceStatus.IN_PROGRESS.value,
                to_status=WorkflowInstanceStatus.APPROVED.value,
            )
            self._emit(inst, "completed")
        await self.session.flush()
        return inst

    async def _reject_or_return(
        self, inst: CoreWorkflowInstance, task: CoreWorkflowTask, action: str,
        comments: str | None, reason_code: str,
    ) -> CoreWorkflowInstance:
        is_reject = action == "REJECT"
        t_status = (
            WorkflowTaskStatus.REJECTED.value
            if is_reject
            else WorkflowTaskStatus.RETURNED.value
        )
        await self._mark(task, t_status, action, comments, reason_code)
        # Cancel every other pending task on this instance.
        rows = await self.session.execute(
            select(CoreWorkflowTask).where(
                CoreWorkflowTask.workflow_instance_id == inst.id,
                CoreWorkflowTask.status == WorkflowTaskStatus.PENDING.value,
                CoreWorkflowTask.id != task.id,
            )
        )
        for other in rows.scalars().all():
            other.status = WorkflowTaskStatus.CANCELLED.value
            self._touch(other)

        inst.status = (
            WorkflowInstanceStatus.REJECTED.value
            if is_reject
            else WorkflowInstanceStatus.RETURNED.value
        )
        inst.current_level = None
        inst.completed_at = utcnow()
        self._touch(inst)
        event = WorkflowEventType.REJECTED if is_reject else WorkflowEventType.RETURNED
        await self._history(
            inst, event_type=event, task=task,
            from_status=WorkflowInstanceStatus.IN_PROGRESS.value, to_status=inst.status,
            comments=comments, metadata={"reason_code": reason_code},
        )
        await record_audit(
            self.session, self.ctx,
            action=AuditAction.REJECT if is_reject else AuditAction.RETURN,
            entity_type=_INST, entity_id=inst.id, entity_uid=inst.uid,
            document_no=inst.document_no, reason=f"{reason_code}: {comments or ''}".strip(),
        )
        self._emit(inst, "rejected" if is_reject else "returned")
        await self.session.flush()
        return inst

    # ─── reassign (V1-WFL-FR-009) / recall (FR-010) ──────────────────────────
    async def reassign(
        self, *, task_uid: str, to_user_uid: str, reason: str, admin: bool = False
    ) -> CoreWorkflowTask:
        task = await self._task_or_404(task_uid)
        inst = await self._instance(task.workflow_instance_id)
        if not admin and task.assigned_to_user_id != self.ctx.user_id:
            raise ForbiddenError("This task is assigned to another user.")
        if task.status != WorkflowTaskStatus.PENDING.value:
            raise InvalidStateTransitionError(
                "Only a pending task can be reassigned.", current_status=task.status
            )
        if not reason or not reason.strip():
            raise ValidationFailedError(
                "A reason is required to reassign.",
                errors=[{"field": "reason", "code": "required", "message": "Give a reason"}],
            )
        target = (
            await self.session.execute(select(SysUser).where(SysUser.uid == to_user_uid))
        ).scalar_one_or_none()
        if target is None:
            raise NotFoundError("Target user not found")
        if target.id == inst.initiated_by:
            raise ValidationFailedError(
                "Cannot reassign to the document's originator (self-approval).",
                errors=[{"field": "to_user_uid", "code": "self", "message": "Pick another user"}],
            )
        task.status = WorkflowTaskStatus.REASSIGNED.value
        task.reassigned_to_user_id = target.id
        task.reassign_reason = reason
        task.acted_at = utcnow()
        self._touch(task)
        new = CoreWorkflowTask(
            workflow_instance_id=inst.id,
            level_no=task.level_no,
            level_name=task.level_name,
            assigned_to_user_id=target.id,
            assigned_role_id=task.assigned_role_id,
            approval_mode=task.approval_mode,
            status=WorkflowTaskStatus.PENDING.value,
            assigned_at=utcnow(),
            due_at=task.due_at,
            channel=self.ctx.channel.value,
        )
        self._stamp_new(new)
        self.session.add(new)
        await self.session.flush()
        await self._history(
            inst, event_type=WorkflowEventType.REASSIGNED, task=new,
            comments=reason,
            metadata={"from_user_id": task.assigned_to_user_id, "to_user_id": target.id,
                      "admin": admin},
        )
        await record_audit(
            self.session, self.ctx, action=AuditAction.UPDATE,
            entity_type=_INST, entity_id=inst.id, entity_uid=inst.uid,
            document_no=inst.document_no, reason=f"Reassigned: {reason}",
        )
        self._emit(inst, "reassigned")
        await self.session.flush()
        return new

    async def recall(self, instance_uid: str) -> CoreWorkflowInstance:
        inst = (
            await self.session.execute(
                select(CoreWorkflowInstance).where(
                    CoreWorkflowInstance.uid == instance_uid,
                    CoreWorkflowInstance.company_id == self.ctx.company_id,
                    CoreWorkflowInstance.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if inst is None:
            raise NotFoundError(f"Workflow instance '{instance_uid}' not found")
        if inst.initiated_by != self.ctx.user_id:
            raise ForbiddenError("Only the originator can recall a document.")
        if inst.status != WorkflowInstanceStatus.IN_PROGRESS.value:
            raise InvalidStateTransitionError(
                "Only an in-progress workflow can be recalled.", current_status=inst.status
            )
        # V1-WFL-FR-010: recall only while at level 1 and untouched.
        acted = (
            await self.session.execute(
                select(func.count()).select_from(CoreWorkflowTask).where(
                    CoreWorkflowTask.workflow_instance_id == inst.id,
                    CoreWorkflowTask.acted_at.isnot(None),
                )
            )
        ).scalar()
        first_level = (
            await self.session.execute(
                select(func.min(CoreWorkflowTask.level_no)).where(
                    CoreWorkflowTask.workflow_instance_id == inst.id
                )
            )
        ).scalar()
        if acted or inst.current_level != first_level:
            raise InvalidStateTransitionError(
                "The document has already been acted on — use return-for-correction instead.",
                current_status=inst.status,
            )
        for t in await self._stage_tasks(inst.id, inst.current_level or 1):
            if t.status == WorkflowTaskStatus.PENDING.value:
                t.status = WorkflowTaskStatus.CANCELLED.value
                self._touch(t)
        inst.status = WorkflowInstanceStatus.RECALLED.value
        inst.current_level = None
        inst.completed_at = utcnow()
        self._touch(inst)
        await self._history(
            inst, event_type=WorkflowEventType.RECALLED,
            from_status=WorkflowInstanceStatus.IN_PROGRESS.value,
            to_status=WorkflowInstanceStatus.RECALLED.value,
        )
        self._emit(inst, "recalled")
        await self.session.flush()
        return inst

    # ─── read models: inbox + monitor ───────────────────────────────────────
    async def inbox(self, *, include_done: bool = False) -> list[dict[str, Any]]:
        stmt = (
            select(CoreWorkflowTask, CoreWorkflowInstance)
            .join(
                CoreWorkflowInstance,
                CoreWorkflowInstance.id == CoreWorkflowTask.workflow_instance_id,
            )
            .where(
                CoreWorkflowTask.company_id == self.ctx.company_id,
                CoreWorkflowTask.assigned_to_user_id == self.ctx.user_id,
                CoreWorkflowTask.deleted_at.is_(None),
            )
            .order_by(CoreWorkflowTask.due_at.is_(None), CoreWorkflowTask.due_at)
        )
        if not include_done:
            stmt = stmt.where(CoreWorkflowTask.status == WorkflowTaskStatus.PENDING.value)
        rows = (await self.session.execute(stmt)).all()
        now = utcnow()

        def _overdue(t: CoreWorkflowTask) -> bool:
            return bool(
                t.due_at
                and t.due_at < now
                and t.status == WorkflowTaskStatus.PENDING.value
            )

        return [{"task": t, "instance": i, "overdue": _overdue(t)} for t, i in rows]

    async def inbox_count(self) -> int:
        return (
            await self.session.execute(
                select(func.count()).select_from(CoreWorkflowTask).where(
                    CoreWorkflowTask.company_id == self.ctx.company_id,
                    CoreWorkflowTask.assigned_to_user_id == self.ctx.user_id,
                    CoreWorkflowTask.status == WorkflowTaskStatus.PENDING.value,
                    CoreWorkflowTask.deleted_at.is_(None),
                )
            )
        ).scalar() or 0

    async def instances(
        self, *, status: str | None = None, overdue: bool | None = None
    ) -> list[dict[str, Any]]:
        stmt = select(CoreWorkflowInstance).where(
            CoreWorkflowInstance.company_id == self.ctx.company_id,
            CoreWorkflowInstance.deleted_at.is_(None),
        )
        if status:
            stmt = stmt.where(CoreWorkflowInstance.status == status)
        stmt = stmt.order_by(CoreWorkflowInstance.initiated_at.desc())
        rows = list((await self.session.execute(stmt)).scalars().all())
        now = utcnow()
        out = []
        for inst in rows:
            cur = None
            if inst.status == WorkflowInstanceStatus.IN_PROGRESS.value:
                cur = next(
                    (
                        t
                        for t in await self._stage_tasks(inst.id, inst.current_level or 0)
                        if t.status == WorkflowTaskStatus.PENDING.value
                    ),
                    None,
                )
            is_over = bool(cur and cur.due_at and cur.due_at < now)
            if overdue is True and not is_over:
                continue
            out.append({"instance": inst, "current_task": cur, "overdue": is_over})
        return out

    async def instance_detail(self, uid: str) -> dict[str, Any]:
        inst = (
            await self.session.execute(
                select(CoreWorkflowInstance).where(
                    CoreWorkflowInstance.uid == uid,
                    CoreWorkflowInstance.company_id == self.ctx.company_id,
                    CoreWorkflowInstance.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if inst is None:
            raise NotFoundError(f"Workflow instance '{uid}' not found")
        tasks = list(
            (
                await self.session.execute(
                    select(CoreWorkflowTask)
                    .where(CoreWorkflowTask.workflow_instance_id == inst.id,
                           CoreWorkflowTask.deleted_at.is_(None))
                    .order_by(CoreWorkflowTask.level_no, CoreWorkflowTask.id)
                )
            ).scalars().all()
        )
        history = list(
            (
                await self.session.execute(
                    select(CoreWorkflowHistory)
                    .where(CoreWorkflowHistory.workflow_instance_id == inst.id)
                    .order_by(CoreWorkflowHistory.sequence_no)
                )
            ).scalars().all()
        )
        return {"instance": inst, "tasks": tasks, "history": history}

    async def task_detail(self, uid: str) -> dict[str, Any]:
        task = await self._task_or_404(uid)
        inst = await self._instance(task.workflow_instance_id)
        if task.first_viewed_at is None and task.assigned_to_user_id == self.ctx.user_id:
            task.first_viewed_at = utcnow()
        return {"task": task, "instance": inst}
