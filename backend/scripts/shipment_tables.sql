USE ERP_Packing;

CREATE TABLE IF NOT EXISTS Shipment (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    ShipmentType VARCHAR(20) NOT NULL,
    Customer VARCHAR(150) NOT NULL,
    CustomerCode VARCHAR(50),
    Destination VARCHAR(150) NOT NULL,
    Region VARCHAR(50) NOT NULL,
    Route VARCHAR(100) NOT NULL,
    ChallanNo VARCHAR(50) NOT NULL,
    InvoiceNo VARCHAR(50),
    EwayBillNo VARCHAR(50),
    VehicleNo VARCHAR(50) NOT NULL,
    Transporter VARCHAR(150) NOT NULL,
    Driver VARCHAR(100) NOT NULL,
    DriverPhone VARCHAR(10) NOT NULL,
    Cartons INT NOT NULL DEFAULT 0,
    Pallets INT NOT NULL DEFAULT 0,
    WeightKg DECIMAL(10,2) NOT NULL DEFAULT 0,
    InvoiceValue DECIMAL(15,2) NOT NULL DEFAULT 0,
    Remarks TEXT,
    Status VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    DispatchPlanNo VARCHAR(50),
    DispatchedAt DATETIME,
    EtaAt DATETIME,
    DeliveredAt DATETIME,
    LastLocation VARCHAR(255),
    LastUpdatedAt DATETIME,
    DelayReason VARCHAR(255),
    PodStatus VARCHAR(20) NOT NULL DEFAULT 'NOT_DUE',
    IsExport BOOLEAN NOT NULL DEFAULT 0,
    
    IsDeleted BOOLEAN DEFAULT 0,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    
    CONSTRAINT CHK_Shipment_DriverPhone CHECK (DriverPhone REGEXP '^[0-9]{10}$')
);

DELIMITER $$

DROP PROCEDURE IF EXISTS SpManageShipment$$

CREATE PROCEDURE SpManageShipment(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_ShipmentType VARCHAR(20),
    IN p_Customer VARCHAR(150),
    IN p_CustomerCode VARCHAR(50),
    IN p_Destination VARCHAR(150),
    IN p_Region VARCHAR(50),
    IN p_Route VARCHAR(100),
    IN p_ChallanNo VARCHAR(50),
    IN p_InvoiceNo VARCHAR(50),
    IN p_EwayBillNo VARCHAR(50),
    IN p_VehicleNo VARCHAR(50),
    IN p_Transporter VARCHAR(150),
    IN p_Driver VARCHAR(100),
    IN p_DriverPhone VARCHAR(10),
    IN p_Cartons INT,
    IN p_Pallets INT,
    IN p_WeightKg DECIMAL(10,2),
    IN p_InvoiceValue DECIMAL(15,2),
    IN p_Remarks TEXT,
    IN p_Status VARCHAR(20),
    IN p_DispatchPlanNo VARCHAR(50),
    IN p_DispatchedAt DATETIME,
    IN p_EtaAt DATETIME,
    IN p_DeliveredAt DATETIME,
    IN p_LastLocation VARCHAR(255),
    IN p_LastUpdatedAt DATETIME,
    IN p_DelayReason VARCHAR(255),
    IN p_PodStatus VARCHAR(20),
    IN p_IsExport BOOLEAN,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE v_NextId INT;
    DECLARE v_DocNo VARCHAR(50);

    IF p_Action = 'INSERT' THEN
        -- Auto generate DocNo: SHP/2607/0001
        SELECT COALESCE(MAX(Id), 0) + 1 INTO v_NextId FROM Shipment;
        SET v_DocNo = CONCAT('SHP/2607/', LPAD(v_NextId, 4, '0'));

        INSERT INTO Shipment (
            DocNo, ShipmentType, Customer, CustomerCode, Destination, Region, Route, 
            ChallanNo, InvoiceNo, EwayBillNo, VehicleNo, Transporter, Driver, DriverPhone, 
            Cartons, Pallets, WeightKg, InvoiceValue, Remarks, Status, DispatchPlanNo,
            DispatchedAt, EtaAt, DeliveredAt, LastLocation, LastUpdatedAt, DelayReason,
            PodStatus, IsExport, IsDeleted, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, p_ShipmentType, p_Customer, COALESCE(p_CustomerCode, 'CUS-NEW'), p_Destination, p_Region, p_Route,
            p_ChallanNo, p_InvoiceNo, p_EwayBillNo, p_VehicleNo, p_Transporter, p_Driver, p_DriverPhone,
            COALESCE(p_Cartons, 0), COALESCE(p_Pallets, 0), COALESCE(p_WeightKg, 0), COALESCE(p_InvoiceValue, 0), p_Remarks, COALESCE(p_Status, 'PLANNED'), COALESCE(p_DispatchPlanNo, '—'),
            p_DispatchedAt, p_EtaAt, p_DeliveredAt, p_LastLocation, p_LastUpdatedAt, p_DelayReason,
            COALESCE(p_PodStatus, 'NOT_DUE'), COALESCE(p_IsExport, 0), 0, p_User, NOW()
        );
        
        SELECT * FROM Shipment WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Shipment
        SET
            ShipmentType = COALESCE(p_ShipmentType, ShipmentType),
            Customer = COALESCE(p_Customer, Customer),
            CustomerCode = COALESCE(p_CustomerCode, CustomerCode),
            Destination = COALESCE(p_Destination, Destination),
            Region = COALESCE(p_Region, Region),
            Route = COALESCE(p_Route, Route),
            ChallanNo = COALESCE(p_ChallanNo, ChallanNo),
            InvoiceNo = CASE WHEN p_InvoiceNo IS NOT NULL THEN p_InvoiceNo ELSE InvoiceNo END,
            EwayBillNo = CASE WHEN p_EwayBillNo IS NOT NULL THEN p_EwayBillNo ELSE EwayBillNo END,
            VehicleNo = COALESCE(p_VehicleNo, VehicleNo),
            Transporter = COALESCE(p_Transporter, Transporter),
            Driver = COALESCE(p_Driver, Driver),
            DriverPhone = COALESCE(p_DriverPhone, DriverPhone),
            Cartons = COALESCE(p_Cartons, Cartons),
            Pallets = COALESCE(p_Pallets, Pallets),
            WeightKg = COALESCE(p_WeightKg, WeightKg),
            InvoiceValue = COALESCE(p_InvoiceValue, InvoiceValue),
            Remarks = CASE WHEN p_Remarks IS NOT NULL THEN p_Remarks ELSE Remarks END,
            Status = COALESCE(p_Status, Status),
            DispatchPlanNo = COALESCE(p_DispatchPlanNo, DispatchPlanNo),
            DispatchedAt = CASE WHEN p_DispatchedAt IS NOT NULL THEN p_DispatchedAt ELSE DispatchedAt END,
            EtaAt = CASE WHEN p_EtaAt IS NOT NULL THEN p_EtaAt ELSE EtaAt END,
            DeliveredAt = CASE WHEN p_DeliveredAt IS NOT NULL THEN p_DeliveredAt ELSE DeliveredAt END,
            LastLocation = CASE WHEN p_LastLocation IS NOT NULL THEN p_LastLocation ELSE LastLocation END,
            LastUpdatedAt = CASE WHEN p_LastUpdatedAt IS NOT NULL THEN p_LastUpdatedAt ELSE LastUpdatedAt END,
            DelayReason = CASE WHEN p_DelayReason IS NOT NULL THEN p_DelayReason ELSE DelayReason END,
            PodStatus = COALESCE(p_PodStatus, PodStatus),
            IsExport = COALESCE(p_IsExport, IsExport),
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND IsDeleted = 0;
        
        SELECT * FROM Shipment WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Shipment
        SET IsDeleted = 1, ModifiedBy = p_User, ModifiedDate = NOW()
        WHERE Id = p_Id;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT * FROM Shipment WHERE IsDeleted = 0 ORDER BY Id DESC;

    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM Shipment WHERE Id = p_Id AND IsDeleted = 0;
        
    END IF;
END$$

DELIMITER ;
