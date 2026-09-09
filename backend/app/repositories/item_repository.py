from collections.abc import Sequence
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict

# Every statement here is schema-qualified to ERP_Master on purpose.
#
# `SpItem` and `ItemUomConversion` exist in BOTH admin_erp and ERP_Master, and the
# procedure body references an unqualified `Item`. Because the connection's default
# database is admin_erp (DB_NAME), unqualified calls resolved to admin_erp.Item --
# 5 UI test rows ("Steel", "Book", "test") -- while every BOM, routing and standard
# cost in ERP_Product references ERP_Master.Item (23 real rows). The product pickers
# on the BOM and BOM-explorer screens were therefore always empty: the intersection
# of "items the API returns" and "products with a BOM" was zero.
#
# Qualify all of them together. Repointing SpItem alone would leave UOM conversion
# rows keyed to the other schema's item ids.

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

    async def get_all_items(
        self, item_types: Sequence[str] | None = None
    ) -> list[dict[str, Any]]:
        """Active items, optionally narrowed to a set of ItemType values.

        With no filter this is `SpItem('LIST')` exactly as before, so every
        existing caller is untouched.

        With a filter it runs the same query the procedure's LIST branch runs
        (`SELECT * FROM Item WHERE IsDeleted = 0 ORDER BY Id DESC`) plus an
        `ItemType IN (...)` clause. The procedure takes 47 positional arguments
        and has no filter parameter, so narrowing it would mean rewriting it and
        re-testing every caller for a clause the query can carry itself. The
        filter still runs in the database, not in Python.
        """
        if item_types is None:
            stmt = text("CALL ERP_Master.SpItem('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
            result = await self.session.execute(stmt)
        elif not item_types:
            # An explicit empty set means "nothing qualifies". Returning the full
            # list here would silently defeat the filter.
            return []
        else:
            result = await self.session.execute(
                text("SELECT * FROM ERP_Master.Item"
                     " WHERE IsDeleted = 0 AND ItemType IN :types"
                     " ORDER BY Id DESC").bindparams(types=tuple(item_types)))

        rows = result.mappings().fetchall()

        items = [self._parse_row(row) for row in rows]

        if items:
            # Fetch all conversions
            conv_stmt = text("SELECT * FROM ERP_Master.ItemUomConversion")
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
            CALL ERP_Master.SpItem(
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
                INSERT INTO ERP_Master.ItemUomConversion (ItemId, Uom, Factor, Purpose)
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
        stmt = text("CALL ERP_Master.SpItem('READ', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.session.execute(stmt, {'id': item_id})
        row = result.mappings().fetchone()
        
        if not row:
            return None
            
        item = self._parse_row(row)
        
        conv_stmt = text("SELECT * FROM ERP_Master.ItemUomConversion WHERE ItemId = :item_id")
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
            CALL ERP_Master.SpItem(
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
        
        del_stmt = text("DELETE FROM ERP_Master.ItemUomConversion WHERE ItemId = :item_id")
        await self.session.execute(del_stmt, {'item_id': item_id})
        
        if uom_conversions:
            insert_stmt = text("""
                INSERT INTO ERP_Master.ItemUomConversion (ItemId, Uom, Factor, Purpose)
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
        stmt = text("CALL ERP_Master.SpItem('DELETE', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :user)")
        await self.session.execute(stmt, {'id': item_id, 'user': user_id})
        await self.session.commit()
