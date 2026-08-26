"""Alembic migration must apply AND roll back cleanly (CLAUDE.md §8 migration
tests). Runs against a throwaway database so it never touches test data."""

from __future__ import annotations

import os

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import BASE_DIR, settings

_MIG_DB = "ssberp_migtest"
_BASE = f"{settings.db_user}:{settings.db_password}@{settings.db_host}:{settings.db_port}"
_MIG_URL = f"mysql+pymysql://{_BASE}/{_MIG_DB}?charset=utf8mb4"


def _alembic_config() -> Config:
    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "migrations"))
    return cfg


@pytest.fixture()
def mig_db():
    server = sa.create_engine(f"mysql+pymysql://{_BASE}/?charset=utf8mb4")
    try:
        with server.connect() as conn:
            conn.execute(sa.text(f"DROP DATABASE IF EXISTS {_MIG_DB}"))
            conn.execute(
                sa.text(
                    f"CREATE DATABASE {_MIG_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
                )
            )
    except Exception:
        pytest.skip("MySQL not reachable / cannot create migration database.")
    os.environ["ALEMBIC_DATABASE_URL"] = _MIG_URL
    yield
    os.environ.pop("ALEMBIC_DATABASE_URL", None)
    with server.connect() as conn:
        conn.execute(sa.text(f"DROP DATABASE IF EXISTS {_MIG_DB}"))
    server.dispose()


def test_migration_upgrade_then_downgrade(mig_db) -> None:
    cfg = _alembic_config()
    engine = sa.create_engine(_MIG_URL)

    command.upgrade(cfg, "head")
    insp = sa.inspect(engine)
    tables = set(insp.get_table_names())
    assert "sys_company" in tables
    assert "sys_branch" in tables
    assert "sys_financial_year" in tables

    command.downgrade(cfg, "base")
    insp = sa.inspect(engine)
    remaining = set(insp.get_table_names()) - {"alembic_version"}
    assert remaining == set(), f"Tables left after downgrade: {remaining}"
    engine.dispose()
