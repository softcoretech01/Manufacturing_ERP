"""In-process request metrics for the Logging & monitoring screen.

A lightweight Starlette middleware records every API request into a bounded
in-memory ring buffer (method, normalised path, status, duration, timestamp,
correlation id). The monitoring endpoints aggregate this buffer into health,
per-endpoint performance, an hourly trend, and a log of failed requests.

Everything served is derived from real traffic to this process — nothing is
precomputed or invented. The buffer is per-process and resets on restart; that
is the honest scope of an in-process collector (a durable store would be a
metrics backend, out of scope here).
"""

from __future__ import annotations

import re
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Bounded so memory stays flat under sustained traffic; ~last 5000 requests.
_MAX = 5000
_BUFFER: Deque[dict[str, Any]] = deque(maxlen=_MAX)
_START = time.time()

# Path segments that are identifiers get collapsed so "/taxes/3" and "/taxes/9"
# aggregate as one endpoint "/taxes/:id".
_NUMERIC = re.compile(r"^\d+$")
_ULID = re.compile(r"^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$")
_UUID = re.compile(r"^[0-9a-fA-F-]{32,36}$")


def _normalise(path: str) -> str:
    parts = []
    for seg in path.split("/"):
        if _NUMERIC.match(seg) or _ULID.match(seg) or _UUID.match(seg):
            parts.append(":id")
        else:
            parts.append(seg)
    return "/".join(parts) or "/"


def record(method: str, path: str, status: int, duration_ms: float, correlation_id: str) -> None:
    _BUFFER.append({
        "ts": time.time(),
        "method": method,
        "path": _normalise(path),
        "status": status,
        "duration_ms": duration_ms,
        "correlation_id": correlation_id,
    })


def snapshot() -> list[dict[str, Any]]:
    return list(_BUFFER)


def uptime_seconds() -> float:
    return time.time() - _START


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            duration_ms = (time.perf_counter() - start) * 1000.0
            path = request.url.path
            # Only track the versioned API surface; skip docs/openapi/static.
            if path.startswith("/api/"):
                cid = request.headers.get("X-Correlation-Id", "")
                record(request.method, path, status, duration_ms, cid)


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * pct
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = k - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def endpoint_metrics() -> list[dict[str, Any]]:
    """Per-endpoint call/error counts and latency percentiles."""
    groups: dict[tuple[str, str], list[float]] = {}
    errors: dict[tuple[str, str], int] = {}
    for r in _BUFFER:
        key = (r["method"], r["path"])
        groups.setdefault(key, []).append(r["duration_ms"])
        if r["status"] >= 400:
            errors[key] = errors.get(key, 0) + 1
    out = []
    for (method, endpoint), durations in groups.items():
        s = sorted(durations)
        out.append({
            "endpoint": endpoint,
            "method": method,
            "calls": len(durations),
            "errors": errors.get((method, endpoint), 0),
            "p50Ms": round(_percentile(s, 0.50)),
            "p95Ms": round(_percentile(s, 0.95)),
            "p99Ms": round(_percentile(s, 0.99)),
            "maxMs": round(max(s)) if s else 0,
        })
    out.sort(key=lambda e: e["calls"], reverse=True)
    return out


def api_trend() -> list[dict[str, Any]]:
    """Calls, errors and p95 latency bucketed by hour for the last 24 hours."""
    now = time.time()
    buckets: list[dict[str, Any]] = []
    for i in range(23, -1, -1):
        lo = now - (i + 1) * 3600
        hi = now - i * 3600
        durs = [r["duration_ms"] for r in _BUFFER if lo <= r["ts"] < hi]
        errs = sum(1 for r in _BUFFER if lo <= r["ts"] < hi and r["status"] >= 400)
        hour_label = datetime.fromtimestamp(hi, tz=timezone.utc).strftime("%H:00")
        buckets.append({
            "hour": hour_label,
            "calls": len(durs),
            "errors": errs,
            "p95Ms": round(_percentile(sorted(durs), 0.95)),
        })
    return buckets


def failure_logs() -> list[dict[str, Any]]:
    """Every failed request (>=400) as a log entry, newest first."""
    out = []
    for r in reversed(_BUFFER):
        if r["status"] < 400:
            continue
        level = "ERROR" if r["status"] >= 500 else "WARN"
        out.append({
            "uid": f"log-{r['correlation_id'] or r['ts']}",
            "at": datetime.fromtimestamp(r["ts"], tz=timezone.utc).isoformat(),
            "level": level,
            "source": "API",
            "origin": f"{r['method']} {r['path']}",
            "message": f"HTTP {r['status']} on {r['method']} {r['path']}",
            "correlationId": r["correlation_id"] or "",
            "userName": None,
            "durationMs": round(r["duration_ms"]),
            "httpStatus": r["status"],
            "stackTrace": "",
            "acknowledged": False,
            "deletedAt": None,
        })
    return out
