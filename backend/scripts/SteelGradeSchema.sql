-- Create SteelGrade Table
CREATE TABLE IF NOT EXISTS SteelGrade (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    Standard VARCHAR(150) NOT NULL,
    ChromiumPct VARCHAR(50) NULL,
    NickelPct VARCHAR(50) NULL,
    CarbonMaxPct DECIMAL(6,3) NULL,
    FoodContact BIT NOT NULL DEFAULT 0,
    Application VARCHAR(255) NULL,
    
    Status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    EffectiveFrom DATETIME NULL,
    EffectiveTo DATETIME NULL,
    Revision INT NOT NULL DEFAULT 1,
    UsageCount INT NOT NULL DEFAULT 0,
    
    IsDeleted BIT NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stored Procedure for Next Code
DROP PROCEDURE IF EXISTS SpGetNextSteelGradeCode;

DELIMITER //

CREATE PROCEDURE SpGetNextSteelGradeCode()
BEGIN
    DECLARE v_NextNumber INT;
    DECLARE v_NextCode VARCHAR(50);
    
    SELECT COUNT(*) + 1 INTO v_NextNumber FROM SteelGrade;
    SET v_NextCode = CONCAT('GRD-', LPAD(v_NextNumber, 4, '0'));
    
    SELECT v_NextCode AS nextCode;
END //

DELIMITER ;

-- Stored Procedure for SteelGrade CRUD Operations
DROP PROCEDURE IF EXISTS SpSteelGrade;

DELIMITER //

CREATE PROCEDURE SpSteelGrade(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_Standard VARCHAR(150),
    IN p_ChromiumPct VARCHAR(50),
    IN p_NickelPct VARCHAR(50),
    IN p_CarbonMaxPct DECIMAL(6,3),
    IN p_FoodContact BIT,
    IN p_Application VARCHAR(255),
    IN p_Status VARCHAR(30),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_Revision INT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, Standard, ChromiumPct, NickelPct, CarbonMaxPct, FoodContact, Application,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelGrade
        WHERE IsDeleted = 0
        ORDER BY Code ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, Standard, ChromiumPct, NickelPct, CarbonMaxPct, FoodContact, Application,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelGrade
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO SteelGrade (
            Code, Name, Standard, ChromiumPct, NickelPct, CarbonMaxPct, FoodContact, Application,
            Status, EffectiveFrom, EffectiveTo,
            Revision, CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_Standard, p_ChromiumPct, p_NickelPct, p_CarbonMaxPct, p_FoodContact, p_Application,
            COALESCE(p_Status, 'PENDING_APPROVAL'), p_EffectiveFrom, p_EffectiveTo,
            COALESCE(p_Revision, 1), p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, Standard, ChromiumPct, NickelPct, CarbonMaxPct, FoodContact, Application,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelGrade
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE SteelGrade SET
            Name          = COALESCE(p_Name, Name),
            Standard      = COALESCE(p_Standard, Standard),
            ChromiumPct   = p_ChromiumPct,
            NickelPct     = p_NickelPct,
            CarbonMaxPct  = p_CarbonMaxPct,
            FoodContact   = COALESCE(p_FoodContact, FoodContact),
            Application   = p_Application,
            Status        = COALESCE(p_Status, Status),
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo   = p_EffectiveTo,
            Revision      = COALESCE(p_Revision, Revision),
            ModifiedBy    = p_ModifiedBy,
            ModifiedDate  = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- Return the updated record
        SELECT Id, Code, Name, Standard, ChromiumPct, NickelPct, CarbonMaxPct, FoodContact, Application,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelGrade
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE SteelGrade 
        SET IsDeleted = 1, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
        
    END IF;
END //

DELIMITER ;
