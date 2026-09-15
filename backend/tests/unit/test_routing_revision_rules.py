"""Routing rules that need no database: who may set what, and who approves.

The revision and approval behaviour itself is verified against a real MariaDB in
`tests/isolated/test_routing_revision_flow.py`. What is pinned here is the part a
database cannot show: that the endpoint hands the service the *authenticated*
identity rather than a name off the wire, and that the status a client may save
is a closed set.
"""

from __future__ import annotations

import pytest

from app.core.errors import BusinessRuleViolationError
from app.routers import engineering_routings as router_mod
from app.services.engineering_routing_service import (
    ALLOWED_TRANSITIONS,
    APPROVABLE,
    CLIENT_STATUSES,
    EngineeringRoutingService,
)


class _Ctx:
    """Just enough TenantContext for the handlers."""

    user_name = "Meera Rajan"
    login_id = "mrajan"


class _StubService:
    """Records what the endpoint asked for."""

    def __init__(self, *_args, **_kwargs) -> None:
        self.calls: list[tuple[str, tuple]] = []

    async def approve_routing(self, uid, approver):
        self.calls.append(("approve", (uid, approver)))
        return {"uid": uid, "approvedBy": approver, "superseded": [], "defaultTakenFrom": []}

    async def create_revision(self, uid, data, user):
        self.calls.append(("revision", (uid, user)))
        return {"uid": "9", "docNo": "RTG/26-27/0001", "revision": 4}

    async def set_default_routing(self, uid, user):
        self.calls.append(("default", (uid, user)))
        return {"uid": uid}


@pytest.fixture
def stub_service(monkeypatch):
    created: list[_StubService] = []

    def factory(*args, **kwargs):
        service = _StubService(*args, **kwargs)
        created.append(service)
        return service

    monkeypatch.setattr(router_mod, "EngineeringRoutingService", factory)
    return created


# ── The approver is the authenticated user ──────────────────────────────────


async def test_approve_uses_the_authenticated_identity(stub_service):
    result = await router_mod.approve_routing(uid="4", db=None, ctx=_Ctx())
    assert stub_service[0].calls == [("approve", ("4", "Meera Rajan"))]
    assert result["approvedBy"] == "Meera Rajan"


async def test_revision_records_the_authenticated_author(stub_service):
    await router_mod.create_routing_revision(uid="1", routing=object(), db=None, ctx=_Ctx())
    assert stub_service[0].calls == [("revision", ("1", "Meera Rajan"))]


async def test_set_default_records_the_authenticated_user(stub_service):
    await router_mod.set_default_routing(uid="4", db=None, ctx=_Ctx())
    assert stub_service[0].calls == [("default", ("4", "Meera Rajan"))]


# ── Status is a closed set ──────────────────────────────────────────────────


@pytest.mark.parametrize("status", ["ACTIVE", "APPROVED", "SUPERSEDED", "OBSOLETE", "anything"])
def test_a_client_cannot_name_a_server_only_status(status):
    with pytest.raises(BusinessRuleViolationError) as exc:
        EngineeringRoutingService._client_status(status)
    assert exc.value.status_code == 409


@pytest.mark.parametrize("status", ["DRAFT", "PENDING_APPROVAL", "REJECTED"])
def test_draft_states_are_the_client_s(status):
    assert EngineeringRoutingService._client_status(status) == status


def test_missing_status_defaults_to_draft():
    assert EngineeringRoutingService._client_status(None) == "DRAFT"


def test_no_transition_leads_to_a_live_status():
    """Only approval publishes. Nothing in the client-facing map reaches ACTIVE."""
    reachable = set().union(*ALLOWED_TRANSITIONS.values())
    assert reachable <= CLIENT_STATUSES
    assert "ACTIVE" not in reachable and "SUPERSEDED" not in reachable


def test_only_draft_states_can_be_approved():
    assert APPROVABLE == {"DRAFT", "PENDING_APPROVAL"}
