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
-- 1. AnalyticsSpendByCategory
CREATE TABLE IF NOT EXISTS AnalyticsSpendByCategory (
    CategoryId INT AUTO_INCREMENT PRIMARY KEY,
    CategoryName VARCHAR(100) NOT NULL,
    SpendValue DECIMAL(15,2) NOT NULL DEFAULT 0,
    PoCount INT NOT NULL DEFAULT 0,
    SupplierCount INT NOT NULL DEFAULT 0,
    SavingsPct DECIMAL(5,2) NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

-- 2. AnalyticsSpendTrend
CREATE TABLE IF NOT EXISTS AnalyticsSpendTrend (
    TrendId INT AUTO_INCREMENT PRIMARY KEY,
    MonthName VARCHAR(20) NOT NULL,
    Spend DECIMAL(15,2) NOT NULL DEFAULT 0,
    Budget DECIMAL(15,2) NOT NULL DEFAULT 0,
    PoCount INT NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

-- 3. AnalyticsSupplierSpend
CREATE TABLE IF NOT EXISTS AnalyticsSupplierSpend (
    SupplierSpendId INT AUTO_INCREMENT PRIMARY KEY,
    SupplierName VARCHAR(100) NOT NULL,
    SpendValue DECIMAL(15,2) NOT NULL DEFAULT 0,
    SharePct DECIMAL(5,2) NOT NULL DEFAULT 0,
    OnTimePct DECIMAL(5,2) NOT NULL DEFAULT 0,
    RejectionPct DECIMAL(5,2) NOT NULL DEFAULT 0,
    Grade VARCHAR(5),
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

-- 4. AnalyticsPriceTrend
CREATE TABLE IF NOT EXISTS AnalyticsPriceTrend (
    PriceTrendId INT AUTO_INCREMENT PRIMARY KEY,
    MonthName VARCHAR(20) NOT NULL,
    Ss304Price DECIMAL(10,2) NOT NULL DEFAULT 0,
    Ss316Price DECIMAL(10,2) NOT NULL DEFAULT 0,
    LidPrice DECIMAL(10,2) NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

-- 5. AnalyticsCycleTime
CREATE TABLE IF NOT EXISTS AnalyticsCycleTime (
    CycleTimeId INT AUTO_INCREMENT PRIMARY KEY,
    StageName VARCHAR(100) NOT NULL,
    AvgDays DECIMAL(10,2) NOT NULL DEFAULT 0,
    TargetDays DECIMAL(10,2) NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DROP PROCEDURE IF EXISTS SpManageAnalytics;

CREATE PROCEDURE SpManageAnalytics (
    IN p_Action VARCHAR(50),
    IN p_Payload JSON
)
BEGIN
    DECLARE v_CreatedBy VARCHAR(100);
    DECLARE v_CreatedDate DATETIME;
    
    SET v_CreatedBy = 'System';
    SET v_CreatedDate = NOW();
    
    IF p_Action = 'REPLACE_ALL' THEN
        -- Clear existing data
        TRUNCATE TABLE AnalyticsSpendByCategory;
        TRUNCATE TABLE AnalyticsSpendTrend;
        TRUNCATE TABLE AnalyticsSupplierSpend;
        TRUNCATE TABLE AnalyticsPriceTrend;
        TRUNCATE TABLE AnalyticsCycleTime;
        
        -- 1. Insert SpendByCategory
        IF JSON_CONTAINS_PATH(p_Payload, 'one', '$.spendByCategory') THEN
            INSERT INTO AnalyticsSpendByCategory (CategoryName, SpendValue, PoCount, SupplierCount, SavingsPct, CreatedBy, CreatedDate)
            SELECT 
                CategoryName, SpendValue, PoCount, SupplierCount, SavingsPct, v_CreatedBy, v_CreatedDate
            FROM JSON_TABLE(
                p_Payload, '$.spendByCategory[*]'
                COLUMNS (
                    CategoryName VARCHAR(100) PATH '$.category',
                    SpendValue DECIMAL(15,2) PATH '$.value',
                    PoCount INT PATH '$.poCount',
                    SupplierCount INT PATH '$.suppliers',
                    SavingsPct DECIMAL(5,2) PATH '$.savingsPct'
                )
            ) jt;
        END IF;
        
        -- 2. Insert SpendTrend
        IF JSON_CONTAINS_PATH(p_Payload, 'one', '$.spendTrend') THEN
            INSERT INTO AnalyticsSpendTrend (MonthName, Spend, Budget, PoCount, CreatedBy, CreatedDate)
            SELECT 
                MonthName, Spend, Budget, PoCount, v_CreatedBy, v_CreatedDate
            FROM JSON_TABLE(
                p_Payload, '$.spendTrend[*]'
                COLUMNS (
                    MonthName VARCHAR(20) PATH '$.month',
                    Spend DECIMAL(15,2) PATH '$.spend',
                    Budget DECIMAL(15,2) PATH '$.budget',
                    PoCount INT PATH '$.poCount'
                )
            ) jt;
        END IF;

        -- 3. Insert SupplierSpend
        IF JSON_CONTAINS_PATH(p_Payload, 'one', '$.supplierSpend') THEN
            INSERT INTO AnalyticsSupplierSpend (SupplierName, SpendValue, SharePct, OnTimePct, RejectionPct, Grade, CreatedBy, CreatedDate)
            SELECT 
                SupplierName, SpendValue, SharePct, OnTimePct, RejectionPct, Grade, v_CreatedBy, v_CreatedDate
            FROM JSON_TABLE(
                p_Payload, '$.supplierSpend[*]'
                COLUMNS (
                    SupplierName VARCHAR(100) PATH '$.supplierName',
                    SpendValue DECIMAL(15,2) PATH '$.value',
                    SharePct DECIMAL(5,2) PATH '$.sharePct',
                    OnTimePct DECIMAL(5,2) PATH '$.onTimePct',
                    RejectionPct DECIMAL(5,2) PATH '$.rejectionPct',
                    Grade VARCHAR(5) PATH '$.grade'
                )
            ) jt;
        END IF;

        -- 4. Insert PriceTrend
        IF JSON_CONTAINS_PATH(p_Payload, 'one', '$.priceTrend') THEN
            INSERT INTO AnalyticsPriceTrend (MonthName, Ss304Price, Ss316Price, LidPrice, CreatedBy, CreatedDate)
            SELECT 
                MonthName, Ss304Price, Ss316Price, LidPrice, v_CreatedBy, v_CreatedDate
            FROM JSON_TABLE(
                p_Payload, '$.priceTrend[*]'
                COLUMNS (
                    MonthName VARCHAR(20) PATH '$.month',
                    Ss304Price DECIMAL(10,2) PATH '$.ss304',
                    Ss316Price DECIMAL(10,2) PATH '$.ss316',
                    LidPrice DECIMAL(10,2) PATH '$.lid'
                )
            ) jt;
        END IF;
        
        -- 5. Insert CycleTime
        IF JSON_CONTAINS_PATH(p_Payload, 'one', '$.cycleTimes') THEN
            INSERT INTO AnalyticsCycleTime (StageName, AvgDays, TargetDays, CreatedBy, CreatedDate)
            SELECT 
                StageName, AvgDays, TargetDays, v_CreatedBy, v_CreatedDate
            FROM JSON_TABLE(
                p_Payload, '$.cycleTimes[*]'
                COLUMNS (
                    StageName VARCHAR(100) PATH '$.stage',
                    AvgDays DECIMAL(10,2) PATH '$.avgDays',
                    TargetDays DECIMAL(10,2) PATH '$.targetDays'
                )
            ) jt;
        END IF;
        
        SELECT 'SUCCESS' AS Status;
    END IF;
END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
    conn.commit()
    print("Analytics tables and stored procedure created successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
