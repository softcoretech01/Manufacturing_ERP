"""Administration reports endpoint (read-only aggregates)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.modules.reporting import schemas as s
from app.modules.reporting.service import AdminReportService

router = APIRouter(tags=["Reporting"])


@router.get("/admin-reports", response_model=s.AdminReportsOut)
async def admin_reports(
    session: SessionDep,
    ctx: TenantContext = Depends(require("SYSTEM.AUDIT.VIEW")),
):
    return await AdminReportService(session, ctx).build()
