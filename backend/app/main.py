# FastAPI application entrypoint (V0-API-001)
# File: backend/app/main.py
"""FastAPI application assembly (CLAUDE.md §6). One deployable app; modules
register their routers here. This phase mounts IAM (auth) and Organisation."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import dispose_engine
from app.core.errors import (
    AppError,
    app_error_handler,
    integrity_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.routers import customer_router, supplier_router
from app.routers.transporter import router as transporter_router
from app.routers.bank import router as bank_router
from app.routers.contact import router as contact_router
from app.routers.item import router as item_router
from app.routers.bottle_model import router as bottle_model_router
from app.routers.bottle_capacity import router as bottle_capacity_router
from app.routers.bottle_colour import router as bottle_colour_router
from app.routers.lid_type import router as lid_type_router
from app.routers.packaging import router as packaging_router
from app.routers.steel_grade import router as steel_grade_router
from app.routers.steel_thickness import router as steel_thickness_router
from app.routers.machine import router as machine_router
from app.routers.admin_plants import router as admin_plants_router
from app.routers.shift import router as shift_router
from app.routers.holiday_calendar import router as holiday_calendar_router
from app.routers.quality_parameter import router as quality_parameter_router
from app.routers.defect import router as defect_router
from app.routers.employee import router as employee_router
from app.routers.hsn import router as hsn_router
from app.routers.tax import router as tax_router
from app.routers.payment_term import router as payment_term_router
from app.routers.currency import router as currency_router
from app.routers.cost_centre import router as cost_centre_router
from app.routers.uom import router as uom_router
from app.routers.reason_code import router as reason_code_router
from app.routers.country import router as country_router
from app.routers.state import router as state_router
from app.routers.city import router as city_router
from app.routers.procurement import router as procurement_router
from app.routers.rfq import router as rfq_router
from app.routers.quotation import router as quotation_router
from app.routers.purchase_order import router as purchase_order_router

from app.routers.grn import router as grn_router
from app.routers.analytics import router as analytics_router
from app.routers.dashboard import router as dashboard_router
from app.routers.settings import router as settings_router
from app.routers import engineering_boms, engineering_routings, engineering_products, engineering_documents, engineering_operations, engineering_workcentres, engineering_tools, engineering_changes
from app.routers import admin_audit
import traceback
from fastapi.responses import JSONResponse

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown lifecycle management."""
from app.core.logging import configure_logging
from app.core.middleware import CorrelationIdMiddleware
from app.core.security import ensure_dev_keys
from app.core.base import Base  # noqa: F401
from app.modules.iam.api.management_router import router as iam_mgmt_router
from app.modules.iam.api.router import router as iam_router
from app.modules.inventory.api.routers import router as inventory_router
from app.modules.numbering.api.router import router as numbering_router
from app.modules.organisation.api.routers import router as org_router
from app.modules.workflow.api.routers import router as workflow_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    if not settings.is_production:
        ensure_dev_keys()
    yield
    await dispose_engine()


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS (V0-NFR-040)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception Handlers mapping to RFC 9457 problem+json (V0-IR-010)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(IntegrityError, integrity_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

# Include Routers
app.include_router(customer_router, prefix=settings.api_v1_prefix)
app.include_router(supplier_router, prefix=settings.api_v1_prefix)
app.include_router(transporter_router, prefix=settings.api_v1_prefix)
app.include_router(bank_router, prefix=settings.api_v1_prefix)
app.include_router(contact_router, prefix=settings.api_v1_prefix)
app.include_router(item_router, prefix=settings.api_v1_prefix)
app.include_router(bottle_model_router, prefix=settings.api_v1_prefix)
app.include_router(bottle_capacity_router, prefix=settings.api_v1_prefix)
app.include_router(bottle_colour_router, prefix=settings.api_v1_prefix)
app.include_router(lid_type_router, prefix=settings.api_v1_prefix)
app.include_router(packaging_router, prefix=settings.api_v1_prefix)
app.include_router(steel_grade_router, prefix=settings.api_v1_prefix)
app.include_router(steel_thickness_router, prefix=settings.api_v1_prefix)
app.include_router(machine_router, prefix=settings.api_v1_prefix)
app.include_router(admin_plants_router, prefix=settings.api_v1_prefix)
app.include_router(shift_router, prefix=settings.api_v1_prefix)
app.include_router(holiday_calendar_router, prefix=settings.api_v1_prefix)
app.include_router(quality_parameter_router, prefix=settings.api_v1_prefix)
app.include_router(defect_router, prefix=settings.api_v1_prefix)
app.include_router(employee_router, prefix=settings.api_v1_prefix)
app.include_router(hsn_router, prefix=settings.api_v1_prefix)
app.include_router(tax_router, prefix=settings.api_v1_prefix)
app.include_router(payment_term_router, prefix=settings.api_v1_prefix)
app.include_router(currency_router, prefix=settings.api_v1_prefix)
app.include_router(cost_centre_router, prefix=settings.api_v1_prefix)
app.include_router(uom_router, prefix=settings.api_v1_prefix)
app.include_router(reason_code_router, prefix=settings.api_v1_prefix)
app.include_router(country_router, prefix=settings.api_v1_prefix)
app.include_router(state_router, prefix=settings.api_v1_prefix)
app.include_router(city_router, prefix=settings.api_v1_prefix)
app.include_router(procurement_router, prefix=settings.api_v1_prefix)
app.include_router(rfq_router, prefix="/api/v1")
app.include_router(quotation_router, prefix="/api/v1")
app.include_router(purchase_order_router, prefix="/api/v1")
app.include_router(grn_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1/procurement/analytics")
app.include_router(dashboard_router, prefix="/api/v1/procurement/dashboard", tags=["procurement-dashboard"])
app.include_router(settings_router, prefix="/api/v1/procurement/settings", tags=["procurement-settings"])
app.include_router(engineering_documents.router, prefix="/api/v1/engineering/documents", tags=["Engineering Documents"])
app.include_router(engineering_products.router, prefix="/api/v1/engineering/products", tags=["Engineering Products"])
app.include_router(engineering_boms.router, prefix="/api/v1/engineering/boms", tags=["Engineering BOMs"])
app.include_router(engineering_routings.router, prefix="/api/v1/engineering/routings", tags=["Engineering Routings"])
app.include_router(engineering_operations.router, prefix="/api/v1/engineering/operations")
app.include_router(engineering_workcentres.router, prefix="/api/v1/engineering/workcentres", tags=["Engineering Operations"])
app.include_router(engineering_tools.router, prefix="/api/v1/engineering/tools")
app.include_router(engineering_changes.router, prefix="/api/v1/engineering/changes")
app.include_router(admin_audit.router, prefix="/api/v1/admin/audit")

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    err_msg = traceback.format_exc()
    print("GLOBAL EXCEPTION:", err_msg)
    return JSONResponse(status_code=500, content={"detail": str(exc), "traceback": err_msg})

@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint to check API health."""
    return {"status": "healthy", "service": settings.app_name}
def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Organisation module — multi-company ERP foundation.",
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url="/docs",
        lifespan=lifespan,
    )

    app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Correlation-Id"],
    )

    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(IntegrityError, integrity_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)

    api = settings.api_v1_prefix
    app.include_router(iam_router, prefix=api)
    app.include_router(iam_mgmt_router, prefix=api)
    app.include_router(org_router, prefix=api)
    app.include_router(inventory_router, prefix=api)
    app.include_router(workflow_router, prefix=api)
    app.include_router(numbering_router, prefix=api)

    @app.get("/health", tags=["Health"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "app": settings.app_name}

    return app


app = create_app()
