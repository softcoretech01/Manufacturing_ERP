USE ERP_Packing;

-- 1. Vehicle Table
CREATE TABLE IF NOT EXISTS Vehicle (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    VehicleNo VARCHAR(50) NOT NULL UNIQUE,
    Transporter VARCHAR(150) NOT NULL,
    Driver VARCHAR(100) NOT NULL,
    DriverPhone VARCHAR(10) NOT NULL,
    CapacityKg DECIMAL(10,2) NOT NULL,
    State VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    CurrentShipmentNo VARCHAR(50) NULL,
    IsActive BOOLEAN DEFAULT TRUE,
    IsDeleted BOOLEAN DEFAULT FALSE,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    CONSTRAINT CHK_DriverPhone CHECK (DriverPhone REGEXP '^[0-9]{10}$')
);

-- 2. DispatchPlan Table
CREATE TABLE IF NOT EXISTS DispatchPlan (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    PlanDate DATE NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    Basis VARCHAR(20) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    CustomerCode VARCHAR(50) NOT NULL,
    SalesOrderNo VARCHAR(50) NULL,
    Route VARCHAR(100) NOT NULL,
    Region VARCHAR(100) NOT NULL,
    DeliveryDate DATE NOT NULL,
    Priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    Cartons INT NOT NULL DEFAULT 0,
    Pallets INT NOT NULL DEFAULT 0,
    WeightKg DECIMAL(10,2) NOT NULL DEFAULT 0,
    VolumeCbm DECIMAL(10,2) NOT NULL DEFAULT 0,
    VehicleNo VARCHAR(50) NULL,
    Transporter VARCHAR(150) NULL,
    VehicleCapacityKg DECIMAL(10,2) NULL,
    IsExport BOOLEAN DEFAULT FALSE,
    Remarks TEXT NULL,
    IsDeleted BOOLEAN DEFAULT FALSE,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

-- SP for Vehicle
DROP PROCEDURE IF EXISTS SpManageVehicle //

CREATE PROCEDURE SpManageVehicle(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_VehicleNo VARCHAR(50),
    IN p_Transporter VARCHAR(150),
    IN p_Driver VARCHAR(100),
    IN p_DriverPhone VARCHAR(10),
    IN p_CapacityKg DECIMAL(10,2),
    IN p_State VARCHAR(20),
    IN p_CurrentShipmentNo VARCHAR(50),
    IN p_IsActive BOOLEAN,
    IN p_User VARCHAR(100)
)
BEGIN
    IF p_Action = 'INSERT' THEN
        INSERT INTO Vehicle (
            VehicleNo, Transporter, Driver, DriverPhone, CapacityKg, State,
            CurrentShipmentNo, IsActive, IsDeleted, CreatedBy, CreatedDate
        ) VALUES (
            p_VehicleNo, p_Transporter, p_Driver, p_DriverPhone, p_CapacityKg, COALESCE(p_State, 'AVAILABLE'),
            p_CurrentShipmentNo, COALESCE(p_IsActive, 1), 0, p_User, NOW()
        );
        SELECT * FROM Vehicle WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Vehicle
        SET 
            VehicleNo = COALESCE(p_VehicleNo, VehicleNo),
            Transporter = COALESCE(p_Transporter, Transporter),
            Driver = COALESCE(p_Driver, Driver),
            DriverPhone = COALESCE(p_DriverPhone, DriverPhone),
            CapacityKg = COALESCE(p_CapacityKg, CapacityKg),
            State = CASE WHEN p_State IS NOT NULL THEN p_State ELSE State END,
            CurrentShipmentNo = CASE WHEN p_State = 'AVAILABLE' THEN NULL WHEN p_CurrentShipmentNo IS NOT NULL THEN p_CurrentShipmentNo ELSE CurrentShipmentNo END,
            IsActive = COALESCE(p_IsActive, IsActive),
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND IsDeleted = 0;
        SELECT * FROM Vehicle WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Vehicle 
        SET IsDeleted = 1, ModifiedBy = p_User, ModifiedDate = NOW()
        WHERE Id = p_Id;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT * FROM Vehicle WHERE IsDeleted = 0 ORDER BY Id DESC;

    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM Vehicle WHERE Id = p_Id AND IsDeleted = 0;
    END IF;
END //

-- SP for DispatchPlan
DROP PROCEDURE IF EXISTS SpManageDispatchPlan //

CREATE PROCEDURE SpManageDispatchPlan(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_PlanDate DATE,
    IN p_Status VARCHAR(20),
    IN p_Basis VARCHAR(20),
    IN p_Customer VARCHAR(255),
    IN p_CustomerCode VARCHAR(50),
    IN p_SalesOrderNo VARCHAR(50),
    IN p_Route VARCHAR(100),
    IN p_Region VARCHAR(100),
    IN p_DeliveryDate DATE,
    IN p_Priority VARCHAR(20),
    IN p_Cartons INT,
    IN p_Pallets INT,
    IN p_WeightKg DECIMAL(10,2),
    IN p_VolumeCbm DECIMAL(10,2),
    IN p_VehicleNo VARCHAR(50),
    IN p_Transporter VARCHAR(150),
    IN p_VehicleCapacityKg DECIMAL(10,2),
    IN p_IsExport BOOLEAN,
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_Count INT;

    IF p_Action = 'INSERT' THEN
        -- Generate auto DocNo like DSP-YYYY-XXXXX
        SELECT COUNT(*) + 1 INTO v_Count FROM DispatchPlan;
        SET v_DocNo = CONCAT('DSP/', YEAR(NOW()), '/', LPAD(v_Count, 4, '0'));

        INSERT INTO DispatchPlan (
            DocNo, PlanDate, Status, Basis, Customer, CustomerCode, SalesOrderNo,
            Route, Region, DeliveryDate, Priority, Cartons, Pallets, WeightKg,
            VolumeCbm, VehicleNo, Transporter, VehicleCapacityKg, IsExport, Remarks,
            IsDeleted, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, p_PlanDate, COALESCE(p_Status, 'DRAFT'), p_Basis, p_Customer, p_CustomerCode, p_SalesOrderNo,
            p_Route, p_Region, p_DeliveryDate, COALESCE(p_Priority, 'NORMAL'), p_Cartons, p_Pallets, p_WeightKg,
            p_VolumeCbm, p_VehicleNo, p_Transporter, p_VehicleCapacityKg, COALESCE(p_IsExport, 0), p_Remarks,
            0, p_User, NOW()
        );
        SELECT * FROM DispatchPlan WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE DispatchPlan
        SET 
            PlanDate = COALESCE(p_PlanDate, PlanDate),
            Status = COALESCE(p_Status, Status),
            Basis = COALESCE(p_Basis, Basis),
            Customer = COALESCE(p_Customer, Customer),
            CustomerCode = COALESCE(p_CustomerCode, CustomerCode),
            SalesOrderNo = CASE WHEN p_SalesOrderNo = '' THEN NULL WHEN p_SalesOrderNo IS NOT NULL THEN p_SalesOrderNo ELSE SalesOrderNo END,
            Route = COALESCE(p_Route, Route),
            Region = COALESCE(p_Region, Region),
            DeliveryDate = COALESCE(p_DeliveryDate, DeliveryDate),
            Priority = COALESCE(p_Priority, Priority),
            Cartons = COALESCE(p_Cartons, Cartons),
            Pallets = COALESCE(p_Pallets, Pallets),
            WeightKg = COALESCE(p_WeightKg, WeightKg),
            VolumeCbm = COALESCE(p_VolumeCbm, VolumeCbm),
            -- If VehicleNo is updated, these must update too. Using IF logic:
            VehicleNo = p_VehicleNo,
            Transporter = p_Transporter,
            VehicleCapacityKg = p_VehicleCapacityKg,
            IsExport = COALESCE(p_IsExport, IsExport),
            Remarks = p_Remarks,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND IsDeleted = 0;
        SELECT * FROM DispatchPlan WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE DispatchPlan 
        SET IsDeleted = 1, ModifiedBy = p_User, ModifiedDate = NOW()
        WHERE Id = p_Id;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT * FROM DispatchPlan WHERE IsDeleted = 0 ORDER BY Id DESC;

    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM DispatchPlan WHERE Id = p_Id AND IsDeleted = 0;
    END IF;
END //

DELIMITER ;
