from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
import datetime

class UomRepository:
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
            else:
                result[column[:1].lower() + column[1:]] = val
        return result

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextUomCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def get_all(self) -> List[Dict[str, Any]]:
        query = text("CALL SpUom('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(row) for row in result.fetchall()]

    async def get_by_id(self, id: int) -> Dict[str, Any]:
        query = text("CALL SpUom('READ', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query, {'id': id})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def create(self, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpUom(
                'CREATE', NULL, :code, :name, :symbol, :uomType, :decimals, 
                :isBase, :status, :effectiveFrom, :effectiveTo, :modifiedBy
            )
        """)
        params = {
            'code': data.get('code'),
            'name': data.get('name'),
            'symbol': data.get('symbol'),
            'uomType': data.get('uomType'),
            'decimals': data.get('decimals', 0),
            'isBase': data.get('isBase', False),
            'status': data.get('status', 'ACTIVE'),
            'effectiveFrom': data.get('effectiveFrom'),
            'effectiveTo': data.get('effectiveTo'),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def update(self, id: int, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpUom(
                'UPDATE', :id, :code, :name, :symbol, :uomType, :decimals, 
                :isBase, :status, :effectiveFrom, :effectiveTo, :modifiedBy
            )
        """)
        params = {
            'id': id,
            'code': data.get('code'),
            'name': data.get('name'),
            'symbol': data.get('symbol'),
            'uomType': data.get('uomType'),
            'decimals': data.get('decimals', 0),
            'isBase': data.get('isBase', False),
            'status': data.get('status', 'ACTIVE'),
            'effectiveFrom': data.get('effectiveFrom'),
            'effectiveTo': data.get('effectiveTo'),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def delete(self, id: int, current_user: str) -> None:
        query = text("CALL SpUom('DELETE', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :modifiedBy)")
        await self.db.execute(query, {'id': id, 'modifiedBy': current_user})
        await self.db.commit()
