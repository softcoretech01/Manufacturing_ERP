"""A work centre is "used by" live routing steps, and by nothing else.

The Work centres grid counts routing operation lines in ACTIVE or APPROVED
routings, and disables Delete on that count. The server's delete guard used to
count something different — active standard operations whose default work centre
matched — so the two could disagree: a centre reading "0 ops" with Delete
enabled could still be refused by the API, and the count quoted in the refusal
was not the count on screen.

These tests pin the single definition to the server side, which is the
authoritative one.
"""

from __future__ import annotations

import pytest

from app.core.errors import BusinessRuleViolationError, NotFoundError
from app.repositories.engineering_workcentre_repository import LIVE_ROUTING_USAGE_SQL
from app.services.engineering_workcentre_service import EngineeringWorkCentreService

CODE = "WC-WELD-01"


class _StubRepo:
    """Stands in for the repository so the guard can be tested without a database."""

    def __init__(self, *, code: str | None = CODE, usage: int = 0) -> None:
        self._code = code
        self._usage = usage
        self.counted: list[str] = []
        self.deleted: list[tuple[str, str]] = []

    async def get_code(self, uid: str) -> str | None:
        return self._code

    async def count_live_routing_usage(self, code: str) -> int:
        self.counted.append(code)
        return self._usage

    async def delete_workcentre(self, uid: str, user: str) -> str:
        self.deleted.append((uid, user))
        return uid


def _service(**kw) -> tuple[EngineeringWorkCentreService, _StubRepo]:
    service = EngineeringWorkCentreService(None)  # type: ignore[arg-type]
    repo = _StubRepo(**kw)
    service.repository = repo  # type: ignore[assignment]
    return service, repo


# ── The guard ───────────────────────────────────────────────────────────────


async def test_unused_centre_is_deleted():
    """Test 1: nothing live references it, so the retire goes through."""
    service, repo = _service(usage=0)
    assert await service.delete_workcentre("7", "tester") == "7"
    assert repo.deleted == [("7", "tester")]
    assert repo.counted == [CODE]


@pytest.mark.parametrize("usage", [1, 2])
async def test_live_routing_usage_blocks_delete(usage: int):
    """Tests 2, 3 and 6: one or more live routing lines refuse the delete."""
    service, repo = _service(usage=usage)
    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.delete_workcentre("7", "tester")
    assert exc.value.status_code == 409
    assert repo.deleted == []


async def test_refusal_names_the_centre_and_the_count():
    """The message must be usable as-is: which centre, and how many steps."""
    service, _ = _service(usage=2)
    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.delete_workcentre("7", "tester")
    detail = exc.value.detail
    assert CODE in detail
    assert "2" in detail
    assert "routing operation" in detail
    assert exc.value.rule_code == "V5-WC-BR-001"


async def test_missing_work_centre_is_a_404_not_a_silent_success():
    """The old guard counted 0 for a row that was gone and reported success."""
    service, repo = _service(code=None)
    with pytest.raises(NotFoundError):
        await service.delete_workcentre("999", "tester")
    assert repo.deleted == []


# ── The definition itself ───────────────────────────────────────────────────


def test_usage_sql_counts_only_live_routing_lines():
    """Tests 4, 5 and 7: drafts and superseded routings must not hold a centre.

    Asserted on the SQL because that is where the definition lives; a change in
    wording is fine, a change in meaning has to be deliberate.
    """
    sql = " ".join(LIVE_ROUTING_USAGE_SQL.split())
    assert "EngineeringRoutingOperation" in sql
    assert "r.Id = o.RoutingId" in sql
    assert "IN ('ACTIVE', 'APPROVED')" in sql
    assert "r.DeletedAt IS NULL" in sql
    # Draft, pending approval and superseded routings are excluded by the
    # whitelist above, and the standard operation library is not usage at all —
    # DefaultWorkCentre was the column the old, divergent guard counted on.
    assert "DRAFT" not in sql
    assert "SUPERSEDED" not in sql
    assert "DefaultWorkCentre" not in sql
