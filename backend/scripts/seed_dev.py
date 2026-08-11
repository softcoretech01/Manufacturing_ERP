"""Dev seed: reference data (currencies + permission catalogue) + a bootstrap
company and admin user, so the API is immediately usable.

Run from the backend directory:  python scripts/seed_dev.py
Idempotent — safe to run more than once.
"""

from __future__ import annotations

import asyncio
import os
import sys

# Make the `app` package importable when run as a plain script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# aiomysql needs the selector loop on Windows.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import select

from app.core.database import session_scope
from app.modules.organisation.infrastructure.models import SysCompany
from app.seed import bootstrap_company_admin, seed_reference_data


async def main() -> None:
    async with session_scope() as s:
        await seed_reference_data(s)
        existing = (
            await s.execute(select(SysCompany).where(SysCompany.code == "SSBIND"))
        ).scalar_one_or_none()
        if existing is not None:
            print(f"Reference data ensured. Company SSBIND already present: {existing.uid}")
            return
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
        print("Seeded currencies + permission catalogue.")
        print(f"Company:  SSBIND  uid={res.company_uid}")
        print("Login:    admin / admin123")


if __name__ == "__main__":
    asyncio.run(main())
