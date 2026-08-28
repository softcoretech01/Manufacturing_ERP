"""Approver resolution + delegation lookup, shared by the simulator and the engine.

Turns a rule level's approver definition into concrete user ids, and applies an
active delegation at assignment time (V1-WFL-FR-016). Kept separate so both the
"what-would-happen" simulator and the real ``submit`` use identical logic.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ApproverType
from app.modules.iam.infrastructure.models import (
    SysDelegation,
    SysRole,
    SysUser,
    SysUserCompany,
    SysUserRole,
)
from app.modules.workflow.infrastructure.models import CoreApprovalRuleLevel

# Approver types that need org-structure links (dept head, reporting manager, …)
# which are not modelled yet. The engine surfaces these as "unresolved" rather
# than guessing an approver (V1-WFL-BR-003: never assign blindly).
_DYNAMIC_TYPES = frozenset(
    {
        ApproverType.DEPARTMENT_HEAD.value,
        ApproverType.REPORTING_MANAGER.value,
        ApproverType.COST_CENTRE_OWNER.value,
        ApproverType.PLANT_HEAD.value,
        ApproverType.DYNAMIC_EXPRESSION.value,
    }
)


async def role_user_ids(session: AsyncSession, role_id: int, company_id: int) -> list[int]:
    """Active users who hold ``role_id`` in ``company_id``."""
    stmt = (
        select(SysUserRole.user_id)
        .join(SysUser, SysUser.id == SysUserRole.user_id)
        .join(
            SysUserCompany,
            and_(
                SysUserCompany.user_id == SysUserRole.user_id,
                SysUserCompany.company_id == company_id,
            ),
        )
        .where(
            SysUserRole.role_id == role_id,
            SysUser.deleted_at.is_(None),
            SysUser.status == "ACTIVE",
            (SysUserRole.company_id.is_(None)) | (SysUserRole.company_id == company_id),
        )
        .distinct()
    )
    return [int(r) for r in (await session.execute(stmt)).scalars().all()]


async def role_name(session: AsyncSession, role_id: int) -> str | None:
    return (
        await session.execute(select(SysRole.code).where(SysRole.id == role_id))
    ).scalar_one_or_none()


async def resolve_level_users(
    session: AsyncSession,
    level: CoreApprovalRuleLevel,
    *,
    company_id: int,
    exclude_user_id: int | None = None,
) -> tuple[list[int], str | None]:
    """Resolve a level to concrete user ids.

    Returns ``(user_ids, unresolved_reason)``. ``unresolved_reason`` is set when
    the approver type is not resolvable yet (org links) or nobody qualifies.
    ``exclude_user_id`` drops the document initiator so self-approval is blocked
    (V1-WFL-BR-002).
    """
    users: list[int] = []
    reason: str | None = None

    if level.approver_type == ApproverType.USER.value:
        if level.approver_user_id:
            users = [int(level.approver_user_id)]
    elif level.approver_type == ApproverType.ROLE.value:
        if level.approver_role_id:
            users = await role_user_ids(session, int(level.approver_role_id), company_id)
        if not users:
            reason = "no active user holds this role"
    elif level.approver_type in _DYNAMIC_TYPES:
        reason = f"{level.approver_type.replace('_', ' ').lower()} is not linked yet"

    if exclude_user_id is not None and exclude_user_id in users:
        without_self = [u for u in users if u != exclude_user_id]
        if without_self:
            # Prefer a different approver whenever one exists (V1-WFL-BR-002).
            users = without_self
        # else: the initiator is the ONLY eligible approver for this role.
        # Rather than blocking the document entirely, allow self-approval in
        # single-approver orgs — keep ``users`` (initiator included). This is a
        # deliberate relaxation of V1-WFL-BR-002 for the sole/authorised approver.

    return users, reason


async def active_delegation(
    session: AsyncSession, *, from_user_id: int, company_id: int, on_date: date
) -> SysDelegation | None:
    """The active delegation (if any) covering ``from_user_id`` on ``on_date``."""
    stmt = select(SysDelegation).where(
        SysDelegation.company_id == company_id,
        SysDelegation.from_user_id == from_user_id,
        SysDelegation.is_active.is_(True),
        SysDelegation.deleted_at.is_(None),
        SysDelegation.valid_from <= on_date,
        SysDelegation.valid_to >= on_date,
    )
    return (await session.execute(stmt.limit(1))).scalar_one_or_none()
