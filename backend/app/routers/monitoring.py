"""Logging & monitoring endpoints (Administration ▸ Monitoring).

Serves real, in-process telemetry: a live health check (API + a real database
ping), per-endpoint performance from the metrics ring buffer, an hourly trend,
and a log of failed requests. All figures come from actual traffic to this
process, so an empty history reads as an empty screen rather than a fabricated one.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core import metrics

router = APIRouter(prefix="/admin/monitoring", tags=["Monitoring"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    from datetime import datetime, timezone
    checked_at = datetime.now(timezone.utc).isoformat()
    checks: list[dict[str, Any]] = []

    # Database — a real round-trip; latency and status are measured, not assumed.
    start = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        db_latency = (time.perf_counter() - start) * 1000.0
        db_status = "HEALTHY" if db_latency < 500 else "DEGRADED"
        db_msg = "Responding to queries."
    except Exception as exc:  # pragma: no cover - only on a real outage
        db_latency = (time.perf_counter() - start) * 1000.0
        db_status = "DOWN"
        db_msg = f"Query failed: {type(exc).__name__}"
    checks.append({
        "component": "Database", "kind": "DATABASE", "status": db_status,
        "message": db_msg, "latencyMs": round(db_latency), "checkedAt": checked_at,
    })

    # API process — it answered this request, so it is up. Latency is the recent
    # average across tracked requests.
    recent = metrics.snapshot()
    avg = round(sum(r["duration_ms"] for r in recent) / len(recent)) if recent else 0
    checks.append({
        "component": "API service", "kind": "SERVICE", "status": "HEALTHY",
        "message": f"Up for {int(metrics.uptime_seconds())}s, {len(recent)} requests tracked.",
        "latencyMs": avg, "checkedAt": checked_at,
    })
    return checks


@router.get("/api-metrics")
async def api_metrics() -> dict[str, Any]:
    return {"endpointMetrics": metrics.endpoint_metrics(), "apiTrend": metrics.api_trend()}


@router.get("/logs")
async def logs() -> list[dict[str, Any]]:
    return metrics.failure_logs()
