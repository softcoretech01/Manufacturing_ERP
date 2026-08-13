from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
import datetime

class DefectRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row) -> Dict[str, Any]:
        result = {}
        for column in row._mapping.keys():
            val = getattr(row, column)
            if column == "Uid":
                result["id"] = val
            if isinstance(val, datetime.datetime):
                result[column[:1].lower() + column[1:]] = val.isoformat()
            elif isinstance(val, bytes):
                result[column[:1].lower() + column[1:]] = val != b'\x00'
            else:
                result[column[:1].lower() + column[1:]] = val
        return result

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextDefectCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def get_all(self) -> List[Dict[str, Any]]:
        query = text("CALL SpDefect('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(row) for row in result.fetchall()]

    async def get_by_id(self, uid: str) -> Dict[str, Any]:
        query = text("CALL SpDefect('READ', :uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query, {'uid': uid})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def create(self, uid: str, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpDefect(
                'CREATE', :uid, :code, :name, :category, :stage, 
                :severity, :disposition, :reworkable, 
                :effectiveFrom, :effectiveTo, :isActive, :modifiedBy
            )
        """)
        params = {
            'uid': uid,
            'code': data.get('code'),
            'name': data.get('name'),
            'category': data.get('category'),
            'stage': data.get('stage'),
            'severity': data.get('severity'),
            'disposition': data.get('disposition'),
            'reworkable': data.get('reworkable', False),
            'effectiveFrom': data.get('effectiveFrom'),
            'effectiveTo': data.get('effectiveTo'),
            'isActive': data.get('isActive', True),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def update(self, uid: str, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpDefect(
                'UPDATE', :uid, :code, :name, :category, :stage, 
                :severity, :disposition, :reworkable, 
                :effectiveFrom, :effectiveTo, :isActive, :modifiedBy
            )
        """)
        params = {
            'uid': uid,
            'code': data.get('code'),
            'name': data.get('name'),
            'category': data.get('category'),
            'stage': data.get('stage'),
            'severity': data.get('severity'),
            'disposition': data.get('disposition'),
            'reworkable': data.get('reworkable', False),
            'effectiveFrom': data.get('effectiveFrom'),
            'effectiveTo': data.get('effectiveTo'),
            'isActive': data.get('isActive', True),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def delete(self, uid: str, current_user: str) -> None:
        query = text("CALL SpDefect('DELETE', :uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :modifiedBy)")
        await self.db.execute(query, {'uid': uid, 'modifiedBy': current_user})
        await self.db.commit()
