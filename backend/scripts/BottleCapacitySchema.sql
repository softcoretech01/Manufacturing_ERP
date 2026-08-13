-- Create BottleCapacity Table
CREATE TABLE IF NOT EXISTS BottleCapacity (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    NominalMl INT NOT NULL,
    BrimfulMl INT NULL,
    OzLabel VARCHAR(50) NULL,
    Segment VARCHAR(50) NULL,
    
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
DROP PROCEDURE IF EXISTS SpGetNextBottleCapacityCode;

DELIMITER //

CREATE PROCEDURE SpGetNextBottleCapacityCode()
BEGIN
    DECLARE v_NextNumber INT;
    DECLARE v_NextCode VARCHAR(50);
    
    SELECT COUNT(*) + 1 INTO v_NextNumber FROM BottleCapacity;
    SET v_NextCode = CONCAT('CAP-', LPAD(v_NextNumber, 4, '0'));
    
    SELECT v_NextCode AS nextCode;
END //

DELIMITER ;

-- Stored Procedure for BottleCapacity CRUD Operations
DROP PROCEDURE IF EXISTS SpBottleCapacity;

DELIMITER //

CREATE PROCEDURE SpBottleCapacity(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_NominalMl INT,
    IN p_BrimfulMl INT,
    IN p_OzLabel VARCHAR(50),
    IN p_Segment VARCHAR(50),
    IN p_Status VARCHAR(30),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_Revision INT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, NominalMl, BrimfulMl, OzLabel, Segment, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleCapacity
        WHERE IsDeleted = 0
        ORDER BY Code ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, NominalMl, BrimfulMl, OzLabel, Segment, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleCapacity
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO BottleCapacity (
            Code, Name, NominalMl, BrimfulMl, OzLabel, Segment,
            Status, EffectiveFrom, EffectiveTo,
            Revision, CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_NominalMl, p_BrimfulMl, p_OzLabel, p_Segment,
            COALESCE(p_Status, 'ACTIVE'), p_EffectiveFrom, p_EffectiveTo,
            COALESCE(p_Revision, 1), p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, NominalMl, BrimfulMl, OzLabel, Segment, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleCapacity
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE BottleCapacity SET
            Name          = COALESCE(p_Name, Name),
            NominalMl     = COALESCE(p_NominalMl, NominalMl),
            BrimfulMl     = COALESCE(p_BrimfulMl, BrimfulMl),
            OzLabel       = COALESCE(p_OzLabel, OzLabel),
            Segment       = COALESCE(p_Segment, Segment),
            Status        = COALESCE(p_Status, Status),
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo   = p_EffectiveTo, -- Allow nullifying
            Revision      = COALESCE(p_Revision, Revision),
            ModifiedBy    = p_ModifiedBy,
            ModifiedDate  = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- Return the updated record
        SELECT Id, Code, Name, NominalMl, BrimfulMl, OzLabel, Segment, 
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleCapacity
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE BottleCapacity 
        SET IsDeleted = 1, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
        
    END IF;
END //

DELIMITER ;
