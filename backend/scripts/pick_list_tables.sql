USE ERP_Packing;

-- 1. PickList Table
CREATE TABLE IF NOT EXISTS PickList (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    DispatchPlanNo VARCHAR(50) NOT NULL,
    CreatedOn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Method VARCHAR(20) NOT NULL,
    Warehouse VARCHAR(150) NOT NULL,
    Zone VARCHAR(100) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    ItemCode VARCHAR(50) NOT NULL,
    ItemName VARCHAR(255) NOT NULL,
    BatchNo VARCHAR(50) NULL,
    Bin VARCHAR(50) NOT NULL,
    RequiredQty INT NOT NULL DEFAULT 0,
    PickedQty INT NOT NULL DEFAULT 0,
    Uom VARCHAR(20) NOT NULL,
    Picker VARCHAR(100) NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    ShortReason TEXT NULL,
    IsDeleted BOOLEAN DEFAULT FALSE,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

-- SP for PickList
DROP PROCEDURE IF EXISTS SpManagePickList //

CREATE PROCEDURE SpManagePickList(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_DispatchPlanNo VARCHAR(50),
    IN p_CreatedOn DATETIME,
    IN p_Method VARCHAR(20),
    IN p_Warehouse VARCHAR(150),
    IN p_Zone VARCHAR(100),
    IN p_Customer VARCHAR(255),
    IN p_ItemCode VARCHAR(50),
    IN p_ItemName VARCHAR(255),
    IN p_BatchNo VARCHAR(50),
    IN p_Bin VARCHAR(50),
    IN p_RequiredQty INT,
    IN p_PickedQty INT,
    IN p_Uom VARCHAR(20),
    IN p_Picker VARCHAR(100),
    IN p_Status VARCHAR(20),
    IN p_ShortReason TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_Count INT;

    IF p_Action = 'INSERT' THEN
        -- Generate auto DocNo like PCK/YYYY/XXXX
        SELECT COUNT(*) + 1 INTO v_Count FROM PickList;
        SET v_DocNo = CONCAT('PCK/', YEAR(NOW()), '/', LPAD(v_Count, 4, '0'));

        INSERT INTO PickList (
            DocNo, DispatchPlanNo, CreatedOn, Method, Warehouse, Zone, Customer,
            ItemCode, ItemName, BatchNo, Bin, RequiredQty, PickedQty, Uom,
            Picker, Status, ShortReason,
            IsDeleted, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, p_DispatchPlanNo, COALESCE(p_CreatedOn, NOW()), p_Method, p_Warehouse, p_Zone, p_Customer,
            p_ItemCode, p_ItemName, p_BatchNo, p_Bin, p_RequiredQty, COALESCE(p_PickedQty, 0), p_Uom,
            p_Picker, COALESCE(p_Status, 'OPEN'), p_ShortReason,
            0, p_User, NOW()
        );
        SELECT * FROM PickList WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE PickList
        SET 
            DispatchPlanNo = COALESCE(p_DispatchPlanNo, DispatchPlanNo),
            CreatedOn = COALESCE(p_CreatedOn, CreatedOn),
            Method = COALESCE(p_Method, Method),
            Warehouse = COALESCE(p_Warehouse, Warehouse),
            Zone = COALESCE(p_Zone, Zone),
            Customer = COALESCE(p_Customer, Customer),
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            ItemName = COALESCE(p_ItemName, ItemName),
            BatchNo = CASE WHEN p_BatchNo = '' THEN NULL WHEN p_BatchNo IS NOT NULL THEN p_BatchNo ELSE BatchNo END,
            Bin = COALESCE(p_Bin, Bin),
            RequiredQty = COALESCE(p_RequiredQty, RequiredQty),
            PickedQty = COALESCE(p_PickedQty, PickedQty),
            Uom = COALESCE(p_Uom, Uom),
            Picker = CASE WHEN p_Picker = '' THEN NULL WHEN p_Picker IS NOT NULL THEN p_Picker ELSE Picker END,
            Status = COALESCE(p_Status, Status),
            ShortReason = CASE WHEN p_ShortReason = '' THEN NULL WHEN p_ShortReason IS NOT NULL THEN p_ShortReason ELSE ShortReason END,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND IsDeleted = 0;
        SELECT * FROM PickList WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE PickList 
        SET IsDeleted = 1, ModifiedBy = p_User, ModifiedDate = NOW()
        WHERE Id = p_Id;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT * FROM PickList WHERE IsDeleted = 0 ORDER BY Id DESC;

    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM PickList WHERE Id = p_Id AND IsDeleted = 0;
    END IF;
END //

DELIMITER ;
