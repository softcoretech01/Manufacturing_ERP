from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
import datetime
import json

class EmployeeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row) -> Dict[str, Any]:
        result = {}
        for column in row._mapping.keys():
            val = getattr(row, column)
            if column == "Uid":
                result["id"] = val
            elif column == "Code":
                result["employeeCode"] = val
                result["code"] = val
            if isinstance(val, datetime.datetime):
                result[column[:1].lower() + column[1:]] = val.isoformat()
            elif isinstance(val, bytes):
                result[column[:1].lower() + column[1:]] = val != b'\x00'
            elif column in ['Skills', 'Revisions', 'WhereUsed'] and val:
                try:
                    result[column[:1].lower() + column[1:]] = json.loads(val) if isinstance(val, str) else val
                except:
                    result[column[:1].lower() + column[1:]] = []
            else:
                result[column[:1].lower() + column[1:]] = val
        return result

    async def get_next_code(self) -> Dict[str, str]:
        query = text("CALL SpGetNextEmployeeCode()")
        result = await self.db.execute(query)
        row = result.fetchone()
        return {"nextCode": row.nextCode}

    async def get_all(self) -> List[Dict[str, Any]]:
        query = text("CALL SpEmployee('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(row) for row in result.fetchall()]

    async def get_by_id(self, uid: str) -> Dict[str, Any]:
        query = text("CALL SpEmployee('READ', :uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query, {'uid': uid})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def create(self, uid: str, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpEmployee(
                'CREATE', :uid, :code, :name, :designation, :department, :grade, :employmentType, 
                :dateOfJoining, :dateOfBirth, :gender, :bloodGroup, :mobile, :email, 
                :reportsTo, :plantUid, :costCentre, :shiftCode, :skills, :pfNumber, 
                :esiNumber, :uanNumber, :aadhaarMasked, :panMasked, :bankAccountMasked, 
                :isShopFloor, :status, :revisions, :whereUsed, :effectiveFrom, :effectiveTo, 
                :modifiedBy
            )
        """)
        params = {
            'uid': uid,
            'code': data.get('code') or data.get('employeeCode'),
            'name': data.get('name'),
            'designation': data.get('designation'),
            'department': data.get('department'),
            'grade': data.get('grade'),
            'employmentType': data.get('employmentType'),
            'dateOfJoining': data.get('dateOfJoining'),
            'dateOfBirth': data.get('dateOfBirth'),
            'gender': data.get('gender'),
            'bloodGroup': data.get('bloodGroup'),
            'mobile': data.get('mobile'),
            'email': data.get('email'),
            'reportsTo': data.get('reportsTo'),
            'plantUid': data.get('plantUid'),
            'costCentre': data.get('costCentre'),
            'shiftCode': data.get('shiftCode'),
            'skills': json.dumps(data.get('skills', [])),
            'pfNumber': data.get('pfNumber'),
            'esiNumber': data.get('esiNumber'),
            'uanNumber': data.get('uanNumber'),
            'aadhaarMasked': data.get('aadhaarMasked'),
            'panMasked': data.get('panMasked'),
            'bankAccountMasked': data.get('bankAccountMasked'),
            'isShopFloor': data.get('isShopFloor', False),
            'status': data.get('status', 'ACTIVE'),
            'revisions': json.dumps(data.get('revisions', [])),
            'whereUsed': json.dumps(data.get('whereUsed', [])),
            'effectiveFrom': data.get('effectiveFrom') or datetime.datetime.now().isoformat(),
            'effectiveTo': data.get('effectiveTo'),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def update(self, uid: str, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpEmployee(
                'UPDATE', :uid, :code, :name, :designation, :department, :grade, :employmentType, 
                :dateOfJoining, :dateOfBirth, :gender, :bloodGroup, :mobile, :email, 
                :reportsTo, :plantUid, :costCentre, :shiftCode, :skills, :pfNumber, 
                :esiNumber, :uanNumber, :aadhaarMasked, :panMasked, :bankAccountMasked, 
                :isShopFloor, :status, :revisions, :whereUsed, :effectiveFrom, :effectiveTo, 
                :modifiedBy
            )
        """)
        params = {
            'uid': uid,
            'code': data.get('code') or data.get('employeeCode'),
            'name': data.get('name'),
            'designation': data.get('designation'),
            'department': data.get('department'),
            'grade': data.get('grade'),
            'employmentType': data.get('employmentType'),
            'dateOfJoining': data.get('dateOfJoining'),
            'dateOfBirth': data.get('dateOfBirth'),
            'gender': data.get('gender'),
            'bloodGroup': data.get('bloodGroup'),
            'mobile': data.get('mobile'),
            'email': data.get('email'),
            'reportsTo': data.get('reportsTo'),
            'plantUid': data.get('plantUid'),
            'costCentre': data.get('costCentre'),
            'shiftCode': data.get('shiftCode'),
            'skills': json.dumps(data.get('skills', [])),
            'pfNumber': data.get('pfNumber'),
            'esiNumber': data.get('esiNumber'),
            'uanNumber': data.get('uanNumber'),
            'aadhaarMasked': data.get('aadhaarMasked'),
            'panMasked': data.get('panMasked'),
            'bankAccountMasked': data.get('bankAccountMasked'),
            'isShopFloor': data.get('isShopFloor', False),
            'status': data.get('status', 'ACTIVE'),
            'revisions': json.dumps(data.get('revisions', [])),
            'whereUsed': json.dumps(data.get('whereUsed', [])),
            'effectiveFrom': data.get('effectiveFrom') or datetime.datetime.now().isoformat(),
            'effectiveTo': data.get('effectiveTo'),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None

    async def delete(self, uid: str, current_user: str) -> None:
        query = text("CALL SpEmployee('DELETE', :uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :modifiedBy)")
        await self.db.execute(query, {'uid': uid, 'modifiedBy': current_user})
        await self.db.commit()
