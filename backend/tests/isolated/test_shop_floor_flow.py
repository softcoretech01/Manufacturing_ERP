"""The shop floor, end to end, against a throwaway database.

One order for 500 of FG-SS-750-BLK is released, its operations are run, 490 pass
and 10 are scrapped, and 490 reach finished goods. Every assertion is read back
from the database rather than from a service's return value.

The schema is created and dropped by this module. It holds only its own fixture
rows: the production, planning, inventory and master tables this flow touches.
"""

from __future__ import annotations

import asyncio
import os
from decimal import Decimal
from urllib.parse import quote_plus

import pytest
import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.core.context import TenantContext
from app.models import Base

TEST_DB = os.getenv("SHOPFLOOR_TEST_DB", "ssberp_shopfloor_test")
_BASE = f"{quote_plus(settings.db_user)}:{quote_plus(settings.db_password or '')}@{settings.db_host}:{settings.db_port}"
_SERVER_URL = f"mysql+aiomysql://{_BASE}/?charset=utf8mb4"
_DB_URL = f"mysql+aiomysql://{_BASE}/{TEST_DB}?charset=utf8mb4"

COMPANY_ID = 1
PRODUCT = "FG-SS-750-BLK"
ORDER_QTY = Decimal("500")


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


def _ctx() -> TenantContext:
    return TenantContext(
        user_id=1,
        user_uid="01TESTUSER0000000000000001",
        user_name="A. Operator",
        login_id="operator",
        company_id=COMPANY_ID,
        company_uid="01TESTCOMPANY000000000001",
        branch_id=None,
    )


#: Structure is copied from the live schema rather than built from the model
#: metadata: `create_all` trips over a duplicate `branch_id` index name in the
#: planning models, and copying the real DDL also means these tests run against
#: the column definitions actually in production. Structure only — never rows.
TABLES = (
    "mst_item",
    "sys_warehouse",
    "inv_stock_balance",
    "inv_stock_ledger",
    "pp_production_order",
    "pp_prod_order_component",
    "pp_prod_order_operation",
    "prd_work_order",
    "prd_production_entry",
    "prd_production_entry_scrap",
    "prd_scrap",
)


@pytest_asyncio.fixture(scope="module")
async def engine():
    source = settings.db_name
    server = create_async_engine(_SERVER_URL, poolclass=sa.pool.NullPool, isolation_level="AUTOCOMMIT")
    async with server.connect() as conn:
        await conn.execute(sa.text(f"DROP DATABASE IF EXISTS {TEST_DB}"))
        await conn.execute(sa.text(f"CREATE DATABASE {TEST_DB} CHARACTER SET utf8mb4"))
        for table in TABLES:
            await conn.execute(sa.text(f"CREATE TABLE {TEST_DB}.{table} LIKE {source}.{table}"))
    await server.dispose()

    eng = create_async_engine(_DB_URL, poolclass=sa.pool.NullPool)

    yield eng

    await eng.dispose()
    server = create_async_engine(_SERVER_URL, poolclass=sa.pool.NullPool, isolation_level="AUTOCOMMIT")
    async with server.connect() as conn:
        await conn.execute(sa.text(f"DROP DATABASE IF EXISTS {TEST_DB}"))
    await server.dispose()


@pytest_asyncio.fixture
async def seeded(engine):
    """A released-ready order for 500, its components, its five operations, and stock."""
    from app.core.time import utcnow
    from app.modules.masters.infrastructure.models import MstItem
    from app.modules.planning.infrastructure.models import (
        PpProdOrderComponent,
        PpProdOrderOperation,
        PpProductionOrder,
    )

    now = utcnow()
    audit = dict(
        company_id=COMPANY_ID, created_at=now, created_by=1, updated_at=now, updated_by=1, version=1
    )

    async with engine.begin() as conn:
        for table in (
            "prd_production_entry_scrap", "prd_scrap", "prd_production_entry", "prd_work_order",
            "pp_prod_order_operation", "pp_prod_order_component", "pp_production_order",
            "inv_stock_ledger", "inv_stock_balance", "mst_item", "sys_warehouse",
        ):
            await conn.execute(sa.text(f"DELETE FROM {table}"))
        await conn.execute(
            sa.text(
                "INSERT INTO sys_warehouse (id, uid, company_id, code, name, warehouse_type,"
                " is_bin_managed, is_batch_mandatory, allow_negative_stock, is_system_managed,"
                " valuation_method, is_active, created_at, created_by, updated_at, updated_by, version)"
                " VALUES (1, 'WH000000000000000000000001', :cid, 'FG-STORE', 'Finished goods',"
                " 'FINISHED_GOODS', 0, 0, 0, 0, 'MOVING_AVERAGE', 1, NOW(6), 1, NOW(6), 1, 1)"
            ),
            {"cid": COMPANY_ID},
        )

    session = AsyncSession(engine, expire_on_commit=False)
    try:
        # Two components and the finished product, with stock to draw on.
        for idx, (code, name, itype, qty) in enumerate(
            [
                ("RM-SS304-050", "SS304 coil", "RAW_MATERIAL", Decimal("400")),
                ("CMP-LID-SCR-SS", "Screw cap", "COMPONENT", Decimal("600")),
                (PRODUCT, "Vacuum Flask 750 ml", "FINISHED", Decimal("0")),
            ],
            start=1,
        ):
            session.add(
                MstItem(
                    id=idx, uid=f"IT{idx:024d}", code=code, name=name, item_type=itype,
                    base_uom="NOS", is_active=True, **audit,
                )
            )
        await session.flush()

        order = PpProductionOrder(
            id=1, uid="PO00000000000000000000001", doc_no="PRD/TEST/00001",
            order_type="STANDARD", product_code=PRODUCT, product_name="Vacuum Flask 750 ml",
            uom="NOS", qty=float(ORDER_QTY), produced_qty=0, rejected_qty=0,
            plant="Chennai", warehouse="FG-STORE", priority="NORMAL", status="PLANNED",
            bom_doc_no="BOM/26-27/0001", bom_revision=3,
            routing_doc_no="RTG/26-27/0001", routing_revision=3,
            demand_refs=[], estimated_unit_cost=201.91, **audit,
        )
        session.add(order)
        await session.flush()

        # Components: 1 coil-piece and 1 cap per unit, so 500 of each.
        for idx, (code, name) in enumerate(
            [("RM-SS304-050", "SS304 coil"), ("CMP-LID-SCR-SS", "Screw cap")], start=1
        ):
            session.add(
                PpProdOrderComponent(
                    id=idx, uid=f"CM{idx:024d}", order_id=order.id, item_code=code, item_name=name,
                    uom="NOS", required_qty=500, reserved_qty=0, issued_qty=0,
                    available_at_planning=0, **audit,
                )
            )

        for idx, (seq, code, name, wc, qc) in enumerate(
            [
                (10, "OP-090", "Powder Coating", "WC-07", False),
                (20, "OP-100", "Logo Marking", "WC-08", False),
                (30, "OP-120", "Final Assembly", "WC-10", True),
                (40, "OP-070", "Leak Testing", "WC-06", True),
                (50, "OP-130", "Cartoning", "WC-09", False),
            ],
            start=1,
        ):
            session.add(
                PpProdOrderOperation(
                    id=idx, uid=f"OP{idx:024d}", order_id=order.id, seq=seq, operation_code=code,
                    operation_name=name, work_centre_code=wc, machine_code="", operators=2,
                    skill="Operator", tool_code=None, qc_checkpoint=qc, setup_minutes=20,
                    run_minutes=120, planned_start="2026-09-12", planned_finish="2026-09-13",
                    status="PLANNED", **audit,
                )
            )
        await session.commit()
    finally:
        await session.close()

    # Opening stock for the two components, posted through the real engine.
    from app.modules.inventory.application.stock_service import StockService
    from app.core.enums import MovementDirection

    session = AsyncSession(engine, expire_on_commit=False)
    try:
        stock = StockService(session, _ctx())
        for code, qty, rate in (("RM-SS304-050", 800, 160), ("CMP-LID-SCR-SS", 900, 21)):
            item = (
                await session.execute(sa.select(MstItem).where(MstItem.code == code))
            ).scalar_one()
            await stock.post_movement(
                item=item, warehouse_id=1, direction=MovementDirection.IN.value,
                quantity=Decimal(str(qty)), rate=Decimal(str(rate)), movement_type="RECEIPT",
                document_type="OPENING", document_no="OPENING",
            )
        await session.commit()
    finally:
        await session.close()

    return engine


async def _session(engine) -> AsyncSession:
    return AsyncSession(engine, expire_on_commit=False)


async def _rows(engine, sql: str, **params):
    async with engine.connect() as conn:
        return [tuple(r) for r in (await conn.execute(sa.text(sql), params)).fetchall()]


async def _release(engine):
    from app.modules.production.application.release_service import ProductionReleaseService

    session = await _session(engine)
    try:
        result = await ProductionReleaseService(session, _ctx()).release("PO00000000000000000000001")
        await session.commit()
        return result
    finally:
        await session.close()


async def _service(engine):
    from app.modules.production.application.execution_service import ProductionExecutionService

    session = await _session(engine)
    return ProductionExecutionService(session, _ctx()), session


# ── Release ─────────────────────────────────────────────────────────────────


async def test_release_generates_one_work_order_per_operation(seeded):
    result = await _release(seeded)
    assert len(result["workOrders"]) == 5

    rows = await _rows(
        seeded,
        "SELECT seq, operation_name, work_centre_code, status, input_qty, qc_checkpoint"
        " FROM prd_work_order ORDER BY seq",
    )
    assert [r[0] for r in rows] == [10, 20, 30, 40, 50]
    assert rows[0][3] == "READY" and float(rows[0][4]) == 500.0, "operation 10 is ready with the order quantity"
    assert all(r[3] == "QUEUED" and float(r[4]) == 0.0 for r in rows[1:]), "later operations wait, with nothing to work on"
    assert rows[2][5] == 1, "the QC checkpoint came from the routing snapshot"

    status = (await _rows(seeded, "SELECT status FROM pp_production_order"))[0][0]
    assert status == "RELEASED"


async def test_releasing_twice_is_refused(seeded):
    """Twice guarded: the status refuses first, the existing work refuses second."""
    await _release(seeded)

    with pytest.raises(Exception) as exc:
        await _release(seeded)
    assert "is RELEASED and cannot be released" in str(exc.value)

    # Even with the status forced back, the work already on the floor is what
    # stops a second set of work orders being written.
    async with seeded.begin() as conn:
        await conn.execute(sa.text("UPDATE pp_production_order SET status = 'PLANNED'"))
    with pytest.raises(Exception) as exc:
        await _release(seeded)
    assert "already has 5 work order" in str(exc.value)

    assert len(await _rows(seeded, "SELECT id FROM prd_work_order")) == 5, "no duplicates"


async def test_an_order_without_operations_cannot_be_released(seeded):
    async with seeded.begin() as conn:
        await conn.execute(sa.text("DELETE FROM pp_prod_order_operation"))
    with pytest.raises(Exception) as exc:
        await _release(seeded)
    assert "no routing operations" in str(exc.value)
    assert len(await _rows(seeded, "SELECT id FROM prd_work_order")) == 0, "release rolled back"


# ── The queue ───────────────────────────────────────────────────────────────


async def test_queue_blocks_later_operations_until_the_one_before_finishes(seeded):
    await _release(seeded)
    svc, session = await _service(seeded)
    try:
        queue = await svc.queue()
    finally:
        await session.close()

    first, second = queue[0], queue[1]
    assert first["canStart"] is True and first["blockedBy"] is None
    assert second["canStart"] is False
    assert second["blockedBy"] == first["docNo"]
    assert "queued" in second["blockedReason"].lower() or "ready" in second["blockedReason"].lower()


# ── Lifecycle ───────────────────────────────────────────────────────────────


async def test_operation_lifecycle_and_its_refusals(seeded):
    await _release(seeded)
    uids = await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")
    first, second = uids[0][0], uids[1][0]

    svc, session = await _service(seeded)
    try:
        with pytest.raises(Exception) as exc:
            await svc.start(second)
        assert "cannot start until it finishes" in str(exc.value)

        await svc.start(first)
        await svc.pause(first, reason="tea break")
        await svc.resume(first)
        await session.commit()
    finally:
        await session.close()

    status, operator, started = (
        await _rows(seeded, "SELECT status, operator_name, started_at IS NOT NULL FROM prd_work_order WHERE uid = :u", u=first)
    )[0]
    assert status == "RUNNING"
    assert operator == "A. Operator", "the operator is the authenticated user, not a typed name"
    assert started == 1

    svc, session = await _service(seeded)
    try:
        # Completed is terminal.
        await svc.record_production(first, good_qty=Decimal("500"))
        await svc.complete(first)
        await session.commit()
        with pytest.raises(Exception) as exc:
            await svc.start(first)
    finally:
        await session.close()
    assert "cannot become RUNNING" in str(exc.value) or "COMPLETED" in str(exc.value)


# ── Production entry ────────────────────────────────────────────────────────


async def test_entry_quantities_are_validated_against_the_input(seeded):
    await _release(seeded)
    first = (await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq"))[0][0]

    svc, session = await _service(seeded)
    try:
        await svc.start(first)
        with pytest.raises(Exception) as exc:
            await svc.record_production(first, good_qty=Decimal("600"))
        assert "Only 500 remains" in str(exc.value)

        with pytest.raises(Exception) as exc:
            await svc.record_production(first, good_qty=Decimal("10"), scrap_qty=Decimal("2"))
        assert "Scrap needs a reason" in str(exc.value)

        with pytest.raises(Exception):
            await svc.record_production(first, good_qty=Decimal("0"))
        await session.rollback()
    finally:
        await session.close()


async def test_the_490_of_500_scenario_flows_to_the_next_operation(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]

    svc, session = await _service(seeded)
    try:
        await svc.start(uids[0])
        await svc.record_production(
            uids[0], good_qty=Decimal("490"), scrap_qty=Decimal("10"), scrap_reason="Coating runs"
        )
        await svc.complete(uids[0])
        await session.commit()
    finally:
        await session.close()

    rows = await _rows(
        seeded,
        "SELECT seq, status, input_qty, produced_qty, scrap_qty FROM prd_work_order ORDER BY seq",
    )
    assert rows[0][1] == "COMPLETED"
    assert float(rows[0][3]) == 490.0 and float(rows[0][4]) == 10.0
    assert rows[1][1] == "READY", "operation 20 opens"
    assert float(rows[1][2]) == 490.0, "operation 20 receives 490, not 500"

    entries = await _rows(
        seeded, "SELECT doc_no, good_qty, scrap_qty, operator_name FROM prd_production_entry"
    )
    assert len(entries) == 1 and float(entries[0][1]) == 490.0

    scrap = await _rows(
        seeded, "SELECT doc_no, qty, reason, order_doc_no, work_order_doc_no FROM prd_scrap"
    )
    assert len(scrap) == 1 and float(scrap[0][1]) == 10.0
    assert scrap[0][2] == "Coating runs"
    assert scrap[0][3] == "PRD/TEST/00001" and scrap[0][4].startswith("WO/")

    breakdown = await _rows(seeded, "SELECT qty FROM prd_production_entry_scrap")
    assert len(breakdown) == 1 and float(breakdown[0][0]) == 10.0


# ── Material ────────────────────────────────────────────────────────────────


async def test_material_issue_writes_the_stock_ledger_once(seeded):
    await _release(seeded)
    svc, session = await _service(seeded)
    try:
        result = await svc.issue_material("PO00000000000000000000001", warehouse_uid="FG-STORE")
        await session.commit()
    finally:
        await session.close()

    assert len(result["components"]) == 2
    ledger = await _rows(
        seeded,
        "SELECT document_type, document_no, quantity, direction FROM inv_stock_ledger"
        " WHERE document_type = 'PRODUCTION_ISSUE' ORDER BY id",
    )
    assert len(ledger) == 2
    assert all(r[1] == "PRD/TEST/00001" and r[3] == "OUT" and float(r[2]) == 500.0 for r in ledger)

    balances = dict(
        await _rows(
            seeded,
            "SELECT i.code, b.quantity FROM inv_stock_balance b JOIN mst_item i ON i.id = b.item_id",
        )
    )
    assert float(balances["RM-SS304-050"]) == 300.0, "800 issued down to 300"
    assert float(balances["CMP-LID-SCR-SS"]) == 400.0

    issued = await _rows(seeded, "SELECT item_code, issued_qty FROM pp_prod_order_component")
    assert all(float(q) == 500.0 for _, q in issued)

    svc, session = await _service(seeded)
    try:
        with pytest.raises(Exception) as exc:
            await svc.issue_material("PO00000000000000000000001", warehouse_uid="FG-STORE")
        assert "already been issued in full" in str(exc.value)
    finally:
        await session.close()
    assert len(await _rows(seeded, "SELECT id FROM inv_stock_ledger WHERE document_type = 'PRODUCTION_ISSUE'")) == 2


async def test_material_issue_refuses_when_stock_is_short(seeded):
    async with seeded.begin() as conn:
        await conn.execute(sa.text("UPDATE pp_prod_order_component SET required_qty = 5000"))
    await _release(seeded)
    svc, session = await _service(seeded)
    try:
        with pytest.raises(Exception) as exc:
            await svc.issue_material("PO00000000000000000000001", warehouse_uid="FG-STORE")
        assert "Insufficient stock" in str(exc.value)
        await session.rollback()
    finally:
        await session.close()
    assert await _rows(seeded, "SELECT id FROM inv_stock_ledger WHERE document_type = 'PRODUCTION_ISSUE'") == []


async def test_material_issue_refuses_a_component_with_no_inventory_item(seeded):
    """The two masters can drift. A component that inventory has never heard of
    must stop the issue rather than post a movement against nothing."""
    async with seeded.begin() as conn:
        await conn.execute(
            sa.text("UPDATE pp_prod_order_component SET item_code = 'GHOST-001' WHERE id = 1")
        )
    await _release(seeded)
    svc, session = await _service(seeded)
    try:
        with pytest.raises(Exception) as exc:
            await svc.issue_material("PO00000000000000000000001", warehouse_uid="FG-STORE")
        assert "not in the item master" in str(exc.value)
        await session.rollback()
    finally:
        await session.close()
    assert await _rows(seeded, "SELECT id FROM inv_stock_ledger WHERE document_type = 'PRODUCTION_ISSUE'") == []


async def test_a_failure_on_the_last_component_undoes_the_earlier_ones(seeded):
    """The issue is one posting, not a run of them. If the second component
    cannot be issued, the first must not stay issued either."""
    async with seeded.begin() as conn:
        await conn.execute(
            sa.text("UPDATE pp_prod_order_component SET item_code = 'GHOST-002' WHERE id = 2")
        )
    await _release(seeded)
    svc, session = await _service(seeded)
    try:
        with pytest.raises(Exception):
            await svc.issue_material("PO00000000000000000000001", warehouse_uid="FG-STORE")
        await session.rollback()
    finally:
        await session.close()

    assert await _rows(seeded, "SELECT id FROM inv_stock_ledger WHERE document_type = 'PRODUCTION_ISSUE'") == []
    issued = await _rows(seeded, "SELECT item_code, issued_qty FROM pp_prod_order_component ORDER BY id")
    assert all(float(q) == 0.0 for _, q in issued), "the first component was rolled back too"
    balances = dict(
        await _rows(
            seeded,
            "SELECT i.code, b.quantity FROM inv_stock_balance b JOIN mst_item i ON i.id = b.item_id",
        )
    )
    assert float(balances["RM-SS304-050"]) == 800.0, "opening stock untouched"


async def test_issuing_material_spends_the_reservation(seeded):
    """Planning reserves against the balance; issuing is what spends it. If the
    issue left the reservation standing, free stock would read low by the issued
    quantity for the rest of the order's life."""
    from app.modules.planning.application.conversion_service import ConversionService

    await _release(seeded)

    session = await _session(seeded)
    try:
        reserved = await ConversionService(session, _ctx()).reserve_components(
            "PO00000000000000000000001"
        )
        await session.commit()
    finally:
        await session.close()
    assert reserved["fully_covered"], reserved["shortages"]

    held = dict(
        await _rows(
            seeded,
            "SELECT i.code, b.reserved_qty FROM inv_stock_balance b JOIN mst_item i ON i.id = b.item_id",
        )
    )
    assert float(held["RM-SS304-050"]) == 500.0
    assert float(held["CMP-LID-SCR-SS"]) == 500.0

    svc, session = await _service(seeded)
    try:
        result = await svc.issue_material("PO00000000000000000000001", warehouse_uid="FG-STORE")
        await session.commit()
    finally:
        await session.close()
    assert result["reservationReleased"] == 1000.0

    after = await _rows(
        seeded,
        "SELECT i.code, b.quantity, b.reserved_qty, b.quantity - b.reserved_qty"
        "  FROM inv_stock_balance b JOIN mst_item i ON i.id = b.item_id ORDER BY i.code",
    )
    for code, qty, res, free in after:
        assert float(res) == 0.0, f"{code} is still reserved after the stock left the shelf"
        assert float(free) >= 0.0, f"{code} is over-reserved"
    assert dict((c, float(q)) for c, q, _, _ in after)["RM-SS304-050"] == 300.0

    on_component = await _rows(seeded, "SELECT item_code, reserved_qty FROM pp_prod_order_component")
    assert all(float(q) == 0.0 for _, q in on_component)


# ── Quality ─────────────────────────────────────────────────────────────────


async def _run_operation(engine, uid, good, scrap=Decimal("0"), reason=""):
    svc, session = await _service(engine)
    try:
        await svc.start(uid)
        await svc.record_production(uid, good_qty=good, scrap_qty=scrap, scrap_reason=reason)
        outcome = await svc.complete(uid)
        await session.commit()
        return outcome
    finally:
        await session.close()


async def test_a_qc_checkpoint_holds_the_lot_until_quality_decides(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]

    await _run_operation(seeded, uids[0], Decimal("490"), Decimal("10"), "Coating runs")
    await _run_operation(seeded, uids[1], Decimal("490"))
    outcome = await _run_operation(seeded, uids[2], Decimal("490"))  # operation 30 has a checkpoint

    assert outcome["awaitingQc"] is True
    rows = await _rows(seeded, "SELECT seq, status, qc_result, input_qty FROM prd_work_order ORDER BY seq")
    assert rows[2][1] == "QC_HOLD" and rows[2][2] == "PENDING"
    assert rows[3][1] == "QUEUED" and float(rows[3][3]) == 0.0, "nothing moves on an unchecked lot"

    svc, session = await _service(seeded)
    try:
        with pytest.raises(Exception) as exc:
            await svc.record_qc(uids[2], result="MAYBE")
        assert "not a quality decision" in str(exc.value)

        with pytest.raises(Exception) as exc:
            await svc.record_qc(uids[2], result="PASS", inspection_doc_no="IQC/NOPE/0001")
        assert "does not exist in Quality" in str(exc.value)
        await session.rollback()

        failed = await svc.record_qc(uids[2], result="FAIL", note="porosity")
        await session.commit()
        assert failed["released"] is False
    finally:
        await session.close()

    rows = await _rows(seeded, "SELECT seq, status, qc_result, input_qty FROM prd_work_order ORDER BY seq")
    assert rows[2][1] == "QC_HOLD" and rows[2][2] == "FAIL"
    assert float(rows[3][3]) == 0.0, "a failed inspection passes nothing on"

    svc, session = await _service(seeded)
    try:
        passed = await svc.record_qc(uids[2], result="PASS")
        await session.commit()
        assert passed["released"] is True
    finally:
        await session.close()

    rows = await _rows(seeded, "SELECT seq, status, qc_result, input_qty FROM prd_work_order ORDER BY seq")
    assert rows[2][1] == "COMPLETED" and rows[2][2] == "PASS"
    assert rows[3][1] == "READY" and float(rows[3][3]) == 490.0


# ── Finished goods and closing the order ────────────────────────────────────


async def test_the_whole_order_from_release_to_completion(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]

    svc, session = await _service(seeded)
    try:
        await svc.issue_material("PO00000000000000000000001", warehouse_uid="FG-STORE")
        await session.commit()
    finally:
        await session.close()

    await _run_operation(seeded, uids[0], Decimal("490"), Decimal("10"), "Coating runs")
    await _run_operation(seeded, uids[1], Decimal("490"))
    await _run_operation(seeded, uids[2], Decimal("490"))

    svc, session = await _service(seeded)
    try:
        await svc.record_qc(uids[2], result="PASS")
        await session.commit()
    finally:
        await session.close()

    await _run_operation(seeded, uids[3], Decimal("490"))
    svc, session = await _service(seeded)
    try:
        await svc.record_qc(uids[3], result="PASS")
        await session.commit()
    finally:
        await session.close()

    # The order cannot close while the last operation is still open.
    svc, session = await _service(seeded)
    try:
        with pytest.raises(Exception) as exc:
            await svc.complete_order("PO00000000000000000000001")
        assert "cannot be completed" in str(exc.value)
        await session.rollback()
    finally:
        await session.close()

    final = await _run_operation(seeded, uids[4], Decimal("490"))
    assert final["finishedGoods"]["quantity"] == 490.0

    receipt = await _rows(
        seeded,
        "SELECT document_type, document_no, quantity, direction, rate FROM inv_stock_ledger"
        " WHERE document_type = 'PRODUCTION_RECEIPT'",
    )
    assert len(receipt) == 1
    assert receipt[0][1] == "PRD/TEST/00001" and float(receipt[0][2]) == 490.0 and receipt[0][3] == "IN"
    assert float(receipt[0][4]) == 201.91, "valued at the order's estimated unit cost"

    fg = (
        await _rows(
            seeded,
            "SELECT b.quantity FROM inv_stock_balance b JOIN mst_item i ON i.id = b.item_id"
            " WHERE i.code = :c",
            c=PRODUCT,
        )
    )[0][0]
    assert float(fg) == 490.0, "490 finished goods are in stock"

    svc, session = await _service(seeded)
    try:
        closed = await svc.complete_order("PO00000000000000000000001")
        await session.commit()
    finally:
        await session.close()

    assert closed["producedQty"] == 490.0
    assert closed["scrapQty"] == 10.0

    order = (
        await _rows(seeded, "SELECT status, produced_qty, rejected_qty FROM pp_production_order")
    )[0]
    assert order[0] == "COMPLETED"
    assert float(order[1]) == 490.0 and float(order[2]) == 10.0

    statuses = [r[0] for r in await _rows(seeded, "SELECT status FROM prd_work_order ORDER BY seq")]
    assert statuses == ["COMPLETED"] * 5


# ── The read side ───────────────────────────────────────────────────────────
#
# Every shop-floor screen reads one of these projections. They are tested
# against the same throwaway schema, so a screen can only show what the floor
# actually recorded.


async def _query(engine):
    from app.modules.production.application.shopfloor_query_service import ShopFloorQueryService

    session = await _session(engine)
    return ShopFloorQueryService(session, _ctx()), session


async def test_the_entry_projection_carries_its_defects(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]
    await _run_operation(seeded, uids[0], Decimal("480"), Decimal("20"), reason="Dented on the chute")

    svc, session = await _query(seeded)
    try:
        rows = await svc.entries()
    finally:
        await session.close()

    assert len(rows) == 1
    entry = rows[0]
    assert entry["goodQty"] == 480.0 and entry["scrapQty"] == 20.0
    assert entry["operatorName"] == "A. Operator", "the operator is whoever booked it"
    assert entry["isReversal"] is False
    assert entry["defects"], "the scrap reason is carried with the entry"
    assert entry["defects"][0]["qty"] == 20.0


async def test_wip_is_derived_not_stored(seeded):
    """Nothing stores work in progress. It is input less everything booked out."""
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]

    svc, session = await _query(seeded)
    try:
        before = await svc.wip()
    finally:
        await session.close()
    first = next(lot for lot in before["lots"] if lot["seq"] == 10)
    assert first["heldQty"] == 500.0, "the whole order is sitting at the first operation"
    assert first["ageHours"] is None, "an operation that never started has no clock"

    # Book part of it without completing the operation, so the lot is still
    # standing at the station rather than having moved on.
    exec_svc, exec_session = await _service(seeded)
    try:
        await exec_svc.start(uids[0])
        await exec_svc.record_production(uids[0], good_qty=Decimal("300"))
        await exec_session.commit()
    finally:
        await exec_session.close()

    svc, session = await _query(seeded)
    try:
        after = await svc.wip()
    finally:
        await session.close()
    first = next(lot for lot in after["lots"] if lot["seq"] == 10)
    assert first["heldQty"] == 200.0, "500 in, 300 booked, 200 still held"
    assert first["ageHours"] is not None, "it has started, so it has an age"


async def test_the_traveller_shows_the_route_and_its_bookings(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]
    await _run_operation(seeded, uids[0], Decimal("490"), Decimal("10"), reason="Pinhole")

    svc, session = await _query(seeded)
    try:
        card = await svc.traveller("PRD/TEST/00001")
    finally:
        await session.close()

    assert card["order"]["docNo"] == "PRD/TEST/00001"
    assert len(card["steps"]) == 5
    assert len(card["components"]) == 2
    first = card["steps"][0]
    assert first["producedQty"] == 490.0
    assert len(first["entries"]) == 1, "the booking is shown under its own operation"
    assert card["steps"][1]["inputQty"] == 490.0, "only the good quantity moved on"


async def test_the_dashboard_counts_real_rows_and_names_what_it_cannot_show(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]
    await _run_operation(seeded, uids[0], Decimal("450"), Decimal("50"), reason="Scored")

    svc, session = await _query(seeded)
    try:
        board = await svc.dashboard()
    finally:
        await session.close()

    assert board["today"]["goodQty"] == 450.0
    assert board["today"]["scrapQty"] == 50.0
    assert board["today"]["yieldPct"] == 90.0
    metrics = {u["metric"] for u in board["unavailable"]}
    assert "OEE" in metrics and "Machine availability" in metrics


async def test_a_dashboard_with_nothing_booked_reports_no_yield_rather_than_zero(seeded):
    await _release(seeded)
    svc, session = await _query(seeded)
    try:
        board = await svc.dashboard()
    finally:
        await session.close()
    assert board["today"]["entries"] == 0
    assert board["today"]["yieldPct"] is None, "a yield of zero would read as a total loss"


async def test_effectiveness_publishes_quality_but_never_availability(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]
    await _run_operation(seeded, uids[0], Decimal("475"), Decimal("25"), reason="Burr")

    svc, session = await _query(seeded)
    try:
        eff = await svc.effectiveness()
    finally:
        await session.close()

    assert eff["overall"]["qualityPct"] == 95.0
    assert eff["overall"]["availabilityPct"] is None
    assert eff["overall"]["oeePct"] is None, "two factors of three is not OEE"
    assert {c["factor"] for c in eff["cannotCompute"]} == {"Availability", "OEE"}


async def test_readiness_separates_a_missing_item_from_missing_stock(seeded):
    """Not in the inventory master and not on the shelf are different problems."""
    async with seeded.begin() as conn:
        await conn.execute(sa.text("UPDATE pp_prod_order_component SET item_code = 'GHOST-003' WHERE id = 1"))
        await conn.execute(sa.text("UPDATE pp_prod_order_component SET required_qty = 5000 WHERE id = 2"))

    svc, session = await _query(seeded)
    try:
        ready = await svc.readiness("PO00000000000000000000001")
    finally:
        await session.close()

    assert ready["material"]["ready"] is False
    assert ready["material"]["missingFromInventory"] == ["GHOST-003"]
    assert [s["itemCode"] for s in ready["material"]["short"]] == ["CMP-LID-SCR-SS"]
    ghost = next(c for c in ready["components"] if c["itemCode"] == "GHOST-003")
    assert ghost["inInventoryMaster"] is False
    short = next(c for c in ready["components"] if c["itemCode"] == "CMP-LID-SCR-SS")
    assert short["inInventoryMaster"] is True and short["shortQty"] == 4100.0
    assert {u["check"] for u in ready["unknown"]} == {
        "Machine available",
        "Tooling available",
        "Manpower available",
    }


async def test_integrity_reports_a_quantity_with_no_booking_behind_it(seeded):
    """The check has to catch a work order whose figures no entry supports."""
    await _release(seeded)

    svc, session = await _query(seeded)
    try:
        clean = await svc.integrity()
    finally:
        await session.close()
    assert clean["clean"] is True, "a freshly released order reconciles"

    # Write a quantity the way the old code could and the current code cannot.
    async with seeded.begin() as conn:
        await conn.execute(sa.text("UPDATE prd_work_order SET produced_qty = 320 WHERE seq = 10"))

    svc, session = await _query(seeded)
    try:
        dirty = await svc.integrity()
    finally:
        await session.close()

    assert dirty["clean"] is False
    found = dirty["quantitiesWithoutEntries"]
    assert len(found) == 1
    assert found[0]["seq"] == 10
    assert found[0]["entries"] == 0
    assert found[0]["goodDifference"] == 320.0


async def test_integrity_flags_a_component_inventory_has_never_heard_of(seeded):
    async with seeded.begin() as conn:
        await conn.execute(sa.text("UPDATE pp_prod_order_component SET item_code = 'GHOST-004' WHERE id = 1"))

    svc, session = await _query(seeded)
    try:
        result = await svc.integrity()
    finally:
        await session.close()

    assert result["clean"] is False
    assert result["componentsNotInInventory"] == [
        {"orderDocNo": "PRD/TEST/00001", "itemCode": "GHOST-004"}
    ]


async def test_output_can_be_grouped_by_shift_and_by_operator(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]
    await _run_operation(seeded, uids[0], Decimal("400"), Decimal("20"), reason="Dent")

    svc, session = await _query(seeded)
    try:
        by_operator = await svc.output_by(dimension="operator")
        by_shift = await svc.output_by(dimension="shift")
    finally:
        await session.close()

    assert len(by_operator["rows"]) == 1
    assert by_operator["rows"][0]["goodQty"] == 400.0
    assert by_operator["rows"][0]["operatorName"] == "A. Operator"
    assert by_operator["rows"][0]["yieldPct"] == 95.24
    assert {u["metric"] for u in by_operator["unavailable"]} >= {"Labour cost"}
    assert len(by_shift["rows"]) == 1


async def test_the_scrap_projection_groups_by_reason(seeded):
    await _release(seeded)
    uids = [r[0] for r in await _rows(seeded, "SELECT uid FROM prd_work_order ORDER BY seq")]
    await _run_operation(seeded, uids[0], Decimal("480"), Decimal("20"), reason="Dented on the chute")

    svc, session = await _query(seeded)
    try:
        result = await svc.scrap()
    finally:
        await session.close()

    assert result["totals"]["documents"] >= 1
    assert result["totals"]["qty"] == 20.0
    assert result["byReason"], "scrap is grouped by whatever reason was given"
    assert result["byReason"][0]["qty"] == 20.0
