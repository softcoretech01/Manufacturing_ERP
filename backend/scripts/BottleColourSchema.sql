-- Create BottleColour Table
CREATE TABLE IF NOT EXISTS BottleColour (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    Hex VARCHAR(20) NOT NULL,
    RalCode VARCHAR(50) NOT NULL,
    Finish VARCHAR(50) NOT NULL,
    Process VARCHAR(50) NULL,
    Consumable VARCHAR(150) NULL,
    
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
DROP PROCEDURE IF EXISTS SpGetNextBottleColourCode;

DELIMITER //

CREATE PROCEDURE SpGetNextBottleColourCode()
BEGIN
    DECLARE v_NextNumber INT;
    DECLARE v_NextCode VARCHAR(50);
    
    SELECT COUNT(*) + 1 INTO v_NextNumber FROM BottleColour;
    SET v_NextCode = CONCAT('COL-', LPAD(v_NextNumber, 4, '0'));
    
    SELECT v_NextCode AS nextCode;
END //

DELIMITER ;

-- Stored Procedure for BottleColour CRUD Operations
DROP PROCEDURE IF EXISTS SpBottleColour;

DELIMITER //

CREATE PROCEDURE SpBottleColour(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_Hex VARCHAR(20),
    IN p_RalCode VARCHAR(50),
    IN p_Finish VARCHAR(50),
    IN p_Process VARCHAR(50),
    IN p_Consumable VARCHAR(150),
    IN p_Status VARCHAR(30),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_Revision INT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, Hex, RalCode, Finish, Process, Consumable, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleColour
        WHERE IsDeleted = 0
        ORDER BY Code ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, Hex, RalCode, Finish, Process, Consumable, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleColour
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO BottleColour (
            Code, Name, Hex, RalCode, Finish, Process, Consumable,
            Status, EffectiveFrom, EffectiveTo,
            Revision, CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_Hex, p_RalCode, p_Finish, p_Process, p_Consumable,
            COALESCE(p_Status, 'ACTIVE'), p_EffectiveFrom, p_EffectiveTo,
            COALESCE(p_Revision, 1), p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, Hex, RalCode, Finish, Process, Consumable, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleColour
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE BottleColour SET
            Name          = COALESCE(p_Name, Name),
            Hex           = COALESCE(p_Hex, Hex),
            RalCode       = COALESCE(p_RalCode, RalCode),
            Finish        = COALESCE(p_Finish, Finish),
            Process       = COALESCE(p_Process, Process),
            Consumable    = COALESCE(p_Consumable, Consumable),
            Status        = COALESCE(p_Status, Status),
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo   = p_EffectiveTo,
            Revision      = COALESCE(p_Revision, Revision),
            ModifiedBy    = p_ModifiedBy,
            ModifiedDate  = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- Return the updated record
        SELECT Id, Code, Name, Hex, RalCode, Finish, Process, Consumable, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleColour
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE BottleColour 
        SET IsDeleted = 1, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
        
    END IF;
END //

DELIMITER ;
