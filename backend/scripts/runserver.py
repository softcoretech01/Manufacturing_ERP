"""Dev server entrypoint.

Runs uvicorn with the asyncio selector loop, which aiomysql requires on Windows.
    python scripts/runserver.py
Then open http://localhost:8000/docs
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

from app.main import app

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port, loop="asyncio", log_level="info")
