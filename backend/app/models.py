"""Single import surface for the ORM metadata.

Importing this module registers every table on `Base.metadata`, which is what
Alembic autogenerate and the test-schema builder rely on. Add new modules'
models here as they land.
"""

from __future__ import annotations

from app.core.audit import CoreAuditLog  # noqa: F401
from app.core.base import Base
from app.core.outbox import CoreOutbox  # noqa: F401
from app.modules.iam.infrastructure.models import (  # noqa: F401
    SysPermission,
    SysRole,
    SysRolePermission,
    SysSession,
    SysUser,
    SysUserCompany,
    SysUserRole,
)
from app.modules.organisation.infrastructure.models import (  # noqa: F401
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

__all__ = ["Base"]
