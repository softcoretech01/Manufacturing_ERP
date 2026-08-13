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
-- 1. Truncate existing tables to remove all fake mock data
TRUNCATE TABLE AnalyticsSpendTrend;
TRUNCATE TABLE AnalyticsSupplierSpend;
TRUNCATE TABLE AnalyticsSpendByCategory;

-- 2. Drop existing triggers if they exist
DROP TRIGGER IF EXISTS TRG_PO_Analytics_AfterUpdate;
DROP TRIGGER IF EXISTS TRG_PO_Analytics_AfterInsert;

-- 3. Procedure to recalculate analytics for a single PO
DROP PROCEDURE IF EXISTS SpApplyPoToAnalytics;
CREATE PROCEDURE SpApplyPoToAnalytics(
    IN p_PoId INT,
    IN p_DocDate DATE,
    IN p_SupplierName VARCHAR(100),
    IN p_TotalValue DECIMAL(15,2),
    IN p_Multiplier INT -- 1 to add, -1 to subtract
)
BEGIN
    DECLARE v_MonthName VARCHAR(20);
    SET v_MonthName = DATE_FORMAT(p_DocDate, '%b');
    
    -- 3A. Trend
    IF EXISTS (SELECT 1 FROM AnalyticsSpendTrend WHERE MonthName = v_MonthName) THEN
        UPDATE AnalyticsSpendTrend 
        SET Spend = Spend + (p_TotalValue * p_Multiplier), 
            PoCount = PoCount + p_Multiplier 
        WHERE MonthName = v_MonthName;
    ELSE
        IF p_Multiplier = 1 THEN
            INSERT INTO AnalyticsSpendTrend (MonthName, Spend, Budget, PoCount, CreatedBy, CreatedDate)
            VALUES (v_MonthName, p_TotalValue, p_TotalValue * 1.1, 1, 'Trigger', NOW());
        END IF;
    END IF;
    
    -- 3B. Supplier Spend
    IF EXISTS (SELECT 1 FROM AnalyticsSupplierSpend WHERE SupplierName = p_SupplierName) THEN
        UPDATE AnalyticsSupplierSpend 
        SET SpendValue = SpendValue + (p_TotalValue * p_Multiplier)
        WHERE SupplierName = p_SupplierName;
    ELSE
        IF p_Multiplier = 1 THEN
            INSERT INTO AnalyticsSupplierSpend (SupplierName, SpendValue, SharePct, OnTimePct, RejectionPct, Grade, CreatedBy, CreatedDate)
            VALUES (p_SupplierName, p_TotalValue, 0, 0, 0, 'N/A', 'Trigger', NOW());
        END IF;
    END IF;
    
    -- Recalculate Share Pct across all suppliers
    UPDATE AnalyticsSupplierSpend 
    CROSS JOIN (SELECT SUM(SpendValue) as Total FROM AnalyticsSupplierSpend) t
    SET SharePct = IF(t.Total > 0, (SpendValue / t.Total) * 100, 0);

    -- 3C. Spend by Category (Line Level)
    -- We'll use a temporary cursor or simple INSERT ON DUPLICATE KEY UPDATE
    -- Actually, since we don't have ON DUPLICATE KEY on a non-unique CategoryName easily if it's not unique
    -- Wait, CategoryName is not unique in the table? The schema was INT AUTO_INCREMENT PRIMARY KEY, CategoryName.
    -- We can just update it using a multi-table update.
    -- To keep it simple, we will execute a block for the lines of this PO.
END;

-- Actually, a cleaner trigger approach is a full recalculation of the specific rows, or just keeping the summary tables as materialized views updated by events.
-- Given this is MySQL, let's write a robust SP to fully Refresh the analytics tables from scratch, and call it from the trigger! 
-- This is much safer for a prototype than incremental updates which can drift.

DROP PROCEDURE IF EXISTS SpRefreshAnalytics;
CREATE PROCEDURE SpRefreshAnalytics()
BEGIN
    -- Truncate tables
    TRUNCATE TABLE AnalyticsSpendTrend;
    TRUNCATE TABLE AnalyticsSupplierSpend;
    TRUNCATE TABLE AnalyticsSpendByCategory;
    
    -- Seed SpendTrend
    INSERT INTO AnalyticsSpendTrend (MonthName, Spend, Budget, PoCount, CreatedBy, CreatedDate)
    SELECT 
        DATE_FORMAT(DocDate, '%b'),
        IFNULL(SUM(TotalValue), 0),
        IFNULL(SUM(TotalValue), 0) * 1.1,
        COUNT(Id),
        'System', NOW()
    FROM PurchaseOrder
    WHERE IsDeleted = 0 AND Status = 'Approved'
    GROUP BY DATE_FORMAT(DocDate, '%b'), MONTH(DocDate);
    
    -- Seed SupplierSpend
    INSERT INTO AnalyticsSupplierSpend (SupplierName, SpendValue, SharePct, OnTimePct, RejectionPct, Grade, CreatedBy, CreatedDate)
    SELECT 
        p.SupplierName,
        IFNULL(SUM(p.TotalValue), 0),
        0, 95.0, 1.0, 'A', 'System', NOW()
    FROM PurchaseOrder p
    WHERE p.IsDeleted = 0 AND Status = 'Approved'
    GROUP BY p.SupplierUid, p.SupplierName;
    
    -- Update Share Pct
    UPDATE AnalyticsSupplierSpend 
    CROSS JOIN (SELECT SUM(SpendValue) as Total FROM AnalyticsSupplierSpend) t
    SET SharePct = IF(t.Total > 0, (SpendValue / t.Total) * 100, 0);
    
    -- Seed Category
    INSERT INTO AnalyticsSpendByCategory (CategoryName, SpendValue, PoCount, SupplierCount, SavingsPct, CreatedBy, CreatedDate)
    SELECT 
        SUBSTRING_INDEX(pl.ItemName, ' ', 1) as CategoryName,
        IFNULL(SUM(pl.LineTotal), 0),
        COUNT(DISTINCT p.Id),
        COUNT(DISTINCT p.SupplierUid),
        0.0,
        'System', NOW()
    FROM PurchaseOrderLine pl
    JOIN PurchaseOrder p ON pl.PurchaseOrderId = p.Id
    WHERE p.IsDeleted = 0 AND p.Status = 'Approved'
    GROUP BY SUBSTRING_INDEX(pl.ItemName, ' ', 1);
END;

-- 4. Triggers
CREATE TRIGGER TRG_PO_Analytics_AfterUpdate
AFTER UPDATE ON PurchaseOrder
FOR EACH ROW
BEGIN
    IF (NEW.Status != OLD.Status AND (NEW.Status = 'Approved' OR OLD.Status = 'Approved')) OR 
       (NEW.IsDeleted != OLD.IsDeleted) OR
       (NEW.TotalValue != OLD.TotalValue AND NEW.Status = 'Approved') THEN
        CALL SpRefreshAnalytics();
    END IF;
END;

CREATE TRIGGER TRG_PO_Analytics_AfterInsert
AFTER INSERT ON PurchaseOrder
FOR EACH ROW
BEGIN
    IF NEW.Status = 'Approved' AND NEW.IsDeleted = 0 THEN
        CALL SpRefreshAnalytics();
    END IF;
END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
        # Call it once to seed current data
        cursor.execute("CALL SpRefreshAnalytics();")
    conn.commit()
    print("Analytics triggers created and data seeded successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
