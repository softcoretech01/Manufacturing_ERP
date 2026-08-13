import pymysql
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

conn = pymysql.connect(
    host=os.getenv('DB_HOST', '187.127.131.38'),
    port=int(os.getenv('DB_PORT', 3308)),
    user=os.getenv('DB_USER', 'root'),
    password=os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026'),
    database='ERP_Product',
    client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
)

sql = """
DROP TABLE IF EXISTS EngineeringBomLine;
DROP TABLE IF EXISTS EngineeringBom;

CREATE TABLE EngineeringBom (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) UNIQUE NOT NULL,
    ProductCode VARCHAR(50) NOT NULL,
    ProductName VARCHAR(150),
    BomType VARCHAR(50) NOT NULL,
    Revision INT NOT NULL DEFAULT 1,
    Status VARCHAR(50) NOT NULL,
    BaseQty DECIMAL(14,4) NOT NULL,
    Uom VARCHAR(20) NOT NULL,
    EffectiveFrom DATETIME NOT NULL,
    EffectiveTo DATETIME,
    IsDefault BOOLEAN NOT NULL DEFAULT FALSE,
    AlternateFor VARCHAR(150),
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME,
    ApprovedBy VARCHAR(100),
    ApprovedAt DATETIME,
    SourceEcn VARCHAR(50),
    ChangeReason VARCHAR(1000),
    Version INT NOT NULL DEFAULT 1,
    DeletedAt DATETIME
);

CREATE TABLE EngineeringBomLine (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    BomId INT NOT NULL,
    Seq INT NOT NULL,
    ItemCode VARCHAR(50) NOT NULL,
    ItemName VARCHAR(150),
    Uom VARCHAR(20),
    QtyPer DECIMAL(14,6) NOT NULL,
    ScrapPct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    IsPhantom BOOLEAN NOT NULL DEFAULT FALSE,
    OperationSeq INT,
    Notes VARCHAR(1000),
    FOREIGN KEY (BomId) REFERENCES EngineeringBom(Id) ON DELETE CASCADE
);

DROP PROCEDURE IF EXISTS SpManageEngineeringBom;

CREATE PROCEDURE SpManageEngineeringBom(
    IN p_Action VARCHAR(50),
    IN p_Payload JSON,
    IN p_Id INT
)
BEGIN
    DECLARE v_Id INT;
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_NewCodeNumber INT;
    
    IF p_Action = 'INSERT' THEN
        -- Auto-increment DocNo (BOM-0001 format) if not provided
        SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.docNo'));
        
        IF v_DocNo IS NULL OR v_DocNo = '' OR v_DocNo = 'null' THEN
            SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 5) AS UNSIGNED)), 0) + 1 INTO v_NewCodeNumber 
            FROM EngineeringBom WHERE DocNo LIKE 'BOM-%';
            SET v_DocNo = CONCAT('BOM-', LPAD(v_NewCodeNumber, 4, '0'));
        END IF;

        INSERT INTO EngineeringBom (
            DocNo, ProductCode, ProductName, BomType, Revision, Status, BaseQty, Uom,
            EffectiveFrom, EffectiveTo, IsDefault, AlternateFor, CreatedBy, CreatedAt,
            ApprovedBy, ApprovedAt, SourceEcn, ChangeReason, Version
        ) VALUES (
            v_DocNo,
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productCode')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productName')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.bomType')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.revision')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.status')),
            CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.baseQty')) AS DECIMAL(14,4)),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uom')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.effectiveFrom')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.effectiveTo')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.isDefault')) = 'true',
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.alternateFor')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.createdBy')),
            NOW(),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.approvedBy')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.approvedAt')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.sourceEcn')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.changeReason')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.version')), 'null')
        );

        SET v_Id = LAST_INSERT_ID();

        -- Insert BomLines
        INSERT INTO EngineeringBomLine (
            BomId, Seq, ItemCode, ItemName, Uom, QtyPer, ScrapPct, IsPhantom, OperationSeq, Notes
        )
        SELECT 
            v_Id,
            jt.seq,
            jt.itemCode,
            jt.itemName,
            jt.uom,
            jt.qtyPer,
            jt.scrapPct,
            jt.isPhantom,
            jt.operationSeq,
            jt.notes
        FROM JSON_TABLE(
            JSON_EXTRACT(p_Payload, '$.lines'),
            '$[*]' COLUMNS (
                seq INT PATH '$.seq',
                itemCode VARCHAR(50) PATH '$.itemCode',
                itemName VARCHAR(150) PATH '$.itemName',
                uom VARCHAR(20) PATH '$.uom',
                qtyPer DECIMAL(14,6) PATH '$.qtyPer',
                scrapPct DECIMAL(5,2) PATH '$.scrapPct',
                isPhantom BOOLEAN PATH '$.isPhantom',
                operationSeq INT PATH '$.operationSeq',
                notes VARCHAR(1000) PATH '$.notes'
            )
        ) AS jt;
        
        SELECT v_Id AS Id, v_DocNo AS DocNo;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_Id = p_Id;
        
        UPDATE EngineeringBom SET
            ProductCode = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productCode')), ProductCode),
            ProductName = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productName')), ProductName),
            BomType = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.bomType')), BomType),
            Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.status')), Status),
            BaseQty = IFNULL(CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.baseQty')) AS DECIMAL(14,4)), BaseQty),
            Uom = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uom')), Uom),
            EffectiveFrom = IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.effectiveFrom')), 'null'), EffectiveFrom),
            EffectiveTo = IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.effectiveTo')), 'null'), EffectiveTo),
            IsDefault = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.isDefault')) = 'true', IsDefault),
            AlternateFor = IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.alternateFor')), 'null'), AlternateFor),
            ChangeReason = IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.changeReason')), 'null'), ChangeReason),
            Version = Version + 1
        WHERE Id = v_Id AND DeletedAt IS NULL;
        
        -- Delete old lines and reinsert if lines are provided
        IF JSON_EXTRACT(p_Payload, '$.lines') IS NOT NULL THEN
            DELETE FROM EngineeringBomLine WHERE BomId = v_Id;
            
            INSERT INTO EngineeringBomLine (
                BomId, Seq, ItemCode, ItemName, Uom, QtyPer, ScrapPct, IsPhantom, OperationSeq, Notes
            )
            SELECT 
                v_Id, jt.seq, jt.itemCode, jt.itemName, jt.uom, jt.qtyPer, jt.scrapPct, jt.isPhantom, jt.operationSeq, jt.notes
            FROM JSON_TABLE(
                JSON_EXTRACT(p_Payload, '$.lines'),
                '$[*]' COLUMNS (
                    seq INT PATH '$.seq',
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(150) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    qtyPer DECIMAL(14,6) PATH '$.qtyPer',
                    scrapPct DECIMAL(5,2) PATH '$.scrapPct',
                    isPhantom BOOLEAN PATH '$.isPhantom',
                    operationSeq INT PATH '$.operationSeq',
                    notes VARCHAR(1000) PATH '$.notes'
                )
            ) AS jt;
        END IF;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE EngineeringBom SET DeletedAt = NOW() WHERE Id = p_Id;
        
    ELSEIF p_Action = 'APPROVE' THEN
        -- Superseding logic and approval logic is done via UPDATE or a specific APPROVE action
        UPDATE EngineeringBom SET
            Status = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.status')),
            ApprovedBy = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.approvedBy')),
            ApprovedAt = NOW()
        WHERE Id = p_Id AND DeletedAt IS NULL;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT 
            b.*
        FROM EngineeringBom b
        WHERE b.DeletedAt IS NULL
        ORDER BY b.Id DESC;
        
    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM EngineeringBom WHERE Id = p_Id AND DeletedAt IS NULL;
        
    ELSEIF p_Action = 'SELECT_LINES' THEN
        SELECT * FROM EngineeringBomLine WHERE BomId = p_Id ORDER BY Seq;
        
    END IF;
END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
    conn.commit()
    print("Database tables and SpManageEngineeringBom created successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
