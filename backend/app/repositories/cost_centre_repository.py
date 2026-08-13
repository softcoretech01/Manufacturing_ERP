from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
import datetime

class CostCentreRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row) -> Dict[str, Any]:
        result = {}
        for column in row._mapping.keys():
            val = getattr(row, column)
            if isinstance(val, datetime.datetime):
                result[column[:1].lower() + column[1:]] = val.isoformat()
            elif isinstance(val, datetime.date):
                result[column[:1].lower() + column[1:]] = val.isoformat()
            elif isinstance(val, bytes):
                result[column[:1].lower() + column[1:]] = val != b'\x00'
            elif column in ('Budget', 'Actual') and val is not None:
                result[column[:1].lower() + column[1:]] = float(val)
            else:
                result[column[:1].lower() + column[1:]] = val
        return result

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextCostCentreCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def get_all(self) -> List[Dict[str, Any]]:
        query = text("CALL SpCostCentre('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(row) for row in result.fetchall()]

    async def get_by_id(self, id: int) -> Dict[str, Any]:
        query = text("CALL SpCostCentre('READ', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query, {'id': id})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def create(self, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpCostCentre(
                'CREATE', NULL, :code, :name, :type, :parentId, :owner,
                :budget, :actual, :validFrom, :validTo, :isPostable,
                :status, :modifiedBy
            )
        """)
        params = {
            'code': data.get('code'),
            'name': data.get('name'),
            'type': data.get('type'),
            'parentId': data.get('parentId'),
            'owner': data.get('owner'),
            'budget': data.get('budget', 0),
            'actual': data.get('actual', 0),
            'validFrom': data.get('validFrom'),
            'validTo': data.get('validTo'),
            'isPostable': data.get('isPostable', True),
            'status': data.get('status', 'ACTIVE'),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def update(self, id: int, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpCostCentre(
                'UPDATE', :id, :code, :name, :type, :parentId, :owner,
                :budget, :actual, :validFrom, :validTo, :isPostable,
                :status, :modifiedBy
            )
        """)
        params = {
            'id': id,
            'code': data.get('code'),
            'name': data.get('name'),
            'type': data.get('type'),
            'parentId': data.get('parentId'),
            'owner': data.get('owner'),
            'budget': data.get('budget', 0),
            'actual': data.get('actual', 0),
            'validFrom': data.get('validFrom'),
            'validTo': data.get('validTo'),
            'isPostable': data.get('isPostable', True),
            'status': data.get('status', 'ACTIVE'),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def delete(self, id: int, current_user: str) -> None:
        query = text("CALL SpCostCentre('DELETE', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :modifiedBy)")
        await self.db.execute(query, {'id': id, 'modifiedBy': current_user})
        await self.db.commit()
