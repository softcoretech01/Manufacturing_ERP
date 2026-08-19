CREATE DATABASE IF NOT EXISTS ERP_Packing;
USE ERP_Packing;

CREATE TABLE IF NOT EXISTS PackMaterialLine (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL,
    PackingOrderNo VARCHAR(50) NOT NULL,
    ItemCode VARCHAR(50) NOT NULL,
    ItemName VARCHAR(255) NOT NULL,
    Category VARCHAR(50) NOT NULL,
    StandardQty DECIMAL(18,2) DEFAULT 0,
    IssuedQty DECIMAL(18,2) DEFAULT 0,
    ConsumedQty DECIMAL(18,2) DEFAULT 0,
    Uom VARCHAR(20) NOT NULL,
    UnitCost DECIMAL(18,2) DEFAULT 0,
    Warehouse VARCHAR(100) NOT NULL,
    IssuedOn DATETIME NULL,
    IssuedBy VARCHAR(100) NULL,
    Status VARCHAR(20) NOT NULL,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    DeletedAt DATETIME NULL
);

DROP PROCEDURE IF EXISTS SpManagePackMaterialLine;
DELIMITER //
CREATE PROCEDURE SpManagePackMaterialLine(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_PackingOrderNo VARCHAR(50),
    IN p_ItemCode VARCHAR(50),
    IN p_ItemName VARCHAR(255),
    IN p_Category VARCHAR(50),
    IN p_StandardQty DECIMAL(18,2),
    IN p_IssuedQty DECIMAL(18,2),
    IN p_ConsumedQty DECIMAL(18,2),
    IN p_Uom VARCHAR(20),
    IN p_UnitCost DECIMAL(18,2),
    IN p_Warehouse VARCHAR(100),
    IN p_IssuedOn DATETIME,
    IN p_IssuedBy VARCHAR(100),
    IN p_Status VARCHAR(20),
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_NewId INT;

    IF p_Action = 'CREATE' THEN
        SELECT IFNULL(MAX(Id), 0) + 1 INTO v_NewId FROM PackMaterialLine;
        SET v_DocNo = CONCAT('PMT-', LPAD(v_NewId, 4, '0'));
        
        INSERT INTO PackMaterialLine (
            DocNo, PackingOrderNo, ItemCode, ItemName, Category, StandardQty, 
            IssuedQty, ConsumedQty, Uom, UnitCost, Warehouse, IssuedOn, IssuedBy, Status,
            CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, p_PackingOrderNo, p_ItemCode, p_ItemName, p_Category, p_StandardQty,
            p_IssuedQty, p_ConsumedQty, p_Uom, p_UnitCost, p_Warehouse, p_IssuedOn, p_IssuedBy, p_Status,
            p_User, NOW()
        );
        SELECT * FROM PackMaterialLine WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE PackMaterialLine SET
            PackingOrderNo = COALESCE(p_PackingOrderNo, PackingOrderNo),
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            ItemName = COALESCE(p_ItemName, ItemName),
            Category = COALESCE(p_Category, Category),
            StandardQty = COALESCE(p_StandardQty, StandardQty),
            IssuedQty = COALESCE(p_IssuedQty, IssuedQty),
            ConsumedQty = COALESCE(p_ConsumedQty, ConsumedQty),
            Uom = COALESCE(p_Uom, Uom),
            UnitCost = COALESCE(p_UnitCost, UnitCost),
            Warehouse = COALESCE(p_Warehouse, Warehouse),
            IssuedOn = COALESCE(p_IssuedOn, IssuedOn),
            IssuedBy = COALESCE(p_IssuedBy, IssuedBy),
            Status = COALESCE(p_Status, Status),
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;
        SELECT * FROM PackMaterialLine WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE PackMaterialLine SET DeletedAt = NOW(), ModifiedBy = p_User, ModifiedDate = NOW() WHERE Id = p_Id;
        
    ELSEIF p_Action = 'READ' THEN
        IF p_Id IS NOT NULL THEN
            SELECT * FROM PackMaterialLine WHERE Id = p_Id AND DeletedAt IS NULL;
        ELSE
            SELECT * FROM PackMaterialLine WHERE DeletedAt IS NULL ORDER BY Id DESC;
        END IF;

    ELSEIF p_Action = 'ISSUE_ALL' THEN
        -- Bulk update status to ISSUED where status is PENDING for a specific PackingOrderNo
        UPDATE PackMaterialLine SET 
            IssuedQty = StandardQty, 
            Status = 'ISSUED', 
            IssuedOn = NOW(), 
            IssuedBy = p_User,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE PackingOrderNo = p_PackingOrderNo AND Status = 'PENDING' AND DeletedAt IS NULL;
        
        SELECT * FROM PackMaterialLine WHERE PackingOrderNo = p_PackingOrderNo AND DeletedAt IS NULL;
    END IF;
END //
DELIMITER ;
