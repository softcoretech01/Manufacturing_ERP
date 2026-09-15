"""Applying an engineering change, end to end, against a throwaway schema.

Applying ECN-0004 to BOM/26-27/0005 R1 must leave R1 superseded and R2 live under
the same document number, with the product's default flag moved across and the
change closed as implemented. That spans a unique key, a transaction and four
statements, so it is verified against a real MariaDB.

The schema is created and dropped here and holds nothing but its own fixture
rows. The repository is pointed at it through `ERP_PRODUCT_SCHEMA` before it is
imported, so production tables are never opened.
"""

from __future__ import annotations

import asyncio
import importlib
import os
from urllib.parse import quote_plus

import pytest
import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings

TEST_SCHEMA = os.getenv("CHANGE_TEST_SCHEMA", "ssberp_change_apply_test")
_BASE = f"{quote_plus(settings.db_user)}:{quote_plus(settings.db_password or '')}@{settings.db_host}:{settings.db_port}"
_SERVER_URL = f"mysql+aiomysql://{_BASE}/?charset=utf8mb4"
_SCHEMA_URL = f"mysql+aiomysql://{_BASE}/{TEST_SCHEMA}?charset=utf8mb4"

BOM_DOC = "BOM/26-27/0005"
PRODUCT = "FG-SS-1000-STL"
ECN = "ECN-0004"


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

    return asyncio.run(_check())


pytestmark = pytest.mark.skipif(
    not _server_reachable(), reason="MariaDB/MySQL not reachable — integration tests skipped"
)

DDL = [
    """
    CREATE TABLE EngineeringBom (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        DocNo VARCHAR(50) NOT NULL,
        ProductCode VARCHAR(50) NOT NULL,
        ProductName VARCHAR(150),
        BomType VARCHAR(30) NOT NULL DEFAULT 'MANUFACTURING',
        Revision INT NOT NULL DEFAULT 1,
        Status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        BaseQty DECIMAL(18,6) NOT NULL DEFAULT 1,
        Uom VARCHAR(20) NOT NULL DEFAULT 'NOS',
        EffectiveFrom DATE NOT NULL,
        EffectiveTo DATE NULL,
        IsDefault TINYINT(1) NOT NULL DEFAULT 0,
        AlternateFor VARCHAR(50) NULL,
        CreatedBy VARCHAR(100) NOT NULL,
        CreatedAt DATETIME NOT NULL,
        ApprovedBy VARCHAR(100) NULL,
        ApprovedAt DATETIME NULL,
        SourceEcn VARCHAR(50) NULL,
        ChangeReason VARCHAR(1000) NULL,
        Version INT NOT NULL DEFAULT 1,
        DeletedAt DATETIME NULL,
        DefaultKey VARCHAR(50) GENERATED ALWAYS AS
            (IF(IsDefault = 1 AND DeletedAt IS NULL AND Status IN ('ACTIVE','APPROVED'), ProductCode, NULL)) STORED,
        UNIQUE KEY uk_engbom_docno_revision (DocNo, Revision),
        UNIQUE KEY uk_engbom_default_per_product (DefaultKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    """,
    """
    CREATE TABLE EngineeringBomLine (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        BomId INT NOT NULL,
        Seq INT NOT NULL,
        ItemCode VARCHAR(50) NOT NULL,
        ItemName VARCHAR(150),
        Uom VARCHAR(20) NOT NULL DEFAULT 'NOS',
        QtyPer DECIMAL(18,6) NOT NULL DEFAULT 0,
        ScrapPct DECIMAL(9,4) NOT NULL DEFAULT 0,
        IsPhantom TINYINT(1) NOT NULL DEFAULT 0,
        OperationSeq INT NULL,
        Notes VARCHAR(500) NULL,
        FOREIGN KEY (BomId) REFERENCES EngineeringBom(Id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    """,
    """
    CREATE TABLE EngineeringChange (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        DocNo VARCHAR(50) NOT NULL,
        ChangeType VARCHAR(10) NOT NULL DEFAULT 'ECN',
        Title VARCHAR(200) NOT NULL,
        Reason VARCHAR(2000) NULL,
        Category VARCHAR(50) NULL,
        Priority VARCHAR(20) NULL,
        ProductCode VARCHAR(50) NULL,
        RequestedBy VARCHAR(100) NULL,
        RequestedOn DATE NULL,
        EffectiveFrom DATE NOT NULL,
        ImpactNote VARCHAR(2000) NULL,
        Status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        SourceEcr VARCHAR(50) NULL,
        ResultingBom VARCHAR(200) NULL,
        IsActive TINYINT(1) NOT NULL DEFAULT 1,
        CreatedBy VARCHAR(100) NULL,
        CreatedDate DATETIME NULL,
        ModifiedBy VARCHAR(100) NULL,
        ModifiedDate DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    """,
    """
    CREATE TABLE EngineeringChangeLine (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        ChangeId INT NOT NULL,
        BomDocNo VARCHAR(50) NOT NULL,
        Action VARCHAR(20) NOT NULL,
        ItemCode VARCHAR(50) NOT NULL,
        NewItemCode VARCHAR(50) NULL,
        NewQtyPer DECIMAL(18,6) NULL,
        NewScrapPct DECIMAL(9,4) NULL,
        Note VARCHAR(500) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    """,
]


@pytest_asyncio.fixture(scope="module")
async def modules():
    server = create_async_engine(_SERVER_URL, poolclass=sa.pool.NullPool, isolation_level="AUTOCOMMIT")
    async with server.connect() as conn:
        await conn.execute(sa.text(f"DROP DATABASE IF EXISTS {TEST_SCHEMA}"))
        await conn.execute(sa.text(f"CREATE DATABASE {TEST_SCHEMA} CHARACTER SET utf8mb4"))
    await server.dispose()

    engine = create_async_engine(_SCHEMA_URL, poolclass=sa.pool.NullPool)
    async with engine.begin() as conn:
        for statement in DDL:
            await conn.execute(sa.text(statement))

    previous = os.environ.get("ERP_PRODUCT_SCHEMA")
    os.environ["ERP_PRODUCT_SCHEMA"] = TEST_SCHEMA
    repo_mod = importlib.reload(
        importlib.import_module("app.repositories.engineering_change_apply_repository")
    )
    svc_mod = importlib.reload(importlib.import_module("app.services.engineering_change_service"))

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
    """BOM/26-27/0005 R1 live with three lines, and an approved ECN against it."""
    _, _, engine = modules
    async with engine.begin() as conn:
        for table in ("EngineeringChangeLine", "EngineeringChange", "EngineeringBomLine", "EngineeringBom"):
            await conn.execute(sa.text(f"DELETE FROM {table}"))
        await conn.execute(
            sa.text(
                "INSERT INTO EngineeringBom (Id, DocNo, ProductCode, ProductName, Revision, Status,"
                " BaseQty, Uom, EffectiveFrom, IsDefault, CreatedBy, CreatedAt)"
                " VALUES (1, :doc, :product, 'Vacuum Flask 1000', 1, 'ACTIVE', 1, 'NOS',"
                " '2026-06-15', 1, 'seed', NOW())"
            ),
            {"doc": BOM_DOC, "product": PRODUCT},
        )
        for seq, code, qty in ((1, "SF-BODY-1000", 1), (2, "SF-LID-ASSY-SS", 1), (3, "PKG-CARTON", 1)):
            await conn.execute(
                sa.text(
                    "INSERT INTO EngineeringBomLine (BomId, Seq, ItemCode, ItemName, Uom, QtyPer, ScrapPct)"
                    " VALUES (1, :seq, :code, :code, 'NOS', :qty, 0)"
                ),
                {"seq": seq, "code": code, "qty": qty},
            )
        await conn.execute(
            sa.text(
                "INSERT INTO EngineeringChange (Id, DocNo, Title, Status, EffectiveFrom, ProductCode,"
                " RequestedBy, CreatedBy, CreatedDate)"
                " VALUES (1, :ecn, 'SteelSip Bottles', 'APPROVED', '2026-09-11', :product,"
                " 'Rahul Iyer', 'seed', NOW())"
            ),
            {"ecn": ECN, "product": PRODUCT},
        )
        await conn.execute(
            sa.text(
                "INSERT INTO EngineeringChangeLine (ChangeId, BomDocNo, Action, ItemCode, NewQtyPer, NewScrapPct)"
                " VALUES (1, :doc, 'ADD', 'CON-GAS-ARG', 0.02, 1)"
            ),
            {"doc": BOM_DOC},
        )
    return engine


async def _session(engine) -> AsyncSession:
    return AsyncSession(engine, expire_on_commit=False)


async def _boms(engine):
    async with engine.connect() as conn:
        result = await conn.execute(
            sa.text(
                "SELECT DocNo, Revision, Status, IsDefault, SourceEcn, ApprovedBy"
                " FROM EngineeringBom ORDER BY DocNo, Revision"
            )
        )
        return [tuple(r) for r in result.fetchall()]


# ── The apply ───────────────────────────────────────────────────────────────


async def test_apply_creates_the_next_revision_of_the_same_document(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringChangeService(session)
        result = await service.apply_change("1", "Meera Rajan")
    finally:
        await session.close()

    assert result["resultingBom"] == [f"{BOM_DOC} R2"]
    assert result["status"] == "IMPLEMENTED"

    boms = await _boms(engine)
    assert (BOM_DOC, 1, "SUPERSEDED", 0, None, None) in boms, "R1 steps down, it is not deleted"
    assert (BOM_DOC, 2, "ACTIVE", 1, ECN, "Meera Rajan") in boms, "R2 is live, default, and credits the ECN"


async def test_the_new_revision_carries_the_changed_lines(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringChangeService(session)
        await service.apply_change("1", "Meera Rajan")
    finally:
        await session.close()

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                sa.text(
                    "SELECT l.ItemCode, l.QtyPer FROM EngineeringBomLine l"
                    " JOIN EngineeringBom b ON b.Id = l.BomId"
                    " WHERE b.Revision = 2 ORDER BY l.Seq"
                )
            )
        ).fetchall()
    assert [r[0] for r in rows] == ["SF-BODY-1000", "SF-LID-ASSY-SS", "PKG-CARTON", "CON-GAS-ARG"]
    assert float(rows[-1][1]) == 0.02

    async with engine.connect() as conn:
        original = (
            await conn.execute(
                sa.text("SELECT COUNT(*) FROM EngineeringBomLine WHERE BomId = 1")
            )
        ).scalar()
    assert original == 3, "the superseded revision keeps the structure it was built to"


async def test_only_one_live_default_per_product_survives(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringChangeService(session)
        await service.apply_change("1", "Meera Rajan")
    finally:
        await session.close()

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                sa.text(
                    "SELECT ProductCode, COUNT(*) FROM EngineeringBom"
                    " WHERE IsDefault = 1 AND DeletedAt IS NULL AND Status IN ('ACTIVE','APPROVED')"
                    " GROUP BY ProductCode"
                )
            )
        ).fetchall()
    assert [tuple(r) for r in rows] == [(PRODUCT, 1)]


async def test_a_change_can_only_be_applied_once(modules, fixture_rows):
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringChangeService(session)
        await service.apply_change("1", "Meera Rajan")
        with pytest.raises(Exception) as exc:
            await service.apply_change("1", "Meera Rajan")
    finally:
        await session.close()
    assert "IMPLEMENTED" in str(exc.value)


async def test_an_unapproved_change_is_refused(modules, fixture_rows):
    _, _, engine = modules
    async with engine.begin() as conn:
        await conn.execute(sa.text("UPDATE EngineeringChange SET Status = 'PENDING_APPROVAL' WHERE Id = 1"))

    svc_mod, _, _ = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringChangeService(session)
        with pytest.raises(Exception) as exc:
            await service.apply_change("1", "Meera Rajan")
    finally:
        await session.close()
    assert "Only an approved change" in str(exc.value)
    assert len(await _boms(engine)) == 1, "nothing was written"


async def test_a_failure_rolls_the_whole_apply_back(modules, fixture_rows):
    """A bill superseded with no successor is a product that cannot be made."""
    svc_mod, _, engine = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringChangeService(session)

        async def boom(*_args, **_kwargs):
            raise RuntimeError("simulated failure while writing the new lines")

        service.apply_repository.insert_lines = boom  # type: ignore[assignment]
        with pytest.raises(RuntimeError):
            await service.apply_change("1", "Meera Rajan")
    finally:
        await session.close()

    boms = await _boms(engine)
    assert boms == [(BOM_DOC, 1, "ACTIVE", 1, None, None)], "R1 is untouched and still live"

    async with engine.connect() as conn:
        status = (await conn.execute(sa.text("SELECT Status FROM EngineeringChange WHERE Id = 1"))).scalar()
    assert status == "APPROVED", "the change stays open for another attempt"


async def test_a_change_whose_bill_has_no_live_revision_changes_nothing(modules, fixture_rows):
    _, _, engine = modules
    async with engine.begin() as conn:
        await conn.execute(sa.text("UPDATE EngineeringBom SET Status = 'DRAFT' WHERE Id = 1"))

    svc_mod, _, _ = modules
    session = await _session(engine)
    try:
        service = svc_mod.EngineeringChangeService(session)
        with pytest.raises(Exception) as exc:
            await service.apply_change("1", "Meera Rajan")
    finally:
        await session.close()
    assert "no bill with a live revision" in str(exc.value)


async def test_duplicate_document_and_revision_is_rejected_by_the_database(modules, fixture_rows):
    _, _, engine = modules
    with pytest.raises(Exception) as exc:
        async with engine.begin() as conn:
            await conn.execute(
                sa.text(
                    "INSERT INTO EngineeringBom (DocNo, ProductCode, Revision, Status, EffectiveFrom,"
                    " CreatedBy, CreatedAt) VALUES (:doc, :product, 1, 'DRAFT', '2026-09-11', 'tester', NOW())"
                ),
                {"doc": BOM_DOC, "product": PRODUCT},
            )
    assert "uk_engbom_docno_revision" in str(exc.value) or "Duplicate" in str(exc.value)
