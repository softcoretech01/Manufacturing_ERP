"""The routing revision flow, end to end, against a throwaway schema.

A routing revision keeps its document number: `RTG/26-27/0001` R3 and R4 are two
rows of one document, and approving R4 supersedes R3. That behaviour spans a
unique key, a transaction and three UPDATE statements, so it is verified against
a real MariaDB rather than stubs.

The schema is created and dropped by this module (`ssberp_routing_rev_test` by
default) and holds nothing but its own fixture rows. Production tables are never
opened: the repository is pointed at the throwaway schema through
`ERP_PRODUCT_SCHEMA` before it is imported.
"""

from __future__ import annotations

import asyncio
import importlib
import os
from datetime import datetime
from urllib.parse import quote_plus

import pytest
import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings

TEST_SCHEMA = os.getenv("ROUTING_TEST_SCHEMA", "ssberp_routing_rev_test")
# Quoted: this deployment's password contains characters that would otherwise be
# read as part of the host.
_USER = quote_plus(settings.db_user)
_PASSWORD = quote_plus(settings.db_password or "")
_BASE = f"{_USER}:{_PASSWORD}@{settings.db_host}:{settings.db_port}"
_SERVER_URL = f"mysql+aiomysql://{_BASE}/?charset=utf8mb4"
_SCHEMA_URL = f"mysql+aiomysql://{_BASE}/{TEST_SCHEMA}?charset=utf8mb4"

DOC = "RTG/26-27/0001"
PRODUCT = "FG-SS-750-BLK"
OTHER_DOC = "RTG/26-27/0002"
OTHER_PRODUCT = "SF-BODY-750"


def _server_reachable() -> bool:
    async def _check() -> bool:
        engine = create_async_engine(_SERVER_URL, poolclass=sa.pool.NullPool)
        try:
            async with engine.connect() as conn:
                await conn.execute(sa.text("SELECT 1"))
            return True
        except Exception:
            return False
        finally:
            await engine.dispose()

    try:
        return asyncio.get_event_loop().run_until_complete(_check())
    except RuntimeError:
        return asyncio.run(_check())


pytestmark = pytest.mark.skipif(
    not _server_reachable(), reason="MariaDB/MySQL not reachable — integration tests skipped"
)

DDL_ROUTING = """
CREATE TABLE EngineeringRouting (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    RouteCode VARCHAR(50) NOT NULL,
    ProductCode VARCHAR(50) NOT NULL,
    ProductName VARCHAR(150),
    Revision INT NOT NULL DEFAULT 1,
    Status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    EffectiveFrom DATETIME NOT NULL,
    EffectiveTo DATETIME NULL,
    IsDefault BOOLEAN NOT NULL DEFAULT 0,
    CostingLotSize INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NULL,
    ApprovedBy VARCHAR(100) NULL,
    ApprovedAt DATETIME NULL,
    SourceEcn VARCHAR(50) NULL,
    ChangeReason VARCHAR(1000) NULL,
    Version INT NOT NULL DEFAULT 1,
    DeletedAt DATETIME NULL,
    DefaultKey VARCHAR(50) GENERATED ALWAYS AS
        (IF(IsDefault = 1 AND DeletedAt IS NULL AND Status IN ('ACTIVE','APPROVED'), ProductCode, NULL)) STORED,
    UNIQUE KEY uk_engrouting_code_revision (RouteCode, Revision),
    UNIQUE KEY uk_engrouting_default_per_product (DefaultKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
"""

DDL_OPERATION = """
CREATE TABLE EngineeringRoutingOperation (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    RoutingId INT NOT NULL,
    Seq INT NOT NULL,
    OperationCode VARCHAR(50) NOT NULL,
    OperationName VARCHAR(150),
    WorkCentreCode VARCHAR(50) NOT NULL,
    MachineCode VARCHAR(50),
    SetupMinutes DECIMAL(10,2) NOT NULL DEFAULT 0,
    CycleSeconds DECIMAL(10,2) NOT NULL DEFAULT 0,
    Operators INT NOT NULL DEFAULT 1,
    Skill VARCHAR(50),
    ToolCode VARCHAR(50),
    QcCheckpoint BOOLEAN NOT NULL DEFAULT 0,
    Instructions VARCHAR(1000),
    FOREIGN KEY (RoutingId) REFERENCES EngineeringRouting(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
"""


@pytest_asyncio.fixture(scope="module")
async def modules():
    """Point the routing repository at the throwaway schema and build it."""
    server = create_async_engine(_SERVER_URL, poolclass=sa.pool.NullPool, isolation_level="AUTOCOMMIT")
    async with server.connect() as conn:
        await conn.execute(sa.text(f"DROP DATABASE IF EXISTS {TEST_SCHEMA}"))
        await conn.execute(sa.text(f"CREATE DATABASE {TEST_SCHEMA} CHARACTER SET utf8mb4"))
    await server.dispose()

    engine = create_async_engine(_SCHEMA_URL, poolclass=sa.pool.NullPool)
    async with engine.begin() as conn:
        await conn.execute(sa.text(DDL_ROUTING))
        await conn.execute(sa.text(DDL_OPERATION))

    previous = os.environ.get("ERP_PRODUCT_SCHEMA")
    os.environ["ERP_PRODUCT_SCHEMA"] = TEST_SCHEMA
    repo_mod = importlib.reload(importlib.import_module("app.repositories.engineering_routing_repository"))
    svc_mod = importlib.reload(importlib.import_module("app.services.engineering_routing_service"))

    yield svc_mod, repo_mod, engine

    await engine.dispose()
    if previous is None:
        os.environ.pop("ERP_PRODUCT_SCHEMA", None)
    else:
        os.environ["ERP_PRODUCT_SCHEMA"] = previous
    importlib.reload(repo_mod)
    importlib.reload(svc_mod)

    server = create_async_engine(_SERVER_URL, poolclass=sa.pool.NullPool, isolation_level="AUTOCOMMIT")
    async with server.connect() as conn:
        await conn.execute(sa.text(f"DROP DATABASE IF EXISTS {TEST_SCHEMA}"))
    await server.dispose()


@pytest_asyncio.fixture
async def fixture_rows(modules):
    """Reset to: DOC R3 ACTIVE (the live routing), plus one unrelated product."""
    _, _, engine = modules
    async with engine.begin() as conn:
        await conn.execute(sa.text("DELETE FROM EngineeringRoutingOperation"))
        await conn.execute(sa.text("DELETE FROM EngineeringRouting"))
        await conn.execute(
            sa.text(
                "INSERT INTO EngineeringRouting"
                " (Id, RouteCode, ProductCode, ProductName, Revision, Status, EffectiveFrom,"
                "  IsDefault, CostingLotSize, CreatedBy, CreatedDate)"
                " VALUES (1, :doc, :product, 'Bottle 750ml Black', 3, 'ACTIVE', '2026-06-15',"
                "  1, 500, 'seed', NOW())"
            ),
            {"doc": DOC, "product": PRODUCT},
        )
        await conn.execute(
            sa.text(
                "INSERT INTO EngineeringRouting"
                " (Id, RouteCode, ProductCode, ProductName, Revision, Status, EffectiveFrom,"
                "  IsDefault, CostingLotSize, CreatedBy, CreatedDate)"
                " VALUES (2, :doc, :product, 'Body shell 750', 2, 'ACTIVE', '2026-06-15',"
                "  1, 500, 'seed', NOW())"
            ),
            {"doc": OTHER_DOC, "product": OTHER_PRODUCT},
        )
        # R3 runs two lines on WC-07; the revision below will drop one of them,
        # which is what proves Used By follows the live revision.
        for seq, centre in ((10, "WC-07"), (20, "WC-07"), (30, "WC-08")):
            await conn.execute(
                sa.text(
                    "INSERT INTO EngineeringRoutingOperation"
                    " (RoutingId, Seq, OperationCode, OperationName, WorkCentreCode,"
                    "  SetupMinutes, CycleSeconds, Operators, QcCheckpoint)"
                    " VALUES (1, :seq, 'OP-090', 'Powder Coating', :centre, 25, 9, 3, 0)"
                ),
                {"seq": seq, "centre": centre},
            )
        await conn.execute(
            sa.text(
                "INSERT INTO EngineeringRoutingOperation"
                " (RoutingId, Seq, OperationCode, OperationName, WorkCentreCode,"
                "  SetupMinutes, CycleSeconds, Operators, QcCheckpoint)"
                " VALUES (2, 10, 'OP-020', 'Deep Drawing', 'WC-02', 45, 8, 2, 1)"
            )
        )
    return engine


def _payload(schema_mod, *, ops=(("WC-07", 10),), status="DRAFT", reason="Cycle time re-timed"):
    from app.schemas.engineering_routing import EngRoutingOperationSchema, EngRoutingSchema

    return EngRoutingSchema(
        productCode=PRODUCT,
        productName="Bottle 750ml Black",
        status=status,
        effectiveFrom=datetime(2026, 9, 11),
        costingLotSize=500,
        changeReason=reason,
        operations=[
            EngRoutingOperationSchema(
                seq=seq,
                operationCode="OP-090",
                operationName="Powder Coating",
                workCentreCode=centre,
                setupMinutes=25,
                cycleSeconds=9,
                operators=3,
                qcCheckpoint=False,
            )
            for centre, seq in ops
        ],
    )


async def _session(engine) -> AsyncSession:
    return AsyncSession(engine, expire_on_commit=False)


async def _rows(engine):
    async with engine.connect() as conn:
        result = await conn.execute(
            sa.text(
                "SELECT RouteCode, Revision, Status, IsDefault, ApprovedBy, EffectiveTo"
                " FROM EngineeringRouting WHERE DeletedAt IS NULL ORDER BY RouteCode, Revision"
            )
        )
        return [tuple(r) for r in result.fetchall()]


# ── Creation: new document vs revision ──────────────────────────────────────


async def test_new_routing_gets_a_new_document_number(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        uid = await service.create_routing(_payload(svc_mod), "Tester")
        routing = await service.repository.get_routing(uid)
    finally:
        await session.close()

    assert routing["docNo"] == "RTG-0001"  # first RTG-#### in this schema
    assert routing["revision"] == 1
    assert routing["status"] == "DRAFT"


async def test_revision_keeps_the_document_number_and_increments(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod), "Tester")
    finally:
        await session.close()

    assert created["docNo"] == DOC, "a revision must not mint a new document number"
    assert created["revision"] == 4

    rows = await _rows(engine)
    assert (DOC, 3, "ACTIVE", 1, None, None) in rows, "R3 stays live until R4 is approved"
    assert (DOC, 4, "DRAFT", 0, None, None) in rows, "R4 is a draft and not the default"


async def test_duplicate_code_and_revision_is_rejected(modules, fixture_rows):
    """The database, not the application, is what guarantees the identity."""
    _, _, engine = modules
    with pytest.raises(Exception) as exc:
        async with engine.begin() as conn:
            await conn.execute(
                sa.text(
                    "INSERT INTO EngineeringRouting"
                    " (RouteCode, ProductCode, Revision, Status, EffectiveFrom, CreatedBy, CreatedDate)"
                    " VALUES (:doc, :product, 3, 'DRAFT', '2026-09-11', 'tester', NOW())"
                ),
                {"doc": DOC, "product": PRODUCT},
            )
    assert "uk_engrouting_code_revision" in str(exc.value) or "Duplicate" in str(exc.value)


async def test_revision_of_a_draft_is_refused(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod), "Tester")
        with pytest.raises(Exception) as exc:
            await service.create_revision(created["uid"], _payload(svc_mod), "Tester")
    finally:
        await session.close()
    assert "nothing to revise" in str(exc.value)


async def test_revision_requires_a_reason(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        with pytest.raises(Exception) as exc:
            await service.create_revision("1", _payload(svc_mod, reason="   "), "Tester")
    finally:
        await session.close()
    assert "reason" in str(exc.value).lower()


# ── Status is the server's ──────────────────────────────────────────────────


async def test_client_cannot_create_an_active_routing(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        with pytest.raises(Exception) as exc:
            await service.create_routing(_payload(svc_mod, status="ACTIVE"), "Tester")
    finally:
        await session.close()
    assert "cannot be saved as ACTIVE" in str(exc.value)


async def test_client_cannot_activate_by_update(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod), "Tester")
        with pytest.raises(Exception) as exc:
            await service.update_routing(created["uid"], _payload(svc_mod, status="ACTIVE"), "Tester")
    finally:
        await session.close()
    assert "cannot be saved as ACTIVE" in str(exc.value)


async def test_live_routing_cannot_be_edited_in_place(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        with pytest.raises(Exception) as exc:
            await service.update_routing("1", _payload(svc_mod), "Tester")
    finally:
        await session.close()
    assert "not edited in place" in str(exc.value)


# ── Approval ────────────────────────────────────────────────────────────────


async def test_approving_a_revision_supersedes_the_previous_one(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod), "Tester")
        result = await service.approve_routing(created["uid"], "Meera Rajan")
    finally:
        await session.close()

    assert result["superseded"] == ["R3"]
    rows = dict(((code, rev), (status, is_default, approver)) for code, rev, status, is_default, approver, _ in await _rows(engine))
    assert rows[(DOC, 3)][0] == "SUPERSEDED"
    assert rows[(DOC, 3)][1] == 0
    assert rows[(DOC, 4)][0] == "ACTIVE"
    assert rows[(DOC, 4)][1] == 1, "the approved revision is the default"
    assert rows[(DOC, 4)][2] == "Meera Rajan", "approver comes from the caller's identity"
    # Another product's routing is untouched.
    assert rows[(OTHER_DOC, 2)][0] == "ACTIVE"


async def test_only_one_live_default_survives_approval(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod), "Tester")
        await service.approve_routing(created["uid"], "Meera Rajan")
    finally:
        await session.close()

    async with engine.connect() as conn:
        result = await conn.execute(
            sa.text(
                "SELECT ProductCode, COUNT(*) FROM EngineeringRouting"
                " WHERE IsDefault = 1 AND DeletedAt IS NULL AND Status IN ('ACTIVE','APPROVED')"
                " GROUP BY ProductCode"
            )
        )
        per_product = {row[0]: row[1] for row in result.fetchall()}
    assert per_product == {PRODUCT: 1, OTHER_PRODUCT: 1}


async def test_approval_rolls_back_entirely_when_a_step_fails(modules, fixture_rows):
    """Half an approval is worse than none: R3 superseded with no live successor."""
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod), "Tester")

        async def boom(*_args, **_kwargs):
            raise RuntimeError("simulated failure while activating")

        service.repository.activate = boom  # type: ignore[assignment]
        with pytest.raises(RuntimeError):
            await service.approve_routing(created["uid"], "Meera Rajan")
    finally:
        await session.close()

    rows = dict(((code, rev), status) for code, rev, status, *_ in await _rows(engine))
    assert rows[(DOC, 3)] == "ACTIVE", "the previous revision must not be left superseded"
    assert rows[(DOC, 4)] == "DRAFT"


async def test_a_superseded_routing_cannot_be_approved_again(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod), "Tester")
        await service.approve_routing(created["uid"], "Meera Rajan")
        with pytest.raises(Exception) as exc:
            await service.approve_routing("1", "Meera Rajan")  # R3, now superseded
    finally:
        await session.close()
    assert "cannot be approved" in str(exc.value)


# ── Used By follows the live revision ───────────────────────────────────────


async def test_used_by_counts_the_new_revision_not_the_superseded_one(modules, fixture_rows):
    """The Used By definition is unchanged; superseded lines simply stop qualifying.

    R3 runs two lines on WC-07. R4 runs one. After approval the work centre must
    read 1, not 3.
    """
    from app.repositories.engineering_workcentre_repository import LIVE_ROUTING_USAGE_SQL

    usage_sql = LIVE_ROUTING_USAGE_SQL.replace("ERP_Product.", f"{TEST_SCHEMA}.")
    svc_mod, _, engine = modules

    async def used_by(code: str) -> int:
        async with engine.connect() as conn:
            return (await conn.execute(sa.text(usage_sql), {"code": code})).scalar()

    assert await used_by("WC-07") == 2, "R3's two lines while R3 is the live revision"

    session = await _session(engine)
    try:
        service = svc_mod.EngineeringRoutingService(session)
        created = await service.create_revision("1", _payload(svc_mod, ops=(("WC-07", 10),)), "Tester")
        assert await used_by("WC-07") == 2, "a draft revision adds nothing"
        await service.approve_routing(created["uid"], "Meera Rajan")
    finally:
        await session.close()

    assert await used_by("WC-07") == 1, "only the live revision counts"
    assert await used_by("WC-08") == 0, "R3's other centre drops out with R3"
