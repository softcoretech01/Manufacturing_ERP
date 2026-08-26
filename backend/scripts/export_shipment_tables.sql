USE ERP_Packing;

CREATE TABLE IF NOT EXISTS ExportShipment (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) UNIQUE NOT NULL,
    ShipmentNo VARCHAR(50) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    Country VARCHAR(100) NOT NULL,
    Incoterm VARCHAR(10) NOT NULL,
    ContainerNo VARCHAR(50) NOT NULL,
    ContainerSize VARCHAR(10) NOT NULL,
    SealNo VARCHAR(50) NULL,
    StuffingDate DATE NOT NULL,
    Vessel VARCHAR(150) NOT NULL,
    VoyageNo VARCHAR(50) NULL,
    PortOfLoading VARCHAR(100) NOT NULL,
    PortOfDischarge VARCHAR(100) NOT NULL,
    Etd DATE NOT NULL,
    Eta DATE NOT NULL,
    HsCode VARCHAR(50) NOT NULL,
    FobValueUsd DECIMAL(15,2) DEFAULT 0,
    ExchangeRate DECIMAL(10,4) DEFAULT 83.5,
    ShippingBillNo VARCHAR(50) NULL,
    BlNo VARCHAR(50) NULL,
    CustomsStatus VARCHAR(30) DEFAULT 'NOT_FILED',
    Status VARCHAR(30) DEFAULT 'PLANNED',
    Remarks TEXT NULL,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManageExportShipment //
CREATE PROCEDURE SpManageExportShipment(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_DocNo VARCHAR(50),
    IN p_ShipmentNo VARCHAR(50),
    IN p_Customer VARCHAR(255),
    IN p_Country VARCHAR(100),
    IN p_Incoterm VARCHAR(10),
    IN p_ContainerNo VARCHAR(50),
    IN p_ContainerSize VARCHAR(10),
    IN p_SealNo VARCHAR(50),
    IN p_StuffingDate DATE,
    IN p_Vessel VARCHAR(150),
    IN p_VoyageNo VARCHAR(50),
    IN p_PortOfLoading VARCHAR(100),
    IN p_PortOfDischarge VARCHAR(100),
    IN p_Etd DATE,
    IN p_Eta DATE,
    IN p_HsCode VARCHAR(50),
    IN p_FobValueUsd DECIMAL(15,2),
    IN p_ExchangeRate DECIMAL(10,4),
    IN p_ShippingBillNo VARCHAR(50),
    IN p_BlNo VARCHAR(50),
    IN p_CustomsStatus VARCHAR(30),
    IN p_Status VARCHAR(30),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE next_id INT;
    DECLARE generated_doc VARCHAR(50);

    IF p_Action = 'CREATE' THEN
        SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM ExportShipment;
        SET generated_doc = CONCAT('EXP/', DATE_FORMAT(NOW(), '%y%m'), '/', LPAD(next_id, 4, '0'));

        INSERT INTO ExportShipment (
            DocNo, ShipmentNo, Customer, Country, Incoterm, ContainerNo, ContainerSize,
            SealNo, StuffingDate, Vessel, VoyageNo, PortOfLoading, PortOfDischarge,
            Etd, Eta, HsCode, FobValueUsd, ExchangeRate, ShippingBillNo, BlNo,
            CustomsStatus, Status, Remarks, CreatedBy, CreatedDate
        ) VALUES (
            generated_doc, p_ShipmentNo, p_Customer, p_Country, p_Incoterm, p_ContainerNo, p_ContainerSize,
            p_SealNo, p_StuffingDate, p_Vessel, p_VoyageNo, p_PortOfLoading, p_PortOfDischarge,
            p_Etd, p_Eta, p_HsCode, p_FobValueUsd, p_ExchangeRate, p_ShippingBillNo, p_BlNo,
            COALESCE(p_CustomsStatus, 'NOT_FILED'), COALESCE(p_Status, 'PLANNED'), p_Remarks, p_User, NOW()
        );

        SELECT * FROM ExportShipment WHERE Id = LAST_INSERT_ID();
    
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE ExportShipment
        SET ShipmentNo = COALESCE(p_ShipmentNo, ShipmentNo),
            Customer = COALESCE(p_Customer, Customer),
            Country = COALESCE(p_Country, Country),
            Incoterm = COALESCE(p_Incoterm, Incoterm),
            ContainerNo = COALESCE(p_ContainerNo, ContainerNo),
            ContainerSize = COALESCE(p_ContainerSize, ContainerSize),
            SealNo = p_SealNo,
            StuffingDate = COALESCE(p_StuffingDate, StuffingDate),
            Vessel = COALESCE(p_Vessel, Vessel),
            VoyageNo = p_VoyageNo,
            PortOfLoading = COALESCE(p_PortOfLoading, PortOfLoading),
            PortOfDischarge = COALESCE(p_PortOfDischarge, PortOfDischarge),
            Etd = COALESCE(p_Etd, Etd),
            Eta = COALESCE(p_Eta, Eta),
            HsCode = COALESCE(p_HsCode, HsCode),
            FobValueUsd = COALESCE(p_FobValueUsd, FobValueUsd),
            ExchangeRate = COALESCE(p_ExchangeRate, ExchangeRate),
            ShippingBillNo = p_ShippingBillNo,
            BlNo = p_BlNo,
            CustomsStatus = COALESCE(p_CustomsStatus, CustomsStatus),
            Status = COALESCE(p_Status, Status),
            Remarks = p_Remarks,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;

        SELECT * FROM ExportShipment WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM ExportShipment WHERE Id = p_Id;
        SELECT p_Id AS DeletedId;

    ELSEIF p_Action = 'GET_ALL' THEN
        SELECT * FROM ExportShipment ORDER BY Id DESC;

    ELSEIF p_Action = 'GET_BY_ID' THEN
        SELECT * FROM ExportShipment WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;
