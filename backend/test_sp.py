import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from app.core.config import settings

async def test():
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine)
    async with Session() as session:
        try:
            res = await session.execute(text("CALL SpInsertTransporter('TRN-9999', 'Test', 'ACTIVE', '2023-01-01', None, '12345', 'ROAD', False, 0, None, None)"))
            print("ROWS RETURNED?", res.returns_rows)
            print("FETCHONE:", res.mappings().fetchone())
        except Exception as e:
            print("EXCEPTION:", repr(e))

asyncio.run(test())
