USE ERP_Packing;

CREATE TABLE IF NOT EXISTS FreightCharge (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) UNIQUE NOT NULL,
    ShipmentNo VARCHAR(50) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    Transporter VARCHAR(150) NOT NULL,
    Route VARCHAR(100) NOT NULL,
    ChargeType VARCHAR(50) NOT NULL,
    Basis VARCHAR(20) NOT NULL,
    Quantity DECIMAL(10,2) NOT NULL,
    Rate DECIMAL(10,2) NOT NULL,
    Amount DECIMAL(12,2) NOT NULL,
    AllocateTo VARCHAR(20) NOT NULL,
    BillNo VARCHAR(50) NULL,
    BillDate DATE NULL,
    ApprovedBy VARCHAR(100) NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'ESTIMATED',
    Remarks TEXT NULL,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManageFreightCharge //
CREATE PROCEDURE SpManageFreightCharge(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_DocNo VARCHAR(50),
    IN p_ShipmentNo VARCHAR(50),
    IN p_Customer VARCHAR(255),
    IN p_Transporter VARCHAR(150),
    IN p_Route VARCHAR(100),
    IN p_ChargeType VARCHAR(50),
    IN p_Basis VARCHAR(20),
    IN p_Quantity DECIMAL(10,2),
    IN p_Rate DECIMAL(10,2),
    IN p_Amount DECIMAL(12,2),
    IN p_AllocateTo VARCHAR(20),
    IN p_BillNo VARCHAR(50),
    IN p_BillDate DATE,
    IN p_ApprovedBy VARCHAR(100),
    IN p_Status VARCHAR(30),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE next_id INT;
    DECLARE generated_doc VARCHAR(50);

    IF p_Action = 'CREATE' THEN
        -- Auto-generate DocNo: FRT/YYMM/XXXX
        SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM FreightCharge;
        SET generated_doc = CONCAT('FRT/', DATE_FORMAT(NOW(), '%y%m'), '/', LPAD(next_id, 4, '0'));

        INSERT INTO FreightCharge (
            DocNo, ShipmentNo, Customer, Transporter, Route,
            ChargeType, Basis, Quantity, Rate, Amount, AllocateTo,
            BillNo, BillDate, ApprovedBy, Status, Remarks,
            CreatedBy, CreatedDate
        )
        VALUES (
            generated_doc, p_ShipmentNo, p_Customer, p_Transporter, p_Route,
            p_ChargeType, p_Basis, p_Quantity, p_Rate, p_Amount, p_AllocateTo,
            p_BillNo, p_BillDate, p_ApprovedBy, p_Status, p_Remarks,
            p_User, NOW()
        );

        SELECT * FROM FreightCharge WHERE Id = LAST_INSERT_ID();
    
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE FreightCharge
        SET
            ShipmentNo = COALESCE(p_ShipmentNo, ShipmentNo),
            Customer = COALESCE(p_Customer, Customer),
            Transporter = COALESCE(p_Transporter, Transporter),
            Route = COALESCE(p_Route, Route),
            ChargeType = COALESCE(p_ChargeType, ChargeType),
            Basis = COALESCE(p_Basis, Basis),
            Quantity = COALESCE(p_Quantity, Quantity),
            Rate = COALESCE(p_Rate, Rate),
            Amount = COALESCE(p_Amount, Amount),
            AllocateTo = COALESCE(p_AllocateTo, AllocateTo),
            BillNo = p_BillNo,
            BillDate = p_BillDate,
            ApprovedBy = p_ApprovedBy,
            Status = COALESCE(p_Status, Status),
            Remarks = p_Remarks,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;

        SELECT * FROM FreightCharge WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM FreightCharge WHERE Id = p_Id;
        SELECT p_Id AS DeletedId;

    ELSEIF p_Action = 'GET_ALL' THEN
        SELECT * FROM FreightCharge ORDER BY Id DESC;

    ELSEIF p_Action = 'GET_BY_ID' THEN
        SELECT * FROM FreightCharge WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;
