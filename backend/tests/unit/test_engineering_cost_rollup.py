"""Standard-cost roll-up arithmetic — CLAUDE.md §8 (financial calculation).

The worked example is the real FG-SS-750-BLK data in ERP_Product: BOM Rev 3 over
seven lines, routing Rev 3 over five operations at a costing lot size of 500.
Expected result: ₹182.22 material + ₹12.61 conversion = ₹194.83 per bottle.

A stub session supplies those rows so the arithmetic is tested without a database.
"""

from __future__ import annotations

from decimal import Decimal

from app.services.engineering_cost_service import EngineeringCostService

D = Decimal

# (ItemCode, QtyPer, ScrapPct, matched Item.Code, StandardCost)
BOM_LINES = [
    ("SF-BODY-750", D("1.000000"), D("1.50"), "SF-BODY-750", D("96.40")),
    ("SF-LID-ASSY-SS", D("1.000000"), D("1.00"), "SF-LID-ASSY-SS", D("51.60")),
    ("CON-PWD-BLK", D("0.045000"), D("8.00"), "CON-PWD-BLK", D("312.00")),
    ("PKG-BOX-IND", D("1.000000"), D("1.50"), "PKG-BOX-IND", D("11.80")),
    ("PKG-LBL-BAR", D("2.000000"), D("2.00"), "PKG-LBL-BAR", D("0.55")),
    ("PKG-MAN-USR", D("1.000000"), D("1.00"), "PKG-MAN-USR", D("1.90")),
    ("PKG-CTN-24", D("0.042000"), D("1.00"), "PKG-CTN-24", D("46.00")),
]

# (Seq, Code, Name, WC, SetupMinutes, CycleSeconds, Operators,
#  matched WC.Code, MachineRatePerHour, LabourRatePerHour, OverheadPct)
ROUTING_OPS = [
    (10, "OP-090", "Powder Coating", "WC-07", D("25.00"), D("9.00"), 3,
     "WC-07", D("720.00"), D("190.00"), D("13.00")),
    (20, "OP-100", "Logo Marking", "WC-08", D("12.00"), D("6.00"), 1,
     "WC-08", D("340.00"), D("185.00"), D("10.00")),
    (30, "OP-120", "Final Assembly", "WC-10", D("8.00"), D("22.00"), 2,
     "WC-10", D("60.00"), D("175.00"), D("9.00")),
    (40, "OP-070", "Leak Testing", "WC-06", D("5.00"), D("7.50"), 1,
     "WC-06", D("320.00"), D("205.00"), D("10.00")),
    (50, "OP-130", "Cartoning & Packing", "WC-09", D("6.00"), D("15.00"), 2,
     "WC-09", D("180.00"), D("165.00"), D("8.00")),
]


class _Result:
    def __init__(self, rows):
        self._rows = list(rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def __iter__(self):
        return iter(self._rows)


class _StubSession:
    """Answers the four SELECTs the service issues and records the UPDATE."""

    def __init__(self, bom_row, routing_row, bom_lines, routing_ops):
        self._bom_row = bom_row
        self._routing_row = routing_row
        self._bom_lines = bom_lines
        self._routing_ops = routing_ops
        self.updates: list[dict] = []
        self.committed = False

    async def execute(self, clause, params=None):
        sql = str(clause)
        if "FROM ERP_Product.EngineeringBom " in sql and "BomId" not in sql:
            return _Result([self._bom_row] if self._bom_row else [])
        if "FROM ERP_Product.EngineeringRouting " in sql:
            return _Result([self._routing_row] if self._routing_row else [])
        if "EngineeringBomLine" in sql:
            return _Result(self._bom_lines)
        if "EngineeringRoutingOperation" in sql:
            return _Result(self._routing_ops)
        if sql.strip().startswith("UPDATE ERP_Master.Item"):
            self.updates.append(dict(params or {}))
            return _Result([])
        raise AssertionError(f"unexpected SQL: {sql}")

    async def commit(self):
        self.committed = True


def _service(bom_row=(1, D("1.0000")), routing_row=(1, 500),
             bom_lines=None, routing_ops=None):
    session = _StubSession(
        bom_row,
        routing_row,
        BOM_LINES if bom_lines is None else bom_lines,
        ROUTING_OPS if routing_ops is None else routing_ops,
    )
    return EngineeringCostService(session), session


# ── the worked example ──────────────────────────────────────────────────────

async def test_flask_750_rolls_up_to_the_published_figures():
    service, session = _service()
    result = await service.calculate_and_update_cost_rollup("FG-SS-750-BLK", "tester")

    assert result["materialCost"] == 182.22
    assert result["operationCost"] == 12.61
    assert result["totalStandardCost"] == 194.83
    assert result["warnings"] == []
    assert session.updates == [
        {"total_cost": D("194.83"), "item_code": "FG-SS-750-BLK", "user": "tester"}
    ]
    assert session.committed


def _ops_only(routing_row=(1, 500)):
    """Routing-only service, so material does not enter the assertion."""
    return _service(bom_row=None, bom_lines=[], routing_row=routing_row)


async def test_powder_coating_step_charges_the_full_crew_rate():
    """WC-07: 720 machine + 190 x 3 operators = Rs 1,290/h.

    setup 1.075 + run 3.225 + 13% overhead 0.559 = Rs 4.86 per bottle.
    """
    service, _ = _ops_only()
    result = await service.calculate_and_update_cost_rollup("FG-SS-750-BLK", "t")
    powder = result["operations"][0]

    assert powder["ratePerHour"] == 1290.00
    assert powder["setupCost"] == 1.08     # 1.075 rounded half-up
    assert powder["runCost"] == 3.23       # 3.225 rounded half-up
    assert powder["overheadCost"] == 0.56
    assert powder["cost"] == 4.86


# ── individual rules ────────────────────────────────────────────────────────

async def test_scrap_is_a_yield_loss_not_a_markup():
    """0.045 kg at 8% scrap issues 0.045 / 0.92, not 0.045 * 1.08."""
    service, _ = _service(
        bom_lines=[("CON-PWD-BLK", D("0.045"), D("8.00"), "CON-PWD-BLK", D("312.00"))],
        routing_ops=[],
    )
    result = await service.calculate_and_update_cost_rollup("X", "t")

    line = result["materialLines"][0]
    assert round(line["effectiveQty"], 6) == 0.048913
    assert line["cost"] == 15.26          # a markup would give 14.58


async def test_setup_is_amortised_over_the_costing_lot_size():
    """Setup is once per batch, so a bigger lot spreads it thinner.

    Powder coating: (25 / 60) * 1290 = Rs 537.50 of setup per batch.
    Over 500 that is Rs 1.075/unit; over 5000, Rs 0.1075/unit. Run cost is flat.
    """
    small, _ = _ops_only(routing_row=(1, 500))
    big, _ = _ops_only(routing_row=(1, 5000))

    small_op = (await small.calculate_and_update_cost_rollup("X", "t"))["operations"][0]
    big_op = (await big.calculate_and_update_cost_rollup("X", "t"))["operations"][0]

    assert small_op["setupCost"] == 1.08     # 1.0750
    assert big_op["setupCost"] == 0.11       # 0.1075
    assert small_op["runCost"] == big_op["runCost"] == 3.23


async def test_base_qty_divides_material_cost():
    """A BOM that yields 3 units spreads its lines over 3."""
    service, _ = _service(
        bom_row=(1, D("3.0000")),
        bom_lines=[("A", D("3.0"), D("0.00"), "A", D("30.00"))],
        routing_ops=[],
    )
    result = await service.calculate_and_update_cost_rollup("X", "t")
    assert result["materialCost"] == 30.00


# ── failure modes that used to be silent ────────────────────────────────────

async def test_missing_work_centre_warns_instead_of_costing_silently_at_zero():
    service, _ = _service(
        bom_row=None,
        bom_lines=[],
        routing_ops=[(10, "OP-999", "Mystery", "WC-XX", D("30.00"), D("10.00"), 1,
                      None, None, None, None)],
    )
    result = await service.calculate_and_update_cost_rollup("X", "t")

    assert result["operationCost"] == 0.0
    assert any("WC-XX" in w for w in result["warnings"])


async def test_component_without_a_standard_cost_is_reported():
    service, _ = _service(
        bom_lines=[("NEW-PART", D("1.0"), D("0.00"), "NEW-PART", D("0.00"))],
        routing_ops=[],
    )
    result = await service.calculate_and_update_cost_rollup("X", "t")
    assert any("NEW-PART" in w for w in result["warnings"])


async def test_no_bom_and_no_routing_leaves_standard_cost_untouched():
    """Costing an item with no sources must not zero its existing valuation."""
    service, session = _service(bom_row=None, routing_row=None,
                                bom_lines=[], routing_ops=[])
    result = await service.calculate_and_update_cost_rollup("ORPHAN", "t")

    assert result is None
    assert session.updates == []
    assert not session.committed


async def test_rounding_is_half_up_not_bankers():
    """0.125 must round to 0.13; Python's round() would give 0.12."""
    service, _ = _service(
        bom_lines=[("A", D("1.0"), D("0.00"), "A", D("0.125"))],
        routing_ops=[],
    )
    result = await service.calculate_and_update_cost_rollup("X", "t")
    assert result["totalStandardCost"] == 0.13
