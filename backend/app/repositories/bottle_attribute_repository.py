"""Read-only access to the five masters behind the bottle attributes on Item.

`ERP_Master.Item` stores BottleModel, Colour, LidType and SteelGrade as plain
VARCHAR with no foreign key, so nothing at the database level stops a caller
writing a string that references nothing. That is exactly how `ITM-0004` came to
hold `COL-BLK-M`, `LID-SCR-SS` and `SS304`, none of which resolve to a master
row. This repository supplies the allowed codes so the service can reject the
next one.

Which schema: each of these five masters exists in both `admin_erp` and
`ERP_Master`, with a stored procedure of the same name in each. The lookup
repositories call those procedures unqualified, so they resolve against the
connection's default schema, and that is where the real data lives -- the
`ERP_Master` copies hold single junk rows ("Lion", "Test color"). We read the
same schema those procedures resolve to, so validation can never disagree with
the dropdown the user picked from.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

# Item column -> (master table, label used in error messages)
ATTRIBUTE_MASTERS: dict[str, tuple[str, str]] = {
    "colour": ("BottleColour", "colour"),
    "lidType": ("LidType", "lid type"),
    "steelGrade": ("SteelGrade", "steel grade"),
    "bottleModel": ("BottleModel", "bottle model"),
}


class BottleAttributeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    @property
    def _schema(self) -> str:
        # The connection's default database, which is what an unqualified
        # `CALL SpBottleColour(...)` in the lookup repositories resolves to.
        return settings.db_name

    async def active_options(self, field: str) -> dict[str, str]:
        """Selectable {code: name} for one attribute.

        Excludes retired rows. `IsDeleted` is `bit(1)` on four of these tables
        and `tinyint(1)` on BottleModel; comparing to 0 works for both. This is
        what keeps `GRD-0003 SS 201` out -- its status still reads ACTIVE but the
        row is soft-deleted.
        """
        table, _ = ATTRIBUTE_MASTERS[field]
        rows = await self.session.execute(text(
            f"SELECT Code, Name FROM `{self._schema}`.`{table}`"
            " WHERE IsDeleted = 0 AND Status = 'ACTIVE' ORDER BY Code"
        ))
        return {r[0]: r[1] for r in rows}

    async def active_codes(self, field: str) -> set[str]:
        return set(await self.active_options(field))
