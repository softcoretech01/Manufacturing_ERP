from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
import datetime

class ShiftRepository:
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
        query = text("CALL SpGetNextShiftCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def get_shifts(self) -> List[Dict[str, Any]]:
        query = text("CALL SpShift('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(r) for r in result.fetchall()]

    async def get_shift_by_id(self, uid: str) -> Dict[str, Any]:
        query = text("CALL SpShift('READ', :uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query, {'uid': uid})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def create_shift(self, shift_data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpShift(
                'CREATE',
                :uid,
                :code,
                :name,
                :startTime,
                :endTime,
                :breakMinutes,
                :netHours,
                :crossesMidnight,
                :nightAllowance,
                :effectiveFrom,
                :effectiveTo,
                :isActive,
                :modifiedBy
            )
        """)
        
        params = {
            'uid': shift_data.get('uid'),
            'code': shift_data.get('code'),
            'name': shift_data.get('name'),
            'startTime': shift_data.get('startTime'),
            'endTime': shift_data.get('endTime'),
            'breakMinutes': shift_data.get('breakMinutes'),
            'netHours': shift_data.get('netHours'),
            'crossesMidnight': 1 if shift_data.get('crossesMidnight') else 0,
            'nightAllowance': 1 if shift_data.get('nightAllowance') else 0,
            'effectiveFrom': shift_data.get('effectiveFrom'),
            'effectiveTo': shift_data.get('effectiveTo'),
            'isActive': 1 if shift_data.get('isActive') else 0,
            'modifiedBy': current_user
        }
        
        result = await self.db.execute(query, params)
        await self.db.commit()
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def update_shift(self, uid: str, shift_data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpShift(
                'UPDATE',
                :uid,
                :code,
                :name,
                :startTime,
                :endTime,
                :breakMinutes,
                :netHours,
                :crossesMidnight,
                :nightAllowance,
                :effectiveFrom,
                :effectiveTo,
                :isActive,
                :modifiedBy
            )
        """)
        
        params = {
            'uid': uid,
            'code': shift_data.get('code'),
            'name': shift_data.get('name'),
            'startTime': shift_data.get('startTime'),
            'endTime': shift_data.get('endTime'),
            'breakMinutes': shift_data.get('breakMinutes'),
            'netHours': shift_data.get('netHours'),
            'crossesMidnight': 1 if shift_data.get('crossesMidnight') else 0,
            'nightAllowance': 1 if shift_data.get('nightAllowance') else 0,
            'effectiveFrom': shift_data.get('effectiveFrom'),
            'effectiveTo': shift_data.get('effectiveTo'),
            'isActive': 1 if shift_data.get('isActive') else 0,
            'modifiedBy': current_user
        }
        
        result = await self.db.execute(query, params)
        await self.db.commit()
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def delete_shift(self, uid: str, current_user: str) -> bool:
        query = text("""
            CALL SpShift(
                'DELETE',
                :uid,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                :modifiedBy
            )
        """)
        
        await self.db.execute(query, {'uid': uid, 'modifiedBy': current_user})
        await self.db.commit()
        return True
