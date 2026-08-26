from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import json

class EngineeringProductRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _parse_row(self, row: Any) -> dict[str, Any]:
        data = dict(row)
        for key, value in data.items():
            if hasattr(value, 'isoformat'):
                data[key] = value.isoformat()
        
        return data

    async def get_next_code(self) -> dict[str, str]:
        stmt = text("SELECT IFNULL(MAX(CAST(SUBSTRING(ProductCode, 5) AS UNSIGNED)), 0) + 1 AS nextNum FROM ERP_Product.Product WHERE ProductCode LIKE 'PRD-%'")
        result = await self.session.execute(stmt)
        row = result.mappings().fetchone()
        next_num = int(row['nextNum']) if row and row['nextNum'] else 1
        return {"nextCode": f"PRD-{next_num:04d}"}

    async def get_all_products(self) -> list[dict[str, Any]]:
        stmt = text("CALL ERP_Product.SpManageProduct('SELECT_ALL', '{}')")
        result = await self.session.execute(stmt)
        rows = result.mappings().fetchall()
        
        products = []
        for row in rows:
            data = self._parse_row(row)
            # Reconstruct the spec object
            spec = {
                "id": str(data.get("spec_id")) if data.get("spec_id") is not None else None,
                "materialGrade": data.get("spec_materialGrade"),
                "thicknessMm": data.get("spec_thicknessMm"),
                "diameterMm": data.get("spec_diameterMm"),
                "heightMm": data.get("spec_heightMm"),
                "neckDiameterMm": data.get("spec_neckDiameterMm"),
                "baseDiameterMm": data.get("spec_baseDiameterMm"),
                "capacityMl": data.get("spec_capacityMl"),
                "wallThicknessMm": data.get("spec_wallThicknessMm"),
                "vacuumType": data.get("spec_vacuumType"),
                "insulationType": data.get("spec_insulationType"),
                "coatingType": data.get("spec_coatingType"),
                "paintSpec": data.get("spec_paintSpec"),
                "surfaceFinish": data.get("spec_surfaceFinish"),
                "logoSpec": data.get("spec_logoSpec"),
                "printingMethod": data.get("spec_printingMethod"),
                "packagingStandard": data.get("spec_packagingStandard"),
            }
            # Remove spec fields from main product
            clean_product = {k: v for k, v in data.items() if not k.startswith("spec_")}
            clean_product["uid"] = str(clean_product.pop("id")) if clean_product.get("id") is not None else None
            clean_product["spec"] = spec
            products.append(clean_product)
            
        return products

    async def create_product(self, payload: str) -> tuple[str, str]:
        stmt = text("CALL ERP_Product.SpManageProduct('INSERT', :payload)")
        result = await self.session.execute(stmt, {'payload': payload})
        row = result.mappings().fetchone()
        
        # The SP returns the generated ProductCode and Id
        product_code = row["ProductCode"] if row else None
        product_id = str(row["Id"]) if row else None
        return product_id, product_code

    async def update_product(self, payload: str) -> None:
        stmt = text("CALL ERP_Product.SpManageProduct('UPDATE', :payload)")
        await self.session.execute(stmt, {'payload': payload})

    async def delete_product(self, payload: str) -> None:
        stmt = text("CALL ERP_Product.SpManageProduct('DELETE', :payload)")
        await self.session.execute(stmt, {'payload': payload})
