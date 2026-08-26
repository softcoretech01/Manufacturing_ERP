"""Administration reports — read-only aggregates across modules.

Reporting is the one sanctioned place to read across module tables (CLAUDE.md
§3.3). All queries are company-scoped and read-only.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import CoreAuditLog
from app.core.context import TenantContext
from app.core.enums import PermissionEffect
from app.core.time import utcnow
from app.modules.iam.infrastructure.models import (
    SysRole,
    SysRolePermission,
    SysUser,
    SysUserCompany,
    SysUserRole,
)
from app.modules.organisation.infrastructure import models as om


class AdminReportService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.cid = ctx.company_id

    async def _scalar(self, stmt: Select) -> int:
        return int((await self.session.execute(stmt)).scalar_one() or 0)

    async def _org_count(self, model: Any) -> dict[str, int]:
        base = model.company_id == self.cid, model.deleted_at.is_(None)
        total = await self._scalar(select(func.count()).select_from(model).where(*base))
        active = await self._scalar(
            select(func.count()).select_from(model).where(*base, model.is_active.is_(True))
        )
        return {"total": total, "active": active}

    async def build(self) -> dict[str, Any]:
        cid = self.cid

        # ── Users (scoped through sys_user_company) ──────────────────────────
        user_rows = (
            await self.session.execute(
                select(SysUser.user_type, SysUser.status)
                .join(SysUserCompany, SysUserCompany.user_id == SysUser.id)
                .where(SysUserCompany.company_id == cid, SysUser.deleted_at.is_(None))
            )
        ).all()
        by_type: dict[str, int] = {}
        active = 0
        for utype, status in user_rows:
            by_type[utype] = by_type.get(utype, 0) + 1
            if status == "ACTIVE":
                active += 1
        users = {
            "total": len(user_rows),
            "active": active,
            "inactive": len(user_rows) - active,
            "by_type": [{"label": k, "count": v} for k, v in sorted(by_type.items())],
        }

        # ── Roles (company or global) + permission / user counts ─────────────
        roles = list(
            (
                await self.session.execute(
                    select(SysRole)
                    .where(
                        SysRole.deleted_at.is_(None),
                        or_(SysRole.company_id == cid, SysRole.company_id.is_(None)),
                    )
                    .order_by(SysRole.code)
                )
            )
            .scalars()
            .all()
        )
        role_ids = [r.id for r in roles] or [0]
        perm_counts: dict[int, int] = {}
        for rid, cnt in (
            await self.session.execute(
                select(SysRolePermission.role_id, func.count())
                .where(
                    SysRolePermission.role_id.in_(role_ids),
                    SysRolePermission.effect == PermissionEffect.ALLOW.value,
                )
                .group_by(SysRolePermission.role_id)
            )
        ).all():
            perm_counts[rid] = int(cnt)
        user_counts: dict[int, int] = {}
        for rid, cnt in (
            await self.session.execute(
                select(SysUserRole.role_id, func.count(func.distinct(SysUserRole.user_id)))
                .where(SysUserRole.role_id.in_(role_ids))
                .group_by(SysUserRole.role_id)
            )
        ).all():
            user_counts[rid] = int(cnt)
        role_rows = [
            {
                "code": r.code,
                "name": r.name,
                "permission_count": int(perm_counts.get(r.id, 0)),
                "user_count": int(user_counts.get(r.id, 0)),
            }
            for r in roles
        ]

        # ── Organisation structure ───────────────────────────────────────────
        organisation = {
            "branches": await self._org_count(om.SysBranch),
            "plants": await self._org_count(om.SysPlant),
            "warehouses": await self._org_count(om.SysWarehouse),
            "departments": await self._org_count(om.SysDepartment),
            "cost_centres": await self._org_count(om.SysCostCentre),
        }

        # ── Audit activity ───────────────────────────────────────────────────
        a_base = CoreAuditLog.company_id == cid
        total_audit = await self._scalar(
            select(func.count()).select_from(CoreAuditLog).where(a_base)
        )
        since = utcnow() - timedelta(days=7)
        last7 = await self._scalar(
            select(func.count())
            .select_from(CoreAuditLog)
            .where(a_base, CoreAuditLog.occurred_at >= since)
        )
        actors = await self._scalar(
            select(func.count(func.distinct(CoreAuditLog.actor_user_id))).where(a_base)
        )
        by_action = [
            {"label": action, "count": int(cnt)}
            for action, cnt in (
                await self.session.execute(
                    select(CoreAuditLog.action, func.count())
                    .where(a_base)
                    .group_by(CoreAuditLog.action)
                    .order_by(func.count().desc())
                    .limit(8)
                )
            ).all()
        ]

        return {
            "users": users,
            "roles_total": len(roles),
            "roles": role_rows,
            "organisation": organisation,
            "audit": {
                "total": total_audit,
                "last_7_days": last7,
                "actors": actors,
                "by_action": by_action,
            },
        }
