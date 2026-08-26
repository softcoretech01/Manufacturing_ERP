import asyncio
import redis.asyncio as redis

async def test():
    try:
        r = redis.Redis(host='localhost', port=6379, db=0)
        await r.ping()
        print('Redis connected successfully!')
    except Exception as e:
        print(f"Error connecting to Redis: {e}")

asyncio.run(test())
