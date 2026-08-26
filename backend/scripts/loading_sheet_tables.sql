USE ERP_Packing;

-- 1. LoadingSheet Table
CREATE TABLE IF NOT EXISTS LoadingSheet (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    DispatchPlanNo VARCHAR(50) NOT NULL,
    VehicleNo VARCHAR(50) NOT NULL,
    Transporter VARCHAR(150) NOT NULL,
    Driver VARCHAR(100) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    Destination VARCHAR(255) NOT NULL,
    StagingBay VARCHAR(50) NOT NULL,
    CartonsPlanned INT NOT NULL DEFAULT 0,
    CartonsLoaded INT NOT NULL DEFAULT 0,
    PalletsLoaded INT NOT NULL DEFAULT 0,
    PlannedWeightKg DECIMAL(10,2) NOT NULL DEFAULT 0,
    ActualWeightKg DECIMAL(10,2) NOT NULL DEFAULT 0,
    StartedAt DATETIME NULL,
    CompletedAt DATETIME NULL,
    Loader VARCHAR(100) NOT NULL,
    Supervisor VARCHAR(100) NOT NULL,
    SealNo VARCHAR(50) NULL,
    SealVerified BOOLEAN NOT NULL DEFAULT 0,
    PhotosAttached INT NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL DEFAULT 'STAGED',
    Remarks TEXT NULL,
    IsDeleted BOOLEAN DEFAULT FALSE,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

-- SP for LoadingSheet
DROP PROCEDURE IF EXISTS SpManageLoadingSheet //

CREATE PROCEDURE SpManageLoadingSheet(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_DispatchPlanNo VARCHAR(50),
    IN p_VehicleNo VARCHAR(50),
    IN p_Transporter VARCHAR(150),
    IN p_Driver VARCHAR(100),
    IN p_Customer VARCHAR(255),
    IN p_Destination VARCHAR(255),
    IN p_StagingBay VARCHAR(50),
    IN p_CartonsPlanned INT,
    IN p_CartonsLoaded INT,
    IN p_PalletsLoaded INT,
    IN p_PlannedWeightKg DECIMAL(10,2),
    IN p_ActualWeightKg DECIMAL(10,2),
    IN p_StartedAt DATETIME,
    IN p_CompletedAt DATETIME,
    IN p_Loader VARCHAR(100),
    IN p_Supervisor VARCHAR(100),
    IN p_SealNo VARCHAR(50),
    IN p_SealVerified BOOLEAN,
    IN p_PhotosAttached INT,
    IN p_Status VARCHAR(20),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_Count INT;

    IF p_Action = 'INSERT' THEN
        -- Generate auto DocNo like LDS/YYYY/XXXX
        SELECT COUNT(*) + 1 INTO v_Count FROM LoadingSheet;
        SET v_DocNo = CONCAT('LDS/', YEAR(NOW()), '/', LPAD(v_Count, 4, '0'));

        INSERT INTO LoadingSheet (
            DocNo, DispatchPlanNo, VehicleNo, Transporter, Driver, Customer, Destination, StagingBay,
            CartonsPlanned, CartonsLoaded, PalletsLoaded, PlannedWeightKg, ActualWeightKg,
            StartedAt, CompletedAt, Loader, Supervisor, SealNo, SealVerified, PhotosAttached, Status, Remarks,
            IsDeleted, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, p_DispatchPlanNo, p_VehicleNo, p_Transporter, p_Driver, p_Customer, p_Destination, p_StagingBay,
            p_CartonsPlanned, COALESCE(p_CartonsLoaded, 0), COALESCE(p_PalletsLoaded, 0), p_PlannedWeightKg, COALESCE(p_ActualWeightKg, 0),
            p_StartedAt, p_CompletedAt, p_Loader, p_Supervisor, p_SealNo, COALESCE(p_SealVerified, 0), COALESCE(p_PhotosAttached, 0), COALESCE(p_Status, 'STAGED'), p_Remarks,
            0, p_User, NOW()
        );
        SELECT * FROM LoadingSheet WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE LoadingSheet
        SET 
            DispatchPlanNo = COALESCE(p_DispatchPlanNo, DispatchPlanNo),
            VehicleNo = COALESCE(p_VehicleNo, VehicleNo),
            Transporter = COALESCE(p_Transporter, Transporter),
            Driver = COALESCE(p_Driver, Driver),
            Customer = COALESCE(p_Customer, Customer),
            Destination = COALESCE(p_Destination, Destination),
            StagingBay = COALESCE(p_StagingBay, StagingBay),
            CartonsPlanned = COALESCE(p_CartonsPlanned, CartonsPlanned),
            CartonsLoaded = COALESCE(p_CartonsLoaded, CartonsLoaded),
            PalletsLoaded = COALESCE(p_PalletsLoaded, PalletsLoaded),
            PlannedWeightKg = COALESCE(p_PlannedWeightKg, PlannedWeightKg),
            ActualWeightKg = COALESCE(p_ActualWeightKg, ActualWeightKg),
            StartedAt = CASE WHEN p_StartedAt IS NOT NULL THEN p_StartedAt ELSE StartedAt END,
            CompletedAt = CASE WHEN p_CompletedAt IS NOT NULL THEN p_CompletedAt ELSE CompletedAt END,
            Loader = COALESCE(p_Loader, Loader),
            Supervisor = COALESCE(p_Supervisor, Supervisor),
            SealNo = CASE WHEN p_SealNo = '' THEN NULL WHEN p_SealNo IS NOT NULL THEN p_SealNo ELSE SealNo END,
            SealVerified = COALESCE(p_SealVerified, SealVerified),
            PhotosAttached = COALESCE(p_PhotosAttached, PhotosAttached),
            Status = COALESCE(p_Status, Status),
            Remarks = CASE WHEN p_Remarks = '' THEN NULL WHEN p_Remarks IS NOT NULL THEN p_Remarks ELSE Remarks END,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND IsDeleted = 0;
        SELECT * FROM LoadingSheet WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE LoadingSheet 
        SET IsDeleted = 1, ModifiedBy = p_User, ModifiedDate = NOW()
        WHERE Id = p_Id;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT * FROM LoadingSheet WHERE IsDeleted = 0 ORDER BY Id DESC;

    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM LoadingSheet WHERE Id = p_Id AND IsDeleted = 0;
    END IF;
END //

DELIMITER ;
