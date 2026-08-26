from fastapi import APIRouter, HTTPException, Depends
from typing import Any
import pymysql
import os
import json
from dotenv import load_dotenv
from app.schemas.analytics import AnalyticsPayload
from decimal import Decimal

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

@router.get("/")
def get_analytics():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Call the live aggregation procedure
            cursor.execute("CALL SpGetLiveAnalytics()")
            
            # 1. spendByCategory
            spend_by_category = cursor.fetchall()
            for r in spend_by_category:
                r['value'] = float(r['value']) if r.get('value') is not None else 0.0
                r['savingsPct'] = float(r['savingsPct']) if r.get('savingsPct') is not None else 0.0
            
            # Move to next result set
            cursor.nextset()
            
            # 2. spendTrend
            spend_trend = cursor.fetchall()
            for r in spend_trend:
                r['spend'] = float(r['spend']) if r.get('spend') is not None else 0.0
                r['budget'] = float(r['budget']) if r.get('budget') is not None else 0.0
                
            # Move to next result set
            cursor.nextset()
            
            # 3. supplierSpend
            supplier_spend = cursor.fetchall()
            for r in supplier_spend:
                r['value'] = float(r['value']) if r.get('value') is not None else 0.0
                r['sharePct'] = float(r['sharePct']) if r.get('sharePct') is not None else 0.0
                r['onTimePct'] = float(r['onTimePct']) if r.get('onTimePct') is not None else 0.0
                r['rejectionPct'] = float(r['rejectionPct']) if r.get('rejectionPct') is not None else 0.0
                
            # Move to next result set
            cursor.nextset()
            
            # 4. priceTrend
            price_trend = cursor.fetchall()
            for r in price_trend:
                r['ss304'] = float(r['ss304']) if r.get('ss304') is not None else 0.0
                r['ss316'] = float(r['ss316']) if r.get('ss316') is not None else 0.0
                r['lid'] = float(r['lid']) if r.get('lid') is not None else 0.0
                
            # Move to next result set
            cursor.nextset()
            
            # 5. cycleTimes
            cycle_times = cursor.fetchall()
            for r in cycle_times:
                r['avgDays'] = float(r['avgDays']) if r.get('avgDays') is not None else 0.0
                r['targetDays'] = float(r['targetDays']) if r.get('targetDays') is not None else 0.0

            return {
                "spendByCategory": spend_by_category,
                "spendTrend": spend_trend,
                "supplierSpend": supplier_spend,
                "priceTrend": price_trend,
                "cycleTimes": cycle_times
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/")
def update_analytics(payload: AnalyticsPayload):
    # Still leaving this here in case manual seeding is needed later,
    # but it updates the standalone tables, not the live ones.
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            json_payload = json.dumps(payload.model_dump(exclude_none=True))
            cursor.execute("CALL SpManageAnalytics(%s, %s)", ('REPLACE_ALL', json_payload))
            result = cursor.fetchone()
        conn.commit()
        return {"status": "SUCCESS"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
