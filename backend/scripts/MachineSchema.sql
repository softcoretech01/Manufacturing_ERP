-- Create Machine Table
CREATE TABLE IF NOT EXISTS Machine (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    MachineGroup VARCHAR(100) NOT NULL,
    PlantUid VARCHAR(50) NOT NULL,
    LineCode VARCHAR(50) NOT NULL,
    WorkCentreCode VARCHAR(50) NOT NULL,
    Manufacturer VARCHAR(150) NOT NULL,
    ModelNumber VARCHAR(100) NULL,
    SerialNumber VARCHAR(100) NULL,
    YearOfManufacture INT NULL,
    AssetCode VARCHAR(100) NULL,
    CapacityPerHour DECIMAL(10,2) NOT NULL,
    CapacityUom VARCHAR(20) NOT NULL,
    PowerKw DECIMAL(10,2) NULL,
    OperatorsRequired INT NOT NULL DEFAULT 1,
    InstalledOn DATE NULL,
    WarrantyUntil DATE NULL,
    PmFrequencyDays INT NOT NULL,
    LastPmOn DATE NULL,
    NextPmOn DATE NULL,
    Criticality VARCHAR(10) NOT NULL DEFAULT 'C',
    CurrentState VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    OeePct DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    Operations TEXT NULL,
    
    Status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    
    IsDeleted BIT NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stored Procedure for Next Code
DROP PROCEDURE IF EXISTS SpGetNextMachineCode;

DELIMITER //

CREATE PROCEDURE SpGetNextMachineCode()
BEGIN
    DECLARE v_NextNumber INT;
    DECLARE v_NextCode VARCHAR(50);
    
    SELECT COUNT(*) + 1 INTO v_NextNumber FROM Machine;
    SET v_NextCode = CONCAT('MC-', LPAD(v_NextNumber, 4, '0'));
    
    SELECT v_NextCode AS nextCode;
END //

DELIMITER ;

-- Stored Procedure for Machine CRUD Operations
DROP PROCEDURE IF EXISTS SpMachine;

DELIMITER //

CREATE PROCEDURE SpMachine(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_MachineGroup VARCHAR(100),
    IN p_PlantUid VARCHAR(50),
    IN p_LineCode VARCHAR(50),
    IN p_WorkCentreCode VARCHAR(50),
    IN p_Manufacturer VARCHAR(150),
    IN p_ModelNumber VARCHAR(100),
    IN p_SerialNumber VARCHAR(100),
    IN p_YearOfManufacture INT,
    IN p_AssetCode VARCHAR(100),
    IN p_CapacityPerHour DECIMAL(10,2),
    IN p_CapacityUom VARCHAR(20),
    IN p_PowerKw DECIMAL(10,2),
    IN p_OperatorsRequired INT,
    IN p_InstalledOn DATE,
    IN p_WarrantyUntil DATE,
    IN p_PmFrequencyDays INT,
    IN p_LastPmOn DATE,
    IN p_NextPmOn DATE,
    IN p_Criticality VARCHAR(10),
    IN p_CurrentState VARCHAR(30),
    IN p_OeePct DECIMAL(5,2),
    IN p_Operations TEXT,
    IN p_Status VARCHAR(30),
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, MachineGroup, PlantUid, LineCode, WorkCentreCode,
               Manufacturer, ModelNumber, SerialNumber, YearOfManufacture, AssetCode,
               CapacityPerHour, CapacityUom, PowerKw, OperatorsRequired, InstalledOn,
               WarrantyUntil, PmFrequencyDays, LastPmOn, NextPmOn, Criticality,
               CurrentState, OeePct, Operations, Status,
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Machine
        WHERE IsDeleted = 0
        ORDER BY Code ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, MachineGroup, PlantUid, LineCode, WorkCentreCode,
               Manufacturer, ModelNumber, SerialNumber, YearOfManufacture, AssetCode,
               CapacityPerHour, CapacityUom, PowerKw, OperatorsRequired, InstalledOn,
               WarrantyUntil, PmFrequencyDays, LastPmOn, NextPmOn, Criticality,
               CurrentState, OeePct, Operations, Status,
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Machine
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Machine (
            Code, Name, MachineGroup, PlantUid, LineCode, WorkCentreCode,
            Manufacturer, ModelNumber, SerialNumber, YearOfManufacture, AssetCode,
            CapacityPerHour, CapacityUom, PowerKw, OperatorsRequired, InstalledOn,
            WarrantyUntil, PmFrequencyDays, LastPmOn, NextPmOn, Criticality,
            CurrentState, OeePct, Operations, Status,
            CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_MachineGroup, p_PlantUid, p_LineCode, p_WorkCentreCode,
            p_Manufacturer, p_ModelNumber, p_SerialNumber, p_YearOfManufacture, p_AssetCode,
            p_CapacityPerHour, p_CapacityUom, p_PowerKw, p_OperatorsRequired, p_InstalledOn,
            p_WarrantyUntil, p_PmFrequencyDays, p_LastPmOn, p_NextPmOn, p_Criticality,
            p_CurrentState, p_OeePct, p_Operations, COALESCE(p_Status, 'ACTIVE'),
            p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, MachineGroup, PlantUid, LineCode, WorkCentreCode,
               Manufacturer, ModelNumber, SerialNumber, YearOfManufacture, AssetCode,
               CapacityPerHour, CapacityUom, PowerKw, OperatorsRequired, InstalledOn,
               WarrantyUntil, PmFrequencyDays, LastPmOn, NextPmOn, Criticality,
               CurrentState, OeePct, Operations, Status,
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Machine
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Machine SET
            Name              = COALESCE(p_Name, Name),
            MachineGroup      = COALESCE(p_MachineGroup, MachineGroup),
            PlantUid          = COALESCE(p_PlantUid, PlantUid),
            LineCode          = COALESCE(p_LineCode, LineCode),
            WorkCentreCode    = COALESCE(p_WorkCentreCode, WorkCentreCode),
            Manufacturer      = COALESCE(p_Manufacturer, Manufacturer),
            ModelNumber       = p_ModelNumber,
            SerialNumber      = p_SerialNumber,
            YearOfManufacture = p_YearOfManufacture,
            AssetCode         = p_AssetCode,
            CapacityPerHour   = COALESCE(p_CapacityPerHour, CapacityPerHour),
            CapacityUom       = COALESCE(p_CapacityUom, CapacityUom),
            PowerKw           = p_PowerKw,
            OperatorsRequired = COALESCE(p_OperatorsRequired, OperatorsRequired),
            InstalledOn       = p_InstalledOn,
            WarrantyUntil     = p_WarrantyUntil,
            PmFrequencyDays   = COALESCE(p_PmFrequencyDays, PmFrequencyDays),
            LastPmOn          = p_LastPmOn,
            NextPmOn          = p_NextPmOn,
            Criticality       = COALESCE(p_Criticality, Criticality),
            CurrentState      = COALESCE(p_CurrentState, CurrentState),
            OeePct            = COALESCE(p_OeePct, OeePct),
            Operations        = p_Operations,
            Status            = COALESCE(p_Status, Status),
            ModifiedBy        = p_ModifiedBy,
            ModifiedDate      = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- Return the updated record
        SELECT Id, Code, Name, MachineGroup, PlantUid, LineCode, WorkCentreCode,
               Manufacturer, ModelNumber, SerialNumber, YearOfManufacture, AssetCode,
               CapacityPerHour, CapacityUom, PowerKw, OperatorsRequired, InstalledOn,
               WarrantyUntil, PmFrequencyDays, LastPmOn, NextPmOn, Criticality,
               CurrentState, OeePct, Operations, Status,
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Machine
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Machine 
        SET IsDeleted = 1, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
        
    END IF;
END //

DELIMITER ;
