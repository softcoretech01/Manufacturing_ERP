"""Inventory analysis (SRS Vol 4 Ch 9-10), read-only over the stock engine.

Every report here is a query over `inv_stock_balance` + `inv_stock_ledger` — the
engine is the single source of truth (V4-STK-FR-001), so nothing recomputes stock
its own way. Valuation and ABC read balances; ageing and movement walk the ledger.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import MovementDirection, StockStatus
from app.core.time import utcnow
from app.modules.inventory.infrastructure.models import InvStockBalance, InvStockLedger
from app.modules.masters.infrastructure.models import MstItem

_AGE_BUCKETS = [(0, 30), (31, 60), (61, 90), (91, 180), (181, 10**9)]
_BUCKET_LABELS = ["0-30", "31-60", "61-90", "91-180", "180+"]


class AnalysisService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    async def _items(self) -> dict[int, MstItem]:
        rows = await self.session.execute(
            select(MstItem).where(
                MstItem.company_id == self.ctx.company_id, MstItem.deleted_at.is_(None)
            )
        )
        return {i.id: i for i in rows.scalars().all()}

    # ── valuation (Ch 9) ─────────────────────────────────────────────────────
    async def valuation(self, *, warehouse_id: int | None = None) -> dict[str, Any]:
        stmt = (
            select(
                MstItem,
                func.coalesce(func.sum(InvStockBalance.quantity), 0),
                func.coalesce(func.sum(InvStockBalance.value), 0),
            )
            .join(InvStockBalance, InvStockBalance.item_id == MstItem.id)
            .where(MstItem.company_id == self.ctx.company_id, MstItem.deleted_at.is_(None))
        )
        if warehouse_id:
            stmt = stmt.where(InvStockBalance.warehouse_id == warehouse_id)
        stmt = stmt.group_by(MstItem.id).order_by(func.sum(InvStockBalance.value).desc())
        rows = (await self.session.execute(stmt)).all()
        items: list[dict[str, Any]] = []
        by_type: dict[str, float] = defaultdict(float)
        total = 0.0
        for it, qty, value in rows:
            q, v = float(qty), float(value)
            if q == 0:
                continue
            items.append({
                "item_code": it.code, "item_name": it.name, "uom": it.base_uom,
                "item_type": it.item_type, "quantity": q,
                "avg_rate": round(v / q, 4) if q else 0.0, "value": v,
            })
            by_type[it.item_type] += v
            total += v
        return {
            "items": items,
            "by_type": [
                {"item_type": k, "value": v}
                for k, v in sorted(by_type.items(), key=lambda x: -x[1])
            ],
            "total_value": round(total, 2),
        }

    # ── reorder (Ch 10) ──────────────────────────────────────────────────────
    async def reorder(self, *, warehouse_id: int | None = None) -> list[dict[str, Any]]:
        avail = StockStatus.AVAILABLE.value
        # Aggregate available (AVAILABLE-status) balance per item.
        stmt = (
            select(MstItem, func.coalesce(func.sum(InvStockBalance.quantity), 0))
            .join(
                InvStockBalance,
                (InvStockBalance.item_id == MstItem.id)
                & (InvStockBalance.stock_status == avail),
                isouter=True,
            )
            .where(
                MstItem.company_id == self.ctx.company_id,
                MstItem.deleted_at.is_(None),
                MstItem.reorder_level.isnot(None),
            )
        )
        if warehouse_id:
            stmt = stmt.where(
                (InvStockBalance.warehouse_id == warehouse_id) | (InvStockBalance.id.is_(None))
            )
        stmt = stmt.group_by(MstItem.id).order_by(MstItem.code)
        rows = (await self.session.execute(stmt)).all()
        out = []
        for it, available in rows:
            avail_q = float(available)
            reorder = float(it.reorder_level or 0)
            if avail_q >= reorder:
                continue
            target = float(it.max_level) if it.max_level else reorder
            out.append({
                "item_code": it.code, "item_name": it.name, "uom": it.base_uom,
                "available": avail_q, "reorder_level": reorder,
                "shortfall": round(reorder - avail_q, 6),
                "suggested_order": round(max(target - avail_q, 0), 6),
            })
        return out

    # ── ledger walk (shared by ageing + movement) ────────────────────────────
    async def _ledger(self, warehouse_id: int | None) -> list[InvStockLedger]:
        stmt = select(InvStockLedger).where(InvStockLedger.company_id == self.ctx.company_id)
        if warehouse_id:
            stmt = stmt.where(InvStockLedger.warehouse_id == warehouse_id)
        stmt = stmt.order_by(InvStockLedger.item_id, InvStockLedger.posted_at, InvStockLedger.id)
        return list((await self.session.execute(stmt)).scalars().all())

    # ── ageing (FIFO over the ledger) ────────────────────────────────────────
    async def ageing(self, *, warehouse_id: int | None = None) -> dict[str, Any]:
        items = await self._items()
        ledger = await self._ledger(warehouse_id)
        today = utcnow().date()
        # FIFO layers per item: [(business_date, qty_remaining, rate)]
        layers: dict[int, list[list[Any]]] = defaultdict(list)
        for led in ledger:
            q = Decimal(str(led.quantity))
            if led.direction == MovementDirection.IN.value:
                layers[led.item_id].append([led.business_date, q, Decimal(str(led.rate))])
            else:
                # consume oldest first
                remaining = q
                for layer in layers[led.item_id]:
                    if remaining <= 0:
                        break
                    take = min(layer[1], remaining)
                    layer[1] -= take
                    remaining -= take
        rows: list[dict[str, Any]] = []
        totals = [0.0] * len(_AGE_BUCKETS)
        total_value = 0.0
        for item_id, ls in layers.items():
            it = items.get(item_id)
            if it is None:
                continue
            buckets_q = [0.0] * len(_AGE_BUCKETS)
            buckets_v = [0.0] * len(_AGE_BUCKETS)
            for bdate, qty_rem, rate in ls:
                if qty_rem <= 0:
                    continue
                age = (today - bdate).days
                for i, (lo, hi) in enumerate(_AGE_BUCKETS):
                    if lo <= age <= hi:
                        buckets_q[i] += float(qty_rem)
                        buckets_v[i] += float(qty_rem * rate)
                        totals[i] += float(qty_rem * rate)
                        total_value += float(qty_rem * rate)
                        break
            if sum(buckets_q) == 0:
                continue
            rows.append({
                "item_code": it.code, "item_name": it.name, "uom": it.base_uom,
                "buckets_qty": [round(x, 3) for x in buckets_q],
                "buckets_value": [round(x, 2) for x in buckets_v],
                "on_hand": round(sum(buckets_q), 3),
                "oldest_days": max(
                    ((today - bd).days for bd, qr, _ in ls if qr > 0), default=0
                ),
            })
        rows.sort(key=lambda r: -r["oldest_days"])
        return {
            "labels": _BUCKET_LABELS, "rows": rows,
            "totals_value": [round(x, 2) for x in totals], "total_value": round(total_value, 2),
        }

    # ── ABC / XYZ ────────────────────────────────────────────────────────────
    async def abc_xyz(self, *, warehouse_id: int | None = None) -> dict[str, Any]:
        val = await self.valuation(warehouse_id=warehouse_id)
        items = sorted(val["items"], key=lambda x: -x["value"])
        total = val["total_value"] or 1.0
        # XYZ from consumption variability (monthly OUT qty per item).
        ledger = await self._ledger(warehouse_id)
        monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        code_by_id = {}
        allitems = await self._items()
        for i in allitems.values():
            code_by_id[i.id] = i.code
        for led in ledger:
            is_consumption = led.movement_type in ("ISSUE", "SCRAP")
            if led.direction == MovementDirection.OUT.value and is_consumption:
                key = f"{led.business_date.year}-{led.business_date.month:02d}"
                monthly[code_by_id.get(led.item_id, "?")][key] += float(led.quantity)

        def xyz(code: str) -> str:
            periods = list(monthly.get(code, {}).values())
            if len(periods) < 2:
                return "Z"  # not enough consumption history to classify
            mean = sum(periods) / len(periods)
            if mean == 0:
                return "Z"
            var = sum((p - mean) ** 2 for p in periods) / len(periods)
            cv = (var**0.5) / mean
            return "X" if cv < 0.5 else "Y" if cv < 1.0 else "Z"

        cum = 0.0
        rows: list[dict[str, Any]] = []
        counts = {"A": 0, "B": 0, "C": 0}
        for it in items:
            cum += it["value"]
            pct = cum / total
            cls = "A" if pct <= 0.8 else "B" if pct <= 0.95 else "C"
            counts[cls] += 1
            rows.append({
                **it, "cumulative_pct": round(pct * 100, 1),
                "abc_class": cls, "xyz_class": xyz(it["item_code"]),
            })
        return {"rows": rows, "abc_counts": counts, "total_value": val["total_value"]}

    # ── fast / slow / dead movement ──────────────────────────────────────────
    async def movement(
        self, *, warehouse_id: int | None = None, dead_days: int = 180, slow_days: int = 60
    ) -> dict[str, Any]:
        items = await self._items()
        ledger = await self._ledger(warehouse_id)
        today = utcnow().date()
        last_out: dict[int, date] = {}
        out_count: dict[int, int] = defaultdict(int)
        for led in ledger:
            is_out = led.movement_type in ("ISSUE", "SCRAP", "TRANSFER_OUT")
            if led.direction == MovementDirection.OUT.value and is_out:
                if led.item_id not in last_out or led.business_date > last_out[led.item_id]:
                    last_out[led.item_id] = led.business_date
                out_count[led.item_id] += 1
        # current on-hand + value per item
        bal = (
            await self.session.execute(
                
                    select(
                        InvStockBalance.item_id,
                        func.sum(InvStockBalance.quantity),
                        func.sum(InvStockBalance.value),
                    )
                    .where(InvStockBalance.company_id == self.ctx.company_id)
                    .group_by(InvStockBalance.item_id)
                
            )
        ).all()
        rows: list[dict[str, Any]] = []
        counts = {"FAST": 0, "SLOW": 0, "DEAD": 0}
        for item_id, qty, value in bal:
            it = items.get(item_id)
            if it is None or float(qty) == 0:
                continue
            lo = last_out.get(item_id)
            days = (today - lo).days if lo else None
            if days is None or days > dead_days:
                cls = "DEAD"
            elif days > slow_days:
                cls = "SLOW"
            else:
                cls = "FAST"
            counts[cls] += 1
            rows.append({
                "item_code": it.code, "item_name": it.name, "uom": it.base_uom,
                "on_hand": float(qty), "value": float(value),
                "last_issue_days": days, "issues": out_count.get(item_id, 0), "movement_class": cls,
            })
        rows.sort(
            key=lambda r: (r["movement_class"] != "DEAD", -int(r["last_issue_days"] or 10**9))
        )
        return {"rows": rows, "counts": counts}
