"""DEV ONLY — reset the Organisation masters for company SSBIND and seed fresh
test data, then reset the company profile to sample values.

Scope (per user request "remove all data and add test data for Organisation menu"):
  - Clears branches, plants, warehouses, departments, cost centres, financial
    years (+ accounting periods) and company registrations for SSBIND.
  - KEEPS the SSBIND company row and ALL IAM users/roles so login still works.
  - Overwrites the SSBIND company profile fields with sample values.
  - Seeds test data through the real application services, so codes use the
    live 4-digit auto-number (BR0001, PL0001 …) and audit/events fire normally.

Run:  .venv\\Scripts\\python.exe scripts/reset_org_data.py
This HARD-DELETES the org rows above — intended for a dev database only.
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import select, text

from app.core.context import TenantContext
from app.core.database import session_scope
from app.core.time import utcnow
from app.modules.organisation.api import schemas as sch
from app.modules.organisation.application import services as svc
from app.modules.organisation.infrastructure.models import SysCompany

# Child-master tables cleared for the company, in FK-safe order.
_CHILD_TABLES = [
    "sys_accounting_period",
    "sys_financial_year",
    "sys_cost_centre",
    "sys_department",
    "sys_warehouse",
    "sys_plant",
    "sys_branch",
    "sys_company_registration",
]


async def main() -> None:
    async with session_scope() as s:
        company = (
            await s.execute(select(SysCompany).where(SysCompany.code == "SSBIND"))
        ).scalar_one_or_none()
        if company is None:
            print("Company SSBIND not found — run scripts/seed_dev.py first.")
            return
        cid = company.id
        ctx = TenantContext.system(company_id=cid)
        # Services resolve the active company by uid; give the system context one.
        ctx.company_uid = company.uid
        ctx.company_ids = frozenset({cid})

        # ── 1. Clear child masters (hard delete, dev only) ──────────────────
        await s.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for table in _CHILD_TABLES:
            await s.execute(text(f"DELETE FROM {table} WHERE company_id = :cid"), {"cid": cid})
        await s.execute(text("SET FOREIGN_KEY_CHECKS=1"))
        print(f"Cleared {len(_CHILD_TABLES)} org tables for SSBIND (company_id={cid}).")

        # ── 2. Reset company profile to sample values ───────────────────────
        now = utcnow()
        company.legal_name = "SSB Industries Private Limited"
        company.trade_name = "SSB Bottles"
        company.entity_type = "PRIVATE_LIMITED"
        company.pan = "AABCS1429B"
        company.gst_state_code = "33"
        company.address_line1 = "Plot 42, SIDCO Industrial Estate"
        company.pincode = "602105"
        company.phone = "+91 44 4200 1000"
        company.email = "info@ssbbottles.example"
        company.website = "https://ssbbottles.example"
        company.updated_at = now
        company.updated_by = 0
        company.version += 1
        await s.flush()
        print("Reset SSBIND company profile.")

        # ── 3. Seed fresh test data through the services ────────────────────
        branch_svc = svc.BranchService(s, ctx)
        head = await branch_svc.create(
            sch.BranchCreate(
                name="Chennai Head Office", branch_type="HEAD_OFFICE", gst_state_code="33"
            )
        )
        factory = await branch_svc.create(
            sch.BranchCreate(
                name="Sriperumbudur Factory", branch_type="FACTORY", gst_state_code="33"
            )
        )
        depot = await branch_svc.create(
            sch.BranchCreate(name="Pune Depot", branch_type="DEPOT", gst_state_code="27")
        )
        print(f"Branches: {head.code}, {factory.code}, {depot.code}")

        plant_svc = svc.PlantService(s, ctx)
        p1 = await plant_svc.create(
            sch.PlantCreate(
                branch_uid=factory.uid, name="Plant 1 — Sriperumbudur",
                factory_licence_no="TN/FAC/2021/0421", installed_capacity_per_day=25000,
            )
        )
        p2 = await plant_svc.create(
            sch.PlantCreate(
                branch_uid=factory.uid, name="Plant 2 — Hosur",
                factory_licence_no="TN/FAC/2022/0876", installed_capacity_per_day=18000,
            )
        )
        print(f"Plants: {p1.code}, {p2.code}")

        wh_svc = svc.WarehouseService(s, ctx)
        warehouses = [
            ("Raw Material Store", "RAW_MATERIAL", p1.uid),
            ("Finished Goods Store", "FINISHED_GOODS", p1.uid),
            ("WIP Store", "WIP", p2.uid),
            ("Packing Material Store", "PACKING_MATERIAL", p2.uid),
        ]
        for name, wtype, plant_uid in warehouses:
            w = await wh_svc.create(
                sch.WarehouseCreate(
                    name=name, branch_uid=factory.uid, plant_uid=plant_uid,
                    warehouse_type=wtype, is_batch_mandatory=(wtype == "RAW_MATERIAL"),
                )
            )
            print(f"  Warehouse: {w.code} — {w.name}")

        dept_svc = svc.DepartmentService(s, ctx)
        for name, dtype in [
            ("Production", "PRODUCTION"), ("Quality Assurance", "QUALITY"),
            ("Stores", "STORES"), ("Maintenance", "MAINTENANCE"), ("Purchase", "PURCHASE"),
        ]:
            d = await dept_svc.create(sch.DepartmentCreate(name=name, department_type=dtype))
            print(f"  Department: {d.code} — {d.name}")

        cc_svc = svc.CostCentreService(s, ctx)
        for name, ctype in [
            ("Production Cost Centre", "PRODUCTION"), ("Quality Cost Centre", "QUALITY"),
            ("Utilities", "UTILITY"), ("Administration", "ADMIN"),
        ]:
            c = await cc_svc.create(sch.CostCentreCreate(name=name, cost_centre_type=ctype))
            print(f"  Cost centre: {c.code} — {c.name}")

        fy_svc = svc.FinancialYearService(s, ctx)
        fy = await fy_svc.create(
            sch.FinancialYearCreate(
                code="FY26-27",
                start_date="2026-04-01",  # type: ignore[arg-type]
                end_date="2027-03-31",  # type: ignore[arg-type]
                is_current=True,
            )
        )
        print(f"Financial year: {fy.code} (current, {fy.status})")

        print("\nOrganisation test data seeded successfully.")


if __name__ == "__main__":
    asyncio.run(main())
