from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

class EngineeringBomRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _parse_row(self, row: Any) -> dict[str, Any]:
        data = dict(row)
        for key, value in data.items():
            if hasattr(value, 'isoformat'):
                data[key] = value.isoformat()
        
        # Map DB column names to Schema field names
        mapping = {
            "Id": "uid",
            "DocNo": "docNo",
            "ProductCode": "productCode",
            "ProductName": "productName",
            "BomType": "bomType",
            "Revision": "revision",
            "Status": "status",
            "BaseQty": "baseQty",
            "Uom": "uom",
            "EffectiveFrom": "effectiveFrom",
            "EffectiveTo": "effectiveTo",
            "IsDefault": "isDefault",
            "AlternateFor": "alternateFor",
            "CreatedBy": "createdBy",
            "CreatedAt": "createdAt",
            "ApprovedBy": "approvedBy",
            "ApprovedAt": "approvedAt",
            "SourceEcn": "sourceEcn",
            "ChangeReason": "changeReason",
            "Version": "version",
            "DeletedAt": "deletedAt"
        }
        
        result = {}
        for db_key, schema_key in mapping.items():
            if db_key in data:
                # Convert ID to string uid for frontend
                if db_key == "Id":
                    result[schema_key] = str(data[db_key]) if data[db_key] is not None else None
                elif db_key == "IsDefault":
                    result[schema_key] = bool(data[db_key])
                elif db_key == "BaseQty":
                    result[schema_key] = float(data[db_key]) if data[db_key] is not None else 0.0
                else:
                    result[schema_key] = data[db_key]
            
        return result

    def _parse_line_row(self, row: Any) -> dict[str, Any]:
        data = dict(row)
        mapping = {
            "Id": "uid",
            "Seq": "seq",
            "ItemCode": "itemCode",
            "ItemName": "itemName",
            "Uom": "uom",
            "QtyPer": "qtyPer",
            "ScrapPct": "scrapPct",
            "IsPhantom": "isPhantom",
            "OperationSeq": "operationSeq",
            "Notes": "notes"
        }
        
        result = {}
        for db_key, schema_key in mapping.items():
            if db_key in data:
                if db_key == "Id":
                    result[schema_key] = str(data[db_key]) if data[db_key] is not None else None
                elif db_key in ("QtyPer", "ScrapPct"):
                    result[schema_key] = float(data[db_key]) if data[db_key] is not None else 0.0
                elif db_key == "IsPhantom":
                    result[schema_key] = bool(data[db_key])
                else:
                    result[schema_key] = data[db_key]
        return result

    async def get_next_code(self) -> dict[str, str]:
        stmt = text("SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 5) AS UNSIGNED)), 0) + 1 AS nextNum FROM ERP_Product.EngineeringBom WHERE DocNo LIKE 'BOM-%'")
        result = await self.session.execute(stmt)
        row = result.mappings().fetchone()
        next_num = int(row['nextNum']) if row and row['nextNum'] else 1
        return {"nextCode": f"BOM-{next_num:04d}"}

    async def get_all_boms(self) -> list[dict[str, Any]]:
        # Fetch all headers
        stmt = text("CALL ERP_Product.SpManageEngineeringBom('SELECT_ALL', NULL, NULL)")
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        
        boms = []
        for row in rows:
            bom = self._parse_row(row)
            # For list view we might not need lines, but the frontend BOM screen filters them and expects lines to be loaded.
            # To be efficient, we'll fetch lines separately and map them.
            bom['lines'] = []
            boms.append(bom)
            
        return boms
        
    async def get_all_boms_with_lines(self) -> list[dict[str, Any]]:
        boms = await self.get_all_boms()
        for bom in boms:
            # Fetch lines for each BOM. (Ideally one query in production, but okay for this scale)
            bom['lines'] = await self.get_bom_lines(int(bom['uid']))
        return boms

    async def get_bom_lines(self, bom_id: int) -> list[dict[str, Any]]:
        stmt = text("CALL ERP_Product.SpManageEngineeringBom('SELECT_LINES', NULL, :id)")
        result = await self.session.execute(stmt, {'id': bom_id})
        rows = result.mappings().fetchall()
        return [self._parse_line_row(row) for row in rows]

    async def get_bom_by_id(self, bom_id: int) -> dict[str, Any]:
        stmt = text("CALL ERP_Product.SpManageEngineeringBom('SELECT_BY_ID', NULL, :id)")
        result = await self.session.execute(stmt, {'id': bom_id})
        row = result.mappings().fetchone()
        if not row:
            return None
        
        bom = self._parse_row(row)
        bom['lines'] = await self.get_bom_lines(bom_id)
        return bom

    async def execute_sp(self, action: str, payload_json: str, bom_id: int = None):
        stmt = text("CALL ERP_Product.SpManageEngineeringBom(:action, :payload, :id)")
        result = await self.session.execute(stmt, {
            'action': action,
            'payload': payload_json,
            'id': bom_id
        })
        
        if action == 'INSERT':
            row = result.mappings().fetchone()
            if row:
                return row["Id"]
        
        return bom_id
