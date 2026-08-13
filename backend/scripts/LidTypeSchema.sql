-- Create LidType Table
CREATE TABLE IF NOT EXISTS LidType (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    ClosureType VARCHAR(50) NOT NULL,
    Material VARCHAR(50) NOT NULL,
    ThreadSpec VARCHAR(100) NULL,
    SealMaterial VARCHAR(50) NULL,
    LeakTestBar DECIMAL(5,2) NULL,
    FoodGradeCert VARCHAR(100) NULL,
    
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
DROP PROCEDURE IF EXISTS SpGetNextLidTypeCode;

DELIMITER //

CREATE PROCEDURE SpGetNextLidTypeCode()
BEGIN
    DECLARE v_NextNumber INT;
    DECLARE v_NextCode VARCHAR(50);
    
    SELECT COUNT(*) + 1 INTO v_NextNumber FROM LidType;
    SET v_NextCode = CONCAT('LID-', LPAD(v_NextNumber, 4, '0'));
    
    SELECT v_NextCode AS nextCode;
END //

DELIMITER ;

-- Stored Procedure for LidType CRUD Operations
DROP PROCEDURE IF EXISTS SpLidType;

DELIMITER //

CREATE PROCEDURE SpLidType(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_ClosureType VARCHAR(50),
    IN p_Material VARCHAR(50),
    IN p_ThreadSpec VARCHAR(100),
    IN p_SealMaterial VARCHAR(50),
    IN p_LeakTestBar DECIMAL(5,2),
    IN p_FoodGradeCert VARCHAR(100),
    IN p_Status VARCHAR(30),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_Revision INT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, ClosureType, Material, ThreadSpec, SealMaterial, LeakTestBar, FoodGradeCert,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM LidType
        WHERE IsDeleted = 0
        ORDER BY Code ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, ClosureType, Material, ThreadSpec, SealMaterial, LeakTestBar, FoodGradeCert,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM LidType
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO LidType (
            Code, Name, ClosureType, Material, ThreadSpec, SealMaterial, LeakTestBar, FoodGradeCert,
            Status, EffectiveFrom, EffectiveTo,
            Revision, CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_ClosureType, p_Material, p_ThreadSpec, p_SealMaterial, p_LeakTestBar, p_FoodGradeCert,
            COALESCE(p_Status, 'PENDING_APPROVAL'), p_EffectiveFrom, p_EffectiveTo,
            COALESCE(p_Revision, 1), p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, ClosureType, Material, ThreadSpec, SealMaterial, LeakTestBar, FoodGradeCert,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM LidType
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE LidType SET
            Name          = COALESCE(p_Name, Name),
            ClosureType   = COALESCE(p_ClosureType, ClosureType),
            Material      = COALESCE(p_Material, Material),
            ThreadSpec    = p_ThreadSpec,
            SealMaterial  = p_SealMaterial,
            LeakTestBar   = p_LeakTestBar,
            FoodGradeCert = p_FoodGradeCert,
            Status        = COALESCE(p_Status, Status),
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo   = p_EffectiveTo,
            Revision      = COALESCE(p_Revision, Revision),
            ModifiedBy    = p_ModifiedBy,
            ModifiedDate  = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- Return the updated record
        SELECT Id, Code, Name, ClosureType, Material, ThreadSpec, SealMaterial, LeakTestBar, FoodGradeCert,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM LidType
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE LidType 
        SET IsDeleted = 1, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
        
    END IF;
END //

DELIMITER ;
