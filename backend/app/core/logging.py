"""Structured JSON logging with correlation id on every line (V0-NFR-055)."""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

from app.core.config import settings

_SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "new_password",
    "current_password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "key_hash",
    "mfa_secret",
    "mfa_secret_enc",
    "pin",
    "shopfloor_pin_hash",
    "bank_account_no",
    "aadhaar",
    "pan",
    "authorization",
}


def _redact(_logger: Any, _method: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Never let a secret reach a log line (V0-NFR-016, V0-BR-032)."""
    for key in list(event_dict):
        if key.lower() in _SENSITIVE_KEYS:
            event_dict[key] = "***"
    return event_dict


def configure_logging() -> None:
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.DEBUG if settings.debug else logging.INFO,
    )
    for noisy in ("uvicorn.access", "aiomysql", "sqlalchemy.engine.Engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        _redact,
    ]
    if settings.app_env == "dev":
        processors.append(structlog.dev.ConsoleRenderer(colors=True))
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)  # type: ignore[no-any-return]
