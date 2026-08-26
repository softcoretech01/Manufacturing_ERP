from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

class BankRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_banks(self) -> list[dict[str, Any]]:
        stmt = text("CALL SpBank('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        return [self._parse_row(row) for row in rows]

    async def create_bank(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        stmt = text("""
            CALL SpBank(
                'CREATE', NULL, :Code, :Name, :Status, :IfscPrefix, :BankType, :Swift, :SupportsNeft, :User
            )
        """)
        result = await self.session.execute(stmt, {
            "Code": data['code'],
            "Name": data['name'],
            "Status": data['status'],
            "IfscPrefix": data.get('ifscPrefix'),
            "BankType": data['bankType'],
            "Swift": data.get('swift'),
            "SupportsNeft": data.get('supportsNeft', False),
            "User": user_id
        })
        row = result.mappings().fetchone()
        return self._parse_row(row) if row else {}

    async def update_bank(self, bank_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any] | None:
        stmt = text("""
            CALL SpBank(
                'UPDATE', :Id, :Code, :Name, :Status, :IfscPrefix, :BankType, :Swift, :SupportsNeft, :User
            )
        """)
        result = await self.session.execute(stmt, {
            "Id": bank_id,
            "Code": data['code'],
            "Name": data['name'],
            "Status": data['status'],
            "IfscPrefix": data.get('ifscPrefix'),
            "BankType": data['bankType'],
            "Swift": data.get('swift'),
            "SupportsNeft": data.get('supportsNeft', False),
            "User": user_id
        })
        row = result.mappings().fetchone()
        return self._parse_row(row) if row else None

    async def delete_bank(self, bank_id: int, user_id: str) -> None:
        stmt = text("CALL SpBank('DELETE', :Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :User)")
        await self.session.execute(stmt, {"Id": bank_id, "User": user_id})

    def _parse_row(self, row: dict[str, Any] | Any) -> dict[str, Any]:
        d = dict(row)
        mappings = {
            "Id": "id",
            "Code": "code",
            "Name": "name",
            "Status": "status",
            "IfscPrefix": "ifscPrefix",
            "BankType": "bankType",
            "Swift": "swift",
            "SupportsNeft": "supportsNeft",
            "CreatedBy": "createdBy",
            "CreatedDate": "createdDate",
            "ModifiedBy": "modifiedBy",
            "ModifiedDate": "modifiedDate",
        }
        result = {}
        for db_key, schema_key in mappings.items():
            if db_key in d:
                val = d[db_key]
                if schema_key == 'supportsNeft' and val is not None:
                    val = bool(val)
                result[schema_key] = val
        return result
