import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "187.127.131.38")
DB_PORT = int(os.getenv("DB_PORT", 3308))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Ener9y_Demo@2026")
DB_NAME = "ERP_Product"

def run_setup():
    print(f"Connecting to MySQL on {DB_HOST}:{DB_PORT} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        autocommit=True
    )
    cursor = conn.cursor()

    try:
        # Create EngineeringRouting table
        print("Creating EngineeringRouting table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS EngineeringRouting (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                RouteCode VARCHAR(50) UNIQUE NOT NULL,
                ProductCode VARCHAR(50) NOT NULL,
                ProductName VARCHAR(150),
                Revision INT NOT NULL DEFAULT 1,
                Status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
                EffectiveFrom DATETIME NOT NULL,
                EffectiveTo DATETIME NULL,
                IsDefault BOOLEAN NOT NULL DEFAULT 0,
                CostingLotSize INT NOT NULL DEFAULT 1,
                CreatedBy VARCHAR(100) NOT NULL,
                CreatedDate DATETIME NOT NULL,
                ModifiedBy VARCHAR(100) NULL,
                ModifiedDate DATETIME NULL,
                ApprovedBy VARCHAR(100) NULL,
                ApprovedAt DATETIME NULL,
                SourceEcn VARCHAR(50) NULL,
                ChangeReason VARCHAR(1000) NULL,
                Version INT NOT NULL DEFAULT 1,
                DeletedAt DATETIME NULL
            )
        """)

        # Create EngineeringRoutingOperation table
        print("Creating EngineeringRoutingOperation table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS EngineeringRoutingOperation (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                RoutingId INT NOT NULL,
                Seq INT NOT NULL,
                OperationCode VARCHAR(50) NOT NULL,
                OperationName VARCHAR(150),
                WorkCentreCode VARCHAR(50) NOT NULL,
                MachineCode VARCHAR(50),
                SetupMinutes DECIMAL(10,2) NOT NULL DEFAULT 0,
                CycleSeconds DECIMAL(10,2) NOT NULL DEFAULT 0,
                Operators INT NOT NULL DEFAULT 1,
                Skill VARCHAR(50),
                ToolCode VARCHAR(50),
                QcCheckpoint BOOLEAN NOT NULL DEFAULT 0,
                Instructions VARCHAR(1000),
                FOREIGN KEY (RoutingId) REFERENCES EngineeringRouting(Id) ON DELETE CASCADE
            )
        """)

        # Create Stored Procedure
        print("Creating SpManageEngineeringRouting stored procedure...")
        cursor.execute("DROP PROCEDURE IF EXISTS SpManageEngineeringRouting")
        
        sp_sql = """
        CREATE PROCEDURE SpManageEngineeringRouting(
            IN p_Action VARCHAR(20),
            IN p_Uid VARCHAR(50),
            IN p_ProductCode VARCHAR(50),
            IN p_ProductName VARCHAR(150),
            IN p_Revision INT,
            IN p_Status VARCHAR(50),
            IN p_EffectiveFrom DATETIME,
            IN p_EffectiveTo DATETIME,
            IN p_IsDefault BOOLEAN,
            IN p_CostingLotSize INT,
            IN p_User VARCHAR(100),
            IN p_SourceEcn VARCHAR(50),
            IN p_ChangeReason VARCHAR(1000),
            IN p_OperationsJson JSON,
            IN p_ApprovedBy VARCHAR(100),
            IN p_ApprovedAt DATETIME
        )
        BEGIN
            DECLARE v_RoutingId INT;
            DECLARE v_RouteCode VARCHAR(50);
            DECLARE v_NextId INT;
            
            -- Error handling variables
            DECLARE exit handler for sqlexception
            BEGIN
                ROLLBACK;
                RESIGNAL;
            END;

            START TRANSACTION;

            IF p_Action = 'INSERT' THEN
                -- Auto generate RouteCode (e.g. RTG-0001)
                SELECT COALESCE(MAX(Id), 0) + 1 INTO v_NextId FROM EngineeringRouting;
                SET v_RouteCode = CONCAT('RTG-', LPAD(v_NextId, 4, '0'));
                
                INSERT INTO EngineeringRouting (
                    RouteCode, ProductCode, ProductName, Revision, Status, 
                    EffectiveFrom, EffectiveTo, IsDefault, CostingLotSize, 
                    CreatedBy, CreatedDate, SourceEcn, ChangeReason
                ) VALUES (
                    v_RouteCode, p_ProductCode, p_ProductName, COALESCE(p_Revision, 1), COALESCE(p_Status, 'DRAFT'),
                    p_EffectiveFrom, p_EffectiveTo, p_IsDefault, p_CostingLotSize,
                    p_User, NOW(), p_SourceEcn, p_ChangeReason
                );
                
                SET v_RoutingId = LAST_INSERT_ID();
                
                -- Insert operations if provided
                IF p_OperationsJson IS NOT NULL THEN
                    INSERT INTO EngineeringRoutingOperation (
                        RoutingId, Seq, OperationCode, OperationName, WorkCentreCode, 
                        MachineCode, SetupMinutes, CycleSeconds, Operators, Skill, 
                        ToolCode, QcCheckpoint, Instructions
                    )
                    SELECT 
                        v_RoutingId, 
                        Seq, OperationCode, OperationName, WorkCentreCode, 
                        MachineCode, SetupMinutes, CycleSeconds, Operators, Skill, 
                        ToolCode, QcCheckpoint, Instructions
                    FROM JSON_TABLE(
                        p_OperationsJson,
                        '$[*]' COLUMNS (
                            Seq INT PATH '$.seq',
                            OperationCode VARCHAR(50) PATH '$.operationCode',
                            OperationName VARCHAR(150) PATH '$.operationName',
                            WorkCentreCode VARCHAR(50) PATH '$.workCentreCode',
                            MachineCode VARCHAR(50) PATH '$.machineCode',
                            SetupMinutes DECIMAL(10,2) PATH '$.setupMinutes',
                            CycleSeconds DECIMAL(10,2) PATH '$.cycleSeconds',
                            Operators INT PATH '$.operators',
                            Skill VARCHAR(50) PATH '$.skill',
                            ToolCode VARCHAR(50) PATH '$.toolCode',
                            QcCheckpoint BOOLEAN PATH '$.qcCheckpoint',
                            Instructions VARCHAR(1000) PATH '$.instructions'
                        )
                    ) AS jt;
                END IF;
                
                SELECT v_RouteCode AS Uid;

            ELSEIF p_Action = 'UPDATE' THEN
                SELECT Id INTO v_RoutingId FROM EngineeringRouting WHERE RouteCode = p_Uid AND DeletedAt IS NULL;
                
                IF v_RoutingId IS NULL THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Routing not found or deleted';
                END IF;

                UPDATE EngineeringRouting 
                SET 
                    ProductCode = COALESCE(p_ProductCode, ProductCode),
                    ProductName = COALESCE(p_ProductName, ProductName),
                    Revision = COALESCE(p_Revision, Revision),
                    Status = COALESCE(p_Status, Status),
                    EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
                    EffectiveTo = p_EffectiveTo,
                    IsDefault = COALESCE(p_IsDefault, IsDefault),
                    CostingLotSize = COALESCE(p_CostingLotSize, CostingLotSize),
                    ModifiedBy = p_User,
                    ModifiedDate = NOW(),
                    SourceEcn = COALESCE(p_SourceEcn, SourceEcn),
                    ChangeReason = COALESCE(p_ChangeReason, ChangeReason),
                    ApprovedBy = COALESCE(p_ApprovedBy, ApprovedBy),
                    ApprovedAt = COALESCE(p_ApprovedAt, ApprovedAt),
                    Version = Version + 1
                WHERE Id = v_RoutingId;
                
                IF p_OperationsJson IS NOT NULL THEN
                    DELETE FROM EngineeringRoutingOperation WHERE RoutingId = v_RoutingId;
                    
                    INSERT INTO EngineeringRoutingOperation (
                        RoutingId, Seq, OperationCode, OperationName, WorkCentreCode, 
                        MachineCode, SetupMinutes, CycleSeconds, Operators, Skill, 
                        ToolCode, QcCheckpoint, Instructions
                    )
                    SELECT 
                        v_RoutingId, 
                        Seq, OperationCode, OperationName, WorkCentreCode, 
                        MachineCode, SetupMinutes, CycleSeconds, Operators, Skill, 
                        ToolCode, QcCheckpoint, Instructions
                    FROM JSON_TABLE(
                        p_OperationsJson,
                        '$[*]' COLUMNS (
                            Seq INT PATH '$.seq',
                            OperationCode VARCHAR(50) PATH '$.operationCode',
                            OperationName VARCHAR(150) PATH '$.operationName',
                            WorkCentreCode VARCHAR(50) PATH '$.workCentreCode',
                            MachineCode VARCHAR(50) PATH '$.machineCode',
                            SetupMinutes DECIMAL(10,2) PATH '$.setupMinutes',
                            CycleSeconds DECIMAL(10,2) PATH '$.cycleSeconds',
                            Operators INT PATH '$.operators',
                            Skill VARCHAR(50) PATH '$.skill',
                            ToolCode VARCHAR(50) PATH '$.toolCode',
                            QcCheckpoint BOOLEAN PATH '$.qcCheckpoint',
                            Instructions VARCHAR(1000) PATH '$.instructions'
                        )
                    ) AS jt;
                END IF;
                
                SELECT p_Uid AS Uid;

            ELSEIF p_Action = 'DELETE' THEN
                UPDATE EngineeringRouting 
                SET 
                    DeletedAt = NOW(), 
                    ModifiedBy = p_User,
                    ModifiedDate = NOW(),
                    Version = Version + 1 
                WHERE RouteCode = p_Uid AND DeletedAt IS NULL;
                
                SELECT p_Uid AS Uid;

            ELSEIF p_Action = 'SELECT_ALL' THEN
                SELECT 
                    r.RouteCode AS uid,
                    r.RouteCode AS docNo,
                    r.ProductCode AS productCode,
                    r.ProductName AS productName,
                    r.Revision AS revision,
                    r.Status AS status,
                    DATE_FORMAT(r.EffectiveFrom, '%Y-%m-%d') AS effectiveFrom,
                    DATE_FORMAT(r.EffectiveTo, '%Y-%m-%d') AS effectiveTo,
                    r.IsDefault AS isDefault,
                    r.CostingLotSize AS costingLotSize,
                    r.CreatedBy AS createdBy,
                    DATE_FORMAT(r.CreatedDate, '%Y-%m-%dT%H:%i:%sZ') AS createdAt,
                    r.ApprovedBy AS approvedBy,
                    DATE_FORMAT(r.ApprovedAt, '%Y-%m-%dT%H:%i:%sZ') AS approvedAt,
                    r.SourceEcn AS sourceEcn,
                    r.ChangeReason AS changeReason,
                    r.Version AS version,
                    (
                        SELECT JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'uid', CONCAT(r.RouteCode, '-', o.Seq),
                                'seq', o.Seq,
                                'operationCode', o.OperationCode,
                                'operationName', o.OperationName,
                                'workCentreCode', o.WorkCentreCode,
                                'machineCode', IFNULL(o.MachineCode, ''),
                                'setupMinutes', o.SetupMinutes,
                                'cycleSeconds', o.CycleSeconds,
                                'operators', o.Operators,
                                'skill', o.Skill,
                                'toolCode', IFNULL(o.ToolCode, ''),
                                'qcCheckpoint', o.QcCheckpoint,
                                'instructions', IFNULL(o.Instructions, '')
                            )
                        )
                        FROM EngineeringRoutingOperation o 
                        WHERE o.RoutingId = r.Id
                        ORDER BY o.Seq
                    ) AS operations
                FROM EngineeringRouting r
                WHERE r.DeletedAt IS NULL;
            END IF;

            COMMIT;
        END;
        """
        cursor.execute(sp_sql)
        print("Setup completed successfully in ERP_Product!")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    run_setup()
