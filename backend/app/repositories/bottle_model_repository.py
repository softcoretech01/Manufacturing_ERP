from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class BottleModelRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _to_camel(self, data: dict[str, Any]) -> dict[str, Any]:
        """Convert PascalCase DB columns to camelCase for the API."""
        return {k[0].lower() + k[1:]: v for k, v in data.items()}

    async def get_all(self) -> list[dict[str, Any]]:
        stmt = text(
            "CALL SpBottleModel('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
        )
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        return [self._to_camel(dict(r)) for r in rows]

    async def get_by_id(self, record_id: int) -> dict[str, Any] | None:
        stmt = text(
            "CALL SpBottleModel('READ', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
        )
        result = await self.session.execute(stmt, {'id': record_id})
        row = result.mappings().fetchone()
        return self._to_camel(dict(row)) if row else None

    async def create(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        stmt = text("""
            CALL SpBottleModel(
                'CREATE', NULL, :code, :name, :series, :shellShape, :dieSet,
                :odMm, :heightMm, :isVacuum, :launchYear, :status,
                :effectiveFrom, :effectiveTo, :revision, :modifiedBy
            )
        """)
        params = {
            'code': data.get('code'),
            'name': data.get('name'),
            'series': data.get('series'),
            'shellShape': data.get('shellShape'),
            'dieSet': data.get('dieSet'),
            'odMm': data.get('odMm'),
            'heightMm': data.get('heightMm'),
            'isVacuum': 1 if data.get('isVacuum') else 0,
            'launchYear': data.get('launchYear'),
            'status': data.get('status', 'ACTIVE'),
            'effectiveFrom': data.get('effectiveFrom'),
            'effectiveTo': data.get('effectiveTo'),
            'revision': data.get('revision', 1),
            'modifiedBy': user_id,
        }
        result = await self.session.execute(stmt, params)
        row = result.mappings().fetchone()
        await self.session.commit()
        return self._to_camel(dict(row)) if row else {}

    async def update(self, record_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        stmt = text("""
            CALL SpBottleModel(
                'UPDATE', :id, NULL, :name, :series, :shellShape, :dieSet,
                :odMm, :heightMm, :isVacuum, :launchYear, :status,
                :effectiveFrom, :effectiveTo, :revision, :modifiedBy
            )
        """)
        params = {
            'id': record_id,
            'name': data.get('name'),
            'series': data.get('series'),
            'shellShape': data.get('shellShape'),
            'dieSet': data.get('dieSet'),
            'odMm': data.get('odMm'),
            'heightMm': data.get('heightMm'),
            'isVacuum': 1 if data.get('isVacuum') else (0 if 'isVacuum' in data else None),
            'launchYear': data.get('launchYear'),
            'status': data.get('status'),
            'effectiveFrom': data.get('effectiveFrom'),
            'effectiveTo': data.get('effectiveTo'),
            'revision': data.get('revision'),
            'modifiedBy': user_id,
        }
        result = await self.session.execute(stmt, params)
        row = result.mappings().fetchone()
        await self.session.commit()
        return self._to_camel(dict(row)) if row else {}

    async def delete(self, record_id: int, user_id: str) -> None:
        stmt = text(
            "CALL SpBottleModel('DELETE', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :user)"
        )
        await self.session.execute(stmt, {'id': record_id, 'user': user_id})
        await self.session.commit()

    async def get_next_code(self) -> dict[str, str]:
        stmt = text("CALL SpGetNextBottleModelCode()")
        result = await self.session.execute(stmt)
        row = result.mappings().fetchone()
        return {'nextCode': row['NextCode']} if row else {'nextCode': 'MDL-0001'}
