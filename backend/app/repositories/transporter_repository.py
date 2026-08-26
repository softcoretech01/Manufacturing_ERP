from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

class TransporterRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_transporters(self) -> list[dict[str, Any]]:
        stmt = text("CALL SpGetTransporters()")
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        return [self._parse_row(row) for row in rows]

    async def create_transporter(self, code: str, data: dict[str, Any]) -> dict[str, Any]:
        stmt = text("""
            CALL SpInsertTransporter(
                :Code, :Name, :Status, :EffectiveFrom, :EffectiveTo,
                :TransporterId, :Mode, :IsGta, :FleetSize, :ServiceZones, :ContactMobile
            )
        """)
        result = await self.session.execute(stmt, {
            "Code": code,
            "Name": data['name'],
            "Status": data['status'],
            "EffectiveFrom": data['effectiveFrom'],
            "EffectiveTo": data.get('effectiveTo'),
            "TransporterId": data['transporterId'],
            "Mode": data['mode'],
            "IsGta": data.get('isGta', False),
            "FleetSize": data.get('fleetSize', 0),
            "ServiceZones": data.get('serviceZones'),
            "ContactMobile": data.get('contactMobile')
        })
        row = result.mappings().fetchone()
        return self._parse_row(row) if row else {}

    async def update_transporter(self, transporter_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
        stmt = text("""
            CALL SpUpdateTransporter(
                :Id, :Name, :Status, :EffectiveFrom, :EffectiveTo,
                :TransporterId, :Mode, :IsGta, :FleetSize, :ServiceZones, :ContactMobile
            )
        """)
        result = await self.session.execute(stmt, {
            "Id": transporter_id,
            "Name": data['name'],
            "Status": data['status'],
            "EffectiveFrom": data['effectiveFrom'],
            "EffectiveTo": data.get('effectiveTo'),
            "TransporterId": data['transporterId'],
            "Mode": data['mode'],
            "IsGta": data.get('isGta', False),
            "FleetSize": data.get('fleetSize', 0),
            "ServiceZones": data.get('serviceZones'),
            "ContactMobile": data.get('contactMobile')
        })
        row = result.mappings().fetchone()
        return self._parse_row(row) if row else None

    def _parse_row(self, row: dict[str, Any] | Any) -> dict[str, Any]:
        d = dict(row)
        mappings = {
            "Id": "id",
            "Code": "code",
            "Name": "name",
            "Status": "status",
            "EffectiveFrom": "effectiveFrom",
            "EffectiveTo": "effectiveTo",
            "TransporterId": "transporterId",
            "Mode": "mode",
            "IsGta": "isGta",
            "FleetSize": "fleetSize",
            "ServiceZones": "serviceZones",
            "ContactMobile": "contactMobile",
            "CreatedAt": "createdAt",
            "UpdatedAt": "updatedAt",
        }
        result = {}
        for db_key, schema_key in mappings.items():
            if db_key in d:
                val = d[db_key]
                if schema_key == 'isGta' and val is not None:
                    val = bool(val)
                result[schema_key] = val
        return result

    async def delete_transporter(self, transporter_id: int) -> None:
        stmt = text("CALL SpDeleteTransporter(:Id)")
        await self.session.execute(stmt, {"Id": transporter_id})
