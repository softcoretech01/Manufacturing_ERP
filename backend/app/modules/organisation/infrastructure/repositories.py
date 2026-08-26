"""Repositories for the Organisation aggregates. Thin subclasses of the tenant-
scoped :class:`BaseRepository`, plus the specific queries the deactivation guards
and lookups need."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.organisation.infrastructure.models import (
    MstCurrency,
    MstExchangeRate,
    SysAccountingPeriod,
    SysBranch,
    SysCompany,
    SysCompanyRegistration,
    SysCostCentre,
    SysDepartment,
    SysFinancialYear,
    SysPlant,
    SysWarehouse,
)


class CompanyRepository(BaseRepository[SysCompany]):
    model = SysCompany
    company_scoped = False  # the company table has no company_id column

    def _scoped(self, *, include_deleted: bool = False) -> Select[tuple[SysCompany]]:
        stmt: Select[tuple[SysCompany]] = select(SysCompany)
        if not include_deleted:
            stmt = stmt.where(SysCompany.deleted_at.is_(None))
        if not self.ctx.is_system:
            scope = self.ctx.company_ids or frozenset({self.ctx.company_id})
            stmt = stmt.where(SysCompany.id.in_(scope))
        return stmt

    async def count_active_branches(self, company_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(SysBranch)
            .where(
                SysBranch.company_id == company_id,
                SysBranch.deleted_at.is_(None),
                SysBranch.is_active.is_(True),
            )
        )
        return int((await self.session.execute(stmt)).scalar_one())

    async def has_open_financial_year(self, company_id: int) -> bool:
        stmt = (
            select(SysFinancialYear.id)
            .where(
                SysFinancialYear.company_id == company_id,
                SysFinancialYear.deleted_at.is_(None),
                SysFinancialYear.status == "OPEN",
            )
            .limit(1)
        )
        return (await self.session.execute(stmt)).first() is not None


class RegistrationRepository(BaseRepository[SysCompanyRegistration]):
    model = SysCompanyRegistration

    async def list_for_company(self, company_id: int) -> list[SysCompanyRegistration]:
        stmt = self.base_query().where(SysCompanyRegistration.company_id == company_id)
        return list((await self.session.execute(stmt)).scalars().all())


class BranchRepository(BaseRepository[SysBranch]):
    model = SysBranch

    async def gstin_exists(self, gstin: str, *, exclude_uid: str | None = None) -> bool:
        # GSTIN is unique across the whole installation (V1-ORG-BR-008), not per company.
        stmt = select(SysBranch.id).where(SysBranch.gstin == gstin, SysBranch.deleted_at.is_(None))
        if exclude_uid:
            stmt = stmt.where(SysBranch.uid != exclude_uid)
        return (await self.session.execute(stmt.limit(1))).first() is not None

    async def count_active_plants(self, branch_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(SysPlant)
            .where(
                SysPlant.branch_id == branch_id,
                SysPlant.deleted_at.is_(None),
                SysPlant.is_active.is_(True),
            )
        )
        return int((await self.session.execute(stmt)).scalar_one())


class PlantRepository(BaseRepository[SysPlant]):
    model = SysPlant

    async def count_active_warehouses(self, plant_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(SysWarehouse)
            .where(
                SysWarehouse.plant_id == plant_id,
                SysWarehouse.deleted_at.is_(None),
                SysWarehouse.is_active.is_(True),
            )
        )
        return int((await self.session.execute(stmt)).scalar_one())


class WarehouseRepository(BaseRepository[SysWarehouse]):
    model = SysWarehouse


class DepartmentRepository(BaseRepository[SysDepartment]):
    model = SysDepartment

    def _scoped(self, *, include_deleted: bool = False) -> Select[tuple[SysDepartment]]:
        # Eager-load the parent (one level) on every read — list, get, update — so
        # parent code/name serialise without an async lazy load.
        return super()._scoped(include_deleted=include_deleted).options(
            selectinload(SysDepartment.parent)
        )

    async def parent_map(self, company_id: int) -> dict[int, int | None]:
        stmt = select(SysDepartment.id, SysDepartment.parent_id).where(
            SysDepartment.company_id == company_id, SysDepartment.deleted_at.is_(None)
        )
        return {row[0]: row[1] for row in (await self.session.execute(stmt)).all()}

    async def count_active_children(self, department_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(SysDepartment)
            .where(
                SysDepartment.parent_id == department_id,
                SysDepartment.deleted_at.is_(None),
                SysDepartment.is_active.is_(True),
            )
        )
        return int((await self.session.execute(stmt)).scalar_one())


class CostCentreRepository(BaseRepository[SysCostCentre]):
    model = SysCostCentre

    def _scoped(self, *, include_deleted: bool = False) -> Select[tuple[SysCostCentre]]:
        return super()._scoped(include_deleted=include_deleted).options(
            selectinload(SysCostCentre.parent)
        )

    async def parent_map(self, company_id: int) -> dict[int, int | None]:
        stmt = select(SysCostCentre.id, SysCostCentre.parent_id).where(
            SysCostCentre.company_id == company_id, SysCostCentre.deleted_at.is_(None)
        )
        return {row[0]: row[1] for row in (await self.session.execute(stmt)).all()}

    async def count_active_children(self, cost_centre_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(SysCostCentre)
            .where(
                SysCostCentre.parent_id == cost_centre_id,
                SysCostCentre.deleted_at.is_(None),
                SysCostCentre.is_active.is_(True),
            )
        )
        return int((await self.session.execute(stmt)).scalar_one())


class FinancialYearRepository(BaseRepository[SysFinancialYear]):
    model = SysFinancialYear

    async def intervals(
        self, company_id: int, *, exclude_uid: str | None = None
    ) -> list[SysFinancialYear]:
        stmt = self.base_query().where(SysFinancialYear.company_id == company_id)
        if exclude_uid:
            stmt = stmt.where(SysFinancialYear.uid != exclude_uid)
        return list((await self.session.execute(stmt)).scalars().all())

    async def clear_current(self, company_id: int) -> None:
        rows = (
            (
                await self.session.execute(
                    self.base_query().where(
                        SysFinancialYear.company_id == company_id,
                        SysFinancialYear.is_current.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
        for fy in rows:
            fy.is_current = False


class AccountingPeriodRepository(BaseRepository[SysAccountingPeriod]):
    model = SysAccountingPeriod

    async def list_for_fy(self, financial_year_id: int) -> list[SysAccountingPeriod]:
        stmt = (
            self.base_query()
            .where(SysAccountingPeriod.financial_year_id == financial_year_id)
            .order_by(SysAccountingPeriod.period_no)
        )
        return list((await self.session.execute(stmt)).scalars().all())


class CurrencyRepository(BaseRepository[MstCurrency]):
    model = MstCurrency
    company_scoped = False


class ExchangeRateRepository(BaseRepository[MstExchangeRate]):
    model = MstExchangeRate

    async def latest_on_or_before(
        self, *, company_id: int, from_code: str, to_code: str, rate_type: str, as_of: date
    ) -> MstExchangeRate | None:
        stmt = (
            self.base_query()
            .where(
                MstExchangeRate.company_id == company_id,
                MstExchangeRate.from_currency_code == from_code,
                MstExchangeRate.to_currency_code == to_code,
                MstExchangeRate.rate_type == rate_type,
                MstExchangeRate.effective_date <= as_of,
            )
            .order_by(MstExchangeRate.effective_date.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()
