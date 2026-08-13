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
    SELECT CategoryName as category, SpendValue as value, PoCount as poCount, SupplierCount as suppliers, SavingsPct as savingsPct 
    FROM AnalyticsSpendByCategory;

    -- 2. spendTrend
    SELECT MonthName as month, Spend as spend, Budget as budget, PoCount as poCount 
    FROM AnalyticsSpendTrend;

    -- 3. supplierSpend
    SELECT SupplierName as supplierName, SpendValue as value, SharePct as sharePct, OnTimePct as onTimePct, RejectionPct as rejectionPct, Grade as grade 
    FROM AnalyticsSupplierSpend;

    -- 4. priceTrend
    SELECT MonthName as month, Ss304Price as ss304, Ss316Price as ss316, LidPrice as lid 
    FROM AnalyticsPriceTrend;

    -- 5. cycleTimes
    SELECT StageName as stage, AvgDays as avgDays, TargetDays as targetDays 
    FROM AnalyticsCycleTime;
END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
    conn.commit()
    print("Fixed SpGetLiveAnalytics!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
