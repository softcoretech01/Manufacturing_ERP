import os
import pymysql
from dotenv import load_dotenv
import asyncio

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "ssberp")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ssberp")
DB_NAME = "ERP_Product"

async def setup_db():
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        autocommit=True
    )
    
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
            cursor.execute(f"USE {DB_NAME}")

            # 1. Create Tables
            create_tables_sql = """
            CREATE TABLE IF NOT EXISTS EngineeringChange (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                DocNo VARCHAR(50) UNIQUE NOT NULL,
                ChangeType VARCHAR(10) NOT NULL,
                Title VARCHAR(200) NOT NULL,
                Reason TEXT NOT NULL,
                Category VARCHAR(50) NOT NULL,
                Priority VARCHAR(20) NOT NULL,
                ProductCode VARCHAR(50) NOT NULL,
                RequestedBy VARCHAR(100) NOT NULL,
                RequestedOn DATE NOT NULL,
                EffectiveFrom DATE NOT NULL,
                ImpactNote TEXT NULL,
                Status VARCHAR(50) NOT NULL,
                SourceEcr VARCHAR(50) NULL,
                ResultingBom VARCHAR(100) NULL,
                IsActive BIT(1) DEFAULT b'1',
                CreatedBy VARCHAR(100),
                CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                ModifiedBy VARCHAR(100),
                ModifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
            """
            cursor.execute(create_tables_sql)

            create_lines_sql = """
            CREATE TABLE IF NOT EXISTS EngineeringChangeLine (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                ChangeId INT NOT NULL,
                BomDocNo VARCHAR(50) NOT NULL,
                Action VARCHAR(20) NOT NULL,
                ItemCode VARCHAR(50) NULL,
                NewItemCode VARCHAR(50) NULL,
                NewQtyPer DECIMAL(10,4) NULL,
                NewScrapPct DECIMAL(5,2) NULL,
                Note VARCHAR(255) NULL,
                FOREIGN KEY (ChangeId) REFERENCES EngineeringChange(Id) ON DELETE CASCADE
            );
            """
            cursor.execute(create_lines_sql)

            create_approvals_sql = """
            CREATE TABLE IF NOT EXISTS EngineeringChangeApproval (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                ChangeId INT NOT NULL,
                Level INT NOT NULL,
                Role VARCHAR(100) NOT NULL,
                Approver VARCHAR(100) NOT NULL,
                Status VARCHAR(20) NOT NULL,
                ActedAt DATETIME NULL,
                Remarks TEXT NULL,
                FOREIGN KEY (ChangeId) REFERENCES EngineeringChange(Id) ON DELETE CASCADE
            );
            """
            cursor.execute(create_approvals_sql)

            # 2. Create Stored Procedure
            cursor.execute("DROP PROCEDURE IF EXISTS SpManageEngineeringChange")
            
            create_sp_sql = """
            CREATE PROCEDURE SpManageEngineeringChange(
                IN p_Action VARCHAR(20),
                IN p_Payload JSON,
                IN p_User VARCHAR(100)
            )
            BEGIN
                DECLARE v_Id INT;
                DECLARE v_DocNo VARCHAR(50);
                DECLARE i INT DEFAULT 0;
                DECLARE num_lines INT DEFAULT 0;
                DECLARE num_approvals INT DEFAULT 0;
                
                IF p_Action = 'INSERT' THEN
                    SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.docNo'));
                    
                    INSERT INTO EngineeringChange (
                        DocNo, ChangeType, Title, Reason, Category, Priority,
                        ProductCode, RequestedBy, RequestedOn, EffectiveFrom,
                        ImpactNote, Status, SourceEcr, ResultingBom, IsActive,
                        CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                    ) VALUES (
                        v_DocNo,
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.changeType')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.title')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.reason')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.category')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.priority')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productCode')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.requestedBy')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.requestedOn')),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.effectiveFrom')),
                        IF(JSON_TYPE(JSON_EXTRACT(p_Payload, '$.impactNote')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.impactNote'))),
                        JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.status')),
                        IF(JSON_TYPE(JSON_EXTRACT(p_Payload, '$.sourceEcr')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.sourceEcr'))),
                        IF(JSON_TYPE(JSON_EXTRACT(p_Payload, '$.resultingBom')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.resultingBom'))),
                        b'1', p_User, CURRENT_TIMESTAMP, p_User, CURRENT_TIMESTAMP
                    );
                    
                    SET v_Id = LAST_INSERT_ID();
                    
                    -- Insert Lines
                    SET num_lines = JSON_LENGTH(JSON_EXTRACT(p_Payload, '$.changeLines'));
                    IF num_lines IS NOT NULL THEN
                        SET i = 0;
                        WHILE i < num_lines DO
                            INSERT INTO EngineeringChangeLine (
                                ChangeId, BomDocNo, Action, ItemCode, NewItemCode, NewQtyPer, NewScrapPct, Note
                            ) VALUES (
                                v_Id,
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].bomDocNo'))),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].action'))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].itemCode'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].itemCode')))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newItemCode'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newItemCode')))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newQtyPer'))) = 'NULL', NULL, CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newQtyPer'))) AS DECIMAL(10,4))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newScrapPct'))) = 'NULL', NULL, CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newScrapPct'))) AS DECIMAL(5,2))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].note'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].note'))))
                            );
                            SET i = i + 1;
                        END WHILE;
                    END IF;
                    
                    -- Insert Approvals
                    SET num_approvals = JSON_LENGTH(JSON_EXTRACT(p_Payload, '$.approvals'));
                    IF num_approvals IS NOT NULL THEN
                        SET i = 0;
                        WHILE i < num_approvals DO
                            INSERT INTO EngineeringChangeApproval (
                                ChangeId, Level, Role, Approver, Status, ActedAt, Remarks
                            ) VALUES (
                                v_Id,
                                CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].level'))) AS UNSIGNED),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].role'))),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].approver'))),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].status'))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].actedAt'))) = 'NULL', NULL, CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].actedAt'))) AS DATETIME)),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].remarks'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].remarks'))))
                            );
                            SET i = i + 1;
                        END WHILE;
                    END IF;
                    
                    SELECT v_Id AS InsertedId, v_DocNo AS InsertedDocNo;
                    
                ELSEIF p_Action = 'UPDATE' THEN
                    SET v_Id = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uid'));
                    
                    UPDATE EngineeringChange
                    SET
                        Title = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.title')),
                        Reason = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.reason')),
                        Category = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.category')),
                        Priority = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.priority')),
                        ProductCode = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productCode')),
                        EffectiveFrom = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.effectiveFrom')),
                        ImpactNote = IF(JSON_TYPE(JSON_EXTRACT(p_Payload, '$.impactNote')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.impactNote'))),
                        Status = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.status')),
                        ResultingBom = IF(JSON_TYPE(JSON_EXTRACT(p_Payload, '$.resultingBom')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.resultingBom'))),
                        ModifiedBy = p_User,
                        ModifiedDate = CURRENT_TIMESTAMP
                    WHERE Id = v_Id;
                    
                    -- Rebuild Lines
                    DELETE FROM EngineeringChangeLine WHERE ChangeId = v_Id;
                    SET num_lines = JSON_LENGTH(JSON_EXTRACT(p_Payload, '$.changeLines'));
                    IF num_lines IS NOT NULL THEN
                        SET i = 0;
                        WHILE i < num_lines DO
                            INSERT INTO EngineeringChangeLine (
                                ChangeId, BomDocNo, Action, ItemCode, NewItemCode, NewQtyPer, NewScrapPct, Note
                            ) VALUES (
                                v_Id,
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].bomDocNo'))),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].action'))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].itemCode'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].itemCode')))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newItemCode'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newItemCode')))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newQtyPer'))) = 'NULL', NULL, CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newQtyPer'))) AS DECIMAL(10,4))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newScrapPct'))) = 'NULL', NULL, CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].newScrapPct'))) AS DECIMAL(5,2))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].note'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.changeLines[', i, '].note'))))
                            );
                            SET i = i + 1;
                        END WHILE;
                    END IF;
                    
                    -- Rebuild Approvals
                    DELETE FROM EngineeringChangeApproval WHERE ChangeId = v_Id;
                    SET num_approvals = JSON_LENGTH(JSON_EXTRACT(p_Payload, '$.approvals'));
                    IF num_approvals IS NOT NULL THEN
                        SET i = 0;
                        WHILE i < num_approvals DO
                            INSERT INTO EngineeringChangeApproval (
                                ChangeId, Level, Role, Approver, Status, ActedAt, Remarks
                            ) VALUES (
                                v_Id,
                                CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].level'))) AS UNSIGNED),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].role'))),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].approver'))),
                                JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].status'))),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].actedAt'))) = 'NULL', NULL, CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].actedAt'))) AS DATETIME)),
                                IF(JSON_TYPE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].remarks'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_Payload, CONCAT('$.approvals[', i, '].remarks'))))
                            );
                            SET i = i + 1;
                        END WHILE;
                    END IF;
                    
                    SELECT v_Id AS UpdatedId;
                    
                ELSEIF p_Action = 'DELETE' THEN
                    SET v_Id = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uid'));
                    UPDATE EngineeringChange SET IsActive = b'0', ModifiedBy = p_User, ModifiedDate = CURRENT_TIMESTAMP WHERE Id = v_Id;
                    SELECT v_Id AS DeletedId;
                    
                ELSEIF p_Action = 'SELECT_ALL' THEN
                    SELECT 
                        c.Id, c.DocNo, c.ChangeType, c.Title, c.Reason, c.Category, c.Priority,
                        c.ProductCode, c.RequestedBy, c.RequestedOn, c.EffectiveFrom,
                        c.ImpactNote, c.Status, c.SourceEcr, c.ResultingBom, c.IsActive,
                        c.CreatedBy, c.CreatedDate, c.ModifiedBy, c.ModifiedDate,
                        (
                            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'uid', CONCAT('chl-', l.Id),
                                'bomDocNo', l.BomDocNo,
                                'action', l.Action,
                                'itemCode', l.ItemCode,
                                'newItemCode', l.NewItemCode,
                                'newQtyPer', l.NewQtyPer,
                                'newScrapPct', l.NewScrapPct,
                                'note', l.Note
                            ))
                            FROM EngineeringChangeLine l
                            WHERE l.ChangeId = c.Id
                        ) AS ChangeLines,
                        (
                            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'level', a.Level,
                                'role', a.Role,
                                'approver', a.Approver,
                                'status', a.Status,
                                'actedAt', a.ActedAt,
                                'remarks', a.Remarks
                            ))
                            FROM EngineeringChangeApproval a
                            WHERE a.ChangeId = c.Id
                        ) AS Approvals
                    FROM EngineeringChange c
                    WHERE c.IsActive = b'1';
                END IF;
            END;
            """
            cursor.execute(create_sp_sql)
            
            print("Successfully created EngineeringChange tables and stored procedure.")

    except Exception as e:
        print("Error:", e)
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(setup_db())
