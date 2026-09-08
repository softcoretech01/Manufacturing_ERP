import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select
from app.modules.inventory.application.txn_doc_service import TxnDocService
from app.core.context import TenantContext
from app.modules.inventory.infrastructure.txn_models import InvStockTxn

async def main():
    engine = create_async_engine("mysql+aiomysql://root:password@127.0.0.1:3306/erp_dev_db")
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        # Get a txn
        res = await session.execute(text("SELECT uid FROM inv_stock_txn WHERE status = 'POSTED' LIMIT 1"))
        uid = res.scalar()
        if not uid:
            print("No txns")
            return
        
        ctx = TenantContext(company_id=1, user_id=1)
        svc = TxnDocService(session, ctx)
        try:
            print(f"Updating {uid}...")
            txn = (await session.execute(select(InvStockTxn).where(InvStockTxn.uid == uid))).scalar_one()
            
            data = {
                "txn_type": txn.txn_type,
                "txn_date": txn.txn_date,
                "src_warehouse_uid": None, # Will fix if needed
                "lines": [
                    {
                        "item_id": 1,
                        "quantity": 1,
                        "unit_price": 10,
                        "tax_rate": 0
                    }
                ]
            }
            # For simplicity, we just pass the minimum
            await svc.update_transaction(uid, data)
            print("Success")
        except Exception as e:
            import traceback
            traceback.print_exc()

asyncio.run(main())
