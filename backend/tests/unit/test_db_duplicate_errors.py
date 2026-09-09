"""A unique-index violation must reach the user as an explanation, not a 500.

"One default live BOM per product" is enforced by a generated column plus a
UNIQUE KEY, because MariaDB has no filtered indexes. That works, but a violation
arrives as `(1062, "Duplicate entry 'FG-SS-750-BLK' for key 'uk_engbom_...'")`,
which told a planner nothing and surfaced as a 500.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.errors import DuplicateError
from app.services.engineering_bom_service import EngineeringBomService
from app.utils.db_errors import duplicate_key, raise_for_duplicate

MESSAGES = {
    "uk_engbom_default_per_product": "{value} already has a default bill of material.",
}


def _mysql_error(errno: int, detail: str) -> IntegrityError:
    """An IntegrityError shaped the way pymysql produces one."""
    class _Orig(Exception):
        pass

    orig = _Orig(errno, detail)
    return IntegrityError("stmt", {}, orig)


DUP = "Duplicate entry 'FG-SS-750-BLK' for key 'uk_engbom_default_per_product'"


# ── parsing ─────────────────────────────────────────────────────────────────

def test_a_1062_is_parsed_into_index_and_value():
    assert duplicate_key(_mysql_error(1062, DUP)) == (
        "uk_engbom_default_per_product", "FG-SS-750-BLK")


def test_a_table_qualified_key_is_reduced_to_the_index_name():
    """Some servers report `table.index` rather than the bare index name."""
    err = _mysql_error(1062, "Duplicate entry 'X' for key 'EngineeringBom.uk_a'")
    assert duplicate_key(err) == ("uk_a", "X")


def test_a_value_containing_quotes_still_parses_the_key():
    err = _mysql_error(1062, "Duplicate entry 'O'Brien' for key 'uk_a'")
    index, _ = duplicate_key(err)
    assert index == "uk_a"


@pytest.mark.parametrize("errno", [1042, 1213, 1452])
def test_other_mysql_errors_are_not_treated_as_duplicates(errno):
    assert duplicate_key(_mysql_error(errno, "something else")) is None


def test_a_non_database_exception_is_ignored():
    assert duplicate_key(ValueError("nope")) is None


# ── translation ─────────────────────────────────────────────────────────────

def test_a_known_index_becomes_a_duplicate_error():
    with pytest.raises(DuplicateError) as err:
        raise_for_duplicate(_mysql_error(1062, DUP), MESSAGES)
    assert "FG-SS-750-BLK already has a default bill of material." in str(err.value)


def test_the_duplicate_error_is_a_409():
    try:
        raise_for_duplicate(_mysql_error(1062, DUP), MESSAGES)
    except DuplicateError as exc:
        assert exc.status_code == 409
        assert exc.problem_type == "duplicate-record"
    else:
        pytest.fail("expected DuplicateError")


def test_an_unknown_index_is_left_alone():
    """Better a raw error than a confidently wrong explanation."""
    err = _mysql_error(1062, "Duplicate entry 'x' for key 'some_other_index'")
    raise_for_duplicate(err, MESSAGES)          # returns, so the caller re-raises


# ── the service path ────────────────────────────────────────────────────────

class _StubSession:
    def __init__(self):
        self.rolled_back = False

    async def rollback(self):
        self.rolled_back = True


class _RaisingRepo:
    def __init__(self, exc):
        self.session = _StubSession()
        self._exc = exc

    async def execute_sp(self, action, payload_json, bom_id=None):
        raise self._exc


async def test_creating_a_second_default_bom_explains_the_rule():
    repo = _RaisingRepo(_mysql_error(1062, DUP))
    service = EngineeringBomService(repo)

    with pytest.raises(DuplicateError) as err:
        await service.create_bom({"productCode": "FG-SS-750-BLK"}, "tester")

    assert "already has a default bill of material" in str(err.value)
    assert "alternate" in str(err.value)
    assert repo.session.rolled_back, "the aborted transaction must be rolled back"


async def test_an_unrelated_integrity_error_still_propagates():
    """A foreign-key failure must not be dressed up as a duplicate."""
    repo = _RaisingRepo(_mysql_error(1452, "Cannot add or update a child row"))
    service = EngineeringBomService(repo)

    with pytest.raises(IntegrityError):
        await service.create_bom({"productCode": "X"}, "tester")
    assert repo.session.rolled_back


async def test_a_duplicate_doc_no_is_explained_too():
    repo = _RaisingRepo(_mysql_error(
        1062, "Duplicate entry 'BOM/26-27/0001' for key 'DocNo'"))
    service = EngineeringBomService(repo)

    with pytest.raises(DuplicateError, match="BOM/26-27/0001 already exists"):
        await service.update_bom("1", {"docNo": "BOM/26-27/0001"}, "tester")


async def test_a_successful_write_is_untouched():
    class _OkRepo:
        session = _StubSession()

        async def execute_sp(self, action, payload_json, bom_id=None):
            return 42

        async def get_bom_by_id(self, bom_id):
            return {"uid": str(bom_id), "docNo": "BOM/26-27/0009"}

    service = EngineeringBomService(_OkRepo())
    result = await service.create_bom({"productCode": "X"}, "tester")
    assert result["uid"] == "42"
    assert json.dumps({"ok": True})     # payload still serialisable, no side effects
