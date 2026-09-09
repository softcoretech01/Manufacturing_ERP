"""A production order may only be built to released engineering.

`_validate_bom` used to carry a `pass` where the status check belonged, with a
comment admitting the author did not know the status enum. A DRAFT or
PENDING_APPROVAL BOM therefore passed validation, so unapproved engineering
could drive a production order. FG-SS-500-BLU's BOM is PENDING_APPROVAL in the
live data, which is exactly the case that used to slip through.
"""

from __future__ import annotations

import pytest

from app.core.errors import AppError
from app.modules.planning.domain.services import PlanningService


class _StubBomRepo:
    def __init__(self, boms):
        self._boms = boms

    async def get_all_boms(self):
        return self._boms


class _StubRoutingRepo:
    def __init__(self, routings):
        self._routings = routings

    async def get_all_routings(self):
        return self._routings


def _service(boms=None, routings=None) -> PlanningService:
    """A service with only the repositories these validators touch."""
    svc = PlanningService.__new__(PlanningService)
    svc.bom_repo = _StubBomRepo(boms or [])
    svc.routing_repo = _StubRoutingRepo(routings or [])
    return svc


LIVE_BOM = {"docNo": "BOM/26-27/0001", "status": "ACTIVE"}
PENDING_BOM = {"docNo": "BOM/26-27/0007", "status": "PENDING_APPROVAL"}


# ── BOM ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("status", ["ACTIVE", "APPROVED"])
async def test_a_released_bom_is_accepted(status):
    svc = _service(boms=[{"docNo": "B1", "status": status}])
    await svc._validate_bom("B1")          # must not raise


@pytest.mark.parametrize("status", ["DRAFT", "PENDING_APPROVAL", "SUPERSEDED",
                                    "OBSOLETE", "REJECTED"])
async def test_an_unreleased_bom_is_rejected(status):
    svc = _service(boms=[{"docNo": "B1", "status": status}])
    with pytest.raises(AppError) as err:
        await svc._validate_bom("B1")
    assert status in str(err.value)


async def test_the_real_pending_bom_is_rejected():
    """The live FG-SS-500-BLU case that used to pass."""
    svc = _service(boms=[LIVE_BOM, PENDING_BOM])
    with pytest.raises(AppError) as err:
        await svc._validate_bom("BOM/26-27/0007")
    assert "not released" in str(err.value)
    await svc._validate_bom("BOM/26-27/0001")


async def test_a_missing_bom_is_still_rejected():
    svc = _service(boms=[LIVE_BOM])
    with pytest.raises(AppError, match="does not exist"):
        await svc._validate_bom("NOPE")


async def test_a_bom_with_no_status_is_rejected_not_defaulted():
    """Absent status must fail closed, not be treated as released."""
    svc = _service(boms=[{"docNo": "B1"}])
    with pytest.raises(AppError):
        await svc._validate_bom("B1")


# ── Routing ─────────────────────────────────────────────────────────────────

async def test_a_released_routing_is_accepted():
    svc = _service(routings=[{"docNo": "R1", "status": "ACTIVE"}])
    await svc._validate_routing("R1")


async def test_an_unreleased_routing_is_rejected():
    svc = _service(routings=[{"docNo": "R1", "status": "DRAFT"}])
    with pytest.raises(AppError) as err:
        await svc._validate_routing("R1")
    assert "not released" in str(err.value)


async def test_a_missing_routing_is_still_rejected():
    svc = _service(routings=[{"docNo": "R1", "status": "ACTIVE"}])
    with pytest.raises(AppError, match="does not exist"):
        await svc._validate_routing("NOPE")
