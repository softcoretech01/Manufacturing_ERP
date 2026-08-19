USE ERP_Packing;

CREATE TABLE IF NOT EXISTS Pod (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(100) UNIQUE,
    ShipmentNo VARCHAR(100) NOT NULL,
    ChallanNo VARCHAR(100) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    Destination VARCHAR(255) NOT NULL,
    DeliveredOn DATE NULL,
    DeliveredAtTime VARCHAR(50) NULL,
    ReceiverName VARCHAR(255) NULL,
    ReceiverDesignation VARCHAR(255) NULL,
    DispatchedQty INT NOT NULL,
    ReceivedQty INT DEFAULT 0,
    ShortQty INT DEFAULT 0,
    DamagedQty INT DEFAULT 0,
    CapturedBy VARCHAR(100) NULL,
    CapturedVia VARCHAR(50) NULL,
    SignatureCaptured BOOLEAN DEFAULT 0,
    PhotoCaptured BOOLEAN DEFAULT 0,
    GpsLatitude DECIMAL(10,8) NULL,
    GpsLongitude DECIMAL(11,8) NULL,
    Status VARCHAR(50) NOT NULL,
    Remarks TEXT NULL,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    FOREIGN KEY (ShipmentNo) REFERENCES Shipment(DocNo)
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManagePod //
CREATE PROCEDURE SpManagePod(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_DocNo VARCHAR(100),
    IN p_ShipmentNo VARCHAR(100),
    IN p_ChallanNo VARCHAR(100),
    IN p_Customer VARCHAR(255),
    IN p_Destination VARCHAR(255),
    IN p_DeliveredOn DATE,
    IN p_DeliveredAtTime VARCHAR(50),
    IN p_ReceiverName VARCHAR(255),
    IN p_ReceiverDesignation VARCHAR(255),
    IN p_DispatchedQty INT,
    IN p_ReceivedQty INT,
    IN p_ShortQty INT,
    IN p_DamagedQty INT,
    IN p_CapturedBy VARCHAR(100),
    IN p_CapturedVia VARCHAR(50),
    IN p_SignatureCaptured BOOLEAN,
    IN p_PhotoCaptured BOOLEAN,
    IN p_GpsLatitude DECIMAL(10,8),
    IN p_GpsLongitude DECIMAL(11,8),
    IN p_Status VARCHAR(50),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE next_id INT;
    DECLARE generated_doc VARCHAR(100);

    IF p_Action = 'CREATE' THEN
        -- Auto-generate DocNo: POD/YYMM/00XX
        SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM Pod;
        SET generated_doc = CONCAT('POD/', DATE_FORMAT(NOW(), '%y%m'), '/', LPAD(next_id, 4, '0'));

        INSERT INTO Pod (
            DocNo, ShipmentNo, ChallanNo, Customer, Destination,
            DeliveredOn, DeliveredAtTime, ReceiverName, ReceiverDesignation,
            DispatchedQty, ReceivedQty, ShortQty, DamagedQty, CapturedBy,
            CapturedVia, SignatureCaptured, PhotoCaptured, GpsLatitude, GpsLongitude,
            Status, Remarks, CreatedBy, CreatedDate
        )
        VALUES (
            generated_doc, p_ShipmentNo, p_ChallanNo, p_Customer, p_Destination,
            p_DeliveredOn, p_DeliveredAtTime, p_ReceiverName, p_ReceiverDesignation,
            p_DispatchedQty, p_ReceivedQty, p_ShortQty, p_DamagedQty, p_CapturedBy,
            p_CapturedVia, p_SignatureCaptured, p_PhotoCaptured, p_GpsLatitude, p_GpsLongitude,
            p_Status, p_Remarks, p_User, NOW()
        );

        SELECT * FROM Pod WHERE Id = LAST_INSERT_ID();
    
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Pod
        SET
            ShipmentNo = COALESCE(p_ShipmentNo, ShipmentNo),
            ChallanNo = COALESCE(p_ChallanNo, ChallanNo),
            Customer = COALESCE(p_Customer, Customer),
            Destination = COALESCE(p_Destination, Destination),
            DeliveredOn = p_DeliveredOn,
            DeliveredAtTime = p_DeliveredAtTime,
            ReceiverName = p_ReceiverName,
            ReceiverDesignation = p_ReceiverDesignation,
            DispatchedQty = COALESCE(p_DispatchedQty, DispatchedQty),
            ReceivedQty = COALESCE(p_ReceivedQty, ReceivedQty),
            ShortQty = COALESCE(p_ShortQty, ShortQty),
            DamagedQty = COALESCE(p_DamagedQty, DamagedQty),
            CapturedBy = p_CapturedBy,
            CapturedVia = p_CapturedVia,
            SignatureCaptured = COALESCE(p_SignatureCaptured, SignatureCaptured),
            PhotoCaptured = COALESCE(p_PhotoCaptured, PhotoCaptured),
            GpsLatitude = p_GpsLatitude,
            GpsLongitude = p_GpsLongitude,
            Status = COALESCE(p_Status, Status),
            Remarks = p_Remarks,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;

        SELECT * FROM Pod WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM Pod WHERE Id = p_Id;
        SELECT p_Id AS DeletedId;

    ELSEIF p_Action = 'GET_ALL' THEN
        SELECT * FROM Pod ORDER BY Id DESC;

    ELSEIF p_Action = 'GET_BY_ID' THEN
        SELECT * FROM Pod WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;
