from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_session
from app.core.deps import require
from app.schemas.engineering_routing import EngRoutingSchema
from app.services.engineering_routing_service import EngineeringRoutingService
from pydantic import BaseModel

router = APIRouter()

@router.get("/next-code", dependencies=[Depends(require("ENGINEERING.ROUTING.CREATE"))])
async def get_next_routing_code(db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    code = await service.get_next_code()
    return {"nextCode": code}

@router.get("/", dependencies=[Depends(require("ENGINEERING.ROUTING.VIEW"))])
async def get_routings(db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        return await service.get_all_routings()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", dependencies=[Depends(require("ENGINEERING.ROUTING.CREATE"))])
async def create_routing(routing: EngRoutingSchema, db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        uid = await service.create_routing(routing)
        return {"uid": uid}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{uid}", dependencies=[Depends(require("ENGINEERING.ROUTING.EDIT"))])
async def update_routing(uid: str, routing: EngRoutingSchema, db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        updated_uid = await service.update_routing(uid, routing)
        if not updated_uid:
            raise HTTPException(status_code=404, detail="Routing not found")
        return {"uid": updated_uid}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{uid}", dependencies=[Depends(require("ENGINEERING.ROUTING.DELETE"))])
async def delete_routing(uid: str, db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        deleted_uid = await service.delete_routing(uid)
        if not deleted_uid:
            raise HTTPException(status_code=404, detail="Routing not found")
        return {"uid": deleted_uid}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
