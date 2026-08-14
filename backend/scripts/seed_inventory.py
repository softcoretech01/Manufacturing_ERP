"""Seed a few items + goods receipts so Stock Enquiry / Ledger have real data.
Idempotent: skips items that already exist; only posts receipts on first run.

Run:  python -m scripts.seed_inventory
"""

from __future__ import annotations

import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.context import TenantContext
from app.core.database import session_scope
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import SysUser, SysUserCompany
from app.modules.inventory.application.receipt_service import ReceiptService
from app.modules.masters.application.item_service import ItemService
from app.modules.masters.infrastructure.models import MstItem
from app.modules.organisation.infrastructure.models import SysWarehouse

ITEMS = [
    # code, name, type, uom, batch_tracked, reorder
    ("RM-SS304-050", "SS 304 Coil 0.50 mm", "RAW_MATERIAL", "KG", True, 10000),
    ("RM-SS316-060", "SS 316 Coil 0.60 mm", "RAW_MATERIAL", "KG", False, 5000),
    ("CMP-LID-SCR-SS", "Screw Lid — SS", "PACKING", "NOS", False, 20000),
    ("CON-PWD-BLK", "Coating Powder — Black", "CONSUMABLE", "KG", False, 500),
]

# item_code, qty, rate, batch  (two RM-SS316 receipts at different rates → moving avg)
RECEIPTS = [
    ("RM-SS304-050", 5000, 244.00, "B2606-H4471"),
    ("RM-SS304-050", 3000, 250.00, "B2607-H4488"),
    ("RM-SS316-060", 2000, 300.00, ""),
    ("RM-SS316-060", 1420, 320.00, ""),
    ("CMP-LID-SCR-SS", 42800, 38.00, ""),
    ("CON-PWD-BLK", 1240, 315.00, ""),
]


async def main() -> None:
    async with session_scope() as s:
        admin = (await s.execute(select(SysUser).where(SysUser.login_id == "admin"))).scalar_one()
        cid = (
            await s.execute(
                select(SysUserCompany.company_id).where(SysUserCompany.user_id == admin.id)
            )
        ).scalar_one()
        ctx = TenantContext(
            user_id=admin.id, user_uid=admin.uid, user_name=admin.full_name, login_id="admin",
            company_id=cid, company_uid="", company_ids=frozenset({cid}),
            permissions=frozenset(perm_cat.ALL_CODES),
        )
        items = ItemService(s, ctx)
        existing = {
            i.code for i in (
                await s.execute(
                    select(MstItem).where(MstItem.company_id == cid, MstItem.deleted_at.is_(None))
                )
            ).scalars().all()
        }
        made = 0
        for code, name, typ, uom, batch, reorder in ITEMS:
            if code in existing:
                continue
            await items.create({
                "code": code, "name": name, "item_type": typ, "base_uom": uom,
                "is_batch_tracked": batch, "reorder_level": reorder, "qty_precision": 3,
                "valuation_method": "WEIGHTED_AVG",
            })
            made += 1

        wh = (
            await s.execute(
                select(SysWarehouse).where(
                    SysWarehouse.company_id == cid, SysWarehouse.code == "WH0001",
                    SysWarehouse.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if wh is None:
            print(f"items created={made}; no WH0001 warehouse — skipping receipts")
            return

        # Only post receipts if there are no ledger rows yet (first run).
        from app.modules.inventory.infrastructure.models import InvStockLedger

        has_ledger = (
            await s.execute(
                select(InvStockLedger.id)
                .where(InvStockLedger.company_id == cid)
                .limit(1)
            )
        ).scalar_one_or_none()
        posted = 0
        if not has_ledger:
            rcpt = ReceiptService(s, ctx)
            by_code = {
                i.code: i for i in (
                    await s.execute(
                        select(MstItem).where(
                            MstItem.company_id == cid, MstItem.deleted_at.is_(None)
                        )
                    )
                ).scalars().all()
            }
            for code, qty, rate, batch in RECEIPTS:
                it = by_code.get(code)
                if not it:
                    continue
                await rcpt.receive(
                    item_uid=it.uid, warehouse_uid=wh.uid,
                    quantity=Decimal(str(qty)), rate=Decimal(str(rate)),
                    batch_no=batch, supplier_label="Opening stock",
                )
                posted += 1
        print(f"inventory seed: items created={made}, receipts posted={posted}")


if __name__ == "__main__":
    asyncio.run(main())
