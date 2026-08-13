from fastapi import APIRouter, HTTPException
from typing import List
import pymysql
import os
import json
from dotenv import load_dotenv
from app.schemas.settings import ProcParameter, ProcParameterUpdate, EvalWeight, ProcReasonCode, ProcReasonCodeUpdate

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

router = APIRouter()

def get_db_connection():
    return pymysql.connect(
        host=os.getenv('DB_HOST', '187.127.131.38'),
        port=int(os.getenv('DB_PORT', 3308)),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026'),
        database='ERP_Procurement',
        cursorclass=pymysql.cursors.DictCursor
    )

# =======================================
# PARAMETERS
# =======================================
@router.get("/parameters", response_model=List[ProcParameter])
def get_parameters():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('GET_PARAMETERS', '{}'))
            results = cursor.fetchall()
            for r in results:
                r['editable'] = bool(r['editable'])
            return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.put("/parameters/{uid}")
def update_parameter(uid: str, payload: ProcParameterUpdate):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # We construct a JSON string for the SP
            json_payload = json.dumps({"uid": uid, "value": payload.value})
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('UPDATE_PARAMETER', json_payload))
        conn.commit()
        return {"status": "SUCCESS"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/parameters")
def insert_parameter(payload: ProcParameter):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            json_payload = json.dumps(payload.model_dump(exclude_none=True))
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('INSERT_PARAMETER', json_payload))
        conn.commit()
        return {"status": "SUCCESS"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# =======================================
# EVALUATION WEIGHTS
# =======================================
@router.get("/weights", response_model=List[EvalWeight])
def get_weights():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('GET_WEIGHTS', '{}'))
            results = cursor.fetchall()
            for r in results:
                r['weightPct'] = float(r['weightPct'])
                r['active'] = bool(r['active'])
            return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/weights")
def save_weights_version(payload: List[EvalWeight]):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            json_payload = json.dumps([p.model_dump(exclude_none=True) for p in payload])
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('SAVE_WEIGHTS_VERSION', json_payload))
        conn.commit()
        return {"status": "SUCCESS"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# =======================================
# REASON CODES
# =======================================
@router.get("/reasons", response_model=List[ProcReasonCode])
def get_reasons():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('GET_REASONS', '{}'))
            results = cursor.fetchall()
            for r in results:
                r['requiresComment'] = bool(r['requiresComment'])
                r['active'] = bool(r['active'])
            return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/reasons")
def insert_reason(payload: ProcReasonCode):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            json_payload = json.dumps(payload.model_dump(exclude_none=True))
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('INSERT_REASON', json_payload))
        conn.commit()
        return {"status": "SUCCESS"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.put("/reasons/{uid}")
def update_reason_status(uid: str, payload: ProcReasonCodeUpdate):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            json_payload = json.dumps({"uid": uid, "active": payload.active})
            cursor.execute("CALL SpManageProcurementSettings(%s, %s)", ('UPDATE_REASON_STATUS', json_payload))
        conn.commit()
        return {"status": "SUCCESS"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
