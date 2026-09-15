from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.context import TenantContext
from app.core.database import get_session
from app.core.deps import require
from app.schemas.engineering_routing import EngRoutingSchema
from app.services.engineering_routing_service import EngineeringRoutingService
from pydantic import BaseModel

router = APIRouter()

# Every rejection below travels as RFC 9457 problem+json: the service raises the
# typed errors from app.core.errors and the global handler renders them, so these
# handlers deliberately do not catch and flatten exceptions into a bare 400.

@router.get("/next-code", dependencies=[Depends(require("ENGINEERING.ROUTING.CREATE"))])
async def get_next_routing_code(db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    code = await service.get_next_code()
    return {"nextCode": code}

# Registered with and without the trailing slash: the redirect FastAPI issues for
# the missing one points at the API's own origin, which breaks any client reaching
# it through a proxy.
@router.get("", dependencies=[Depends(require("ENGINEERING.ROUTING.VIEW"))], include_in_schema=False)
@router.get("/", dependencies=[Depends(require("ENGINEERING.ROUTING.VIEW"))])
async def get_routings(db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    return await service.get_all_routings()

@router.post("", dependencies=[Depends(require("ENGINEERING.ROUTING.CREATE"))], include_in_schema=False)
@router.post("/", dependencies=[Depends(require("ENGINEERING.ROUTING.CREATE"))])
async def create_routing(
    routing: EngRoutingSchema,
    db: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("ENGINEERING.ROUTING.CREATE")),
):
    """A new routing document. The server mints the number; revisions do not come here."""
    service = EngineeringRoutingService(db)
    uid = await service.create_routing(routing, ctx.user_name)
    return {"uid": uid}

@router.post("/{uid}/revisions", status_code=201, dependencies=[Depends(require("ENGINEERING.ROUTING.CREATE"))])
async def create_routing_revision(
    uid: str,
    routing: EngRoutingSchema,
    db: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("ENGINEERING.ROUTING.CREATE")),
):
    """The next revision of {uid}, keeping its document number.

    The payload's revision number and document number are ignored: the server
    takes the number from the document being revised and the revision from the
    database.
    """
    service = EngineeringRoutingService(db)
    return await service.create_revision(uid, routing, ctx.user_name)

@router.post("/{uid}/approve", dependencies=[Depends(require("ENGINEERING.ROUTING.APPROVE"))])
async def approve_routing(
    uid: str,
    db: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("ENGINEERING.ROUTING.APPROVE")),
):
    """Publish a revision: supersede the previous one, move the default, activate.

    One transaction, and the approver is the authenticated user — never a name
    supplied by the caller.
    """
    service = EngineeringRoutingService(db)
    return await service.approve_routing(uid, ctx.user_name)

@router.post("/{uid}/set-default", dependencies=[Depends(require("ENGINEERING.ROUTING.EDIT"))])
async def set_default_routing(
    uid: str,
    db: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("ENGINEERING.ROUTING.EDIT")),
):
    """Make this live routing the product's default, clearing the previous one."""
    service = EngineeringRoutingService(db)
    return await service.set_default_routing(uid, ctx.user_name)

@router.put("/{uid}", dependencies=[Depends(require("ENGINEERING.ROUTING.EDIT"))])
async def update_routing(
    uid: str,
    routing: EngRoutingSchema,
    db: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("ENGINEERING.ROUTING.EDIT")),
):
    service = EngineeringRoutingService(db)
    updated_uid = await service.update_routing(uid, routing, ctx.user_name)
    return {"uid": updated_uid}

@router.delete("/{uid}", dependencies=[Depends(require("ENGINEERING.ROUTING.DELETE"))])
async def delete_routing(
    uid: str,
    db: AsyncSession = Depends(get_session),
    ctx: TenantContext = Depends(require("ENGINEERING.ROUTING.DELETE")),
):
    service = EngineeringRoutingService(db)
    deleted_uid = await service.delete_routing(uid, ctx.user_name)
    return {"uid": deleted_uid}

# Pickers for the routing builder.
#
# These read the same ERP_Product.Engineering* tables the Operations, Tools and
# Work centres masters write to. They previously read ERP_Master.Operation/Tool/
# WorkCentre — a different database holding older, narrower copies — so anything
# created in those masters never appeared here, and the routing builder offered
# rows that no master owned.
@router.get("/operations", dependencies=[Depends(require("ENGINEERING.OPERATION.VIEW"))])
async def get_operations(db: AsyncSession = Depends(get_session)):
    sql = text(
        "SELECT Code, Name, DefaultWorkCentre, SetupMinutes, CycleSeconds, Operators,"
        " Skill, QcCheckpoint, Instructions"
        " FROM ERP_Product.EngineeringOperation"
        " WHERE IsActive = 1 ORDER BY Code"
    )
    result = await db.execute(sql)
    ops = []
    for row in result:
        ops.append({
            "code": row[0],
            "name": row[1],
            "defaultWorkCentre": row[2],
            "setupMinutes": float(row[3]) if row[3] else 0,
            "cycleSeconds": float(row[4]) if row[4] else 0,
            "operators": row[5],
            "skill": row[6],
            "qcCheckpoint": bool(row[7]),
            "instructions": row[8]
        })
    return ops

@router.get("/tools", dependencies=[Depends(require("ENGINEERING.TOOL.VIEW"))])
async def get_tools(db: AsyncSession = Depends(get_session)):
    sql = text(
        "SELECT Code, Name, ToolType, LifeStrokes, ReplacementCost"
        " FROM ERP_Product.EngineeringTool"
        " WHERE IsActive = 1 ORDER BY Code"
    )
    result = await db.execute(sql)
    tools = []
    for row in result:
        tools.append({
            "code": row[0],
            "name": row[1],
            "toolType": row[2],
            "lifeStrokes": row[3],
            "replacementCost": float(row[4]) if row[4] else 0
        })
    return tools

@router.get("/workcentres", dependencies=[Depends(require("ENGINEERING.WORK_CENTRE.VIEW"))])
async def get_workcentres(db: AsyncSession = Depends(get_session)):
    sql = text(
        "SELECT Code, Name, Plant, MachineRatePerHour, LabourRatePerHour, OverheadPct"
        " FROM ERP_Product.EngineeringWorkCentre"
        " WHERE IsActive = 1 ORDER BY Code"
    )
    result = await db.execute(sql)
    wcs = []
    for row in result:
        wcs.append({
            "code": row[0],
            "name": row[1],
            "plant": row[2],
            "machineRatePerHour": float(row[3]) if row[3] else 0,
            "labourRatePerHour": float(row[4]) if row[4] else 0,
            "overheadPct": float(row[5]) if row[5] else 0
        })
    return wcs
