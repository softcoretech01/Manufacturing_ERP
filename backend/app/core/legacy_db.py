"""Shared raw-pymysql connection for the stored-procedure routers.

Several routers predate the async SQLAlchemy layer and talk to MySQL directly so
they can call multi-result-set procedures. They each used to open their own
connection with the production host, root user and password written into the
source as literal defaults — thirteen copies of the same credentials, none of
which honoured the application's configured database.

They now all come through here, and the credentials come from settings (env /
.env) like every other connection in the application. Nothing secret is written
in code.

This is a bridge, not a pattern to extend: new endpoints should use the async
session. When those routers are migrated, this module goes with them.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pymysql
from pymysql.constants import CLIENT

from app.core.config import settings

# These routers read procurement's own database, which is separate from the
# application schema the ORM connects to.
PROCUREMENT_DB = "ERP_Procurement"


def get_connection(database: str = PROCUREMENT_DB, *, multi_statements: bool = True):
    """Open a raw connection using the configured credentials."""
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=database,
        cursorclass=pymysql.cursors.DictCursor,
        client_flag=CLIENT.MULTI_STATEMENTS if multi_statements else 0,
    )


def legacy_db_config(database: str = PROCUREMENT_DB, *, multi_statements: bool = True) -> dict[str, Any]:
    """Connection kwargs for routers that keep a module-level ``DB_CONFIG`` dict
    and call ``pymysql.connect(**DB_CONFIG)`` per request."""
    cfg: dict[str, Any] = {
        "host": settings.db_host,
        "port": settings.db_port,
        "user": settings.db_user,
        "password": settings.db_password,
        "database": database,
        "cursorclass": pymysql.cursors.DictCursor,
    }
    if multi_statements:
        cfg["client_flag"] = CLIENT.MULTI_STATEMENTS
    return cfg


def decimal_default(obj: Any) -> float:
    """JSON encoder hook — MySQL DECIMAL comes back as Decimal."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")
