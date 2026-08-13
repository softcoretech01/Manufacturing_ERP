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
DROP PROCEDURE IF EXISTS SpManageProcurementDashboard;

CREATE PROCEDURE SpManageProcurementDashboard(
    IN p_Action VARCHAR(50),
    IN p_Payload JSON
)
BEGIN
    IF p_Action = 'GET_DASHBOARD' THEN
        
        -- 1. KPIs
        SELECT 
            (SELECT COUNT(*) FROM PurchaseOrder WHERE Status IN ('APPROVED', 'PARTIALLY_EXECUTED', 'IN_PROGRESS', 'ON_HOLD') AND IsDeleted = 0) AS openPoCount,
            (SELECT IFNULL(SUM(TotalValue * (1 - ReceivedPct / 100)), 0) FROM PurchaseOrder WHERE Status IN ('APPROVED', 'PARTIALLY_EXECUTED', 'IN_PROGRESS', 'ON_HOLD') AND IsDeleted = 0) AS openValue,
            (SELECT IFNULL(SUM(Spend), 0) FROM AnalyticsSpendTrend) AS ytdSpend,
            (SELECT IFNULL(SUM(Budget), 0) FROM AnalyticsSpendTrend) AS budget,
            (SELECT COUNT(*) FROM PurchaseRequisition WHERE Status = 'PENDING_APPROVAL' AND IsDeleted = 0) AS prPending,
            (SELECT COUNT(*) FROM PurchaseOrder WHERE Status = 'PENDING_APPROVAL' AND IsDeleted = 0) AS poPending,
            (SELECT COUNT(*) FROM Rfq WHERE Status IN ('IN_PROGRESS', 'PENDING_APPROVAL') AND IsDeleted = 0) AS rfqOpen,
            (SELECT COUNT(*) FROM RfqSupplier WHERE ResponseStatus IN ('INVITED', 'VIEWED')) AS quotesAwaiting,
            (SELECT COUNT(*) FROM Asn WHERE Status IN ('IN_TRANSIT', 'NOTIFIED') AND DeletedAt IS NULL) AS inTransit,
            (SELECT COUNT(*) FROM IncomingInspection WHERE Status IN ('PENDING', 'IN_PROGRESS')) AS qcPending,
            (SELECT COUNT(*) FROM Grn WHERE Status != 'CANCELLED' AND DelayDays <= 0) AS onTimeCount,
            (SELECT COUNT(*) FROM Grn WHERE Status != 'CANCELLED') AS totalGrnCount,
            (SELECT IFNULL(SUM(TotalReceived), 0) FROM Grn WHERE Status != 'CANCELLED') AS totalReceived,
            (SELECT IFNULL(SUM(TotalRejected), 0) FROM Grn WHERE Status != 'CANCELLED') AS totalRejected,
            (SELECT IFNULL(SUM(BasicValue * 0.1), 0) FROM SupplierQuotation WHERE Status = 'AWARDED' AND IsDeleted = 0) AS savings
        ;
        
        -- 2. Expiring Contracts (<= 90 days)
        SELECT 
            Id as id, Uid as uid, DocNo as docNo, SupplierUid as supplierUid, SupplierName as supplierName, 
            Title as title, ValidTo as validTo, Status as status,
            DATEDIFF(ValidTo, NOW()) as days
        FROM ProcContract
        WHERE Status IN ('ACTIVE', 'EXPIRING') AND DATEDIFF(ValidTo, NOW()) <= 90 AND DeletedAt IS NULL
        ORDER BY days ASC;

        -- 3. Risk Suppliers (Grade C or D)
        SELECT 
            Id as id, Uid as uid, SupplierUid as supplierUid, SupplierName as supplierName, 
            Grade as grade, OverallScore as overallScore
        FROM SupplierEvaluation
        WHERE Grade IN ('C', 'D') AND DeletedAt IS NULL
        ORDER BY overallScore ASC;

        -- 4. Overdue POs
        SELECT 
            Id as id, DocNo as docNo, SupplierName as supplierName, TotalValue as totalValue, 
            Status as status, PromisedDate as promisedDate,
            DATEDIFF(NOW(), PromisedDate) as days
        FROM PurchaseOrder
        WHERE Status IN ('APPROVED', 'PARTIALLY_EXECUTED', 'ON_HOLD') AND IsDeleted = 0 
          AND PromisedDate < NOW()
        ORDER BY days DESC;
        
        -- 5. Spend By Category
        SELECT CategoryName as category, SpendValue as value
        FROM AnalyticsSpendByCategory
        ORDER BY SpendValue DESC LIMIT 6;

        -- 6. Spend Trend
        SELECT MonthName as month, Spend as spend, Budget as budget, PoCount as poCount
        FROM AnalyticsSpendTrend
        ORDER BY TrendId ASC;
        
        -- 7. Supplier Spend
        SELECT SupplierName as supplierName, SpendValue as value, SharePct as sharePct, OnTimePct as onTimePct, RejectionPct as rejectionPct, Grade as grade
        FROM AnalyticsSupplierSpend
        ORDER BY SpendValue DESC LIMIT 5;

        -- 8. Recent POs
        SELECT Id as uid, DocNo as docNo, SupplierName as supplierName, TotalValue as totalValue, Status as status
        FROM PurchaseOrder
        WHERE IsDeleted = 0
        ORDER BY CreatedDate DESC LIMIT 6;
        
        -- 9. Recent GRNs
        SELECT Id as uid, DocNo as docNo, SupplierName as supplierName, GrnValue as grnValue, QcStatus as qcStatus
        FROM Grn
        ORDER BY CreatedDate DESC LIMIT 6;

    END IF;
END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
    conn.commit()
    print("SpManageProcurementDashboard created successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
