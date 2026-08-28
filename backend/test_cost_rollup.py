import asyncio
from app.core.database import SessionLocal
from sqlalchemy import text

async def main():
    async with SessionLocal() as db:
        res = await db.execute(text("SELECT * FROM ERP_Product.EngineeringBom LIMIT 1"))
        print(res.fetchone())

asyncio.run(main())
