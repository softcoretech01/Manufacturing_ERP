"""Seed a minimal, real demonstration of the approval engine (idempotent).

Creates approval-matrix rules for Purchase Order + Purchase Requisition, ensures a
demo requester user exists, and submits two documents through the REAL engine so
the Approvals inbox and Workflow monitor show genuine data (not mock rows). The
approver on every level is the admin's role, so signing in as `admin` shows the
tasks; the initiator is the demo requester, so self-approval is never triggered.

Run:  python -m scripts.seed_workflow_demo
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.context import TenantContext
from app.core.database import session_scope
from app.core.enums import ApprovalMode, ApproverType, ConditionType, EscalationAction
from app.core.security import hash_password
from app.core.time import utcnow
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import (
    SysUser,
    SysUserCompany,
    SysUserRole,
)
from app.modules.workflow.application.engine import WorkflowService
from app.modules.workflow.application.rule_service import ApprovalRuleService
from app.modules.workflow.infrastructure.models import (
    CoreApprovalRule,
    CoreWorkflowInstance,
)


def _ctx(user: SysUser, company_id: int) -> TenantContext:
    return TenantContext(
        user_id=user.id,
        user_uid=user.uid,
        user_name=user.full_name,
        login_id=user.login_id,
        company_id=company_id,
        company_uid="",
        company_ids=frozenset({company_id}),
        permissions=frozenset(perm_cat.ALL_CODES),
    )


def _lvl(no: int, name: str, role_id: int, sla: float, parallel: bool = False) -> dict:
    return {
        "level_no": no,
        "level_name": name,
        "approver_type": ApproverType.ROLE.value,
        "approver_role_id": role_id,
        "approval_mode": ApprovalMode.ANY_ONE.value,
        "is_parallel_with_previous": parallel,
        "sla_hours": sla,
        "escalation_action": EscalationAction.NOTIFY_MANAGER.value,
    }


async def main() -> None:
    async with session_scope() as s:
        admin = (
            await s.execute(select(SysUser).where(SysUser.login_id == "admin"))
        ).scalar_one()
        company_id = (
            await s.execute(
                select(SysUserCompany.company_id).where(SysUserCompany.user_id == admin.id)
            )
        ).scalar_one()
        role_id = (
            await s.execute(select(SysUserRole.role_id).where(SysUserRole.user_id == admin.id))
        ).scalars().first()

        # demo requester (initiator) so approvals never route to their own author
        requester = (
            await s.execute(select(SysUser).where(SysUser.login_id == "wf_requester"))
        ).scalar_one_or_none()
        if requester is None:
            requester = SysUser(
                login_id="wf_requester",
                email="requester@ssb.local",
                full_name="P. Suresh (demo requester)",
                password_hash=hash_password("requester12"),
                status="ACTIVE",
            )
            now = utcnow()
            requester.created_at = requester.updated_at = now
            requester.created_by = requester.updated_by = admin.id
            s.add(requester)
            await s.flush()
            s.add(SysUserCompany(user_id=requester.id, company_id=company_id, is_default=True))
            await s.flush()

        admin_ctx = _ctx(admin, company_id)
        req_ctx = _ctx(requester, company_id)
        rules = ApprovalRuleService(s, admin_ctx)

        # ── rules (skip if a rule of that name already exists) ──────────────
        existing = {
            r.name
            for r in (
                await s.execute(
                    select(CoreApprovalRule).where(
                        CoreApprovalRule.company_id == company_id,
                        CoreApprovalRule.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
        }

        async def ensure(data: dict) -> None:
            if data["name"] not in existing:
                await rules.create(data)

        await ensure({
            "document_type": "PURCHASE_ORDER", "name": "PO — Routine", "priority": 30,
            "condition_type": ConditionType.AMOUNT_BAND.value,
            "min_amount": 0, "max_amount": 100000,
            "levels": [_lvl(1, "Purchase", role_id, 24)],
        })
        await ensure({
            "document_type": "PURCHASE_ORDER", "name": "PO — Mid value", "priority": 20,
            "condition_type": ConditionType.AMOUNT_BAND.value,
            "min_amount": 100001, "max_amount": 1000000,
            "levels": [_lvl(1, "Purchase", role_id, 24), _lvl(2, "Works", role_id, 24)],
        })
        await ensure({
            "document_type": "PURCHASE_ORDER", "name": "PO — High value", "priority": 10,
            "condition_type": ConditionType.AMOUNT_BAND.value,
            "min_amount": 1000001, "max_amount": None,
            "levels": [
                _lvl(1, "Purchase", role_id, 24), _lvl(2, "Works", role_id, 24),
                _lvl(3, "Finance", role_id, 48), _lvl(4, "Management", role_id, 72),
            ],
        })
        await ensure({
            "document_type": "PURCHASE_REQUISITION", "name": "PR — Standard", "priority": 100,
            "condition_type": ConditionType.ALWAYS.value, "auto_approve_below": 5000,
            "levels": [_lvl(1, "Department approval", role_id, 24)],
        })

        # ── two real instances via the engine (skip if already present) ─────
        engine = WorkflowService(s, req_ctx)
        present = {
            i.document_no
            for i in (
                await s.execute(
                    select(CoreWorkflowInstance).where(
                        CoreWorkflowInstance.company_id == company_id
                    )
                )
            ).scalars().all()
        }
        from app.core.ids import new_uid

        if "PO/25-26/00042" not in present:
            await engine.submit(
                entity_type="PURCHASE_ORDER", entity_uid=new_uid(),
                document_no="PO/25-26/00042", document_label="Purchase Order",
                subject="Jindal Steel — SS304 coil", amount=1562292, currency="INR",
                requester_name="P. Suresh", department="Procurement",
                initiated_by=requester.id,
            )
        if "PR/25-26/00318" not in present:
            await engine.submit(
                entity_type="PURCHASE_REQUISITION", entity_uid=new_uid(),
                document_no="PR/25-26/00318", document_label="Purchase Requisition",
                subject="Coating chemicals", amount=82400, currency="INR",
                requester_name="M. Devi", department="Production",
                initiated_by=requester.id,
            )
        print("workflow demo seeded (rules + 2 instances)")


if __name__ == "__main__":
    asyncio.run(main())
