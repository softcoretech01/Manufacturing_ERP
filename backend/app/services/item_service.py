from typing import Any

from fastapi import HTTPException

from app.repositories.bottle_attribute_repository import (
    ATTRIBUTE_MASTERS,
    BottleAttributeRepository,
)
from app.repositories.item_repository import ItemRepository

# Largest capacity we will accept, in millilitres. A 20 litre carboy is far
# beyond anything this plant makes; the bound exists to catch a slipped decimal
# or a value pasted into the wrong field, not to express a product rule.
MAX_CAPACITY_ML = 20_000


class UnknownAttributeReferenceError(ValueError):
    """Raised when an item is written with an attribute code no master carries."""

    def __init__(self, field: str, value: str, options: dict[str, str]):
        self.field = field
        self.value = value
        _, label = ATTRIBUTE_MASTERS[field]
        allowed = ", ".join(f"{c} ({n})" for c, n in sorted(options.items()))
        super().__init__(
            f"{value!r} is not a valid {label}. Choose one of: {allowed or 'none'}."
        )


class InvalidCapacityError(ValueError):
    """Raised when capacity is not a usable millilitre figure."""

    def __init__(self, value: Any):
        self.value = value
        super().__init__(
            f"Capacity {value!r} is not valid. Give a whole number of millilitres"
            f" between 1 and {MAX_CAPACITY_ML}, or leave it empty."
        )


class ItemService:
    def __init__(
        self,
        repository: ItemRepository,
        attribute_repository: BottleAttributeRepository | None = None,
    ):
        self.repository = repository
        self.attribute_repository = attribute_repository

    # ItemType values that can be manufactured, and so can carry a routing, a BOM
    # as the parent, or a master-production-schedule line. Verified against
    # ERP_Master.Item, which also holds COMPONENT, PACKING, RAW, RAW_MATERIAL and
    # CONSUMABLE -- all purchased, none of which the factory produces.
    MANUFACTURABLE_ITEM_TYPES = ("FINISHED", "SEMI_FINISHED")

    async def get_all_items(
        self, manufacturable_only: bool = False
    ) -> list[dict[str, Any]]:
        """Active items. `manufacturable_only` narrows to what can be produced.

        Default False, so every existing caller keeps the full list -- BOM
        components, purchase requisitions and stock screens all legitimately need
        raw materials, packaging and consumables.
        """
        if manufacturable_only:
            return await self.repository.get_all_items(
                item_types=self.MANUFACTURABLE_ITEM_TYPES)
        return await self.repository.get_all_items()

    async def get_next_code(self) -> dict[str, str]:
        return await self.repository.get_next_code()

    async def get_attribute_options(self) -> dict[str, list[dict[str, str]]]:
        """The selectable values behind the four coded bottle attributes.

        One call so the item form can fill four dropdowns without four requests.
        """
        if self.attribute_repository is None:
            return {field: [] for field in ATTRIBUTE_MASTERS}
        return {
            field: [{"code": c, "name": n} for c, n in
                    (await self.attribute_repository.active_options(field)).items()]
            for field in ATTRIBUTE_MASTERS
        }

    async def _validate_attributes(
        self, data: dict[str, Any], existing: dict[str, Any] | None = None
    ) -> None:
        """Reject attribute codes that reference nothing, and bad capacities.

        The four coded columns are VARCHAR with no foreign key, so this is the
        only thing standing between a typo and another `SS304`.

        A value identical to the one already stored is left alone. Without that,
        the strictness introduced here would make `ITM-0004` uneditable: its three
        stored strings resolve to no master row, so re-sending them -- which the
        edit form does on every save -- would fail, and nobody could so much as
        correct the spelling of "Vaccum Flask". Cleaning those values up is a
        separate, deliberate decision, not something to force through a form.
        """
        capacity = data.get("capacityMl")
        if capacity is not None and capacity != "":
            was = (existing or {}).get("capacityMl")
            if capacity != was:
                try:
                    ml = int(capacity)
                except (TypeError, ValueError):
                    raise InvalidCapacityError(capacity) from None
                if ml < 1 or ml > MAX_CAPACITY_ML:
                    raise InvalidCapacityError(capacity)
                data["capacityMl"] = ml

        if self.attribute_repository is None:
            return

        for field in ATTRIBUTE_MASTERS:
            value = data.get(field)
            if value is None:
                continue
            value = str(value).strip()
            if not value:
                # Clearing an attribute is always allowed.
                data[field] = None
                continue
            if existing is not None and value == (existing.get(field) or "").strip():
                data[field] = value
                continue
            options = await self.attribute_repository.active_options(field)
            if value not in options:
                raise UnknownAttributeReferenceError(field, value, options)
            data[field] = value

    async def create_item(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        await self._validate_attributes(data)
        return await self.repository.create_item(data, user_id)

    async def update_item(self, item_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        existing = await self.repository.get_item_by_id(item_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Item not found")

        # Merge data to pass missing fields as they were
        for key in existing.keys():
            if key not in data and key not in ['id', 'createdDate', 'modifiedDate', 'createdBy', 'modifiedBy', 'isDeleted']:
                data[key] = existing[key]

        await self._validate_attributes(data, existing=existing)
        return await self.repository.update_item(item_id, data, user_id)

    async def delete_item(self, item_id: int, user_id: str) -> None:
        existing = await self.repository.get_item_by_id(item_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Item not found")
        await self.repository.delete_item(item_id, user_id)
