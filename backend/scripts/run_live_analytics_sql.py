import pymysql
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

conn = pymysql.connect(
    host=os.getenv('DB_HOST', '187.127.131.38'),
    port=int(os.getenv('DB_PORT', 3308)),
    user=os.getenv('DB_USER', 'root'),
    password=os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026'),
    database='ERP_Procurement',
    client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
)

sql = """
DROP PROCEDURE IF EXISTS SpGetLiveAnalytics;

CREATE PROCEDURE SpGetLiveAnalytics ()
BEGIN
    -- 1. spendByCategory
    -- Using the first word of ItemName as a pseudo-category for the prototype
    SELECT 
        SUBSTRING_INDEX(pl.ItemName, ' ', 1) as category,
        IFNULL(SUM(pl.LineTotal), 0) as value,
        COUNT(DISTINCT p.Id) as poCount,
        COUNT(DISTINCT p.SupplierUid) as suppliers,
        0.0 as savingsPct
    FROM PurchaseOrderLine pl
    JOIN PurchaseOrder p ON pl.PurchaseOrderId = p.Id
    WHERE p.IsDeleted = 0
    GROUP BY SUBSTRING_INDEX(pl.ItemName, ' ', 1)
    ORDER BY value DESC;

    -- 2. spendTrend
    -- Grouping by month of DocDate
    SELECT 
        DATE_FORMAT(DocDate, '%b') as month,
        IFNULL(SUM(TotalValue), 0) as spend,
        IFNULL(SUM(TotalValue), 0) * 1.1 as budget, -- Simulating budget as 110% of spend
        COUNT(Id) as poCount
    FROM PurchaseOrder
    WHERE IsDeleted = 0
    GROUP BY DATE_FORMAT(DocDate, '%b'), MONTH(DocDate)
    ORDER BY MONTH(DocDate);

    -- 3. supplierSpend
    -- Aggregating total value by Supplier
    SELECT 
        p.SupplierName as supplierName,
        IFNULL(SUM(p.TotalValue), 0) as value,
        15.0 as sharePct,
        95.0 as onTimePct,
        1.0 as rejectionPct,
        'A' as grade
    FROM PurchaseOrder p
    WHERE p.IsDeleted = 0
    GROUP BY p.SupplierUid, p.SupplierName
    ORDER BY value DESC
    LIMIT 10;

    -- 4. priceTrend
    -- Stubbed for now, hard to get live price trends without specific item tracking
    SELECT 'Jan' as month, 215 as ss304, 310 as ss316, 45 as lid UNION ALL
    SELECT 'Feb' as month, 220 as ss304, 305 as ss316, 45 as lid UNION ALL
    SELECT 'Mar' as month, 235 as ss304, 320 as ss316, 46 as lid UNION ALL
    SELECT 'Apr' as month, 230 as ss304, 315 as ss316, 48 as lid UNION ALL
    SELECT 'May' as month, 240 as ss304, 325 as ss316, 49 as lid UNION ALL
    SELECT 'Jun' as month, 245 as ss304, 330 as ss316, 50 as lid;

    -- 5. cycleTimes
    -- Stubbed for now
    SELECT 'Requisition to PO' as stage, 4.5 as avgDays, 5.0 as targetDays UNION ALL
    SELECT 'PO to delivery' as stage, 12.0 as avgDays, 14.0 as targetDays UNION ALL
    SELECT 'Quality inspection' as stage, 1.2 as avgDays, 2.0 as targetDays UNION ALL
    SELECT 'Invoice processing' as stage, 3.5 as avgDays, 5.0 as targetDays UNION ALL
    SELECT 'Payment release' as stage, 42.0 as avgDays, 45.0 as targetDays;

END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
    conn.commit()
    print("SpGetLiveAnalytics (Live Aggregation) created successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
