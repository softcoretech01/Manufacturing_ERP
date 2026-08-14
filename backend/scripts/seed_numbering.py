"""Seed the default numbering series (SRS V1-NUM §3.5), idempotent.

Seeds the series relevant to the modules that exist or are near-term (procurement,
sales, inventory, finance vouchers, masters). Skips any series whose (document_type,
sub_type) already exists for the company.

Run:  python -m scripts.seed_numbering
"""

from __future__ import annotations

# ruff: noqa: E501  -- the SERIES table below is data; keep each series on one row.
import asyncio

from sqlalchemy import select

from app.core.context import TenantContext
from app.core.database import session_scope
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import SysUser, SysUserCompany
from app.modules.numbering.application.service import NumberingService
from app.modules.numbering.infrastructure.models import CoreNumberSeries

# (document_type, sub_type, label, format, statutory, gapless, allocate_on, reset, padding)
SERIES = [
    ("PURCHASE_REQUISITION", None, "Purchase Requisition", "PR/{FY}/{SEQ}", False, False, "DRAFT", "FINANCIAL_YEARLY", 5),
    ("PURCHASE_ORDER", None, "Purchase Order", "PO/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("GRN", None, "Goods Receipt Note", "{PLANT}/GRN/{FY}/{SEQ}", False, True, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("SALES_ORDER", None, "Sales Order", "SO/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("SALES_INVOICE", "DOMESTIC", "Tax Invoice (Domestic)", "{BRANCH}INV{FY}{SEQ}", True, True, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("SALES_INVOICE", "EXPORT", "Tax Invoice (Export)", "{BRANCH}EXP{FY}{SEQ}", True, True, "APPROVAL", "FINANCIAL_YEARLY", 4),
    ("CREDIT_NOTE", None, "Credit Note", "CN/{FY}/{SEQ}", True, True, "APPROVAL", "FINANCIAL_YEARLY", 4),
    ("STOCK_ADJUSTMENT", None, "Stock Adjustment", "ADJ/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 4),
    ("MATERIAL_ISSUE", None, "Material Issue", "{PLANT}/MI/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 6),
    ("MATERIAL_RETURN", None, "Material Return", "{PLANT}/MR/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("STOCK_TRANSFER", None, "Stock Transfer", "ST/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("PUTAWAY", None, "Put-away", "PA/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("SCRAP", None, "Scrap / Write-off", "SCR/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 4),
    ("CYCLE_COUNT", None, "Cycle Count", "CC/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 4),
    ("PHYSICAL_VERIFICATION", None, "Physical Verification", "PVR/{FY}/{SEQ}", False, False, "APPROVAL", "FINANCIAL_YEARLY", 3),
    ("PAYMENT_VOUCHER", None, "Payment Voucher", "PV/{FY}/{SEQ}", True, True, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("JOURNAL_VOUCHER", None, "Journal Voucher", "JV/{FY}/{SEQ}", True, True, "APPROVAL", "FINANCIAL_YEARLY", 5),
    ("CUSTOMER", None, "Customer Code", "CUS{SEQ}", False, False, "DRAFT", "NEVER", 5),
    ("SUPPLIER", None, "Supplier Code", "SUP{SEQ}", False, False, "DRAFT", "NEVER", 5),
    ("EMPLOYEE", None, "Employee Code", "EMP{SEQ}", False, False, "DRAFT", "NEVER", 4),
]


async def main() -> None:
    async with session_scope() as s:
        admin = (
            await s.execute(select(SysUser).where(SysUser.login_id == "admin"))
        ).scalar_one()
        company_id = (
            await s.execute(
                select(SysUserCompany.company_id).where(SysUserCompany.user_id == admin.id)
            )
        ).scalar_one()
        ctx = TenantContext(
            user_id=admin.id, user_uid=admin.uid, user_name=admin.full_name,
            login_id=admin.login_id, company_id=company_id, company_uid="",
            company_ids=frozenset({company_id}), permissions=frozenset(perm_cat.ALL_CODES),
        )
        svc = NumberingService(s, ctx)
        existing = {
            (x.document_type, x.sub_type)
            for x in (
                await s.execute(
                    select(CoreNumberSeries).where(
                        CoreNumberSeries.company_id == company_id,
                        CoreNumberSeries.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
        }
        added = 0
        for dt, sub, label, fmt, stat, gapless, alloc, reset, pad in SERIES:
            if (dt, sub) in existing:
                continue
            prefix = fmt.split("/")[0].replace("{PLANT}", "").replace("{BRANCH}", "") or None
            await svc.create({
                "document_type": dt, "sub_type": sub, "document_label": label,
                "format_string": fmt, "prefix": prefix if prefix and "{" not in prefix else None,
                "padding_width": pad, "is_statutory": stat, "is_gapless": gapless,
                "allocate_on": alloc, "reset_frequency": reset, "is_default": True,
                "is_active": True, "start_number": 1, "increment_by": 1,
                "branch_code": "HO", "plant_code": "P1",
            })
            added += 1
        print(f"numbering seed: {added} series added ({len(existing)} already present)")


if __name__ == "__main__":
    asyncio.run(main())
