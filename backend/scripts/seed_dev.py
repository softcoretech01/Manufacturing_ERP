"""Dev seed: reference data (currencies + permission catalogue) + a bootstrap
company and admin user, and (re)grants every permission to the admin role so new
permission codes are always available to it.

Run from the backend directory:  python scripts/seed_dev.py
Idempotent — safe to run more than once.
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import delete, select

from app.core.database import session_scope
from app.core.enums import PermissionEffect
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import SysRole, SysRolePermission
from app.modules.organisation.infrastructure.models import SysCompany
from app.seed import bootstrap_company_admin, seed_reference_data


async def _grant_all_to_role(session, role_code: str) -> int:
    role = (
        await session.execute(
            select(SysRole).where(SysRole.code == role_code, SysRole.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if role is None:
        return 0
    await session.execute(delete(SysRolePermission).where(SysRolePermission.role_id == role.id))
    for code in sorted(perm_cat.ALL_CODES):
        session.add(
            SysRolePermission(
                role_id=role.id, permission_code=code, effect=PermissionEffect.ALLOW.value
            )
        )
    await session.flush()
    return len(perm_cat.ALL_CODES)


async def main() -> None:
    async with session_scope() as s:
        await seed_reference_data(s)
        existing = (
            await s.execute(select(SysCompany).where(SysCompany.code == "SSBIND"))
        ).scalar_one_or_none()
        if existing is None:
            res = await bootstrap_company_admin(
                s,
                company_code="SSBIND",
                company_name="SSB Industries Pvt Ltd",
                login_id="admin",
                password="admin123",
                full_name="Administrator",
                pan="AABCS1429B",
                gst_state_code="33",
            )
            print(f"Bootstrapped company SSBIND uid={res.company_uid}, admin/admin123")
        else:
            print(f"Company SSBIND already present: {existing.uid}")

        granted = await _grant_all_to_role(s, "ADMIN_SSBIND")
        print(f"Admin role now holds {granted} permissions (all of them).")


if __name__ == "__main__":
    asyncio.run(main())
