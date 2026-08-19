USE ERP_Packing;

DELIMITER $$

DROP PROCEDURE IF EXISTS SpManagePackingOrder$$

CREATE PROCEDURE SpManagePackingOrder(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Status VARCHAR(50),
    IN p_SourceType VARCHAR(50),
    IN p_SourceNo VARCHAR(50),
    IN p_Customer VARCHAR(255),
    IN p_CustomerCode VARCHAR(50),
    IN p_SalesOrderNo VARCHAR(50),
    IN p_ItemCode VARCHAR(50),
    IN p_ItemName VARCHAR(255),
    IN p_BatchNo VARCHAR(50),
    IN p_Quantity INT,
    IN p_PackedQuantity INT,
    IN p_Uom VARCHAR(20),
    IN p_Warehouse VARCHAR(100),
    IN p_PackingDate DATETIME,
    IN p_Supervisor VARCHAR(100),
    IN p_CartonSpec VARCHAR(255),
    IN p_CartonsPlanned INT,
    IN p_CartonsPacked INT,
    IN p_MaterialReady TINYINT(1),
    IN p_QcReleased TINYINT(1),
    IN p_WeightVerified TINYINT(1),
    IN p_Priority VARCHAR(20),
    IN p_IsExport TINYINT(1),
    IN p_IsOem TINYINT(1),
    IN p_Remarks VARCHAR(1000),
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_NewId INT;

    IF p_Action = 'CREATE' THEN
        -- Generate auto-incremented DocNo with prefix PKO-
        SELECT IFNULL(MAX(Id), 0) + 1 INTO v_NewId FROM PackingOrder;
        SET v_DocNo = CONCAT('PKO-', LPAD(v_NewId, 4, '0'));

        INSERT INTO PackingOrder (
            DocNo, DocDate, Status, SourceType, SourceNo, Customer, CustomerCode, SalesOrderNo,
            ItemCode, ItemName, BatchNo, Quantity, PackedQuantity, Uom, Warehouse, PackingDate,
            Supervisor, CartonSpec, CartonsPlanned, CartonsPacked, MaterialReady, QcReleased,
            WeightVerified, Priority, IsExport, IsOem, Remarks, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, NOW(), p_Status, p_SourceType, p_SourceNo, p_Customer, p_CustomerCode, p_SalesOrderNo,
            p_ItemCode, p_ItemName, p_BatchNo, p_Quantity, p_PackedQuantity, p_Uom, p_Warehouse, p_PackingDate,
            p_Supervisor, p_CartonSpec, p_CartonsPlanned, p_CartonsPacked, p_MaterialReady, p_QcReleased,
            p_WeightVerified, p_Priority, p_IsExport, p_IsOem, p_Remarks, p_User, NOW()
        );
        SELECT * FROM PackingOrder WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'READ' THEN
        SELECT * FROM PackingOrder WHERE DeletedAt IS NULL AND (p_Id IS NULL OR Id = p_Id);

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE PackingOrder
        SET
            Status = IFNULL(p_Status, Status),
            PackedQuantity = IFNULL(p_PackedQuantity, PackedQuantity),
            CartonsPacked = IFNULL(p_CartonsPacked, CartonsPacked),
            MaterialReady = IFNULL(p_MaterialReady, MaterialReady),
            QcReleased = IFNULL(p_QcReleased, QcReleased),
            WeightVerified = IFNULL(p_WeightVerified, WeightVerified),
            Priority = IFNULL(p_Priority, Priority),
            Remarks = IFNULL(p_Remarks, Remarks),
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;
        SELECT * FROM PackingOrder WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE PackingOrder
        SET 
            DeletedAt = NOW(),
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;
        SELECT 'DELETED' AS Status;
    END IF;
END$$

DELIMITER ;
