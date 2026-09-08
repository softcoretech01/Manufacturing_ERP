"""Recost engineered items from their default BOM and routing.

The roll-up in `EngineeringCostService` is single level: a sub-assembly line
contributes the component's **stored** `StandardCost` rather than being exploded
again. So order matters -- costing a parent before its children leaves the parent
carrying stale child costs. This script builds the make-item graph and recosts
bottom-up, children first.

Before writing anything it snapshots every affected item's current
`ERP_Master.Item.StandardCost` into a timestamped rollback file, so an unwanted
recost can be undone.

Run:  python -m scripts.recost_items --dry-run     # plan + current values only
      python -m scripts.recost_items               # recost everything costable
      python -m scripts.recost_items FG-SS-750-BLK # recost these items (+ their
                                                   # sub-assemblies, in order)
"""

from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.core.database import SessionFactory, dispose_engine
from app.services.engineering_cost_service import EngineeringCostService

COSTABLE_STATUSES = ("ACTIVE", "APPROVED")


async def _costable_items(session) -> tuple[set[str], set[str]]:
    """Item codes that have a default BOM, and those that have a default routing."""
    bom_items = {
        r[0]
        for r in await session.execute(
            text(
                "SELECT DISTINCT ProductCode FROM ERP_Product.EngineeringBom"
                " WHERE Status IN :statuses AND IsDefault = 1"
            ).bindparams(statuses=COSTABLE_STATUSES)
        )
    }
    routing_items = {
        r[0]
        for r in await session.execute(
            text(
                "SELECT DISTINCT ProductCode FROM ERP_Product.EngineeringRouting"
                " WHERE Status IN :statuses AND IsDefault = 1"
            ).bindparams(statuses=COSTABLE_STATUSES)
        )
    }
    return bom_items, routing_items


async def _component_edges(session, bom_items: set[str]) -> dict[str, set[str]]:
    """parent -> set of components that are themselves costable (its children).

    Built in Python rather than as a SQL join: EngineeringBom and
    EngineeringBomLine text columns differ in collation from the item tables in
    places, and an "Illegal mix of collations" here would be silent scope loss.
    """
    rows = await session.execute(
        text(
            "SELECT b.ProductCode, l.ItemCode"
            " FROM ERP_Product.EngineeringBom b"
            " JOIN ERP_Product.EngineeringBomLine l ON l.BomId = b.Id"
            " WHERE b.Status IN :statuses AND b.IsDefault = 1"
        ).bindparams(statuses=COSTABLE_STATUSES)
    )
    edges: dict[str, set[str]] = defaultdict(set)
    for parent, component in rows:
        if component in bom_items and component != parent:
            edges[parent].add(component)
    return edges


def _bottom_up(targets: set[str], edges: dict[str, set[str]]) -> list[str]:
    """Depth-first order with children before parents; cycles reported, not hidden."""
    order: list[str] = []
    state: dict[str, int] = {}          # 1 = visiting, 2 = done
    cycles: list[str] = []

    def visit(node: str, trail: tuple[str, ...]) -> None:
        if state.get(node) == 2:
            return
        if state.get(node) == 1:
            cycles.append(" -> ".join((*trail, node)))
            return
        state[node] = 1
        for child in sorted(edges.get(node, ())):
            visit(child, (*trail, node))
        state[node] = 2
        order.append(node)

    for target in sorted(targets):
        visit(target, ())

    if cycles:
        raise SystemExit("Cyclic BOM detected, refusing to recost:\n  "
                         + "\n  ".join(cycles))
    return order


async def _stored_costs(session, codes: list[str]) -> dict[str, Any]:
    if not codes:
        return {}
    rows = await session.execute(
        text("SELECT Code, StandardCost FROM ERP_Master.Item WHERE Code IN :codes")
        .bindparams(codes=tuple(codes))
    )
    return {r[0]: r[1] for r in rows}


async def main(only: list[str], dry_run: bool) -> None:
    async with SessionFactory() as session:
        bom_items, routing_items = await _costable_items(session)
        costable = bom_items | routing_items

        if only:
            unknown = [c for c in only if c not in costable]
            if unknown:
                print("Not costable (no default ACTIVE/APPROVED BOM or routing): "
                      + ", ".join(unknown))
            targets = {c for c in only if c in costable}
        else:
            targets = costable

        if not targets:
            print("Nothing to recost.")
            return

        edges = await _component_edges(session, bom_items)
        order = _bottom_up(targets, edges)
        before = await _stored_costs(session, order)

        missing = [c for c in order if c not in before]
        if missing:
            print("Not in ERP_Master.Item, will be costed but nothing to write: "
                  + ", ".join(missing) + "\n")

        depth_of = {code: i for i, code in enumerate(order)}
        print(f"{'#':>3}  {'ITEM':<18} {'SOURCES':<16} {'CURRENT':>10}")
        for code in order:
            src = []
            if code in bom_items:
                src.append("BOM")
            if code in routing_items:
                src.append("routing")
            current = before.get(code)
            shown = f"{current:.2f}" if current is not None else "-"
            print(f"{depth_of[code]:>3}  {code:<18} {'+'.join(src):<16} {shown:>10}")

        if dry_run:
            print(f"\n--dry-run: nothing written. {len(order)} item(s) would be"
                  " recosted in the order above (children first).")
            return

        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        rollback = Path(f"rollback_standardcost_{stamp}.sql")
        with rollback.open("w", encoding="utf-8") as fh:
            fh.write(f"-- StandardCost before recost at {stamp}\n")
            for code, cost in sorted(before.items()):
                fh.write("UPDATE ERP_Master.Item SET StandardCost = "
                         f"{cost} WHERE Code = '{code}';\n")
        print(f"\nRollback snapshot written to {rollback.resolve()}")

        service = EngineeringCostService(session)
        results: list[dict[str, Any]] = []
        for code in order:
            result = await service.calculate_and_update_cost_rollup(code, "recost-script")
            if result is None:
                print(f"  {code}: no BOM or routing after all, skipped")
                continue
            results.append(result)

        print(f"\n{'ITEM':<18} {'BEFORE':>10} {'AFTER':>10} {'CHANGE':>10}"
              f"  {'MATERIAL':>10} {'OPERATION':>10}")
        for r in results:
            code = r["itemCode"]
            old = before.get(code)
            new = r["totalStandardCost"]
            delta = f"{new - float(old):+.2f}" if old is not None else "new"
            old_shown = f"{old:.2f}" if old is not None else "-"
            print(f"{code:<18} {old_shown:>10} {new:>10.2f} {delta:>10}"
                  f"  {r['materialCost']:>10.2f} {r['operationCost']:>10.2f}")

        warned = [(r["itemCode"], w) for r in results for w in r["warnings"]]
        if warned:
            print("\nWarnings:")
            for code, w in warned:
                print(f"  {code}: {w}")

        print(f"\nRecosted {len(results)} item(s).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("items", nargs="*", help="item codes; default is all costable")
    parser.add_argument("--dry-run", action="store_true",
                        help="show the plan and current costs without writing")
    args = parser.parse_args()
    try:
        asyncio.run(main(args.items, args.dry_run))
    finally:
        asyncio.run(dispose_engine())
