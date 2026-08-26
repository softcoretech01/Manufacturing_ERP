"""Integration-test harness. Runs against a REAL MySQL 8 (CLAUDE.md §8 — never
SQLite). The whole module is skipped with a clear message if the server is not
reachable, so `pytest tests/unit` always runs even without Docker up.

Test DB: `TEST_DB_NAME` (default `ssberp_test`). If the configured DB user may
not create databases, create it once and grant:

    CREATE DATABASE ssberp_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    GRANT ALL ON ssberp_test.* TO 'ssberp'@'%';

Isolation: each test runs inside a transaction that is rolled back at the end,
and the API client shares that same session, so tests never see each other's rows.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.core.database import get_session
from app.core.enums import PermissionEffect
from app.core.ids import new_uid
from app.core.security import hash_password
from app.core.time import utcnow
from app.main import app
from app.models import Base
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import (
    SysRole,
    SysRolePermission,
    SysUser,
    SysUserCompany,
    SysUserRole,
)
from app.seed import bootstrap_company_admin, seed_reference_data

_DB_NAME = os.getenv("TEST_DB_NAME", "ssberp_test")
_BASE = f"{settings.db_user}:{settings.db_password}@{settings.db_host}:{settings.db_port}"
SYNC_URL = f"mysql+pymysql://{_BASE}/{_DB_NAME}?charset=utf8mb4"
ASYNC_URL = f"mysql+aiomysql://{_BASE}/{_DB_NAME}?charset=utf8mb4"

_async_engine = create_async_engine(ASYNC_URL, poolclass=sa.pool.NullPool)


def _server_reachable() -> bool:
    server = sa.create_engine(f"mysql+pymysql://{_BASE}/?charset=utf8mb4")
    try:
        with server.connect() as conn:
            conn.execute(
                sa.text(
                    f"CREATE DATABASE IF NOT EXISTS {_DB_NAME} "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
                )
            )
        return True
    except Exception:
        return False
    finally:
        server.dispose()


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    if not _server_reachable():
        pytest.skip(
            "MySQL is not reachable — start Docker (`docker compose up -d mysql`) and "
            "ensure the test database exists. Integration tests need real MySQL, not SQLite.",
            allow_module_level=False,
        )
    sync_engine = sa.create_engine(SYNC_URL)
    Base.metadata.drop_all(sync_engine)
    Base.metadata.create_all(sync_engine)
    yield
    Base.metadata.drop_all(sync_engine)
    sync_engine.dispose()


@pytest_asyncio.fixture
async def db() -> AsyncIterator[AsyncSession]:
    async with _async_engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ─────────────────────────── Seed: two companies, graded users ──────────────
@dataclass(slots=True)
class World:
    company_a_uid: str
    company_a_id: int
    company_b_uid: str
    company_b_id: int
    admin_a: str  # login ids
    admin_b: str
    viewer_a: str
    noperm_a: str
    password: str


async def _add_user(
    db: AsyncSession, *, company_id: int, login_id: str, password: str, perms: list[str]
) -> None:
    now = utcnow()
    role = SysRole(
        uid=new_uid(),
        company_id=company_id,
        code=f"ROLE_{login_id}",
        name=login_id,
        role_type="INTERNAL",
        is_active=True,
        version=1,
        created_at=now,
        created_by=0,
        updated_at=now,
        updated_by=0,
    )
    db.add(role)
    await db.flush()
    for code in perms:
        db.add(
            SysRolePermission(
                role_id=role.id, permission_code=code, effect=PermissionEffect.ALLOW.value
            )
        )
    user = SysUser(
        uid=new_uid(),
        login_id=login_id,
        email=f"{login_id}@x.com",
        full_name=login_id,
        password_hash=hash_password(password),
        user_type="INTERNAL",
        status="ACTIVE",
        default_company_id=company_id,
        version=1,
        created_at=now,
        created_by=0,
        updated_at=now,
        updated_by=0,
    )
    db.add(user)
    await db.flush()
    db.add(SysUserCompany(user_id=user.id, company_id=company_id, is_default=True))
    db.add(SysUserRole(user_id=user.id, role_id=role.id, company_id=company_id))
    await db.flush()


@pytest_asyncio.fixture
async def world(db: AsyncSession) -> World:
    pw = "Passw0rd!xyz"
    await seed_reference_data(db)
    a = await bootstrap_company_admin(
        db,
        company_code="SSBIND",
        company_name="SSB Industries Pvt Ltd",
        login_id="admin_a",
        password=pw,
        full_name="Admin A",
        pan="AABCS1429B",
        gst_state_code="33",
    )
    b = await bootstrap_company_admin(
        db,
        company_code="SSBEXP",
        company_name="SSB Exports LLP",
        login_id="admin_b",
        password=pw,
        full_name="Admin B",
        pan="AAECS9911K",
        gst_state_code="29",
    )
    view_perms = [c for c in perm_cat.ALL_CODES if c.endswith(".VIEW")]
    await _add_user(db, company_id=a.company_id, login_id="viewer_a", password=pw, perms=view_perms)
    await _add_user(db, company_id=a.company_id, login_id="noperm_a", password=pw, perms=[])
    return World(
        company_a_uid=a.company_uid,
        company_a_id=a.company_id,
        company_b_uid=b.company_uid,
        company_b_id=b.company_id,
        admin_a="admin_a",
        admin_b="admin_b",
        viewer_a="viewer_a",
        noperm_a="noperm_a",
        password=pw,
    )


@pytest_asyncio.fixture
def login(client: AsyncClient):
    async def _login(
        login_id: str, password: str, company_uid: str | None = None
    ) -> dict[str, str]:
        body: dict[str, str] = {"login_id": login_id, "password": password}
        if company_uid:
            body["company_uid"] = company_uid
        resp = await client.post("/api/v1/auth/login", json=body)
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    return _login
