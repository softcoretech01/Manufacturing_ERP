"""Reference-data seeding and a bootstrap helper.

`seed_reference_data` loads the currency master and the permission catalogue —
idempotent, safe to re-run. `bootstrap_company_admin` provisions a company, an
admin role holding every Organisation permission, and a user mapped to that
company; it is used by the dev seed and by the test suite to create the two
companies / two users the tenant-isolation tests need.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import PermissionEffect
from app.core.ids import new_uid
from app.core.security import hash_password
from app.core.time import utcnow
from app.modules.iam import permissions as perm_cat
from app.modules.iam.infrastructure.models import (
    SysPermission,
    SysRole,
    SysRolePermission,
    SysUser,
    SysUserCompany,
    SysUserRole,
)
from app.modules.organisation.infrastructure.models import MstCurrency, SysCompany

_CURRENCIES = [
    ("INR", "Indian Rupee", "₹", 2, True),
    ("USD", "US Dollar", "$", 2, False),
    ("EUR", "Euro", "€", 2, False),
    ("GBP", "Pound Sterling", "£", 2, False),
    ("AED", "UAE Dirham", "د.إ", 2, False),
]


def _sys() -> TenantContext:
    return TenantContext.system()


async def seed_reference_data(session: AsyncSession) -> None:
    # Currencies
    existing = set((await session.execute(select(MstCurrency.code))).scalars().all())
    now = utcnow()
    for code, name, symbol, dp, indian in _CURRENCIES:
        if code in existing:
            continue
        session.add(
            MstCurrency(
                uid=new_uid(),
                code=code,
                name=name,
                symbol=symbol,
                decimal_places=dp,
                use_indian_format=indian,
                is_active=True,
                version=1,
                created_at=now,
                created_by=0,
                updated_at=now,
                updated_by=0,
            )
        )
    # Permission catalogue
    have = set((await session.execute(select(SysPermission.code))).scalars().all())
    for p in perm_cat.catalogue():
        if p.code in have:
            continue
        session.add(
            SysPermission(
                uid=new_uid(),
                code=p.code,
                module=p.module,
                entity=p.entity,
                action=p.action,
                label=p.label,
                is_sensitive=p.is_sensitive,
            )
        )
    await session.flush()


@dataclass(slots=True)
class BootstrapResult:
    company_id: int
    company_uid: str
    company_code: str
    user_id: int
    user_uid: str
    login_id: str
    role_id: int


async def bootstrap_company_admin(
    session: AsyncSession,
    *,
    company_code: str,
    company_name: str,
    login_id: str,
    password: str,
    full_name: str,
    permissions: list[str] | None = None,
    pan: str | None = None,
    gst_state_code: str | None = None,
) -> BootstrapResult:
    now = utcnow()
    company = SysCompany(
        uid=new_uid(),
        code=company_code,
        legal_name=company_name,
        base_currency_code="INR",
        fy_start_month=4,
        timezone="Asia/Kolkata",
        locale="en-IN",
        pan=pan,
        gst_state_code=gst_state_code,
        is_active=True,
        version=1,
        created_at=now,
        created_by=0,
        updated_at=now,
        updated_by=0,
    )
    session.add(company)
    await session.flush()

    role = SysRole(
        uid=new_uid(),
        company_id=company.id,
        code=f"ADMIN_{company_code}",
        name="Administrator",
        role_type="INTERNAL",
        is_active=True,
        version=1,
        created_at=now,
        created_by=0,
        updated_at=now,
        updated_by=0,
    )
    session.add(role)
    await session.flush()

    granted = permissions if permissions is not None else sorted(perm_cat.ALL_CODES)
    for code in granted:
        session.add(
            SysRolePermission(
                role_id=role.id, permission_code=code, effect=PermissionEffect.ALLOW.value
            )
        )

    user = SysUser(
        uid=new_uid(),
        login_id=login_id,
        email=f"{login_id}@example.com",
        full_name=full_name,
        password_hash=hash_password(password),
        user_type="INTERNAL",
        status="ACTIVE",
        default_company_id=company.id,
        is_superuser=False,
        version=1,
        created_at=now,
        created_by=0,
        updated_at=now,
        updated_by=0,
    )
    session.add(user)
    await session.flush()

    session.add(SysUserCompany(user_id=user.id, company_id=company.id, is_default=True))
    session.add(SysUserRole(user_id=user.id, role_id=role.id, company_id=company.id))
    await session.flush()

    return BootstrapResult(
        company_id=company.id,
        company_uid=company.uid,
        company_code=company.code,
        user_id=user.id,
        user_uid=user.uid,
        login_id=login_id,
        role_id=role.id,
    )
