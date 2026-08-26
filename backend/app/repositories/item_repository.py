from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict

class ItemRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _parse_row(self, row: Any) -> dict[str, Any]:
        data = dict(row)
        for key, value in data.items():
            if hasattr(value, 'isoformat'):
                data[key] = value.isoformat()
        
        # Lowercase first letter for camelCase to match TS interface
        return {k[0].lower() + k[1:]: v for k, v in data.items()}

    async def get_all_items(self) -> list[dict[str, Any]]:
        stmt = text("CALL SpItem('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        
        items = [self._parse_row(row) for row in rows]
        
        if items:
            # Fetch all conversions
            conv_stmt = text("SELECT * FROM ItemUomConversion")
            conv_result = await self.session.execute(conv_stmt)
            conv_rows = conv_result.mappings().fetchall()
            
            conv_map = defaultdict(list)
            for row in conv_rows:
                r = dict(row)
                conv_map[r['ItemId']].append({
                    "uom": r['Uom'],
                    "factor": float(r['Factor']),
                    "purpose": r['Purpose']
                })
                
            for item in items:
                item['uomConversions'] = conv_map.get(item['id'], [])
                item['revisions'] = []
                item['whereUsed'] = []
                
        return items

    async def get_next_code(self) -> dict[str, str]:
        stmt = text("CALL SpGetNextItemCode()")
        result = await self.session.execute(stmt)
        row = result.mappings().fetchone()
        return {"nextCode": row["nextCode"]} if row else {"nextCode": ""}

    async def create_item(self, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        uom_conversions = data.pop('uomConversions', [])
        
        stmt = text("""
            CALL SpItem(
                'CREATE', NULL, :code, :name, :shortName, :itemType, :category, :family, :series,
                :baseUom, :purchaseUom, :salesUom, :hsnCode, :gstRate,
                :capacityMl, :bottleModel, :colour, :finishType, :lidType, :steelGrade, :thicknessMm, :isVacuumInsulated, :netWeightG,
                :isBatchTracked, :isSerialTracked, :shelfLifeDays, :valuationMethod,
                :standardCost, :lastPurchaseRate, :sellingPrice, :reorderLevel, :reorderQty, :minStock, :maxStock, :leadTimeDays,
                :requiresIncomingInspection, :inspectionPlanCode, :drawingNo, :specification,
                :isPurchased, :isManufactured, :isSold, :preferredSupplier,
                :status, :effectiveFrom, :effectiveTo, :user
            )
        """)
        params = {**data, 'user': user_id}
        result = await self.session.execute(stmt, params)
        row = result.mappings().fetchone()
        if not row:
            raise Exception("Failed to create Item")
            
        item_id = row['Id']
        
        if uom_conversions:
            insert_stmt = text("""
                INSERT INTO ItemUomConversion (ItemId, Uom, Factor, Purpose)
                VALUES (:item_id, :uom, :factor, :purpose)
            """)
            for conv in uom_conversions:
                await self.session.execute(insert_stmt, {
                    'item_id': item_id,
                    'uom': conv['uom'],
                    'factor': conv['factor'],
                    'purpose': conv['purpose']
                })
        
        await self.session.commit()
        return await self.get_item_by_id(item_id)
        
    async def get_item_by_id(self, item_id: int) -> dict[str, Any]:
        stmt = text("CALL SpItem('READ', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(stmt, {'id': item_id})
        row = result.mappings().fetchone()
        
        if not row:
            return None
            
        item = self._parse_row(row)
        
        conv_stmt = text("SELECT * FROM ItemUomConversion WHERE ItemId = :item_id")
        conv_result = await self.session.execute(conv_stmt, {'item_id': item_id})
        conv_rows = conv_result.mappings().fetchall()
        
        item['uomConversions'] = [{
            "uom": r['Uom'],
            "factor": float(r['Factor']),
            "purpose": r['Purpose']
        } for r in conv_rows]
        item['revisions'] = []
        item['whereUsed'] = []
        
        return item

    async def update_item(self, item_id: int, data: dict[str, Any], user_id: str) -> dict[str, Any]:
        uom_conversions = data.pop('uomConversions', [])
        
        stmt = text("""
            CALL SpItem(
                'UPDATE', :id, :code, :name, :shortName, :itemType, :category, :family, :series,
                :baseUom, :purchaseUom, :salesUom, :hsnCode, :gstRate,
                :capacityMl, :bottleModel, :colour, :finishType, :lidType, :steelGrade, :thicknessMm, :isVacuumInsulated, :netWeightG,
                :isBatchTracked, :isSerialTracked, :shelfLifeDays, :valuationMethod,
                :standardCost, :lastPurchaseRate, :sellingPrice, :reorderLevel, :reorderQty, :minStock, :maxStock, :leadTimeDays,
                :requiresIncomingInspection, :inspectionPlanCode, :drawingNo, :specification,
                :isPurchased, :isManufactured, :isSold, :preferredSupplier,
                :status, :effectiveFrom, :effectiveTo, :user
            )
        """)
        params = {**data, 'id': item_id, 'user': user_id}
        await self.session.execute(stmt, params)
        
        del_stmt = text("DELETE FROM ItemUomConversion WHERE ItemId = :item_id")
        await self.session.execute(del_stmt, {'item_id': item_id})
        
        if uom_conversions:
            insert_stmt = text("""
                INSERT INTO ItemUomConversion (ItemId, Uom, Factor, Purpose)
                VALUES (:item_id, :uom, :factor, :purpose)
            """)
            for conv in uom_conversions:
                await self.session.execute(insert_stmt, {
                    'item_id': item_id,
                    'uom': conv['uom'],
                    'factor': conv['factor'],
                    'purpose': conv['purpose']
                })
        
        await self.session.commit()
        return await self.get_item_by_id(item_id)

    async def delete_item(self, item_id: int, user_id: str) -> None:
        stmt = text("CALL SpItem('DELETE', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :user)")
        await self.session.execute(stmt, {'id': item_id, 'user': user_id})
        await self.session.commit()
