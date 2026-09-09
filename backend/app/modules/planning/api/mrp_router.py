"""MRP endpoints.

`POST /planning/mrp/run` returns a run uid, not a result. The client then reads
the run. That contract is identical whether the calculation happens inline (as it
does now, at these data volumes) or on a background worker later — so moving it
off the request thread needs no API change and no frontend change.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.planning.application.conversion_service import ConversionService
from app.modules.planning.application.mrp_service import MrpService
from app.modules.planning.domain import mrp_engine as eng

router = APIRouter(prefix="/planning", tags=["Planning · MRP"])


class MrpRunRequest(BaseModel):
    horizon: int = Field(default=eng.DEFAULT_HORIZON, ge=1, le=52)
    use_mps: bool = Field(
        default=True,
        description="When true, a committed MPS replaces raw demand for the "
        "products it covers, so the same demand is not planned twice.",
    )
    consume_forecast: bool = Field(
        default=True,
        description="Net firm orders against the forecast for the same product and "
        "month before planning, so the same demand is not planned twice.",
    )
    today: date | None = Field(
        default=None, description="Override the run date. For testing and replay."
    )
    demand_doc_no: str | None = Field(
        default=None,
        max_length=40,
        description="Plan one demand document instead of the whole order book — "
        "make-to-order. Stock and open purchase orders still net off, so the "
        "proposals are what must be bought and made on top of what is already "
        "in the building.",
    )


def _run_out(r: Any) -> dict[str, Any]:
    return {
        "uid": r.uid,
        "run_no": r.run_no,
        "run_at": r.run_at,
        "run_by_name": r.run_by_name,
        "horizon": r.horizon,
        "bucket_days": r.bucket_days,
        "use_mps": r.use_mps,
        "demand_doc_no": r.demand_doc_no,
        "first_bucket_start": r.first_bucket_start,
        "status": r.status,
        "stats": {
            "items_planned": r.items_planned,
            "purchase_orders": r.purchase_orders,
            "production_orders": r.production_orders,
            "purchase_value": float(r.purchase_value),
            "late_orders": r.late_orders,
            "exceptions": r.exception_count,
        },
    }


@router.post("/mrp/run", status_code=201)
async def run_mrp(
    body: MrpRunRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.RUN")),
) -> dict[str, Any]:
    run = await MrpService(session, ctx).run(
        horizon=body.horizon, use_mps=body.use_mps,
        consume_forecast=body.consume_forecast, today=body.today,
        demand_doc_no=body.demand_doc_no,
    )
    return _run_out(run)


@router.get("/mrp/runs")
async def list_runs(
    session: SessionDep,
    limit: int = Query(25, ge=1, le=100),
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
) -> list[dict[str, Any]]:
    return [_run_out(r) for r in await MrpService(session, ctx).list_runs(limit)]


@router.get("/mrp/latest")
async def latest_run(
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
) -> dict[str, Any] | None:
    """The current plan. Returns null when MRP has never been run, so the screen
    can say so rather than showing an empty grid that looks like zero demand."""
    svc = MrpService(session, ctx)
    run = await svc.latest_run()
    if run is None:
        return None
    return await _detail_out(await svc.run_detail(run.uid))


@router.get("/mrp/runs/{uid}")
async def get_run(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.VIEW")),
) -> dict[str, Any]:
    return await _detail_out(await MrpService(session, ctx).run_detail(uid))


async def _detail_out(d: dict[str, Any]) -> dict[str, Any]:
    return {
        **_run_out(d["run"]),
        "starts": d["starts"],
        "plans": d["plans"],
        "planned_orders": [
            {
                "uid": o.uid,
                "item_code": o.item_code,
                "item_name": o.item_name,
                "uom": o.uom,
                "llc": o.llc,
                "order_type": o.order_type,
                "quantity": float(o.quantity),
                "net_requirement": float(o.net_requirement),
                "unit_rate": float(o.unit_rate),
                "value": float(o.value),
                "bucket": o.bucket,
                "due_date": o.due_date,
                "release_bucket": o.release_bucket,
                "release_date": o.release_date,
                "is_late": o.is_late,
                "days_late": o.days_late,
                "pegged_to": o.pegged_to,
                "demand_doc_no": o.demand_doc_no,
                "lead_time_days": o.lead_time_days,
                "converted_to_doc_no": o.converted_to_doc_no,
            }
            for o in d["planned_orders"]
        ],
        "exceptions": [
            {
                "uid": x.uid,
                "severity": x.severity,
                "type": x.exception_type,
                "item_code": x.item_code,
                "item_name": x.item_name,
                "message": x.message,
                "action": x.suggested_action,
                "is_resolved": x.is_resolved,
            }
            for x in d["exceptions"]
        ],
        "shortages": d["shortages"],
    }


# ═══════════════════ Planned order → real document ═══════════════════
class ConvertPurchaseRequest(BaseModel):
    planned_order_uids: list[str] = Field(..., min_length=1)
    plant: str = Field(default="", max_length=80)
    department: str = Field(default="", max_length=100)
    justification: str = Field(default="", max_length=500)


class ConvertProductionRequest(BaseModel):
    planned_order_uid: str
    plant: str = Field(default="", max_length=80)
    warehouse: str = Field(default="", max_length=80)


@router.post("/mrp/convert/purchase-requisition", status_code=201)
async def convert_to_purchase_requisition(
    body: ConvertPurchaseRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.CONVERT")),
) -> dict[str, Any]:
    """Raise one requisition in Procurement covering the selected planned buys.

    CONVERT is a separate permission from RUN on purpose: running the plan is
    analysis, committing it to a document another department will act on is not.
    """
    return await ConversionService(session, ctx).to_purchase_requisition(
        body.planned_order_uids, plant=body.plant, department=body.department,
        justification=body.justification,
    )


@router.post("/mrp/convert/production-order", status_code=201)
async def convert_to_production_order(
    body: ConvertProductionRequest,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.MRP.CONVERT")),
) -> dict[str, Any]:
    """Raise a production order, with its BOM and routing snapshotted onto it."""
    return await ConversionService(session, ctx).to_production_order(
        body.planned_order_uid, plant=body.plant, warehouse=body.warehouse
    )


@router.post("/orders/{uid}/reserve", status_code=200)
async def reserve_order_components(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.RESERVATION.CREATE")),
) -> dict[str, Any]:
    """Reserve on-hand stock against a production order's components."""
    return await ConversionService(session, ctx).reserve_components(uid)


@router.post("/orders/{uid}/release-reservation", status_code=200)
async def release_order_reservation(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require("PLANNING.RESERVATION.RELEASE")),
) -> dict[str, Any]:
    """Give an order's reserved stock back to free — on cancellation, or once
    the material has been issued and the reservation is spent."""
    return await ConversionService(session, ctx).release_components(uid)
