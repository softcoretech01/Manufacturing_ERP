"""Application configuration. All settings come from environment variables (V0-NFR-065)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import quote_plus

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Application ────────────────────────────────────────────────────────
    app_name: str = "Stainless Steel Bottle Manufacturing ERP"
    app_env: Literal["dev", "test", "uat", "prod"] = "dev"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me"

    # ─── Database ───────────────────────────────────────────────────────────
    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "ssberp"
    db_user: str = "ssberp"
    db_password: str = "ssberp"
    db_pool_size: int = 20
    db_max_overflow: int = 10
    db_echo: bool = False

    # ─── Redis ──────────────────────────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""

    # ─── JWT ────────────────────────────────────────────────────────────────
    jwt_algorithm: str = "RS256"
    jwt_private_key_path: str = "keys/jwt_private.pem"
    jwt_public_key_path: str = "keys/jwt_public.pem"
    access_token_minutes: int = 15
    refresh_token_hours: int = 12
    permission_cache_seconds: int = 60

    # ─── Security ───────────────────────────────────────────────────────────
    password_min_length: int = 10
    password_history_count: int = 5
    password_max_age_days: int = 90
    max_login_attempts: int = 5
    lockout_minutes: int = 30
    session_idle_minutes: int = 30
    field_encryption_key: str = "0" * 43 + "="

    # ─── Object storage ─────────────────────────────────────────────────────
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "ssberp"
    s3_region: str = "us-east-1"
    max_upload_mb: int = 25

    # ─── Email ──────────────────────────────────────────────────────────────
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = False
    smtp_from: str = "SSB ERP <noreply@ssberp.local>"

    # ─── SMS / WhatsApp ─────────────────────────────────────────────────────
    sms_provider: str = "mock"
    sms_api_key: str = ""
    whatsapp_provider: str = "mock"
    whatsapp_api_key: str = ""
    whatsapp_phone_id: str = ""

    # ─── CORS ───────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174"

    # ─── Pagination ─────────────────────────────────────────────────────────
    default_page_size: int = 50
    max_page_size: int = 200
    export_sync_row_limit: int = 5000

    # ─── Derived ────────────────────────────────────────────────────────────
    def _dsn(self, driver: str) -> str:
        # User and password MUST be URL-encoded — real credentials contain
        # characters like @ : / that otherwise corrupt the connection URL.
        user = quote_plus(self.db_user)
        password = quote_plus(self.db_password)
        return (
            f"mysql+{driver}://{user}:{password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        return self._dsn("aiomysql")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sync_database_url(self) -> str:
        """Used by Alembic, which does not run in an event loop."""
        return self._dsn("pymysql")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def redis_url(self) -> str:
        auth = f":{self.redis_password}@" if self.redis_password else ""
        return f"redis://{auth}{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        return self.app_env == "prod"

    def read_key(self, path_str: str) -> str:
        path = Path(path_str)
        if not path.is_absolute():
            path = BASE_DIR / path
        return path.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

# ─── Constants used across modules ──────────────────────────────────────────

QTY_SCALE = 6
RATE_SCALE = 6
AMOUNT_SCALE = 2
PERCENT_SCALE = 4
EXCHANGE_RATE_SCALE = 8
WEIGHT_SCALE = 4
DIMENSION_SCALE = 3

SOFT_DELETE_SENTINEL = "1970-01-01 00:00:00"
