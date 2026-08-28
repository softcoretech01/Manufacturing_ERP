"""Sync the permission catalogue into `sys_permission` and re-grant every code to
the admin roles.

`seed_dev.py` does this too, but only as part of bootstrapping a company — on an
existing database whose company code differs from its hard-coded "SSBIND" it
would create a spurious second company. This script touches permissions only, so
it is safe to run after adding new codes to `app.modules.iam.permissions`.

Run from the backend directory:  python scripts/sync_permissions.py
Idempotent.
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402
from app.core.ids import new_uid  # noqa: E402
from app.modules.iam import permissions as perm_cat  # noqa: E402


async def main() -> None:
    try:
        await _sync()
    finally:
        # Close the pool while the loop is still running. Without this the
        # connections are finalised after asyncio has shut down and aiomysql
        # prints an "Event loop is closed" traceback over a successful run.
        await engine.dispose()


async def _sync() -> None:
    catalogue = perm_cat.catalogue()

    async with engine.begin() as conn:
        existing = {
            row[0]
            for row in (await conn.execute(text("SELECT code FROM sys_permission"))).fetchall()
        }

        added = 0
        for perm in catalogue:
            if perm.code in existing:
                continue
            await conn.execute(
                text(
                    """
                    INSERT INTO sys_permission (uid, code, module, entity, action, label, is_sensitive)
                    VALUES (:uid, :code, :module, :entity, :action, :label, :is_sensitive)
                    """
                ),
                {
                    "uid": new_uid(),
                    "code": perm.code,
                    "module": perm.module,
                    "entity": perm.entity,
                    "action": perm.action,
                    "label": perm.label,
                    "is_sensitive": int(perm.is_sensitive),
                },
            )
            added += 1
            print(f"  + {perm.code}")

        # Re-grant the full catalogue to every admin role so new codes land.
        roles = (
            await conn.execute(
                text("SELECT id, code FROM sys_role WHERE code LIKE 'ADMIN%' AND deleted_at IS NULL")
            )
        ).fetchall()

        for role_id, role_code in roles:
            granted = {
                row[0]
                for row in (
                    await conn.execute(
                        text(
                            "SELECT permission_code FROM sys_role_permission WHERE role_id = :rid"
                        ),
                        {"rid": role_id},
                    )
                ).fetchall()
            }
            missing = [p.code for p in catalogue if p.code not in granted]
            for code in missing:
                await conn.execute(
                    text(
                        """
                        INSERT INTO sys_role_permission (role_id, permission_code, effect)
                        VALUES (:rid, :code, 'ALLOW')
                        """
                    ),
                    {"rid": role_id, "code": code},
                )
            print(f"Role {role_code}: granted {len(missing)} new code(s).")

    print(f"Catalogue has {len(catalogue)} codes; {added} inserted into sys_permission.")


if __name__ == "__main__":
    asyncio.run(main())
