from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any

class EngineeringCostService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def calculate_and_update_cost_rollup(self, item_code: str, user_id: str) -> Dict[str, Any]:
        # 1. Fetch active/default BOM for the item
        bom_sql = text("""
            SELECT Id, BaseQty
            FROM ERP_Product.EngineeringBom
            WHERE ProductCode = :item_code AND Status IN ('ACTIVE', 'APPROVED') AND IsDefault = 1
            ORDER BY Revision DESC
            LIMIT 1
        """)
        bom_result = await self.session.execute(bom_sql, {"item_code": item_code})
        bom_row = bom_result.fetchone()
        
        material_cost = 0.0
        if bom_row:
            bom_id = bom_row[0]
            base_qty = float(bom_row[1]) if bom_row[1] else 1.0
            
            # Fetch BOM lines with component costs
            lines_sql = text("""
                SELECT bl.QtyPer, bl.ScrapPct, i.StandardCost
                FROM ERP_Product.EngineeringBomLine bl
                LEFT JOIN ERP_Master.Item i ON bl.ItemCode = i.Code
                WHERE bl.BomId = :bom_id
            """)
            lines_result = await self.session.execute(lines_sql, {"bom_id": bom_id})
            
            for row in lines_result:
                qty_per = float(row[0]) if row[0] else 0.0
                scrap_pct = float(row[1]) if row[1] else 0.0
                std_cost = float(row[2]) if row[2] else 0.0
                
                # Formula: qty_per / (1 - scrap_pct/100) * std_cost
                effective_qty = qty_per
                if scrap_pct < 100 and scrap_pct > 0:
                    effective_qty = qty_per / (1.0 - (scrap_pct / 100.0))
                
                material_cost += (effective_qty * std_cost) / base_qty

        # 2. Fetch active/default Routing for the item
        routing_sql = text("""
            SELECT Id, CostingLotSize
            FROM ERP_Product.EngineeringRouting
            WHERE ProductCode = :item_code AND Status IN ('ACTIVE', 'APPROVED') AND IsDefault = 1
            ORDER BY Revision DESC
            LIMIT 1
        """)
        routing_result = await self.session.execute(routing_sql, {"item_code": item_code})
        routing_row = routing_result.fetchone()
        
        operation_cost = 0.0
        if routing_row:
            routing_id = routing_row[0]
            lot_size = float(routing_row[1]) if routing_row[1] else 1.0
            
            # Fetch Routing Operations
            ops_sql = text("""
                SELECT op.SetupMinutes, op.CycleSeconds, op.Operators, wc.HourlyRate
                FROM ERP_Product.EngineeringRoutingOperation op
                LEFT JOIN ERP_Product.EngineeringWorkCentre wc ON op.WorkCentreCode = wc.Code
                WHERE op.RoutingId = :routing_id
            """)
            ops_result = await self.session.execute(ops_sql, {"routing_id": routing_id})
            
            for row in ops_result:
                setup_min = float(row[0]) if row[0] else 0.0
                cycle_sec = float(row[1]) if row[1] else 0.0
                operators = int(row[2]) if row[2] else 1
                hourly_rate = float(row[3]) if row[3] else 0.0
                
                # Setup cost is amortised over lot size
                setup_cost = (setup_min / 60.0) * hourly_rate / lot_size
                # Run cost per unit
                run_cost = (cycle_sec / 3600.0) * operators * hourly_rate
                
                operation_cost += setup_cost + run_cost
                
        total_cost = round(material_cost + operation_cost, 2)
        
        # 3. Update the item's standardCost
        update_sql = text("""
            UPDATE ERP_Master.Item 
            SET StandardCost = :total_cost
            WHERE Code = :item_code
        """)
        await self.session.execute(update_sql, {"total_cost": total_cost, "item_code": item_code})
        await self.session.commit()
        
        return {
            "itemCode": item_code,
            "materialCost": round(material_cost, 2),
            "operationCost": round(operation_cost, 2),
            "totalStandardCost": total_cost
        }
