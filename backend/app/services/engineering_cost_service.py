"""Standard-cost roll-up for an engineered item.

Cost = material from the item's default BOM + conversion cost from its default
routing. Both halves are computed in `Decimal` and rounded exactly once, at the
point of persistence, per CLAUDE.md section 4.4.

The roll-up is **single level**: a sub-assembly line contributes its own stored
`StandardCost`, it is not exploded again here. Roll sub-assemblies up first
(lowest level first) if their costs have changed.
"""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ZERO = Decimal("0")
HOUR_MINUTES = Decimal("60")
HOUR_SECONDS = Decimal("3600")
HUNDRED = Decimal("100")
MONEY = Decimal("0.01")


def _dec(value, default: str = "0") -> Decimal:
    """Decimal from a driver value, without going through float."""
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


class EngineeringCostService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def calculate_and_update_cost_rollup(
        self, item_code: str, user_id: str
    ) -> dict[str, Any] | None:
        """Recost `item_code` and write the result to ERP_Master.Item.

        Returns None when the item has neither a default BOM nor a default
        routing — writing a zero standard cost in that case would silently
        destroy the item's existing valuation.
        """
        warnings: list[str] = []

        bom_id, base_qty = await self._default_bom(item_code)
        routing_id, lot_size = await self._default_routing(item_code)

        if bom_id is None and routing_id is None:
            return None

        material_cost, material_lines = await self._material_cost(
            bom_id, base_qty, warnings
        )
        operation_cost, operations = await self._operation_cost(
            routing_id, lot_size, warnings
        )

        total_cost = _money(material_cost + operation_cost)

        await self.session.execute(
            text(
                "UPDATE ERP_Master.Item"
                " SET StandardCost = :total_cost,"
                "     ModifiedBy = :user,"
                "     ModifiedDate = CURRENT_TIMESTAMP"
                " WHERE Code = :item_code"
            ),
            {"total_cost": total_cost, "item_code": item_code, "user": user_id},
        )
        await self.session.commit()

        return {
            "itemCode": item_code,
            "materialCost": float(_money(material_cost)),
            "operationCost": float(_money(operation_cost)),
            "totalStandardCost": float(total_cost),
            "bomBaseQty": float(base_qty),
            "costingLotSize": float(lot_size),
            "materialLines": material_lines,
            "operations": operations,
            "warnings": warnings,
        }

    # ------------------------------------------------------------------ #

    async def _default_bom(self, item_code: str):
        row = (
            await self.session.execute(
                text(
                    "SELECT Id, BaseQty FROM ERP_Product.EngineeringBom"
                    " WHERE ProductCode = :item_code"
                    "   AND Status IN ('ACTIVE', 'APPROVED')"
                    "   AND IsDefault = 1"
                    " ORDER BY Revision DESC LIMIT 1"
                ),
                {"item_code": item_code},
            )
        ).fetchone()
        if not row:
            return None, Decimal("1")
        base_qty = _dec(row[1], "1")
        return row[0], (base_qty if base_qty > ZERO else Decimal("1"))

    async def _default_routing(self, item_code: str):
        row = (
            await self.session.execute(
                text(
                    "SELECT Id, CostingLotSize FROM ERP_Product.EngineeringRouting"
                    " WHERE ProductCode = :item_code"
                    "   AND Status IN ('ACTIVE', 'APPROVED')"
                    "   AND IsDefault = 1"
                    " ORDER BY Revision DESC LIMIT 1"
                ),
                {"item_code": item_code},
            )
        ).fetchone()
        if not row:
            return None, Decimal("1")
        lot_size = _dec(row[1], "1")
        return row[0], (lot_size if lot_size > ZERO else Decimal("1"))

    async def _material_cost(self, bom_id, base_qty: Decimal, warnings: list[str]):
        """Sum of component cost per one unit of the parent.

        Scrap is a yield loss, so the quantity actually issued is
        `qty_per / (1 - scrap%)` — not `qty_per * (1 + scrap%)`.
        """
        if bom_id is None:
            warnings.append("No default ACTIVE/APPROVED BOM; material cost is zero.")
            return ZERO, []

        rows = await self.session.execute(
            text(
                "SELECT bl.ItemCode, bl.QtyPer, bl.ScrapPct, i.Code, i.StandardCost"
                " FROM ERP_Product.EngineeringBomLine bl"
                " LEFT JOIN ERP_Master.Item i ON bl.ItemCode = i.Code"
                " WHERE bl.BomId = :bom_id"
                " ORDER BY bl.Seq"
            ),
            {"bom_id": bom_id},
        )

        total = ZERO
        lines: list[dict[str, Any]] = []
        for code, qty_per_raw, scrap_raw, matched_code, std_cost_raw in rows:
            qty_per = _dec(qty_per_raw)
            scrap_pct = _dec(scrap_raw)
            std_cost = _dec(std_cost_raw)

            if matched_code is None:
                warnings.append(
                    f"Component {code} is not in the item master; costed at zero."
                )
            elif std_cost == ZERO:
                warnings.append(f"Component {code} has no standard cost.")

            if scrap_pct >= HUNDRED:
                warnings.append(
                    f"Component {code} has scrap {scrap_pct}%; scrap ignored."
                )
                effective_qty = qty_per
            elif scrap_pct > ZERO:
                effective_qty = qty_per / (Decimal("1") - scrap_pct / HUNDRED)
            else:
                effective_qty = qty_per

            line_cost = (effective_qty * std_cost) / base_qty
            total += line_cost
            lines.append(
                {
                    "itemCode": code,
                    "qtyPer": float(qty_per),
                    "scrapPct": float(scrap_pct),
                    "effectiveQty": float(effective_qty),
                    "standardCost": float(std_cost),
                    "cost": float(_money(line_cost)),
                }
            )
        return total, lines

    async def _operation_cost(self, routing_id, lot_size: Decimal, warnings: list[str]):
        """Conversion cost per unit.

        The work centre charges its machine rate plus one labour rate per
        operator on the step, for setup and run alike. Setup is a once-per-batch
        cost, so it is amortised over the routing's costing lot size; run time is
        incurred per piece. Overhead is a percentage uplift on both.
        """
        if routing_id is None:
            warnings.append(
                "No default ACTIVE/APPROVED routing; operation cost is zero."
            )
            return ZERO, []

        rows = await self.session.execute(
            text(
                "SELECT op.Seq, op.OperationCode, op.OperationName, op.WorkCentreCode,"
                "       op.SetupMinutes, op.CycleSeconds, op.Operators,"
                "       wc.Code, wc.MachineRatePerHour, wc.LabourRatePerHour,"
                "       wc.OverheadPct"
                " FROM ERP_Product.EngineeringRoutingOperation op"
                " LEFT JOIN ERP_Product.EngineeringWorkCentre wc"
                "        ON op.WorkCentreCode = wc.Code"
                " WHERE op.RoutingId = :routing_id"
                " ORDER BY op.Seq"
            ),
            {"routing_id": routing_id},
        )

        total = ZERO
        operations: list[dict[str, Any]] = []
        for (
            seq,
            op_code,
            op_name,
            wc_code,
            setup_raw,
            cycle_raw,
            operators_raw,
            matched_wc,
            machine_rate_raw,
            labour_rate_raw,
            overhead_raw,
        ) in rows:
            if matched_wc is None:
                warnings.append(
                    f"Operation {op_code} runs on work centre {wc_code}, which is"
                    " not in the work-centre master; costed at zero."
                )

            setup_minutes = _dec(setup_raw)
            cycle_seconds = _dec(cycle_raw)
            operators = _dec(operators_raw, "1")
            if operators <= ZERO:
                operators = Decimal("1")

            rate_per_hour = _dec(machine_rate_raw) + _dec(labour_rate_raw) * operators
            overhead_pct = _dec(overhead_raw)

            setup_cost = (setup_minutes / HOUR_MINUTES) * rate_per_hour / lot_size
            run_cost = (cycle_seconds / HOUR_SECONDS) * rate_per_hour
            overhead_cost = (setup_cost + run_cost) * overhead_pct / HUNDRED
            op_total = setup_cost + run_cost + overhead_cost

            total += op_total
            operations.append(
                {
                    "seq": seq,
                    "operationCode": op_code,
                    "operationName": op_name,
                    "workCentreCode": wc_code,
                    "operators": int(operators),
                    "ratePerHour": float(_money(rate_per_hour)),
                    "setupCost": float(_money(setup_cost)),
                    "runCost": float(_money(run_cost)),
                    "overheadCost": float(_money(overhead_cost)),
                    "cost": float(_money(op_total)),
                }
            )
        return total, operations
