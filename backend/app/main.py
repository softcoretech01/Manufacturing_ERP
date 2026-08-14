"""FastAPI application assembly (CLAUDE.md §6). One deployable app; modules
register their routers here. This phase mounts IAM (auth) and Organisation."""

from __future__ import annotations

from contextlib import asynccontextmanager

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
from app.core.logging import configure_logging
from app.core.middleware import CorrelationIdMiddleware
from app.core.security import ensure_dev_keys
from app.core.base import Base  # noqa: F401
from app.modules.iam.api.management_router import router as iam_mgmt_router
from app.modules.iam.api.router import router as iam_router
from app.modules.inventory.api.routers import router as inventory_router
from app.modules.inventory.api.analysis_router import router as analysis_router
from app.modules.inventory.api.count_router import router as count_router
from app.modules.inventory.api.stock_router import router as stock_router
from app.modules.inventory.api.txn_router import router as txn_router
from app.modules.masters.api.router import router as masters_router
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
    app.include_router(stock_router, prefix=api)
    app.include_router(txn_router, prefix=api)
    app.include_router(count_router, prefix=api)
    app.include_router(analysis_router, prefix=api)
    app.include_router(masters_router, prefix=api)
    app.include_router(workflow_router, prefix=api)
    app.include_router(numbering_router, prefix=api)

    @app.get("/health", tags=["Health"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "app": settings.app_name}

    return app


app = create_app()
