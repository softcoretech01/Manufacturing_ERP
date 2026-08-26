from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

class ContactRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_contacts(self) -> list[dict[str, Any]]:
        stmt = text("CALL SpContactPerson('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        return [self._parse_row(row) for row in rows]

    async def get_next_code(self) -> dict[str, str]:
        stmt = text("CALL SpGetNextContactCode()")
        result = await self.session.execute(stmt)
        row = result.mappings().fetchone()
        return {"nextCode": row["nextCode"]} if row else {"nextCode": ""}

    async def create_contact(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        stmt = text("""
            CALL SpContactPerson(
                'CREATE', NULL, :Code, :Name, :Status, :Partner, :PartnerType, :Designation, :Purpose, :Email, :Mobile, :HasPortalAccess, :User
            )
        """)
        result = await self.session.execute(stmt, {
            "Code": data['code'],
            "Name": data['name'],
            "Status": data['status'],
            "Partner": data['partner'],
            "PartnerType": data['partnerType'],
            "Designation": data.get('designation'),
            "Purpose": data['purpose'],
            "Email": data['email'],
            "Mobile": data['mobile'],
            "HasPortalAccess": data.get('hasPortalAccess', False),
            "User": user_id
        })
        row = result.mappings().fetchone()
        return self._parse_row(row) if row else {}

    async def update_contact(self, contact_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any] | None:
        stmt = text("""
            CALL SpContactPerson(
                'UPDATE', :Id, :Code, :Name, :Status, :Partner, :PartnerType, :Designation, :Purpose, :Email, :Mobile, :HasPortalAccess, :User
            )
        """)
        result = await self.session.execute(stmt, {
            "Id": contact_id,
            "Code": data['code'],
            "Name": data['name'],
            "Status": data['status'],
            "Partner": data['partner'],
            "PartnerType": data['partnerType'],
            "Designation": data.get('designation'),
            "Purpose": data['purpose'],
            "Email": data['email'],
            "Mobile": data['mobile'],
            "HasPortalAccess": data.get('hasPortalAccess', False),
            "User": user_id
        })
        row = result.mappings().fetchone()
        return self._parse_row(row) if row else None

    async def delete_contact(self, contact_id: int, user_id: str) -> None:
        stmt = text("CALL SpContactPerson('DELETE', :Id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :User)")
        await self.session.execute(stmt, {"Id": contact_id, "User": user_id})

    def _parse_row(self, row: dict[str, Any] | Any) -> dict[str, Any]:
        d = dict(row)
        mappings = {
            "Id": "id",
            "Code": "code",
            "Name": "name",
            "Status": "status",
            "Partner": "partner",
            "PartnerType": "partnerType",
            "Designation": "designation",
            "Purpose": "purpose",
            "Email": "email",
            "Mobile": "mobile",
            "HasPortalAccess": "hasPortalAccess",
            "CreatedBy": "createdBy",
            "CreatedDate": "createdDate",
            "ModifiedBy": "modifiedBy",
            "ModifiedDate": "modifiedDate",
        }
        result = {}
        for db_key, schema_key in mappings.items():
            if db_key in d:
                val = d[db_key]
                if schema_key == 'hasPortalAccess' and val is not None:
                    val = bool(val)
                result[schema_key] = val
        return result
