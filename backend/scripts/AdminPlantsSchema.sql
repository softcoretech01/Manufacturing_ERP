-- Create Tables
CREATE TABLE IF NOT EXISTS Branch (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    CompanyUid VARCHAR(50) NULL,
    Code VARCHAR(10) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    BranchType VARCHAR(50) NULL,
    Gstin VARCHAR(15) NULL,
    HasSeparateGstin BIT NULL DEFAULT 0,
    City VARCHAR(50) NULL,
    State VARCHAR(50) NULL,
    StateCode VARCHAR(2) NULL,
    Pincode VARCHAR(10) NULL,
    ContactPerson VARCHAR(100) NULL,
    Phone VARCHAR(10) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Plant (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    CompanyUid VARCHAR(50) NULL,
    BranchUid VARCHAR(50) NOT NULL,
    Code VARCHAR(10) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    PlantHead VARCHAR(100) NULL,
    FactoryLicence VARCHAR(50) NULL,
    FactoryLicenceValidTo DATE NULL,
    City VARCHAR(50) NULL,
    State VARCHAR(50) NULL,
    InstalledCapacityPerDay INT NULL,
    CapacityUom VARCHAR(20) NULL,
    ShiftPattern VARCHAR(20) NULL,
    LinesCount INT NULL DEFAULT 0,
    WorkCentresCount INT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ProductionLine (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    PlantUid VARCHAR(50) NOT NULL,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    LineType VARCHAR(50) NULL,
    MinCapacityMl INT NULL,
    MaxCapacityMl INT NULL,
    CycleTimeSec DECIMAL(10,2) NULL,
    RatedOutputPerHour INT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS WorkCentre (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    PlantUid VARCHAR(50) NOT NULL,
    LineUid VARCHAR(50) NULL,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    Type VARCHAR(50) NULL,
    CapacityPerHour INT NULL,
    EfficiencyPct DECIMAL(5,2) NULL,
    MachineHourRate DECIMAL(10,2) NULL,
    IsBottleneck BIT NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Warehouse (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    CompanyUid VARCHAR(50) NULL,
    BranchUid VARCHAR(50) NULL,
    PlantUid VARCHAR(50) NULL,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    WarehouseType VARCHAR(50) NULL,
    IsBinManaged BIT NOT NULL DEFAULT 0,
    IsBatchMandatory BIT NOT NULL DEFAULT 0,
    AllowNegativeStock BIT NOT NULL DEFAULT 0,
    IsSystemManaged BIT NOT NULL DEFAULT 0,
    Storekeeper VARCHAR(100) NULL,
    ValuationMethod VARCHAR(50) NULL,
    BinCount INT NULL DEFAULT 0,
    StockValue DECIMAL(15,2) NULL DEFAULT 0.00,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stored Procedures

DROP PROCEDURE IF EXISTS SpBranch;
DELIMITER //
CREATE PROCEDURE SpBranch(
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, CompanyUid, Code, Name, BranchType, Gstin, HasSeparateGstin, City, State, StateCode, Pincode, ContactPerson, Phone, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Branch
        WHERE IsActive = 1;
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, CompanyUid, Code, Name, BranchType, Gstin, HasSeparateGstin, City, State, StateCode, Pincode, ContactPerson, Phone, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Branch
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS SpProductionLine;
DELIMITER //
CREATE PROCEDURE SpProductionLine(
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, PlantUid, Code, Name, LineType, MinCapacityMl, MaxCapacityMl, CycleTimeSec, RatedOutputPerHour, Status, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM ProductionLine;
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, PlantUid, Code, Name, LineType, MinCapacityMl, MaxCapacityMl, CycleTimeSec, RatedOutputPerHour, Status, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM ProductionLine
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS SpWorkCentre;
DELIMITER //
CREATE PROCEDURE SpWorkCentre(
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, PlantUid, LineUid, Code, Name, Type, CapacityPerHour, EfficiencyPct, MachineHourRate, IsBottleneck, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM WorkCentre;
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, PlantUid, LineUid, Code, Name, Type, CapacityPerHour, EfficiencyPct, MachineHourRate, IsBottleneck, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM WorkCentre
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS SpWarehouse;
DELIMITER //
CREATE PROCEDURE SpWarehouse(
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, CompanyUid, BranchUid, PlantUid, Code, Name, WarehouseType, IsBinManaged, IsBatchMandatory, AllowNegativeStock, IsSystemManaged, Storekeeper, ValuationMethod, BinCount, StockValue, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Warehouse
        WHERE IsActive = 1;
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, CompanyUid, BranchUid, PlantUid, Code, Name, WarehouseType, IsBinManaged, IsBatchMandatory, AllowNegativeStock, IsSystemManaged, Storekeeper, ValuationMethod, BinCount, StockValue, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Warehouse
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS SpPlant;
DELIMITER //
CREATE PROCEDURE SpPlant(
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50),
    IN p_CompanyUid VARCHAR(50),
    IN p_BranchUid VARCHAR(50),
    IN p_Code VARCHAR(10),
    IN p_Name VARCHAR(100),
    IN p_PlantHead VARCHAR(100),
    IN p_FactoryLicence VARCHAR(50),
    IN p_FactoryLicenceValidTo DATE,
    IN p_City VARCHAR(50),
    IN p_State VARCHAR(50),
    IN p_InstalledCapacityPerDay INT,
    IN p_CapacityUom VARCHAR(20),
    IN p_ShiftPattern VARCHAR(20),
    IN p_IsActive BIT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, CompanyUid, BranchUid, Code, Name, PlantHead, FactoryLicence, FactoryLicenceValidTo, City, State, InstalledCapacityPerDay, CapacityUom, ShiftPattern, LinesCount, WorkCentresCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Plant
        WHERE IsActive = 1;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, CompanyUid, BranchUid, Code, Name, PlantHead, FactoryLicence, FactoryLicenceValidTo, City, State, InstalledCapacityPerDay, CapacityUom, ShiftPattern, LinesCount, WorkCentresCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Plant
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Plant (
            Uid, CompanyUid, BranchUid, Code, Name, PlantHead, FactoryLicence, FactoryLicenceValidTo, City, State, InstalledCapacityPerDay, CapacityUom, ShiftPattern, IsActive, CreatedBy, ModifiedBy
        ) VALUES (
            p_Uid, p_CompanyUid, p_BranchUid, p_Code, p_Name, p_PlantHead, p_FactoryLicence, p_FactoryLicenceValidTo, p_City, p_State, p_InstalledCapacityPerDay, p_CapacityUom, p_ShiftPattern, COALESCE(p_IsActive, 1), p_ModifiedBy, p_ModifiedBy
        );
        
        SELECT Uid, CompanyUid, BranchUid, Code, Name, PlantHead, FactoryLicence, FactoryLicenceValidTo, City, State, InstalledCapacityPerDay, CapacityUom, ShiftPattern, LinesCount, WorkCentresCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Plant
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Plant SET
            CompanyUid = COALESCE(p_CompanyUid, CompanyUid),
            BranchUid = COALESCE(p_BranchUid, BranchUid),
            Code = COALESCE(p_Code, Code),
            Name = COALESCE(p_Name, Name),
            PlantHead = p_PlantHead,
            FactoryLicence = p_FactoryLicence,
            FactoryLicenceValidTo = p_FactoryLicenceValidTo,
            City = COALESCE(p_City, City),
            State = COALESCE(p_State, State),
            InstalledCapacityPerDay = p_InstalledCapacityPerDay,
            CapacityUom = COALESCE(p_CapacityUom, CapacityUom),
            ShiftPattern = p_ShiftPattern,
            IsActive = COALESCE(p_IsActive, IsActive),
            ModifiedBy = p_ModifiedBy,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Uid = p_Uid;
        
        SELECT Uid, CompanyUid, BranchUid, Code, Name, PlantHead, FactoryLicence, FactoryLicenceValidTo, City, State, InstalledCapacityPerDay, CapacityUom, ShiftPattern, LinesCount, WorkCentresCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Plant
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Plant 
        SET IsActive = 0, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;
