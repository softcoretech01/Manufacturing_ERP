from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_session
from app.schemas.engineering_routing import EngRoutingSchema
from app.services.engineering_routing_service import EngineeringRoutingService
from pydantic import BaseModel

router = APIRouter()

@router.get("/next-code")
async def get_next_routing_code(db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    code = await service.get_next_code()
    return {"nextCode": code}

@router.get("/")
async def get_routings(db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        return await service.get_all_routings()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_routing(routing: EngRoutingSchema, db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        uid = await service.create_routing(routing)
        return {"uid": uid}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{uid}")
async def update_routing(uid: str, routing: EngRoutingSchema, db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        updated_uid = await service.update_routing(uid, routing)
        if not updated_uid:
            raise HTTPException(status_code=404, detail="Routing not found")
        return {"uid": updated_uid}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{uid}")
async def delete_routing(uid: str, db: AsyncSession = Depends(get_session)):
    service = EngineeringRoutingService(db)
    try:
        deleted_uid = await service.delete_routing(uid)
        if not deleted_uid:
            raise HTTPException(status_code=404, detail="Routing not found")
        return {"uid": deleted_uid}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Master data endpoints
@router.get("/operations")
async def get_operations(db: AsyncSession = Depends(get_session)):
    sql = text("SELECT Code, Name, DefaultWorkCentre, SetupMinutes, CycleSeconds, Operators, Skill, QcCheckpoint, Instructions FROM ERP_Master.Operation")
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

@router.get("/tools")
async def get_tools(db: AsyncSession = Depends(get_session)):
    sql = text("SELECT Code, Name, ToolType, LifeStrokes, ReplacementCost FROM ERP_Master.Tool")
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

@router.get("/workcentres")
async def get_workcentres(db: AsyncSession = Depends(get_session)):
    sql = text("SELECT Code, Name, PlantUid, MachineHourRate FROM ERP_Master.WorkCentre")
    result = await db.execute(sql)
    wcs = []
    for row in result:
        wcs.append({
            "code": row[0],
            "name": row[1],
            "plant": row[2],
            "machineRatePerHour": float(row[3]) if row[3] else 0,
            "labourRatePerHour": 0,
            "overheadPct": 0
        })
    return wcs
