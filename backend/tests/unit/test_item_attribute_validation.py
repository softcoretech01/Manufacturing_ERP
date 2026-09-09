"""The bottle attributes on Item must reference a real master row.

`ERP_Master.Item` stores BottleModel, Colour, LidType and SteelGrade as plain
VARCHAR with no foreign key. Nothing in the database stopped `ITM-0004` being
written with `COL-BLK-M`, `LID-SCR-SS` and `SS304`, none of which resolve to
anything. These tests pin the service-side check that replaces the missing
constraint, and the one deliberate hole in it: a value already stored is left
alone, so a row carrying bad data stays editable.
"""

from __future__ import annotations

import pytest

from app.repositories.bottle_attribute_repository import ATTRIBUTE_MASTERS
from app.services.item_service import (
    MAX_CAPACITY_ML,
    InvalidCapacityError,
    ItemService,
    UnknownAttributeReferenceError,
)

# The live contents of the four masters in the schema the application reads,
# verified against admin_erp. GRD-0003 SS 201 is absent on purpose: the row is
# soft-deleted, so it must not be selectable.
OPTIONS = {
    "colour": {"COL-0001": "Steel", "COL-0002": "Matte Black", "COL-0003": "White",
               "COL-0004": "Navy", "COL-0005": "Rose Gold"},
    "lidType": {"LID-0001": "Santhosh", "LID-0002": "Screw", "LID-0003": "Flip",
                "LID-0004": "Sipper", "LID-0005": "Straw"},
    "steelGrade": {"GRD-0001": "SS 304", "GRD-0002": "SS 316"},
    "bottleModel": {"MDL-0001": "Sandy", "MDL-0002": "Aqua", "MDL-0003": "Summit",
                    "MDL-0004": "Trek", "MDL-0005": "Urban", "MDL-0006": "Classic"},
}

# The three strings sitting on ITM-0004 today. Each looks like a code and is not.
INVALID_STORED = {"colour": "COL-BLK-M", "lidType": "LID-SCR-SS",
                  "steelGrade": "SS304"}


class _StubAttributeRepo:
    def __init__(self, options=None):
        self.options = options or OPTIONS

    async def active_options(self, field):
        return dict(self.options[field])

    async def active_codes(self, field):
        return set(self.options[field])


class _StubItemRepo:
    def __init__(self, existing=None):
        self.existing = existing
        self.created: list[dict] = []
        self.updated: list[dict] = []

    async def get_all_items(self, item_types=None):
        return []

    async def get_item_by_id(self, item_id):
        return self.existing

    async def create_item(self, data, user_id):
        self.created.append(data)
        return data

    async def update_item(self, item_id, data, user_id):
        self.updated.append(data)
        return data


def _service(existing=None, options=None):
    items = _StubItemRepo(existing)
    return ItemService(items, _StubAttributeRepo(options)), items


def _payload(**overrides):
    base = {"code": "FG-TEST", "name": "Test flask", "capacityMl": None,
            "colour": None, "lidType": None, "steelGrade": None,
            "bottleModel": None}
    base.update(overrides)
    return base


# ── codes that resolve ──────────────────────────────────────────────────────

@pytest.mark.parametrize("field,value", [
    ("colour", "COL-0002"), ("lidType", "LID-0004"),
    ("steelGrade", "GRD-0001"), ("bottleModel", "MDL-0004"),
])
async def test_a_code_the_master_carries_is_accepted(field, value):
    service, items = _service()
    await service.create_item(_payload(**{field: value}), "tester")
    assert items.created[0][field] == value


async def test_the_values_written_by_the_migration_all_validate():
    """The ten cells the migration populated must survive a later save."""
    service, items = _service()
    await service.create_item(_payload(
        capacityMl=750, colour="COL-0002", lidType="LID-0002",
        steelGrade="GRD-0001"), "tester")
    written = items.created[0]
    assert (written["capacityMl"], written["colour"],
            written["lidType"], written["steelGrade"]) == \
           (750, "COL-0002", "LID-0002", "GRD-0001")


# ── codes that resolve to nothing ───────────────────────────────────────────

@pytest.mark.parametrize("field,value", list(INVALID_STORED.items()))
async def test_the_itm0004_strings_are_rejected_on_a_new_item(field, value):
    service, _ = _service()
    with pytest.raises(UnknownAttributeReferenceError) as exc:
        await service.create_item(_payload(**{field: value}), "tester")
    assert exc.value.value == value
    assert exc.value.field == field


async def test_the_error_names_the_valid_choices():
    service, _ = _service()
    with pytest.raises(UnknownAttributeReferenceError) as exc:
        await service.create_item(_payload(colour="SKY-BLUE"), "tester")
    message = str(exc.value)
    assert "COL-0002 (Matte Black)" in message
    assert "colour" in message


async def test_a_retired_master_row_is_not_selectable():
    """SS 201 is soft-deleted, so writing GRD-0003 must fail."""
    service, _ = _service()
    with pytest.raises(UnknownAttributeReferenceError):
        await service.create_item(_payload(steelGrade="GRD-0003"), "tester")


async def test_a_master_name_is_not_accepted_in_place_of_its_code():
    """Storing the label would break the moment someone renames the row."""
    service, _ = _service()
    with pytest.raises(UnknownAttributeReferenceError):
        await service.create_item(_payload(colour="Matte Black"), "tester")


async def test_nothing_is_written_when_validation_fails():
    service, items = _service()
    with pytest.raises(UnknownAttributeReferenceError):
        await service.create_item(_payload(lidType="LID-SCR-SS"), "tester")
    assert items.created == []


# ── clearing is always allowed ──────────────────────────────────────────────

@pytest.mark.parametrize("blank", [None, "", "   "])
async def test_an_empty_attribute_is_allowed_and_stored_as_null(blank):
    service, items = _service()
    await service.create_item(_payload(colour=blank), "tester")
    assert items.created[0]["colour"] is None


# ── existing bad data stays editable ────────────────────────────────────────

async def test_an_unchanged_invalid_value_is_grandfathered_on_update():
    """Otherwise ITM-0004 could never be edited again, not even to fix a typo.

    The edit form sends the whole row back, so a strict check would reject every
    save on a row that already holds bad data.
    """
    existing = {"id": 4, "code": "ITM-0004", "name": "Vaccum Flask",
                "capacityMl": None, **INVALID_STORED, "bottleModel": ""}
    service, items = _service(existing=existing)
    await service.update_item(4, {"name": "Vacuum Flask", **INVALID_STORED},
                              "tester")
    saved = items.updated[0]
    assert saved["name"] == "Vacuum Flask"
    for field, value in INVALID_STORED.items():
        assert saved[field] == value, "the bad value must be preserved, not blanked"


async def test_changing_one_invalid_value_for_another_is_still_rejected():
    """Grandfathering covers what is already there, not a fresh mistake."""
    existing = {"id": 4, "code": "ITM-0004", "capacityMl": None,
                **INVALID_STORED, "bottleModel": ""}
    service, _ = _service(existing=existing)
    with pytest.raises(UnknownAttributeReferenceError):
        await service.update_item(4, {"colour": "COL-WHT-G"}, "tester")


async def test_a_grandfathered_row_can_be_corrected_to_a_real_code():
    existing = {"id": 4, "code": "ITM-0004", "capacityMl": None,
                **INVALID_STORED, "bottleModel": ""}
    service, items = _service(existing=existing)
    await service.update_item(4, {"colour": "COL-0002"}, "tester")
    assert items.updated[0]["colour"] == "COL-0002"


# ── capacity ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("value", [1, 350, 500, 750, 1000, MAX_CAPACITY_ML])
async def test_a_sensible_capacity_is_accepted(value):
    service, items = _service()
    await service.create_item(_payload(capacityMl=value), "tester")
    assert items.created[0]["capacityMl"] == value


@pytest.mark.parametrize("value", [0, -1, -750, MAX_CAPACITY_ML + 1, 999_999])
async def test_a_capacity_outside_the_sane_range_is_rejected(value):
    service, _ = _service()
    with pytest.raises(InvalidCapacityError):
        await service.create_item(_payload(capacityMl=value), "tester")


async def test_a_non_numeric_capacity_is_rejected():
    service, _ = _service()
    with pytest.raises(InvalidCapacityError):
        await service.create_item(_payload(capacityMl="750 ml"), "tester")


async def test_a_numeric_string_capacity_is_stored_as_a_number():
    """The column is int(11); a string must never reach it."""
    service, items = _service()
    await service.create_item(_payload(capacityMl="750"), "tester")
    assert items.created[0]["capacityMl"] == 750
    assert isinstance(items.created[0]["capacityMl"], int)


async def test_capacity_may_be_left_empty():
    service, items = _service()
    await service.create_item(_payload(capacityMl=None), "tester")
    assert items.created[0]["capacityMl"] is None


# ── the option list the form is built from ──────────────────────────────────

async def test_every_attribute_master_is_offered_to_the_form():
    service, _ = _service()
    options = await service.get_attribute_options()
    assert set(options) == set(ATTRIBUTE_MASTERS)
    assert {o["code"] for o in options["steelGrade"]} == {"GRD-0001", "GRD-0002"}
    assert all({"code", "name"} == set(o) for o in options["colour"])


async def test_the_form_options_carry_the_readable_name():
    """The screen shows 'Matte Black' and submits 'COL-0002'."""
    service, _ = _service()
    options = await service.get_attribute_options()
    by_code = {o["code"]: o["name"] for o in options["colour"]}
    assert by_code["COL-0002"] == "Matte Black"


# ── the filter is opt-in and unrelated behaviour is untouched ───────────────

async def test_validation_is_skipped_when_no_master_repository_is_wired():
    """Callers that construct the service bare keep their old behaviour."""
    items = _StubItemRepo()
    service = ItemService(items)
    await service.create_item(_payload(colour="ANYTHING"), "tester")
    assert items.created[0]["colour"] == "ANYTHING"


async def test_capacity_is_still_checked_without_a_master_repository():
    """Capacity needs no master, so its bounds always apply."""
    service = ItemService(_StubItemRepo())
    with pytest.raises(InvalidCapacityError):
        await service.create_item(_payload(capacityMl=-5), "tester")


# ── the repository reads the schema the application actually serves from ────

class _RecordingSession:
    def __init__(self):
        self.sql = ""

    async def execute(self, stmt, params=None):
        self.sql = str(stmt)
        return []


async def test_the_repository_excludes_retired_and_inactive_master_rows():
    """The live guard behind `test_a_retired_master_row_is_not_selectable`.

    Without both clauses, GRD-0003 SS 201 would appear in the steel-grade
    dropdown: its Status still reads ACTIVE and only IsDeleted marks it retired.
    """
    from app.repositories.bottle_attribute_repository import BottleAttributeRepository

    session = _RecordingSession()
    await BottleAttributeRepository(session).active_options("steelGrade")
    assert "IsDeleted = 0" in session.sql
    assert "Status = 'ACTIVE'" in session.sql


async def test_the_repository_reads_the_connection_default_schema():
    """The lookup procedures resolve unqualified, so validation must match them.

    Reading `ERP_Master` instead would validate against the junk copies, where
    the only steel grade is called "Lion".
    """
    from app.core.config import settings
    from app.repositories.bottle_attribute_repository import BottleAttributeRepository

    session = _RecordingSession()
    await BottleAttributeRepository(session).active_options("colour")
    assert f"`{settings.db_name}`.`BottleColour`" in session.sql
