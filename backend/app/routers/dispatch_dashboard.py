from fastapi import APIRouter, HTTPException
import pymysql
from app.core.config import settings

router = APIRouter(prefix="/dispatch/dashboard", tags=["dispatch-dashboard"])

def get_db_connection():
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database="ERP_Packing",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

@router.get("/analytics")
def get_dashboard_analytics():
    """
    Returns analytics aggregates for the dispatch dashboard.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. 7-day Dispatch Trend
        # We'll just do a 7-day fallback with some basic grouping on Shipment and DispatchPlan
        trend = []
        import datetime
        today = datetime.date.today()
        for i in range(6, -1, -1):
            d = today - datetime.timedelta(days=i)
            # Planned (DispatchPlan)
            cursor.execute("SELECT IFNULL(SUM(Cartons), 0) as p FROM DispatchPlan WHERE DATE(CreatedDate) = %s", (d,))
            planned = cursor.fetchone()['p']
            
            # Dispatched (Shipment)
            cursor.execute("SELECT IFNULL(SUM(Cartons), 0) as disp FROM Shipment WHERE DATE(CreatedDate) = %s", (d,))
            dispatched = cursor.fetchone()['disp']
            
            # Delivered (Shipment)
            cursor.execute("SELECT IFNULL(SUM(Cartons), 0) as deliv FROM Shipment WHERE Status IN ('DELIVERED', 'CLOSED') AND DATE(DeliveredAt) = %s", (d,))
            delivered = cursor.fetchone()['deliv']
            
            trend.append({
                "day": d.strftime("%a").lower(),
                "planned": int(planned),
                "dispatched": int(dispatched),
                "delivered": int(delivered)
            })
            
        # 2. Region Dispatch
        cursor.execute('''
            SELECT 
                IFNULL(Destination, 'Unknown') as region, 
                SUM(Cartons) as cartons
            FROM Shipment
            GROUP BY Destination
            ORDER BY cartons DESC
            LIMIT 5
        ''')
        region_rows = cursor.fetchall()
        region_dispatch = []
        for r in region_rows:
            region_dispatch.append({
                "region": r['region'],
                "cartons": int(r['cartons']),
                "onTimePct": 100 # Mock calculation for now, since ETA logic is complex in SQL
            })
            
        # 3. Transporter Scores
        cursor.execute('''
            SELECT 
                Transporter as transporter, 
                OnTimePct as onTimePct 
            FROM TransporterScore 
            ORDER BY OnTimePct DESC 
            LIMIT 10
        ''')
        transporter_scores = cursor.fetchall()
        for t in transporter_scores:
            t['onTimePct'] = float(t['onTimePct'])

        return {
            "dispatchTrend": trend,
            "regionDispatch": region_dispatch,
            "transporterScores": transporter_scores
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
