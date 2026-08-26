USE ERP_Packing;

CREATE TABLE IF NOT EXISTS SalesReturn (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) UNIQUE NOT NULL,
    RequestedOn DATE NOT NULL,
    ReturnType VARCHAR(30) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    CustomerCode VARCHAR(50) NOT NULL,
    ShipmentNo VARCHAR(50) NULL,
    InvoiceNo VARCHAR(50) NULL,
    ItemCode VARCHAR(50) NOT NULL,
    ItemName VARCHAR(255) NOT NULL,
    BatchNo VARCHAR(50) NULL,
    Quantity INT NOT NULL,
    ReceivedQty INT DEFAULT 0,
    Uom VARCHAR(20) NOT NULL,
    Reason TEXT NOT NULL,
    ApprovedBy VARCHAR(100) NULL,
    PickupOn DATE NULL,
    ReceivedOn DATE NULL,
    InspectedBy VARCHAR(100) NULL,
    Disposition VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    CreditNoteNo VARCHAR(50) NULL,
    Value DECIMAL(12,2) DEFAULT 0,
    Status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    Remarks TEXT NULL,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManageSalesReturn //
CREATE PROCEDURE SpManageSalesReturn(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_DocNo VARCHAR(50),
    IN p_RequestedOn DATE,
    IN p_ReturnType VARCHAR(30),
    IN p_Customer VARCHAR(255),
    IN p_CustomerCode VARCHAR(50),
    IN p_ShipmentNo VARCHAR(50),
    IN p_InvoiceNo VARCHAR(50),
    IN p_ItemCode VARCHAR(50),
    IN p_ItemName VARCHAR(255),
    IN p_BatchNo VARCHAR(50),
    IN p_Quantity INT,
    IN p_ReceivedQty INT,
    IN p_Uom VARCHAR(20),
    IN p_Reason TEXT,
    IN p_ApprovedBy VARCHAR(100),
    IN p_PickupOn DATE,
    IN p_ReceivedOn DATE,
    IN p_InspectedBy VARCHAR(100),
    IN p_Disposition VARCHAR(20),
    IN p_CreditNoteNo VARCHAR(50),
    IN p_Value DECIMAL(12,2),
    IN p_Status VARCHAR(30),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE next_id INT;
    DECLARE generated_doc VARCHAR(50);

    IF p_Action = 'CREATE' THEN
        -- Auto-generate DocNo: SRN/YYMM/XXXX
        SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM SalesReturn;
        SET generated_doc = CONCAT('SRN/', DATE_FORMAT(NOW(), '%y%m'), '/', LPAD(next_id, 4, '0'));

        INSERT INTO SalesReturn (
            DocNo, RequestedOn, ReturnType, Customer, CustomerCode,
            ShipmentNo, InvoiceNo, ItemCode, ItemName, BatchNo,
            Quantity, ReceivedQty, Uom, Reason, ApprovedBy,
            PickupOn, ReceivedOn, InspectedBy, Disposition, CreditNoteNo,
            Value, Status, Remarks, CreatedBy, CreatedDate
        )
        VALUES (
            generated_doc, p_RequestedOn, p_ReturnType, p_Customer, p_CustomerCode,
            p_ShipmentNo, p_InvoiceNo, p_ItemCode, p_ItemName, p_BatchNo,
            p_Quantity, p_ReceivedQty, p_Uom, p_Reason, p_ApprovedBy,
            p_PickupOn, p_ReceivedOn, p_InspectedBy, p_Disposition, p_CreditNoteNo,
            p_Value, p_Status, p_Remarks, p_User, NOW()
        );

        SELECT * FROM SalesReturn WHERE Id = LAST_INSERT_ID();
    
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE SalesReturn
        SET
            RequestedOn = COALESCE(p_RequestedOn, RequestedOn),
            ReturnType = COALESCE(p_ReturnType, ReturnType),
            Customer = COALESCE(p_Customer, Customer),
            CustomerCode = COALESCE(p_CustomerCode, CustomerCode),
            ShipmentNo = p_ShipmentNo,
            InvoiceNo = p_InvoiceNo,
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            ItemName = COALESCE(p_ItemName, ItemName),
            BatchNo = p_BatchNo,
            Quantity = COALESCE(p_Quantity, Quantity),
            ReceivedQty = COALESCE(p_ReceivedQty, ReceivedQty),
            Uom = COALESCE(p_Uom, Uom),
            Reason = COALESCE(p_Reason, Reason),
            ApprovedBy = p_ApprovedBy,
            PickupOn = p_PickupOn,
            ReceivedOn = p_ReceivedOn,
            InspectedBy = p_InspectedBy,
            Disposition = COALESCE(p_Disposition, Disposition),
            CreditNoteNo = p_CreditNoteNo,
            Value = COALESCE(p_Value, Value),
            Status = COALESCE(p_Status, Status),
            Remarks = p_Remarks,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;

        SELECT * FROM SalesReturn WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM SalesReturn WHERE Id = p_Id;
        SELECT p_Id AS DeletedId;

    ELSEIF p_Action = 'GET_ALL' THEN
        SELECT * FROM SalesReturn ORDER BY Id DESC;

    ELSEIF p_Action = 'GET_BY_ID' THEN
        SELECT * FROM SalesReturn WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;
