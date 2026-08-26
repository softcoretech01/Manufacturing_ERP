from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
import pymysql

from app.core.config import settings
from app.schemas.calibration import InstrumentCreate, InstrumentUpdate, InstrumentResponse

def get_db_connection():
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name
    )

def dict_to_camel(d: Dict[str, Any]) -> Dict[str, Any]:
    if not d: return d
    return {k[0].lower() + k[1:]: v for k, v in d.items()}

# Mapping schema's range_val back to range for frontend compatibility
def row_to_camel(row: Dict[str, Any]) -> Dict[str, Any]:
    if not row: return row
    cam = dict_to_camel(row)
    if 'rangeVal' in cam:
        cam['range'] = cam.pop('rangeVal')
    return cam

router = APIRouter(prefix="/api/v1/quality/instruments", tags=["Quality Calibration"])

@router.get("", response_model=List[InstrumentResponse])
def get_instruments():
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Calibration WHERE DeletedAt IS NULL ORDER BY Id DESC")
            rows = cursor.fetchall()
            return [row_to_camel(r) for r in rows]
    finally:
        conn.close()

@router.post("", response_model=InstrumentResponse)
def create_instrument(instrument: InstrumentCreate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageCalibration('CREATE', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_Code)",
                (
                    instrument.name, instrument.instrument_type, instrument.make, instrument.serial_no,
                    instrument.range_val, instrument.least_count, instrument.location, instrument.custodian,
                    instrument.calibration_frequency_days, instrument.last_calibrated_on, instrument.next_due_on,
                    instrument.agency, instrument.certificate_no, instrument.observed_error_pct, instrument.permitted_error_pct,
                    instrument.status, instrument.remarks, user
                )
            )
            cursor.execute("SELECT LAST_INSERT_ID()")
            new_id = cursor.fetchone()[0]
            conn.commit()

        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Calibration WHERE Id = %s", (new_id,))
            row = cursor.fetchone()
            return row_to_camel(row)
    finally:
        conn.close()

@router.put("/{instrument_id}", response_model=InstrumentResponse)
def update_instrument(instrument_id: int, instrument: InstrumentUpdate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageCalibration('UPDATE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_Code)",
                (
                    instrument_id, instrument.name, instrument.instrument_type, instrument.make, instrument.serial_no,
                    instrument.range_val, instrument.least_count, instrument.location, instrument.custodian,
                    instrument.calibration_frequency_days, instrument.last_calibrated_on, instrument.next_due_on,
                    instrument.agency, instrument.certificate_no, instrument.observed_error_pct, instrument.permitted_error_pct,
                    instrument.status, instrument.remarks, user
                )
            )
            conn.commit()

        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM ERP_Quality.Calibration WHERE Id = %s", (instrument_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Instrument not found")
            return row_to_camel(row)
    finally:
        conn.close()

@router.delete("/{instrument_id}")
def delete_instrument(instrument_id: int, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "CALL ERP_Quality.SpManageCalibration('DELETE', %s, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %s, @p_Code)",
                (instrument_id, user)
            )
            conn.commit()
        return {"message": "Deleted successfully"}
    finally:
        conn.close()
