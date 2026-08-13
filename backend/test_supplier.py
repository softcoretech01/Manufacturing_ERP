import asyncio
import json
from datetime import datetime
from app.db.session import async_session
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.supplier import SupplierCreateSchema, SupplierAddressSchema

async def main():
    async with async_session() as session:
        repo = SupplierRepository(session)
        
        # Test Create
        print("Testing CREATE...")
        schema = SupplierCreateSchema(
            name="Test Supplier",
            shortName="TS",
            status="ACTIVE",
            effectiveFrom=datetime.now(),
            companyUid="C1234567890123456789012345",
            legalName="Test Supplier Pvt Ltd",
            vendorType="TRADER",
            category="Standard",
            gstRegistrationType="UNREGISTERED",
            paymentTermsCode="PT-30D",
            addresses=[SupplierAddressSchema(
                type="BILLING", label="HQ", line1="123", city="Bangalore", state="KA", pincode="560001"
            )]
        )
        created = await repo.create_supplier(schema, "Tester")
        print(f"Created Supplier: {created['Id']}")
        print(f"Addresses: {created['addresses']}")
        
        # Test List
        print("Testing LIST...")
        all_sup = await repo.get_all_suppliers()
        print(f"Total suppliers: {len(all_sup)}")
        
        # Test Read
        print("Testing READ...")
        sup = await repo.get_supplier_by_id(created['Id'])
        print(f"Read supplier: {sup['Code']}")
        
        # Test Update
        # ...
        
        # Test Delete
        print("Testing DELETE...")
        await repo.delete_supplier(created['Id'], "Tester")
        all_sup_after = await repo.get_all_suppliers()
        print(f"Total suppliers after delete: {len(all_sup_after)}")

asyncio.run(main())
