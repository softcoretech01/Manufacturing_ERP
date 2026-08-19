from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
import pymysql
import pymysql.cursors
import uuid

from app.core.config import settings
from app.schemas.supplier_quality import SupplierQualityUpdate, SupplierQualityResponse

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

router = APIRouter(prefix="/api/v1/quality/suppliers", tags=["Supplier Quality"])

@router.get("", response_model=List[SupplierQualityResponse])
def get_supplier_quality(period: str = Query("Q3 2026")):
    conn = get_db_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            # Query active suppliers from Supplier master and left join SupplierQuality metrics
            query = """
            SELECT 
                s.Code as SupplierCode, 
                s.Name as SupplierName,
                COALESCE(sq.Period, %s) as Period,
                COALESCE(sq.Id, NULL) as Id,
                COALESCE(sq.LotsReceived, 0) as LotsReceived,
                COALESCE(sq.LotsAccepted, 0) as LotsAccepted,
                COALESCE(sq.LotsRejected, 0) as LotsRejected,
                COALESCE(sq.QtyReceived, 0) as QtyReceived,
                COALESCE(sq.QtyRejected, 0) as QtyRejected,
                COALESCE(sq.LotsWithValidDocs, 0) as LotsWithValidDocs,
                COALESCE(sq.NcrsRaised, 0) as NcrsRaised,
                COALESCE(sq.NcrsClosedOnTime, 0) as NcrsClosedOnTime,
                COALESCE(sq.CapaResponseDays, 0) as CapaResponseDays,
                COALESCE(sq.Version, 1) as Version
            FROM Supplier s
            LEFT JOIN ERP_Quality.SupplierQuality sq 
                ON sq.SupplierCode = s.Code AND sq.Period = %s AND sq.DeletedAt IS NULL
            WHERE s.IsDeleted = 0
            ORDER BY s.Name
            """
            cursor.execute(query, (period, period))
            rows = cursor.fetchall()
            
            out = []
            for r in rows:
                c = dict_to_camel(r)
                # Map missing Uid to use supplier code as a stable fallback key for UI updates
                c['uid'] = c['supplierCode']
                out.append(c)
            return out
    finally:
        conn.close()

@router.put("/{supplier_code}", response_model=SupplierQualityResponse)
def update_supplier_quality(supplier_code: str, data: SupplierQualityUpdate, user: str = "System"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # We use UPSERT in SpManageSupplierQuality
            cursor.execute(
                "CALL ERP_Quality.SpManageSupplierQuality('UPSERT', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, @p_OutId)",
                (
                    supplier_code, data.period, data.lots_received, data.lots_accepted, data.lots_rejected,
                    data.qty_received, data.qty_rejected, data.lots_with_valid_docs, data.ncrs_raised,
                    data.ncrs_closed_on_time, data.capa_response_days, user
                )
            )
            cursor.execute("SELECT @p_OutId")
            out_id = cursor.fetchone()[0]
            conn.commit()
            
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            # Return updated record joined with Supplier name
            query = """
            SELECT 
                s.Code as SupplierCode, 
                s.Name as SupplierName,
                sq.Period as Period,
                sq.Id as Id,
                sq.LotsReceived as LotsReceived,
                sq.LotsAccepted as LotsAccepted,
                sq.LotsRejected as LotsRejected,
                sq.QtyReceived as QtyReceived,
                sq.QtyRejected as QtyRejected,
                sq.LotsWithValidDocs as LotsWithValidDocs,
                sq.NcrsRaised as NcrsRaised,
                sq.NcrsClosedOnTime as NcrsClosedOnTime,
                sq.CapaResponseDays as CapaResponseDays,
                sq.Version as Version
            FROM ERP_Quality.SupplierQuality sq
            JOIN Supplier s ON sq.SupplierCode = s.Code
            WHERE sq.Id = %s
            """
            cursor.execute(query, (out_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Supplier scorecard not found")
                
            c = dict_to_camel(row)
            c['uid'] = c['supplierCode']
            return c
            
    finally:
        conn.close()
