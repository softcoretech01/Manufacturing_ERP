import asyncio
from app.core.database import session_scope
from sqlalchemy import text

async def run():
    async with session_scope() as session:
        print("--- inv_stock_txn ---")
        txns = await session.execute(text("SELECT id, txn_type, document_no, status FROM inv_stock_txn"))
        for t in txns.fetchall():
            print(t)
            
        print("\n--- inv_stock_ledger ---")
        ledgers = await session.execute(text("SELECT id, item_id, movement_type, direction, quantity, document_type, document_no FROM inv_stock_ledger"))
        for l in ledgers.fetchall():
            print(l)
            
        print("\n--- inv_stock_balance ---")
        balances = await session.execute(text("SELECT id, item_id, quantity, value FROM inv_stock_balance"))
        for b in balances.fetchall():
            print(b)
            
        print("\n--- ERP_Procurement.Grn ---")
        grns = await session.execute(text("SELECT Id, DocNo, Status FROM ERP_Procurement.Grn"))
        for g in grns.fetchall():
            print(g)
            
asyncio.run(run())
