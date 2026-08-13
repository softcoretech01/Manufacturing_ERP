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

# module → entity → actions. Each `<MODULE>.<ENTITY>.<ACTION>` becomes a code.
_MODULES: dict[str, dict[str, tuple[str, ...]]] = {
    "SYSTEM": {
        "USER": ("VIEW", "CREATE", "EDIT", "DEACTIVATE", "RESTORE", "RESET_PASSWORD"),
        "ROLE": ("VIEW", "CREATE", "EDIT", "DEACTIVATE", "RESTORE", "GRANT"),
        "PERMISSION": ("VIEW",),
        "COMPANY": _CRUD,
        "BRANCH": _CRUD,
        "PLANT": _CRUD,
        "WAREHOUSE": _CRUD,
        "DEPARTMENT": _CRUD,
        "COST_CENTRE": _CRUD,
        "FINANCIAL_YEAR": ("VIEW", "CREATE", "EDIT", "CLOSE", "REOPEN"),
        "PARAMETER": ("VIEW", "EDIT"),  # currencies + exchange rates
        "AUDIT": ("VIEW",),  # audit trail + login activity
        "INTEGRATION": ("VIEW", "CREATE", "REVOKE"),  # API keys
        "APPROVAL_MATRIX": ("VIEW", "EDIT"),  # workflow approval rules
        "WORKFLOW": ("VIEW", "DESIGN", "ACTIVATE"),  # workflow monitor + designer
        "NUMBERING": ("VIEW", "EDIT", "OVERRIDE"),  # document numbering engine
    },
    # Inventory & Stores — Zone/Bin storage structure (Vol 4 Ch 1).
    "INVENTORY": {
        "ZONE": _CRUD,
        "BIN": ("VIEW", "CREATE", "EDIT", "DEACTIVATE", "RESTORE", "GENERATE", "BLOCK"),
    },
}

_LABELS = {
    "VIEW": "View",
    "CREATE": "Create",
    "EDIT": "Edit",
    "DEACTIVATE": "Deactivate",
    "RESTORE": "Restore",
    "CLOSE": "Close",
    "REOPEN": "Reopen",
    "RESET_PASSWORD": "Reset password for",
    "GRANT": "Grant permissions on",
    "GENERATE": "Bulk-generate",
    "BLOCK": "Block / unblock",
}

_SENSITIVE = {"SYSTEM.FINANCIAL_YEAR.REOPEN", "SYSTEM.CROSS_COMPANY_READ.VIEW"}


def catalogue() -> list[PermissionDef]:
    perms: list[PermissionDef] = []
    for module, entities in _MODULES.items():
        for entity, actions in entities.items():
            for action in actions:
                code = f"{module}.{entity}.{action}"
                perms.append(
                    PermissionDef(
                        code=code,
                        module=module,
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
