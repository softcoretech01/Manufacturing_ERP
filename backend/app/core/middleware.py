"""Correlation-id middleware. Every request gets an X-Correlation-Id that flows
onto every log line, audit row and outbox event (CLAUDE.md §6)."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.ids import new_uid


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        correlation_id = request.headers.get("X-Correlation-Id") or new_uid()
        request.state.correlation_id = correlation_id
        response: Response = await call_next(request)
        response.headers["X-Correlation-Id"] = correlation_id
        return response
