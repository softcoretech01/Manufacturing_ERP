"""Idempotent permission sync: insert any new catalogue codes into sys_permission
and grant every ALL_CODES permission to the roles the `admin` user holds.

Safe to re-run — only inserts what is missing. Used after adding a module's
permissions (here: workflow's APPROVAL_MATRIX + WORKFLOW)."""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.database import session_scope
from app.core.ids import new_uid
from app.core.time import utcnow
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import (
    SysPermission,
    SysRolePermission,
    SysUser,
    SysUserRole,
)


async def main() -> None:
    async with session_scope() as s:
        # 1. sync catalogue → sys_permission
        existing = set(
            (await s.execute(select(SysPermission.code))).scalars().all()
        )
        added = 0
        for p in perm_cat.catalogue():
            if p.code not in existing:
                s.add(
                    SysPermission(
                        uid=new_uid(),
                        code=p.code,
                        module=p.module,
                        entity=p.entity,
                        action=p.action,
                        label=p.label,
                        is_sensitive=p.is_sensitive,
                    )
                )
                added += 1

        # 2. grant ALL_CODES to admin's role(s)
        admin = (
            await s.execute(select(SysUser).where(SysUser.login_id == "admin"))
        ).scalar_one_or_none()
        granted = 0
        if admin:
            role_ids = list(
                (
                    await s.execute(
                        select(SysUserRole.role_id).where(SysUserRole.user_id == admin.id)
                    )
                ).scalars().all()
            )
            for role_id in role_ids:
                have = set(
                    (
                        await s.execute(
                            select(SysRolePermission.permission_code).where(
                                SysRolePermission.role_id == role_id
                            )
                        )
                    ).scalars().all()
                )
                for code in perm_cat.ALL_CODES:
                    if code not in have:
                        s.add(
                            SysRolePermission(
                                role_id=role_id, permission_code=code, effect="ALLOW"
                            )
                        )
                        granted += 1
        print(f"permissions added={added}  grants added={granted}  ({utcnow():%H:%M:%S})")


if __name__ == "__main__":
    asyncio.run(main())
