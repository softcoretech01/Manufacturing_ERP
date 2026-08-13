from typing import Any, List, Dict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import json

class EngineeringDocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _parse_row(self, row: Any) -> dict[str, Any]:
        data = dict(row)
        for key, value in data.items():
            if hasattr(value, 'isoformat'):
                data[key] = value.isoformat()
        
        # Map Id to uid
        data["uid"] = str(data.get("Id")) if data.get("Id") is not None else None
        
        # Map DB column names to Schema field names
        mapping = {
            "DocumentCode": "code",
            "Title": "title",
            "DocType": "docType",
            "ProductCode": "productCode",
            "Revision": "revision",
            "FileName": "fileName",
            "SizeKb": "sizeKb",
            "Status": "status",
            "ApprovedBy": "approvedBy",
            "ApprovedOn": "approvedOn",
            "Remarks": "remarks",
            "Version": "version",
            "CreatedBy": "createdBy",
            "CreatedDate": "createdDate",
            "ModifiedBy": "modifiedBy",
            "ModifiedDate": "modifiedDate",
            "DeletedAt": "deletedAt"
        }
        
        result = {}
        for db_key, schema_key in mapping.items():
            result[schema_key] = data.get(db_key)
            
        result["uid"] = data["uid"]
        # Alias for frontend
        result["uploadedBy"] = data.get("CreatedBy")
        result["uploadedOn"] = data.get("CreatedDate")
        return result

    async def get_next_code(self) -> dict[str, str]:
        stmt = text("SELECT IFNULL(MAX(CAST(SUBSTRING(DocumentCode, 5) AS UNSIGNED)), 0) + 1 AS nextNum FROM ERP_Product.EngineeringDocument WHERE DocumentCode LIKE 'DOC-%'")
        result = await self.session.execute(stmt)
        row = result.mappings().fetchone()
        next_num = int(row['nextNum']) if row and row['nextNum'] else 1
        return {"nextCode": f"DOC-{next_num:04d}"}

    async def get_all_documents(self) -> list[dict[str, Any]]:
        # The stored procedure expects 15 parameters
        stmt = text("CALL ERP_Product.SpManageEngineeringDocument('SELECT', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        return [self._parse_row(row) for row in rows]

    async def get_document_by_id(self, doc_id: int) -> dict[str, Any]:
        stmt = text("CALL ERP_Product.SpManageEngineeringDocument('SELECT', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(stmt, {'id': doc_id})
        row = result.mappings().fetchone()
        if not row:
            return None
        return self._parse_row(row)

    async def execute_sp(self, action: str, data: dict, doc_id: int = None, user_id: str = "System"):
        # Map schema fields back to SP arguments (15 args)
        args = {
            'action': action,
            'id': doc_id,
            'code': data.get('code'),
            'title': data.get('title'),
            'doctype': data.get('docType'),
            'productcode': data.get('productCode'),
            'revision': data.get('revision'),
            'filename': data.get('fileName'),
            'sizekb': data.get('sizeKb'),
            'status': data.get('status'),
            'approvedby': data.get('approvedBy'),
            'approvedon': data.get('approvedOn'),
            'remarks': data.get('remarks'),
            'version': data.get('version'),
            'createdby': user_id
        }
        
        stmt = text("""CALL ERP_Product.SpManageEngineeringDocument(
            :action, :id, :code, :title, :doctype, :productcode, :revision, 
            :filename, :sizekb, :status, :approvedby, :approvedon, :remarks, :version, :createdby
        )""")
        result = await self.session.execute(stmt, args)
        row = result.mappings().fetchone()
        
        # SP returns Id and DocumentCode
        new_id = row["Id"] if row else doc_id
        return new_id
