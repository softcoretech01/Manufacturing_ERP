"""IAM management endpoints: users, roles, permission catalogue, and grants.
Every endpoint declares its permission (CLAUDE.md §5.4)."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.iam.api import schemas as s
from app.modules.iam.application import management as svc

router = APIRouter(tags=["Access Control"])


def _role_out(role: Any, count: int = 0) -> s.RoleOut:
    return s.RoleOut(
        uid=role.uid,
        code=role.code,
        name=role.name,
        role_type=role.role_type,
        is_active=role.is_active,
        version=role.version,
        permission_count=count,
    )


def _user_out(entry: dict[str, Any]) -> s.UserOut:
    u = entry["user"]
    return s.UserOut(
        uid=u.uid,
        login_id=u.login_id,
        email=u.email,
        full_name=u.full_name,
        user_type=u.user_type,
        status=u.status,
        version=u.version,
        roles=entry["roles"],
        mfa_enabled=bool(getattr(u, "mfa_enabled", False)),
        last_login_at=getattr(u, "last_login_at", None),
    )


# ═══════════════════════════ Permissions ════════════════════════════════════
@router.get("/permissions", response_model=list[s.PermissionOut])
async def list_permissions(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PERMISSION.VIEW")),
):
    return await svc.PermissionService(session, ctx).list_page()


@router.get("/access-matrix")
async def access_matrix(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.PERMISSION.VIEW")),
) -> dict[str, Any]:
    """Permissions + roles(with codes) + users(with role codes) in one call —
    powers the Permission explorer's who-can-do-X / what-can-user-do views."""
    perms = await svc.PermissionService(session, ctx).list_page()
    roles = await svc.RoleService(session, ctx).matrix()
    users = [
        {
            "uid": e["user"].uid,
            "login_id": e["user"].login_id,
            "full_name": e["user"].full_name,
            "roles": e["roles"],
        }
        for e in await svc.UserService(session, ctx).list_page()
    ]
    return {
        "permissions": [
            {
                "code": p.code,
                "module": p.module,
                "entity": p.entity,
                "action": p.action,
                "label": p.label,
                "is_sensitive": p.is_sensitive,
            }
            for p in perms
        ],
        "roles": roles,
        "users": users,
    }


# ═══════════════════════════ Roles ══════════════════════════════════════════
@router.get("/roles", response_model=list[s.RoleOut])
async def list_roles(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.VIEW")),
):
    entries = await svc.RoleService(session, ctx).list_page()
    return [_role_out(e["role"], e["permission_count"]) for e in entries]


@router.post("/roles", response_model=s.RoleOut, status_code=201)
async def create_role(
    body: s.RoleCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.CREATE")),
):
    return _role_out(await svc.RoleService(session, ctx).create(body))


@router.get("/roles/{uid}", response_model=s.RoleOut)
async def get_role(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.VIEW")),
):
    return _role_out(await svc.RoleService(session, ctx).get(uid))


@router.patch("/roles/{uid}", response_model=s.RoleOut)
async def update_role(
    uid: str,
    body: s.RoleUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.EDIT")),
):
    return _role_out(await svc.RoleService(session, ctx).update(uid, body))


@router.post("/roles/{uid}/deactivate", response_model=s.RoleOut)
async def deactivate_role(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.DEACTIVATE")),
):
    svc_ = svc.RoleService(session, ctx)
    return _role_out(await svc_.set_active(uid, active=False, version=body.version))


@router.post("/roles/{uid}/restore", response_model=s.RoleOut)
async def restore_role(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.RESTORE")),
):
    svc_ = svc.RoleService(session, ctx)
    return _role_out(await svc_.set_active(uid, active=True, version=None))


@router.get("/roles/{uid}/permissions", response_model=dict[str, list[str]])
async def get_role_permissions(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.VIEW")),
):
    return {"codes": await svc.RoleService(session, ctx).permission_codes(uid)}


@router.put("/roles/{uid}/permissions", response_model=dict[str, list[str]])
async def set_role_permissions(
    uid: str,
    body: s.RolePermissionsBody,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.GRANT")),
):
    codes = await svc.RoleService(session, ctx).set_permissions(uid, body.codes)
    return {"codes": codes}


# ═══════════════════════════ Users ══════════════════════════════════════════
@router.get("/users", response_model=list[s.UserOut])
async def list_users(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.VIEW")),
):
    return [_user_out(e) for e in await svc.UserService(session, ctx).list_page()]


@router.post("/users", response_model=s.UserOut, status_code=201)
async def create_user(
    body: s.UserCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.CREATE")),
):
    return _user_out(await svc.UserService(session, ctx).create(body))


@router.get("/users/{uid}", response_model=s.UserOut)
async def get_user(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.VIEW")),
):
    return _user_out(await svc.UserService(session, ctx).get(uid))


@router.patch("/users/{uid}", response_model=s.UserOut)
async def update_user(
    uid: str,
    body: s.UserUpdate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.EDIT")),
):
    return _user_out(await svc.UserService(session, ctx).update(uid, body))


@router.post("/users/{uid}/deactivate", response_model=s.UserOut)
async def deactivate_user(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.DEACTIVATE")),
):
    svc_ = svc.UserService(session, ctx)
    return _user_out(await svc_.set_status(uid, active=False, version=body.version))


@router.post("/users/{uid}/restore", response_model=s.UserOut)
async def restore_user(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.RESTORE")),
):
    svc_ = svc.UserService(session, ctx)
    return _user_out(await svc_.set_status(uid, active=True, version=None))


@router.put("/users/{uid}/roles", response_model=s.UserOut)
async def set_user_roles(
    uid: str,
    body: s.UserRolesBody,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.EDIT")),
):
    return _user_out(await svc.UserService(session, ctx).set_roles(uid, body.role_uids))


@router.post("/users/{uid}/reset-password", status_code=204)
async def reset_user_password(
    uid: str,
    body: s.ResetPasswordBody,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.RESET_PASSWORD")),
) -> None:
    await svc.UserService(session, ctx).reset_password(uid, body.password)


# ═══════════════════════════ Sessions ═══════════════════════════════════════
@router.get("/sessions", response_model=list[s.SessionOut])
async def list_sessions(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.VIEW")),
):
    return [
        s.SessionOut(
            uid=e["sess"].uid,
            user_login=e["user"].login_id,
            user_name=e["user"].full_name,
            ip_address=e["sess"].ip_address,
            issued_at=e["sess"].issued_at,
            expires_at=e["sess"].expires_at,
            revoked_at=e["sess"].revoked_at,
            status=e["status"],
            is_current=e["is_current"],
        )
        for e in await svc.SessionService(session, ctx).list_page()
    ]


@router.post("/sessions/{uid}/revoke", status_code=204)
async def revoke_session(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.EDIT")),
) -> None:
    await svc.SessionService(session, ctx).revoke(uid)


# ═══════════════════════════ Login activity ═════════════════════════════════
@router.get("/login-activity", response_model=list[s.LoginEventOut])
async def login_activity(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.AUDIT.VIEW")),
):
    return await svc.LoginActivityService(session, ctx).list_page()


# ═══════════════════════════ Audit trail ════════════════════════════════════
@router.get("/audit-log/filters")
async def audit_filters(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.AUDIT.VIEW")),
) -> dict[str, list[str]]:
    return await svc.AuditService(session, ctx).filter_options()


@router.get("/audit-log", response_model=list[s.AuditEntryOut])
async def audit_log(
    session: SessionDep,
    entity_type: str | None = None,
    action: str | None = None,
    actor: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    search: str | None = None,
    limit: int = 200,
    ctx: TenantContext = Depends(require("SYSTEM.AUDIT.VIEW")),
):
    return await svc.AuditService(session, ctx).list_page(
        entity_type=entity_type, action=action, actor=actor,
        from_date=from_date, to_date=to_date, search=search, limit=limit,
    )


# ═══════════════════════════ API keys ═══════════════════════════════════════
def _apikey_out(entry: dict[str, Any]) -> s.ApiKeyOut:
    k = entry["key"]
    return s.ApiKeyOut(
        uid=k.uid,
        name=k.name,
        prefix=k.prefix,
        role_code=entry["role_code"],
        status=entry["status"],
        expires_at=k.expires_at,
        last_used_at=k.last_used_at,
        created_at=k.created_at,
    )


@router.get("/api-keys", response_model=list[s.ApiKeyOut])
async def list_api_keys(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.INTEGRATION.VIEW")),
):
    return [_apikey_out(e) for e in await svc.ApiKeyService(session, ctx).list_page()]


@router.post("/api-keys", response_model=s.ApiKeyCreated, status_code=201)
async def create_api_key(
    body: s.ApiKeyCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.INTEGRATION.CREATE")),
):
    key, secret = await svc.ApiKeyService(session, ctx).issue(body)
    return s.ApiKeyCreated(
        uid=key.uid,
        name=key.name,
        prefix=key.prefix,
        role_code=None,
        status="ACTIVE",
        expires_at=key.expires_at,
        last_used_at=key.last_used_at,
        created_at=key.created_at,
        secret=secret,
    )


@router.post("/api-keys/{uid}/revoke", status_code=204)
async def revoke_api_key(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.INTEGRATION.REVOKE")),
) -> None:
    await svc.ApiKeyService(session, ctx).revoke(uid)


# ═══════════════════════════ Segregation of duties ══════════════════════════
def _sod_out(entry: dict[str, Any]) -> s.SodRuleOut:
    r = entry["rule"]
    return s.SodRuleOut(
        uid=r.uid,
        name=r.name,
        permission_a=r.permission_a,
        permission_b=r.permission_b,
        severity=r.severity,
        description=r.description,
        is_active=r.is_active,
        version=r.version,
        violation_count=len(entry["violators"]),
        violators=entry["violators"],
    )


@router.get("/sod-rules", response_model=list[s.SodRuleOut])
async def list_sod_rules(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.VIEW")),
):
    return [_sod_out(e) for e in await svc.SodService(session, ctx).list_rules()]


@router.post("/sod-rules", response_model=s.SodRuleOut, status_code=201)
async def create_sod_rule(
    body: s.SodRuleCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.EDIT")),
):
    rule = await svc.SodService(session, ctx).create(body)
    return _sod_out({"rule": rule, "violators": []})


@router.post("/sod-rules/{uid}/deactivate", response_model=s.SodRuleOut)
async def deactivate_sod_rule(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.EDIT")),
):
    rule = await svc.SodService(session, ctx).set_active(uid, active=False, version=body.version)
    return _sod_out({"rule": rule, "violators": []})


@router.post("/sod-rules/{uid}/restore", response_model=s.SodRuleOut)
async def restore_sod_rule(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.ROLE.EDIT")),
):
    rule = await svc.SodService(session, ctx).set_active(uid, active=True, version=None)
    return _sod_out({"rule": rule, "violators": []})


# ═══════════════════════════ Delegations ════════════════════════════════════
def _delegation_out(entry: dict[str, Any]) -> s.DelegationOut:
    d = entry["del"]
    return s.DelegationOut(
        uid=d.uid,
        from_name=entry["from_name"],
        to_name=entry["to_name"],
        valid_from=d.valid_from,
        valid_to=d.valid_to,
        reason=d.reason,
        status=entry["status"],
        is_active=d.is_active,
        version=d.version,
    )


@router.get("/delegations", response_model=list[s.DelegationOut])
async def list_delegations(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.VIEW")),
):
    return [_delegation_out(e) for e in await svc.DelegationService(session, ctx).list_page()]


@router.post("/delegations", response_model=s.DelegationOut, status_code=201)
async def create_delegation(
    body: s.DelegationCreate,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.EDIT")),
):
    d = await svc.DelegationService(session, ctx).create(body)
    entry = next(
        e for e in await svc.DelegationService(session, ctx).list_page() if e["del"].uid == d.uid
    )
    return _delegation_out(entry)


@router.post("/delegations/{uid}/revoke", response_model=s.DelegationOut)
async def revoke_delegation(
    uid: str,
    body: s.DeactivateRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.USER.EDIT")),
):
    svc_ = svc.DelegationService(session, ctx)
    await svc_.set_active(uid, active=False, version=body.version)
    entry = next(e for e in await svc_.list_page() if e["del"].uid == uid)
    return _delegation_out(entry)
