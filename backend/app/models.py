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
    SysApiKey,
    SysDelegation,
    SysPermission,
    SysRole,
    SysRolePermission,
    SysSession,
    SysSodRule,
    SysUser,
    SysUserCompany,
    SysUserRole,
)
from app.modules.inventory.infrastructure.models import (  # noqa: F401
    InvBin,
    InvZone,
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
from app.modules.numbering.infrastructure.models import (  # noqa: F401
    CoreNumberAllocation,
    CoreNumberSeries,
)
from app.modules.workflow.infrastructure.models import (  # noqa: F401
    CoreApprovalRule,
    CoreApprovalRuleLevel,
    CoreWorkflowHistory,
    CoreWorkflowInstance,
    CoreWorkflowTask,
)

__all__ = ["Base"]
