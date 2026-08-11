"""Organisation-module permission catalogue (`<MODULE>.<ENTITY>.<ACTION>`).

Follows the codes the SRS (V1-ORG §2.12) and the existing frontend navigation
already use — module `SYSTEM`. Seeded into `sys_permission` so the permission
explorer can enumerate them and roles can grant them.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PermissionDef:
    code: str
    module: str
    entity: str
    action: str
    label: str
    is_sensitive: bool = False


_CRUD = ("VIEW", "CREATE", "EDIT", "DEACTIVATE", "RESTORE")

_ENTITIES: dict[str, tuple[str, ...]] = {
    "COMPANY": _CRUD,
    "BRANCH": _CRUD,
    "PLANT": _CRUD,
    "WAREHOUSE": _CRUD,
    "DEPARTMENT": _CRUD,
    "COST_CENTRE": _CRUD,
    "FINANCIAL_YEAR": ("VIEW", "CREATE", "EDIT", "CLOSE", "REOPEN"),
    "PARAMETER": ("VIEW", "EDIT"),  # currencies + exchange rates
}

_LABELS = {
    "VIEW": "View",
    "CREATE": "Create",
    "EDIT": "Edit",
    "DEACTIVATE": "Deactivate",
    "RESTORE": "Restore",
    "CLOSE": "Close",
    "REOPEN": "Reopen",
}

_SENSITIVE = {"SYSTEM.FINANCIAL_YEAR.REOPEN", "SYSTEM.CROSS_COMPANY_READ.VIEW"}


def catalogue() -> list[PermissionDef]:
    perms: list[PermissionDef] = []
    for entity, actions in _ENTITIES.items():
        for action in actions:
            code = f"SYSTEM.{entity}.{action}"
            perms.append(
                PermissionDef(
                    code=code,
                    module="SYSTEM",
                    entity=entity,
                    action=action,
                    label=f"{_LABELS.get(action, action)} {entity.replace('_', ' ').title()}",
                    is_sensitive=code in _SENSITIVE,
                )
            )
    perms.append(
        PermissionDef(
            "SYSTEM.CROSS_COMPANY_READ.VIEW",
            "SYSTEM",
            "CROSS_COMPANY_READ",
            "VIEW",
            "Read across companies (group MIS)",
            is_sensitive=True,
        )
    )
    return perms


ALL_CODES: frozenset[str] = frozenset(p.code for p in catalogue())
