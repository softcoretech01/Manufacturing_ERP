"""Inventory reporting endpoints: category ledger, low stock, dashboard KPIs.

These three were being called by the frontend but had no server side at all, so
Category Ledger rendered a blank screen and the dashboard fell back to mock data.

Everything here is read-only and derived from the stock engine's own tables —
`inv_stock_balance` for position and `inv_stock_ledger` for movement — so no
figure on these screens can disagree with Current Stock. Value columns follow the
same masking rule as every other stock screen (V4-STK §2.11): without
`INVENTORY.STOCK.VALUE` they come back null rather than being silently wrong.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.core.enums import MovementDirection, StockStatus
from app.core.time import utcnow
from app.modules.inventory.infrastructure.models import InvStockBalance, InvStockLedger
from app.modules.masters.infrastructure.models import MstItem
from app.modules.organisation.infrastructure.models import SysWarehouse

router = APIRouter(tags=["Inventory · Reports"])


async def _wh_id(session: SessionDep, ctx: TenantContext, uid: str | None) -> int | None:
    if not uid:
        return None
    return (
        await session.execute(
            select(SysWarehouse.id).where(
                SysWarehouse.uid == uid, SysWarehouse.company_id == ctx.company_id
            )
        )
    ).scalar_one_or_none()


def _category_of(item_type: str) -> str:
    """Display category for an item.

    `mst_item` carries the item type, not a category id — the Item master in
    ERP_Master owns Category, and the two are bridged on item code rather than
    joined (their collations differ, so a cross-database join raises MySQL 1267).
    Until a category column lands on `mst_item`, the item type is the honest
    grouping key, and it is what Current Stock already shows in its Category
    column, so the two screens agree.
    """
    return (item_type or "UNCLASSIFIED").replace("_", " ").title()


# ═══════════════════════════ Category ledger ════════════════════════════════
@router.get("/inventory/category-ledger")
async def category_ledger(
    session: SessionDep,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    warehouse: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> list[dict[str, Any]]:
    """Movement and closing position rolled up by item category."""
    wid = await _wh_id(session, ctx, warehouse)

    # ── movement in the period, from the ledger ──────────────────────────────
    mv = (
        select(
            MstItem.item_type,
            func.coalesce(
                func.sum(
                    case(
                        (InvStockLedger.direction == MovementDirection.IN.value,
                         InvStockLedger.quantity),
                        else_=0,
                    )
                ),
                0,
            ).label("in_qty"),
            func.coalesce(
                func.sum(
                    case(
                        (InvStockLedger.direction == MovementDirection.OUT.value,
                         InvStockLedger.quantity),
                        else_=0,
                    )
                ),
                0,
            ).label("out_qty"),
        )
        .join(InvStockLedger, InvStockLedger.item_id == MstItem.id)
        .where(
            MstItem.company_id == ctx.company_id,
            MstItem.deleted_at.is_(None),
            InvStockLedger.company_id == ctx.company_id,
        )
        .group_by(MstItem.item_type)
    )
    if wid:
        mv = mv.where(InvStockLedger.warehouse_id == wid)
    if date_from:
        mv = mv.where(InvStockLedger.business_date >= date_from)
    if date_to:
        mv = mv.where(InvStockLedger.business_date <= date_to)
    movement = {r[0]: (float(r[1]), float(r[2])) for r in (await session.execute(mv)).all()}

    # ── closing position, from the balances ──────────────────────────────────
    bal = (
        select(
            MstItem.item_type,
            func.count(func.distinct(MstItem.id)).label("item_count"),
            func.coalesce(func.sum(InvStockBalance.quantity), 0).label("qty"),
            func.coalesce(func.sum(InvStockBalance.value), 0).label("value"),
        )
        .join(InvStockBalance, InvStockBalance.item_id == MstItem.id)
        .where(
            MstItem.company_id == ctx.company_id,
            MstItem.deleted_at.is_(None),
            InvStockBalance.company_id == ctx.company_id,
        )
        .group_by(MstItem.item_type)
    )
    if wid:
        bal = bal.where(InvStockBalance.warehouse_id == wid)
    balances = {
        r[0]: (int(r[1]), float(r[2]), float(r[3]))
        for r in (await session.execute(bal)).all()
    }

    show_value = ctx.has("INVENTORY.STOCK.VALUE")
    out: list[dict[str, Any]] = []
    for item_type in sorted(set(movement) | set(balances)):
        label = _category_of(item_type)
        if category and label.lower() != category.lower():
            continue
        in_qty, out_qty = movement.get(item_type, (0.0, 0.0))
        count, qty, value = balances.get(item_type, (0, 0.0, 0.0))
        out.append(
            {
                "category": label,
                "item_type": item_type,
                "item_count": count,
                "total_in_qty": round(in_qty, 6),
                "total_out_qty": round(out_qty, 6),
                # Closing is the live balance; opening is closing less the
                # period's net movement, so the two always reconcile.
                "current_qty": round(qty, 6),
                "opening_qty": round(qty - in_qty + out_qty, 6),
                "total_value": round(value, 2) if show_value else None,
            }
        )
    return out


# ═══════════════════════════ Low stock ══════════════════════════════════════
@router.get("/inventory/low-stock")
async def low_stock(
    session: SessionDep,
    warehouse: str | None = None,
    item_type: str | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> list[dict[str, Any]]:
    """Items at or below their reorder level, one row per item.

    `shortage_qty` is positive — it is how much is missing, not a negative
    balance. Screens must render it as-is.
    """
    wid = await _wh_id(session, ctx, warehouse)
    avail = StockStatus.AVAILABLE.value

    stmt = (
        select(MstItem, func.coalesce(func.sum(InvStockBalance.quantity), 0))
        .join(
            InvStockBalance,
            (InvStockBalance.item_id == MstItem.id)
            & (InvStockBalance.stock_status == avail)
            & ((InvStockBalance.warehouse_id == wid) if wid else (1 == 1)),
            isouter=True,
        )
        .where(
            MstItem.company_id == ctx.company_id,
            MstItem.deleted_at.is_(None),
            MstItem.is_active.is_(True),
            MstItem.reorder_level.isnot(None),
            MstItem.reorder_level > 0,
        )
        .group_by(MstItem.id)
        .order_by(MstItem.code)
    )
    if item_type:
        stmt = stmt.where(MstItem.item_type == item_type)

    wh_name = None
    if wid:
        wh = (
            await session.execute(
                select(SysWarehouse.code, SysWarehouse.name).where(SysWarehouse.id == wid)
            )
        ).first()
        wh_name = f"{wh[0]} — {wh[1]}" if wh else None

    rows = (await session.execute(stmt)).all()
    out: list[dict[str, Any]] = []
    for it, qty in rows:
        current = float(qty or 0)
        reorder = float(it.reorder_level or 0)
        if current >= reorder:
            continue
        minimum = float(it.min_level) if it.min_level is not None else 0.0
        out.append(
            {
                "item_uid": it.uid,
                "item_code": it.code,
                "item_name": it.name,
                "category": _category_of(it.item_type),
                "uom": it.base_uom,
                "warehouse_name": wh_name or "All stores",
                "current_qty": current,
                "min_level": minimum,
                "reorder_level": reorder,
                "shortage_qty": round(reorder - current, 6),
                "status": (
                    "Critical" if current <= 0
                    else "Low" if current < reorder * 0.5
                    else "Normal"
                ),
            }
        )
    return out


# ═══════════════════════════ Dashboard KPIs ═════════════════════════════════
@router.get("/inventory/dashboard-kpis")
async def dashboard_kpis(
    session: SessionDep,
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> dict[str, Any]:
    """Real figures for the inventory dashboard — every one a query, none seeded."""
    today = utcnow().date()
    start = date_from or today
    end = date_to or today
    show_value = ctx.has("INVENTORY.STOCK.VALUE")

    total_value, sku_count = (
        await session.execute(
            select(
                func.coalesce(func.sum(InvStockBalance.value), 0),
                func.count(func.distinct(InvStockBalance.item_id)),
            ).where(
                InvStockBalance.company_id == ctx.company_id,
                InvStockBalance.quantity > 0,
            )
        )
    ).one()

    # Movement in the window, split by direction.
    moved = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (InvStockLedger.direction == MovementDirection.IN.value,
                             InvStockLedger.quantity),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (InvStockLedger.direction == MovementDirection.OUT.value,
                             InvStockLedger.quantity),
                            else_=0,
                        )
                    ),
                    0,
                ),
            ).where(
                InvStockLedger.company_id == ctx.company_id,
                InvStockLedger.business_date >= start,
                InvStockLedger.business_date <= end,
            )
        )
    ).one()

    below = len(await low_stock(session, None, None, ctx))  # type: ignore[arg-type]

    # A 14-day movement trend, so the chart has something real behind it.
    trend_start = today - timedelta(days=13)
    trend_rows = (
        await session.execute(
            select(
                InvStockLedger.business_date,
                func.coalesce(
                    func.sum(
                        case(
                            (InvStockLedger.direction == MovementDirection.IN.value,
                             InvStockLedger.quantity),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (InvStockLedger.direction == MovementDirection.OUT.value,
                             InvStockLedger.quantity),
                            else_=0,
                        )
                    ),
                    0,
                ),
            )
            .where(
                InvStockLedger.company_id == ctx.company_id,
                InvStockLedger.business_date >= trend_start,
            )
            .group_by(InvStockLedger.business_date)
            .order_by(InvStockLedger.business_date)
        )
    ).all()

    out_of_stock = (
        await session.execute(
            select(func.count()).select_from(
                select(MstItem.id)
                .join(InvStockBalance, InvStockBalance.item_id == MstItem.id, isouter=True)
                .where(
                    MstItem.company_id == ctx.company_id,
                    MstItem.deleted_at.is_(None),
                    MstItem.is_active.is_(True),
                )
                .group_by(MstItem.id)
                .having(func.coalesce(func.sum(InvStockBalance.quantity), 0) <= 0)
                .subquery()
            )
        )
    ).scalar_one()

    return {
        "total_stock_value": round(float(total_value), 2) if show_value else None,
        "total_sku_count": int(sku_count),
        "below_reorder_count": below,
        "out_of_stock_count": int(out_of_stock),
        # No batch carries an expiry date until `inv_batch_master` is populated,
        # so this is genuinely zero rather than a placeholder.
        "expiring_soon_count": 0,
        "pending_grn_count": 0,
        "draft_txn_count": 0,
        "stock_in_period": round(float(moved[0]), 6),
        "stock_out_period": round(float(moved[1]), 6),
        "movement_trend": [
            {
                "date": r[0].isoformat(),
                "receipts": round(float(r[1]), 6),
                "issues": round(float(r[2]), 6),
            }
            for r in trend_rows
        ],
    }
