"""Approval-matrix configuration: rules + levels, coverage analysis, simulation.

Level-1 of the two-level model (V1-WFL §4.2): document type + condition → ordered
approval levels. Covers ~90% of cases without the designer.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import ApprovalMode, ApproverType, ConditionType, EscalationAction
from app.core.errors import (
    ConcurrentModificationError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.time import utcnow
from app.modules.iam.infrastructure.models import SysRole, SysUser
from app.modules.workflow.application import resolver
from app.modules.workflow.application.constants import (
    AUTO_APPROVE_FORBIDDEN,
    DOCUMENT_TYPES,
    EXPRESSION_FIELDS,
)
from app.modules.workflow.domain import expression
from app.modules.workflow.infrastructure.models import (
    CoreApprovalRule,
    CoreApprovalRuleLevel,
)


def _f(v: Any) -> float | None:
    return None if v is None else float(v)


class ApprovalRuleService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    # ─── reads ───────────────────────────────────────────────────────────────
    def _scoped(self):
        return select(CoreApprovalRule).where(
            CoreApprovalRule.company_id == self.ctx.company_id,
            CoreApprovalRule.deleted_at.is_(None),
        )

    async def _levels(self, rule_id: int) -> list[CoreApprovalRuleLevel]:
        rows = await self.session.execute(
            select(CoreApprovalRuleLevel)
            .where(
                CoreApprovalRuleLevel.approval_rule_id == rule_id,
                CoreApprovalRuleLevel.deleted_at.is_(None),
            )
            .order_by(CoreApprovalRuleLevel.level_no)
        )
        return list(rows.scalars().all())

    async def list_rules(
        self, *, document_type: str | None = None, active_only: bool = False
    ) -> list[dict[str, Any]]:
        stmt = self._scoped()
        if document_type:
            stmt = stmt.where(CoreApprovalRule.document_type == document_type)
        if active_only:
            stmt = stmt.where(CoreApprovalRule.is_active.is_(True))
        stmt = stmt.order_by(CoreApprovalRule.document_type, CoreApprovalRule.priority)
        rules = list((await self.session.execute(stmt)).scalars().all())
        role_map = await self._role_map()
        out = []
        for r in rules:
            out.append({"rule": r, "levels": await self._levels(r.id), "roles": role_map})
        return out

    async def _role_map(self) -> dict[int, tuple[str, str]]:
        """id → (uid, code) for the company's roles (+ global roles), for display."""
        rows = await self.session.execute(
            select(SysRole.id, SysRole.uid, SysRole.code).where(
                (SysRole.company_id == self.ctx.company_id) | (SysRole.company_id.is_(None)),
                SysRole.deleted_at.is_(None),
            )
        )
        return {rid: (uid, code) for rid, uid, code in rows.all()}

    async def _role_id_by_uid(self, uid: str | None) -> int | None:
        if not uid:
            return None
        return (
            await self.session.execute(select(SysRole.id).where(SysRole.uid == uid))
        ).scalar_one_or_none()

    async def _user_id_by_uid(self, uid: str | None) -> int | None:
        if not uid:
            return None
        return (
            await self.session.execute(select(SysUser.id).where(SysUser.uid == uid))
        ).scalar_one_or_none()

    async def get_or_404(self, uid: str) -> CoreApprovalRule:
        row: CoreApprovalRule | None = (
            await self.session.execute(self._scoped().where(CoreApprovalRule.uid == uid))
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Approval rule '{uid}' not found")
        return row

    async def get_detail(self, uid: str) -> dict[str, Any]:
        r = await self.get_or_404(uid)
        return {"rule": r, "levels": await self._levels(r.id), "roles": await self._role_map()}

    def document_types(self) -> list[dict[str, str]]:
        return [{"code": c, "label": lbl} for c, lbl in DOCUMENT_TYPES.items()]

    # ─── validation ──────────────────────────────────────────────────────────
    def _validate(self, data: dict[str, Any], levels: list[dict[str, Any]]) -> None:
        errors: list[dict[str, str]] = []
        ct = data.get("condition_type")
        if ct == ConditionType.AMOUNT_BAND.value:
            lo, hi = data.get("min_amount"), data.get("max_amount")
            if lo is not None and hi is not None and Decimal(str(hi)) < Decimal(str(lo)):
                errors.append(
                    {"field": "max_amount", "code": "range", "message": "To must be ≥ From"}
                )
        elif ct == ConditionType.EXPRESSION.value:
            expr = data.get("condition_expr") or ""
            if not expr.strip():
                errors.append(
                    {"field": "condition_expr", "code": "required",
                     "message": "An expression is required for this condition type"}
                )
            else:
                try:
                    expression.validate(expr, set(EXPRESSION_FIELDS))
                except expression.ExpressionError as exc:
                    errors.append(
                        {"field": "condition_expr", "code": "invalid", "message": str(exc)}
                    )
        if not levels:
            errors.append(
                {"field": "levels", "code": "required", "message": "At least one level is required"}
            )
        doc_type = data.get("document_type", "")
        for i, lv in enumerate(levels):
            if lv.get("escalation_action") == EscalationAction.AUTO_APPROVE.value:
                blocked = doc_type in AUTO_APPROVE_FORBIDDEN or (
                    doc_type == "PURCHASE_ORDER" and (data.get("min_amount") or 0) > 1_000_000
                )
                if blocked:
                    errors.append(
                        {"field": f"levels.{i}.escalation_action", "code": "forbidden",
                         "message": "Auto-approve is not permitted for this document type/amount "
                                    "(V1-WFL-BR-010)"}
                    )
            quorum = lv.get("approval_mode") == ApprovalMode.QUORUM_N.value
            if quorum and not lv.get("quorum_count"):
                errors.append(
                    {"field": f"levels.{i}.quorum_count", "code": "required",
                     "message": "Quorum mode needs a quorum count"}
                )
        if errors:
            raise ValidationFailedError(f"{len(errors)} field(s) failed validation", errors=errors)

    # ─── writes ──────────────────────────────────────────────────────────────
    def _stamp_new(self, entity: Any) -> None:
        now = utcnow()
        entity.company_id = self.ctx.company_id
        entity.created_at = now
        entity.updated_at = now
        entity.created_by = self.ctx.user_id
        entity.updated_by = self.ctx.user_id
        entity.version = 1

    async def create(self, data: dict[str, Any]) -> CoreApprovalRule:
        levels = data.pop("levels", [])
        self._validate(data, levels)
        rule = CoreApprovalRule(**data)
        self._stamp_new(rule)
        self.session.add(rule)
        await self.session.flush()
        await self._replace_levels(rule.id, levels)
        await self.session.flush()
        return await self.get_or_404(rule.uid)

    async def update(
        self, uid: str, data: dict[str, Any], *, expected_version: int
    ) -> CoreApprovalRule:
        rule = await self.get_or_404(uid)
        if rule.version != expected_version:
            raise ConcurrentModificationError(
                "Rule was modified by another user.",
                extra={"current_version": rule.version, "your_version": expected_version},
            )
        levels = data.pop("levels", None)
        merged = {
            "document_type": rule.document_type,
            "condition_type": rule.condition_type,
            "min_amount": rule.min_amount,
            "max_amount": rule.max_amount,
            "condition_expr": rule.condition_expr,
            **data,
        }
        self._validate(merged, levels if levels is not None else [{"_": 1}])
        for k, v in data.items():
            setattr(rule, k, v)
        rule.version += 1
        rule.updated_at = utcnow()
        rule.updated_by = self.ctx.user_id
        if levels is not None:
            await self._replace_levels(rule.id, levels)
        await self.session.flush()
        return await self.get_or_404(uid)

    async def _replace_levels(self, rule_id: int, levels: list[dict[str, Any]]) -> None:
        existing = await self._levels(rule_id)
        now = utcnow()
        for lv in existing:  # soft-delete rows no longer present
            lv.deleted_at = now
            lv.deleted_by = self.ctx.user_id
            lv.version += 1
            lv.updated_at = now
            lv.updated_by = self.ctx.user_id
        for i, data in enumerate(levels, start=1):
            # Accept either internal ids (seed/system callers) or public uids (API).
            role_id = data.get("approver_role_id")
            if role_id is None:
                role_id = await self._role_id_by_uid(data.get("approver_role_uid"))
            user_id = data.get("approver_user_id")
            if user_id is None:
                user_id = await self._user_id_by_uid(data.get("approver_user_uid"))
            level = CoreApprovalRuleLevel(
                approval_rule_id=rule_id,
                level_no=data.get("level_no", i),
                level_name=data.get("level_name"),
                approver_type=data.get("approver_type", ApproverType.ROLE.value),
                approver_role_id=role_id,
                approver_user_id=user_id,
                approver_expr=data.get("approver_expr"),
                approval_mode=data.get("approval_mode", ApprovalMode.ANY_ONE.value),
                quorum_count=data.get("quorum_count"),
                is_parallel_with_previous=data.get("is_parallel_with_previous", False),
                sla_hours=data.get("sla_hours"),
                reminder_pct=data.get("reminder_pct"),
                escalation_action=data.get("escalation_action", EscalationAction.NOTIFY_ONLY.value),
                escalation_user_id=data.get("escalation_user_id"),
                escalation_role_id=data.get("escalation_role_id"),
            )
            self._stamp_new(level)
            self.session.add(level)

    async def set_active(
        self, uid: str, active: bool, *, expected_version: int | None = None
    ) -> CoreApprovalRule:
        rule = await self.get_or_404(uid)
        if expected_version is not None and rule.version != expected_version:
            raise ConcurrentModificationError(
                "Rule was modified by another user.",
                extra={"current_version": rule.version, "your_version": expected_version},
            )
        rule.is_active = active
        rule.version += 1
        rule.updated_at = utcnow()
        rule.updated_by = self.ctx.user_id
        await self.session.flush()
        return rule

    # ─── coverage (V1-WFL-FR-007) ────────────────────────────────────────────
    async def coverage(self, document_type: str) -> dict[str, Any]:
        rules = [
            e["rule"]
            for e in await self.list_rules(document_type=document_type, active_only=True)
            if e["rule"].condition_type == ConditionType.AMOUNT_BAND.value
        ]
        bands = sorted(
            (
                {"from": _f(r.min_amount) or 0.0, "to": _f(r.max_amount), "name": r.name}
                for r in rules
            ),
            key=lambda b: b["from"],
        )
        gaps: list[dict[str, float]] = []
        overlaps: list[str] = []
        cursor = 0.0
        for b in bands:
            if b["from"] > cursor + 1:
                gaps.append({"from": cursor, "to": b["from"] - 1})
            elif b["from"] < cursor:
                overlaps.append(b["name"])
            cursor = b["to"] if b["to"] is not None else float("inf")
        full = not gaps and any(b["to"] is None for b in bands)
        return {"bands": bands, "gaps": gaps, "overlaps": overlaps, "full_coverage": full}

    # ─── resolution + simulation (V1-WFL-FR-005/006) ─────────────────────────
    async def resolve_rule(
        self,
        *,
        document_type: str,
        sub_type: str | None,
        amount: float | None,
        attrs: dict[str, Any],
    ) -> CoreApprovalRule | None:
        entries = await self.list_rules(document_type=document_type, active_only=True)
        rules = [e["rule"] for e in entries]
        matches: list[CoreApprovalRule] = []
        for r in rules:
            if r.sub_type and sub_type and r.sub_type != sub_type:
                continue
            if r.sub_type and not sub_type:
                continue
            if not self._condition_holds(r, amount, attrs):
                continue
            matches.append(r)
        if not matches:
            return None
        # most-specific-first: more non-null scope fields wins, then lower priority
        def specificity(r: CoreApprovalRule) -> int:
            return sum(
                1 for x in (r.plant_id, r.scope_branch_id, r.department_id, r.cost_centre_id)
                if x is not None
            )
        matches.sort(key=lambda r: (-specificity(r), r.priority))
        return matches[0]

    def _condition_holds(
        self, r: CoreApprovalRule, amount: float | None, attrs: dict[str, Any]
    ) -> bool:
        if r.condition_type == ConditionType.ALWAYS.value:
            return True
        if r.condition_type == ConditionType.AMOUNT_BAND.value:
            if amount is None:
                return False
            lo = _f(r.min_amount) or 0.0
            hi = _f(r.max_amount)
            return amount >= lo and (hi is None or amount <= hi)
        if r.condition_type == ConditionType.EXPRESSION.value:
            merged = {**attrs}
            if amount is not None:
                merged.setdefault("total_amount", amount)
                merged.setdefault("amount", amount)
            try:
                return expression.evaluate(r.condition_expr or "", merged)
            except expression.ExpressionError:
                return False
        return False

    async def simulate(
        self, *, document_type: str, amount: float | None, attrs: dict[str, Any]
    ) -> dict[str, Any]:
        rule = await self.resolve_rule(
            document_type=document_type, sub_type=attrs.get("sub_type"), amount=amount, attrs=attrs
        )
        if rule is None:
            return {
                "matched": False,
                "reason": "No rule matches — the document could not be submitted.",
            }
        auto = (
            rule.auto_approve_below is not None
            and amount is not None
            and amount < float(rule.auto_approve_below)
        )
        levels_out = []
        for lv in await self._levels(rule.id):
            users, unresolved = await resolver.resolve_level_users(
                self.session, lv, company_id=self.ctx.company_id
            )
            levels_out.append(
                {
                    "level_no": lv.level_no,
                    "level_name": lv.level_name,
                    "approver_type": lv.approver_type,
                    "approver_label": await self._approver_label(lv),
                    "approval_mode": lv.approval_mode,
                    "sla_hours": _f(lv.sla_hours),
                    "is_parallel_with_previous": lv.is_parallel_with_previous,
                    "resolved_user_count": len(users),
                    "unresolved_reason": unresolved,
                }
            )
        return {
            "matched": True,
            "rule_uid": rule.uid,
            "rule_name": rule.name,
            "priority": rule.priority,
            "auto_approved": auto,
            "auto_approve_below": _f(rule.auto_approve_below),
            "levels": levels_out,
        }

    async def _approver_label(self, lv: CoreApprovalRuleLevel) -> str:
        if lv.approver_type == ApproverType.ROLE.value and lv.approver_role_id:
            code = await resolver.role_name(self.session, int(lv.approver_role_id))
            return f"Role: {code or lv.approver_role_id}"
        if lv.approver_type == ApproverType.USER.value:
            return "Specific user"
        return lv.approver_type.replace("_", " ").title()
