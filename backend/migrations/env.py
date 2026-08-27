"""Alembic environment. Runs synchronously (pymysql) — Alembic is not async.
The target metadata is the full app metadata registered via app.models."""

from __future__ import annotations

import os
from logging.config import fileConfig

# pyrefly: ignore [missing-import]
from alembic import context 
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.models import Base

# A dedicated URL (used by the migration up/down test) takes precedence over the
# app's configured database, so migrations can be exercised on a throwaway DB.
# NOTE: the URL is used to build the engine directly and is NEVER pushed through
# alembic's ConfigParser — a URL-encoded password (e.g. %40) would otherwise be
# mistaken for ConfigParser interpolation syntax and blow up.
_DB_URL = os.getenv("ALEMBIC_DATABASE_URL", settings.sync_database_url)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=_DB_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_DB_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
