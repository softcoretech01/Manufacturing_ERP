"""Routing, BOM parents and the master schedule may only offer what is produced.

`/items` returns every active item, which is right for BOM components, purchase
requisitions and stock screens. It was wrong for the three screens that describe
manufacturing: the Routing dropdown offered argon gas, and the master schedule
defaulted to it.

The filter is opt-in, so the generic list must be unchanged for every existing
caller.
"""

from __future__ import annotations

from app.services.item_service import ItemService

# The real ItemType values in ERP_Master.Item, verified against the database.
ALL_TYPES = ["FINISHED", "SEMI_FINISHED", "COMPONENT", "PACKING",
             "RAW", "RAW_MATERIAL", "CONSUMABLE"]


class _StubRepo:
    """Mimics the repository: filters when asked, returns everything when not."""

    def __init__(self):
        self.calls: list[tuple | None] = []
        self._rows = [{"code": f"X-{t}", "itemType": t} for t in ALL_TYPES]

    async def get_all_items(self, item_types=None):
        self.calls.append(item_types)
        if item_types is None:
            return list(self._rows)
        if not item_types:
            return []
        return [r for r in self._rows if r["itemType"] in item_types]


def _service():
    repo = _StubRepo()
    return ItemService(repo), repo


# ── the generic list is untouched ───────────────────────────────────────────

async def test_the_default_call_returns_every_item_type():
    service, repo = _service()
    rows = await service.get_all_items()
    assert len(rows) == len(ALL_TYPES)
    assert repo.calls == [None], "the unfiltered path must not pass a filter"


async def test_manufacturable_false_is_the_same_as_omitting_it():
    service, repo = _service()
    assert await service.get_all_items(manufacturable_only=False) == \
           await service.get_all_items()
    assert repo.calls == [None, None]


# ── the filtered list ───────────────────────────────────────────────────────

async def test_manufacturable_returns_only_finished_and_semi_finished():
    service, _ = _service()
    rows = await service.get_all_items(manufacturable_only=True)
    assert sorted(r["itemType"] for r in rows) == ["FINISHED", "SEMI_FINISHED"]


async def test_purchased_types_are_excluded():
    """Argon gas, steel coil, cartons and labels must not be schedulable."""
    service, _ = _service()
    rows = await service.get_all_items(manufacturable_only=True)
    got = {r["itemType"] for r in rows}
    for excluded in ("CONSUMABLE", "RAW", "RAW_MATERIAL", "PACKING", "COMPONENT"):
        assert excluded not in got, f"{excluded} must not be offered"


async def test_the_filter_is_pushed_to_the_repository_not_applied_in_python():
    service, repo = _service()
    await service.get_all_items(manufacturable_only=True)
    assert repo.calls == [("FINISHED", "SEMI_FINISHED")]


async def test_the_allowed_set_is_declared_once():
    """One constant, so a new manufacturable type is added in a single place."""
    assert ItemService.MANUFACTURABLE_ITEM_TYPES == ("FINISHED", "SEMI_FINISHED")


# ── the empty case must not fall back ───────────────────────────────────────

async def test_no_matches_returns_an_empty_list_not_the_full_one():
    """A silent fallback would put argon gas back in the Routing dropdown."""
    service, repo = _service()
    repo._rows = [{"code": "X-RAW", "itemType": "RAW"}]
    rows = await service.get_all_items(manufacturable_only=True)
    assert rows == []
