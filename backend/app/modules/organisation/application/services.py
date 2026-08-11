"""Organisation application services.

Each use case is a method here; routers only translate HTTP ↔ service call.
Services own the transaction boundary implicitly (the request session commits on
success), apply domain rules, guard dependencies, write the audit trail and emit
domain events. Cross-module writes are avoided — organisation talks to other
modules only through events (CLAUDE.md §3.3).
"""

from __future__ import annotations

from typing import Any, ClassVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import diff, record_audit
from app.core.context import TenantContext
from app.core.enums import AuditAction, FinancialYearStatus
from app.core.errors import (
    BusinessRuleViolationError,
    DuplicateError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.outbox import emit_event
from app.core.pagination import ListSpec, PageParams
from app.core.repository import assert_in_write_scope
from app.core.time import utcnow
from app.modules.organisation.domain import rules
from app.modules.organisation.infrastructure import models as m
from app.modules.organisation.infrastructure import repositories as repo

# ─────────────────────────── helpers ────────────────────────────────────────


def _rule_error(err: rules.RuleError) -> ValidationFailedError:
    return ValidationFailedError(
        err.message,
        errors=[{"field": err.field, "code": "business_rule", "message": err.message}],
        rule_code=err.rule_code,
    )


def _snapshot(entity: Any, fields: list[str]) -> dict[str, Any]:
    return {f: getattr(entity, f) for f in fields}


# ─────────────────────────── Company ────────────────────────────────────────
class CompanyService:
    AUDITED: ClassVar[list[str]] = [
        "code",
        "legal_name",
        "trade_name",
        "pan",
        "gst_state_code",
        "is_active",
    ]
    SPEC = ListSpec(
        sortable={
            "code": m.SysCompany.code,
            "legal_name": m.SysCompany.legal_name,
            "created_at": m.SysCompany.created_at,
            "id": m.SysCompany.id,
        },
        searchable=[m.SysCompany.code, m.SysCompany.legal_name, m.SysCompany.trade_name],
    )

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.CompanyRepository(session, ctx)

    async def list_page(self, params: PageParams) -> tuple[list[m.SysCompany], int]:
        stmt = self.SPEC.apply_search(self.repo.base_query(), params.q)
        total = await self.repo.count(stmt)
        stmt = self.SPEC.apply_sort(stmt, params.sort)
        rows = await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size)
        return rows, total

    async def get(self, uid: str) -> m.SysCompany:
        return await self.repo.get_by_uid_or_404(uid)

    async def create(self, data: Any) -> m.SysCompany:
        if data.pan and (err := rules.validate_pan(data.pan.upper())):
            raise _rule_error(err)
        if await self.repo.exists_code(data.code, company_id=0):
            raise DuplicateError(
                f"Company code '{data.code}' already exists.", rule_code="V1-ORG-BR-002"
            )
        entity = m.SysCompany(**data.model_dump())
        if entity.pan:
            entity.pan = entity.pan.upper()
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_company",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="company",
            aggregate_uid=entity.uid,
            event_type="org.company.created",
            payload={"uid": entity.uid, "code": entity.code},
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.SysCompany:
        entity = await self.repo.get_by_uid_or_404(uid)
        before = _snapshot(entity, self.AUDITED)
        payload = data.model_dump(exclude_unset=True, exclude={"version"})
        if payload.get("pan"):
            payload["pan"] = payload["pan"].upper()
            if err := rules.validate_pan(payload["pan"]):
                raise _rule_error(err)
        for key, value in payload.items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_company",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="company",
            aggregate_uid=entity.uid,
            event_type="org.company.updated",
            payload={"uid": entity.uid},
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.SysCompany:
        entity = await self.repo.get_by_uid_or_404(uid)
        if await self.repo.count_active_branches(entity.id):
            raise BusinessRuleViolationError(
                "Company cannot be deactivated while it has active branches.",
                rule_code="V1-ORG-BR-006",
            )
        if await self.repo.has_open_financial_year(entity.id):
            raise BusinessRuleViolationError(
                "Company cannot be deactivated while it holds an open financial year.",
                rule_code="V1-ORG-BR-006",
            )
        entity.is_active = False
        self.repo.soft_delete(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="sys_company",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="company",
            aggregate_uid=entity.uid,
            event_type="org.company.deactivated",
            payload={"uid": entity.uid},
        )
        return entity

    async def restore(self, uid: str) -> m.SysCompany:
        entity = await self.repo.get_by_uid_or_404(uid, include_deleted=True)
        if not entity.is_deleted:
            raise BusinessRuleViolationError("Company is not deactivated.")
        entity.is_active = True
        self.repo.restore(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_company",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason="restore",
        )
        return entity

    async def registrations(self, company_uid: str) -> list[m.SysCompanyRegistration]:
        company = await self.repo.get_by_uid_or_404(company_uid)
        return await repo.RegistrationRepository(self.session, self.ctx).list_for_company(
            company.id
        )

    async def add_registration(self, company_uid: str, data: Any) -> m.SysCompanyRegistration:
        company = await self.repo.get_by_uid_or_404(company_uid)
        reg = m.SysCompanyRegistration(company_id=company.id, **data.model_dump())
        repo.RegistrationRepository(self.session, self.ctx).stamp_new(reg)
        await self.session.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_company_registration",
            entity_id=reg.id,
            entity_uid=reg.uid,
            new_values={"type": reg.registration_type, "no": reg.registration_no},
        )
        return reg


# ─────────────────────────── Branch ─────────────────────────────────────────
class BranchService:
    AUDITED: ClassVar[list[str]] = [
        "code",
        "name",
        "branch_type",
        "gstin",
        "gst_state_code",
        "is_active",
    ]
    SPEC = ListSpec(
        sortable={
            "code": m.SysBranch.code,
            "name": m.SysBranch.name,
            "created_at": m.SysBranch.created_at,
            "id": m.SysBranch.id,
        },
        searchable=[m.SysBranch.code, m.SysBranch.name, m.SysBranch.gstin],
    )

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.BranchRepository(session, ctx)

    async def list_page(self, params: PageParams) -> tuple[list[m.SysBranch], int]:
        stmt = self.SPEC.apply_search(self.repo.base_query(), params.q)
        total = await self.repo.count(stmt)
        stmt = self.SPEC.apply_sort(stmt, params.sort)
        rows = await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size)
        return rows, total

    async def get(self, uid: str) -> m.SysBranch:
        return await self.repo.get_by_uid_or_404(uid)

    async def _company(self) -> m.SysCompany:
        company = await repo.CompanyRepository(self.session, self.ctx).get_by_uid(
            self.ctx.company_uid
        )
        if company is None:
            raise NotFoundError("Active company not found.")
        return company

    async def _validate_gstin(
        self,
        gstin: str | None,
        gst_state_code: str | None,
        company: m.SysCompany,
        *,
        exclude_uid: str | None = None,
    ) -> None:
        if not gstin:
            return
        gstin = gstin.upper()
        if err := rules.validate_gstin(
            gstin, expected_pan=company.pan, expected_state_code=gst_state_code
        ):
            raise _rule_error(err)
        if await self.repo.gstin_exists(gstin, exclude_uid=exclude_uid):
            raise DuplicateError(
                f"GSTIN {gstin} is already registered to another branch.", rule_code="V1-ORG-BR-008"
            )

    async def create(self, data: Any) -> m.SysBranch:
        company = await self._company()
        if await self.repo.exists_code(data.code, company_id=self.ctx.company_id):
            raise DuplicateError(f"Branch code '{data.code}' already exists in this company.")
        await self._validate_gstin(data.gstin, data.gst_state_code, company)
        payload = data.model_dump()
        if payload.get("gstin"):
            payload["gstin"] = payload["gstin"].upper()
        entity = m.SysBranch(company_id=self.ctx.company_id, **payload)
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_branch",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="branch",
            aggregate_uid=entity.uid,
            event_type="org.branch.created",
            payload={"uid": entity.uid, "code": entity.code},
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.SysBranch:
        entity = await self.repo.get_by_uid_or_404(uid)
        company = await self._company()
        before = _snapshot(entity, self.AUDITED)
        payload = data.model_dump(exclude_unset=True, exclude={"version"})
        new_gstin = payload.get("gstin", entity.gstin)
        new_state = payload.get("gst_state_code", entity.gst_state_code)
        if "gstin" in payload or "gst_state_code" in payload:
            await self._validate_gstin(new_gstin, new_state, company, exclude_uid=entity.uid)
            if payload.get("gstin"):
                payload["gstin"] = payload["gstin"].upper()
        for key, value in payload.items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_branch",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="branch",
            aggregate_uid=entity.uid,
            event_type="org.branch.updated",
            payload={"uid": entity.uid},
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.SysBranch:
        entity = await self.repo.get_by_uid_or_404(uid)
        if await self.repo.count_active_plants(entity.id):
            raise BusinessRuleViolationError(
                "Branch cannot be deactivated while it has active plants.",
                rule_code="V1-ORG-BR-012",
            )
        entity.is_active = False
        self.repo.soft_delete(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="sys_branch",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="branch",
            aggregate_uid=entity.uid,
            event_type="org.branch.deactivated",
            payload={"uid": entity.uid},
        )
        return entity

    async def restore(self, uid: str) -> m.SysBranch:
        entity = await self.repo.get_by_uid_or_404(uid, include_deleted=True)
        if not entity.is_deleted:
            raise BusinessRuleViolationError("Branch is not deactivated.")
        entity.is_active = True
        self.repo.restore(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_branch",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason="restore",
        )
        return entity


# ─────────────────────────── Plant ──────────────────────────────────────────
class PlantService:
    AUDITED: ClassVar[list[str]] = ["code", "name", "branch_id", "factory_licence_no", "is_active"]
    SPEC = ListSpec(
        sortable={"code": m.SysPlant.code, "name": m.SysPlant.name, "id": m.SysPlant.id},
        searchable=[m.SysPlant.code, m.SysPlant.name],
    )

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.PlantRepository(session, ctx)

    async def list_page(self, params: PageParams) -> tuple[list[m.SysPlant], int]:
        stmt = self.SPEC.apply_search(self.repo.base_query(), params.q)
        total = await self.repo.count(stmt)
        stmt = self.SPEC.apply_sort(stmt, params.sort)
        return await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size), total

    async def get(self, uid: str) -> m.SysPlant:
        return await self.repo.get_by_uid_or_404(uid)

    async def _branch(self, branch_uid: str) -> m.SysBranch:
        branch = await repo.BranchRepository(self.session, self.ctx).get_by_uid(branch_uid)
        if branch is None:
            raise ValidationFailedError(
                "Branch not found in this company.",
                errors=[{"field": "branch_uid", "code": "not_found", "message": "Unknown branch"}],
            )
        assert_in_write_scope(self.ctx, branch.company_id)
        return branch

    async def create(self, data: Any) -> m.SysPlant:
        branch = await self._branch(data.branch_uid)
        if await self.repo.exists_code(data.code, company_id=self.ctx.company_id):
            raise DuplicateError(f"Plant code '{data.code}' already exists in this company.")
        payload = data.model_dump(exclude={"branch_uid"})
        entity = m.SysPlant(company_id=self.ctx.company_id, branch_id=branch.id, **payload)
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_plant",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="plant",
            aggregate_uid=entity.uid,
            event_type="org.plant.created",
            payload={"uid": entity.uid, "code": entity.code},
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.SysPlant:
        entity = await self.repo.get_by_uid_or_404(uid)
        before = _snapshot(entity, self.AUDITED)
        for key, value in data.model_dump(exclude_unset=True, exclude={"version"}).items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_plant",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.SysPlant:
        entity = await self.repo.get_by_uid_or_404(uid)
        if await self.repo.count_active_warehouses(entity.id):
            raise BusinessRuleViolationError(
                "Plant cannot be deactivated while it has active warehouses.",
                rule_code="V1-ORG-BR-012",
            )
        entity.is_active = False
        self.repo.soft_delete(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="sys_plant",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="plant",
            aggregate_uid=entity.uid,
            event_type="org.plant.deactivated",
            payload={"uid": entity.uid},
        )
        return entity

    async def restore(self, uid: str) -> m.SysPlant:
        entity = await self.repo.get_by_uid_or_404(uid, include_deleted=True)
        entity.is_active = True
        self.repo.restore(entity)
        await self.repo.flush()
        return entity


# ─────────────────────────── Warehouse ──────────────────────────────────────
class WarehouseService:
    AUDITED: ClassVar[list[str]] = ["code", "name", "warehouse_type", "is_active"]
    SPEC = ListSpec(
        sortable={
            "code": m.SysWarehouse.code,
            "name": m.SysWarehouse.name,
            "id": m.SysWarehouse.id,
        },
        searchable=[m.SysWarehouse.code, m.SysWarehouse.name],
    )

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.WarehouseRepository(session, ctx)

    async def list_page(self, params: PageParams) -> tuple[list[m.SysWarehouse], int]:
        stmt = self.SPEC.apply_search(self.repo.base_query(), params.q)
        total = await self.repo.count(stmt)
        stmt = self.SPEC.apply_sort(stmt, params.sort)
        return await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size), total

    async def get(self, uid: str) -> m.SysWarehouse:
        return await self.repo.get_by_uid_or_404(uid)

    async def create(self, data: Any) -> m.SysWarehouse:
        branch = await repo.BranchRepository(self.session, self.ctx).get_by_uid(data.branch_uid)
        if branch is None:
            raise ValidationFailedError(
                "Branch not found in this company.",
                errors=[{"field": "branch_uid", "code": "not_found", "message": "Unknown branch"}],
            )
        plant_id = None
        if data.plant_uid:
            plant = await repo.PlantRepository(self.session, self.ctx).get_by_uid(data.plant_uid)
            if plant is None or plant.branch_id != branch.id:
                raise ValidationFailedError(
                    "Plant not found in this branch.",
                    errors=[
                        {
                            "field": "plant_uid",
                            "code": "invalid",
                            "message": "Plant/branch mismatch",
                        }
                    ],
                )
            plant_id = plant.id
        if await self.repo.exists_code(data.code, company_id=self.ctx.company_id):
            raise DuplicateError(f"Warehouse code '{data.code}' already exists in this company.")
        payload = data.model_dump(exclude={"branch_uid", "plant_uid"})
        entity = m.SysWarehouse(
            company_id=self.ctx.company_id, branch_id=branch.id, plant_id=plant_id, **payload
        )
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_warehouse",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="warehouse",
            aggregate_uid=entity.uid,
            event_type="org.warehouse.created",
            payload={"uid": entity.uid, "type": entity.warehouse_type},
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.SysWarehouse:
        entity = await self.repo.get_by_uid_or_404(uid)
        before = _snapshot(entity, self.AUDITED)
        for key, value in data.model_dump(exclude_unset=True, exclude={"version"}).items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_warehouse",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.SysWarehouse:
        entity = await self.repo.get_by_uid_or_404(uid)
        # V1-ORG-BR-015 — non-zero stock blocks deactivation. Stock lives in the
        # Inventory module (not this phase); that guard is enforced there via the
        # org.warehouse.deactivated event being rejected / a pre-check. Documented
        # as a cross-module dependency in the handoff.
        entity.is_active = False
        self.repo.soft_delete(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="sys_warehouse",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="warehouse",
            aggregate_uid=entity.uid,
            event_type="org.warehouse.deactivated",
            payload={"uid": entity.uid},
        )
        return entity

    async def restore(self, uid: str) -> m.SysWarehouse:
        entity = await self.repo.get_by_uid_or_404(uid, include_deleted=True)
        entity.is_active = True
        self.repo.restore(entity)
        await self.repo.flush()
        return entity


# ─────────────────────────── Department ─────────────────────────────────────
class DepartmentService:
    AUDITED: ClassVar[list[str]] = ["code", "name", "department_type", "parent_id", "is_active"]
    SPEC = ListSpec(
        sortable={
            "code": m.SysDepartment.code,
            "name": m.SysDepartment.name,
            "id": m.SysDepartment.id,
        },
        searchable=[m.SysDepartment.code, m.SysDepartment.name],
    )

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.DepartmentRepository(session, ctx)

    async def list_page(self, params: PageParams) -> tuple[list[m.SysDepartment], int]:
        stmt = self.SPEC.apply_search(self.repo.base_query(), params.q)
        total = await self.repo.count(stmt)
        stmt = self.SPEC.apply_sort(stmt, params.sort)
        return await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size), total

    async def get(self, uid: str) -> m.SysDepartment:
        return await self.repo.get_by_uid_or_404(uid)

    async def _resolve_parent(
        self, parent_uid: str | None, *, node_id: int | None = None
    ) -> tuple[int | None, int]:
        if not parent_uid:
            return None, 0
        parent = await self.repo.get_by_uid_or_404(parent_uid)
        parent_map = await self.repo.parent_map(self.ctx.company_id)
        if node_id and rules.would_create_cycle(node_id, parent.id, parent_map):
            raise BusinessRuleViolationError(
                "Department hierarchy cannot contain a cycle.", rule_code="V1-ORG-BR-019"
            )
        return parent.id, parent.level + 1

    async def create(self, data: Any) -> m.SysDepartment:
        if await self.repo.exists_code(data.code, company_id=self.ctx.company_id):
            raise DuplicateError(f"Department code '{data.code}' already exists in this company.")
        parent_id, level = await self._resolve_parent(data.parent_uid)
        payload = data.model_dump(exclude={"parent_uid", "plant_uid"})
        entity = m.SysDepartment(
            company_id=self.ctx.company_id, parent_id=parent_id, level=level, **payload
        )
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_department",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.SysDepartment:
        entity = await self.repo.get_by_uid_or_404(uid)
        before = _snapshot(entity, self.AUDITED)
        payload = data.model_dump(exclude_unset=True, exclude={"version", "parent_uid"})
        if "parent_uid" in data.model_fields_set:
            parent_id, level = await self._resolve_parent(data.parent_uid, node_id=entity.id)
            entity.parent_id = parent_id
            entity.level = level
        for key, value in payload.items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_department",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.SysDepartment:
        entity = await self.repo.get_by_uid_or_404(uid)
        if await self.repo.count_active_children(entity.id):
            raise BusinessRuleViolationError(
                "Department cannot be deactivated while it has active sub-departments."
            )
        entity.is_active = False
        self.repo.soft_delete(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="sys_department",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        return entity

    async def restore(self, uid: str) -> m.SysDepartment:
        entity = await self.repo.get_by_uid_or_404(uid, include_deleted=True)
        entity.is_active = True
        self.repo.restore(entity)
        await self.repo.flush()
        return entity


# ─────────────────────────── Cost centre ────────────────────────────────────
class CostCentreService:
    AUDITED: ClassVar[list[str]] = [
        "code",
        "name",
        "cost_centre_type",
        "parent_id",
        "is_postable",
        "is_active",
    ]
    SPEC = ListSpec(
        sortable={
            "code": m.SysCostCentre.code,
            "name": m.SysCostCentre.name,
            "id": m.SysCostCentre.id,
        },
        searchable=[m.SysCostCentre.code, m.SysCostCentre.name],
    )

    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.CostCentreRepository(session, ctx)

    async def list_page(self, params: PageParams) -> tuple[list[m.SysCostCentre], int]:
        stmt = self.SPEC.apply_search(self.repo.base_query(), params.q)
        total = await self.repo.count(stmt)
        stmt = self.SPEC.apply_sort(stmt, params.sort)
        return await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size), total

    async def get(self, uid: str) -> m.SysCostCentre:
        return await self.repo.get_by_uid_or_404(uid)

    async def _resolve_parent(
        self, parent_uid: str | None, *, node_id: int | None = None
    ) -> tuple[int | None, int]:
        if not parent_uid:
            return None, 0
        parent = await self.repo.get_by_uid_or_404(parent_uid)
        parent_map = await self.repo.parent_map(self.ctx.company_id)
        if node_id and rules.would_create_cycle(node_id, parent.id, parent_map):
            raise BusinessRuleViolationError(
                "Cost centre hierarchy cannot contain a cycle.", rule_code="V1-ORG-BR-019"
            )
        return parent.id, parent.level + 1

    async def create(self, data: Any) -> m.SysCostCentre:
        if await self.repo.exists_code(data.code, company_id=self.ctx.company_id):
            raise DuplicateError(f"Cost centre code '{data.code}' already exists in this company.")
        parent_id, level = await self._resolve_parent(data.parent_uid)
        payload = data.model_dump(exclude={"parent_uid"})
        entity = m.SysCostCentre(
            company_id=self.ctx.company_id, parent_id=parent_id, level=level, **payload
        )
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_cost_centre",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values=_snapshot(entity, self.AUDITED),
        )
        return entity

    async def update(self, uid: str, data: Any) -> m.SysCostCentre:
        entity = await self.repo.get_by_uid_or_404(uid)
        before = _snapshot(entity, self.AUDITED)
        payload = data.model_dump(exclude_unset=True, exclude={"version", "parent_uid"})
        if "parent_uid" in data.model_fields_set:
            parent_id, level = await self._resolve_parent(data.parent_uid, node_id=entity.id)
            entity.parent_id = parent_id
            entity.level = level
        for key, value in payload.items():
            setattr(entity, key, value)
        self.repo.stamp_update(entity, expected_version=data.version)
        await self.repo.flush()
        old, new = diff(before, _snapshot(entity, self.AUDITED))
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_cost_centre",
            entity_id=entity.id,
            entity_uid=entity.uid,
            old_values=old,
            new_values=new,
        )
        return entity

    async def deactivate(self, uid: str, version: int, reason: str | None) -> m.SysCostCentre:
        entity = await self.repo.get_by_uid_or_404(uid)
        if await self.repo.count_active_children(entity.id):
            raise BusinessRuleViolationError(
                "Cost centre cannot be deactivated while it has active children.",
                rule_code="V1-ORG-BR-020",
            )
        entity.is_active = False
        self.repo.soft_delete(entity, expected_version=version)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.DELETE,
            entity_type="sys_cost_centre",
            entity_id=entity.id,
            entity_uid=entity.uid,
            reason=reason,
        )
        return entity

    async def restore(self, uid: str) -> m.SysCostCentre:
        entity = await self.repo.get_by_uid_or_404(uid, include_deleted=True)
        entity.is_active = True
        self.repo.restore(entity)
        await self.repo.flush()
        return entity


# ─────────────────────────── Financial year ─────────────────────────────────
class FinancialYearService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.FinancialYearRepository(session, ctx)
        self.periods = repo.AccountingPeriodRepository(session, ctx)

    async def list_page(self) -> list[m.SysFinancialYear]:
        stmt = self.repo.base_query().order_by(m.SysFinancialYear.start_date)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get(self, uid: str) -> m.SysFinancialYear:
        return await self.repo.get_by_uid_or_404(uid)

    async def list_periods(self, uid: str) -> list[m.SysAccountingPeriod]:
        fy = await self.repo.get_by_uid_or_404(uid)
        return await self.periods.list_for_fy(fy.id)

    async def create(self, data: Any) -> m.SysFinancialYear:
        interval = rules.FyInterval(data.start_date, data.end_date)
        if err := rules.validate_fy_dates(interval):
            raise _rule_error(err)
        existing = await self.repo.intervals(self.ctx.company_id)
        existing_intervals = [rules.FyInterval(fy.start_date, fy.end_date) for fy in existing]
        if rules.fy_overlaps(interval, existing_intervals):
            raise BusinessRuleViolationError(
                "Financial year overlaps an existing one.", rule_code="V1-ORG-BR-024"
            )
        if await self.repo.exists_code(data.code, company_id=self.ctx.company_id):
            raise DuplicateError(f"Financial year '{data.code}' already exists.")

        status = FinancialYearStatus.OPEN if data.is_current else FinancialYearStatus.FUTURE
        if data.is_current:
            await self.repo.clear_current(self.ctx.company_id)

        fy = m.SysFinancialYear(
            company_id=self.ctx.company_id,
            code=data.code,
            start_date=data.start_date,
            end_date=data.end_date,
            status=status.value,
            is_current=data.is_current,
        )
        self.repo.stamp_new(fy)
        await self.repo.flush()

        # Auto-generate monthly accounting periods (V1-ORG-FR-027).
        for period_no, p_start, p_end in rules.month_periods(data.start_date, data.end_date):
            period = m.SysAccountingPeriod(
                company_id=self.ctx.company_id,
                financial_year_id=fy.id,
                period_no=period_no,
                name=p_start.strftime("%b %Y"),
                start_date=p_start,
                end_date=p_end,
            )
            self.periods.stamp_new(period)
        await self.session.flush()

        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="sys_financial_year",
            entity_id=fy.id,
            entity_uid=fy.uid,
            new_values={"code": fy.code, "start": str(fy.start_date), "end": str(fy.end_date)},
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="financial_year",
            aggregate_uid=fy.uid,
            event_type="org.financial_year.opened"
            if data.is_current
            else "org.financial_year.created",
            payload={"uid": fy.uid, "code": fy.code},
        )
        return fy

    async def set_current(self, uid: str) -> m.SysFinancialYear:
        fy = await self.repo.get_by_uid_or_404(uid)
        await self.repo.clear_current(self.ctx.company_id)
        fy.is_current = True
        if fy.status == FinancialYearStatus.FUTURE.value:
            fy.status = FinancialYearStatus.OPEN.value
        fy.updated_at = utcnow()
        fy.updated_by = self.ctx.user_id
        fy.version += 1
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.UPDATE,
            entity_type="sys_financial_year",
            entity_id=fy.id,
            entity_uid=fy.uid,
            reason="set current",
        )
        return fy


# ─────────────────────────── Currency + exchange rate ───────────────────────
class CurrencyService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.CurrencyRepository(session, ctx)

    async def list_page(self) -> list[m.MstCurrency]:
        stmt = self.repo.base_query().order_by(m.MstCurrency.code)
        return list((await self.session.execute(stmt)).scalars().all())


class ExchangeRateService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.repo = repo.ExchangeRateRepository(session, ctx)

    async def list_page(self, params: PageParams) -> tuple[list[m.MstExchangeRate], int]:
        stmt = self.repo.base_query().order_by(m.MstExchangeRate.effective_date.desc())
        total = await self.repo.count(stmt)
        rows = await self.repo.list_page(stmt, offset=params.offset, limit=params.page_size)
        return rows, total

    async def create(self, data: Any) -> m.MstExchangeRate:
        entity = m.MstExchangeRate(
            company_id=self.ctx.company_id,
            from_currency_code=data.from_currency_code.upper(),
            to_currency_code=data.to_currency_code.upper(),
            rate_type=data.rate_type.value if hasattr(data.rate_type, "value") else data.rate_type,
            rate=data.rate,
            effective_date=data.effective_date,
            source=data.source or "MANUAL",
        )
        self.repo.stamp_new(entity)
        await self.repo.flush()
        await record_audit(
            self.session,
            self.ctx,
            action=AuditAction.CREATE,
            entity_type="mst_exchange_rate",
            entity_id=entity.id,
            entity_uid=entity.uid,
            new_values={
                "pair": f"{entity.from_currency_code}/{entity.to_currency_code}",
                "rate": str(entity.rate),
            },
        )
        emit_event(
            self.session,
            self.ctx,
            aggregate_type="exchange_rate",
            aggregate_uid=entity.uid,
            event_type="org.exchange_rate.updated",
            payload={"from": entity.from_currency_code, "to": entity.to_currency_code},
        )
        return entity

    async def resolve_rate(
        self, *, from_code: str, to_code: str, rate_type: str, as_of
    ) -> m.MstExchangeRate:
        row = await self.repo.latest_on_or_before(
            company_id=self.ctx.company_id,
            from_code=from_code.upper(),
            to_code=to_code.upper(),
            rate_type=rate_type,
            as_of=as_of,
        )
        if row is None:
            # V1-ORG-FR-034 — block, never default to 1.
            raise BusinessRuleViolationError(
                f"No {rate_type} rate for {from_code}->{to_code} on or before {as_of}.",
                rule_code="V1-ORG-FR-034",
            )
        return row
