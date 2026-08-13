-- Create SteelThickness Table
CREATE TABLE IF NOT EXISTS SteelThickness (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    ThicknessMm DECIMAL(5,2) NOT NULL,
    TolerancePlusMm DECIMAL(5,2) NULL,
    ToleranceMinusMm DECIMAL(5,2) NULL,
    MaxDrawRatio DECIMAL(5,2) NULL,
    UsedFor VARCHAR(255) NULL,
    
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
DROP PROCEDURE IF EXISTS SpGetNextSteelThicknessCode;

DELIMITER //

CREATE PROCEDURE SpGetNextSteelThicknessCode()
BEGIN
    DECLARE v_NextNumber INT;
    DECLARE v_NextCode VARCHAR(50);
    
    SELECT COUNT(*) + 1 INTO v_NextNumber FROM SteelThickness;
    SET v_NextCode = CONCAT('THK-', LPAD(v_NextNumber, 4, '0'));
    
    SELECT v_NextCode AS nextCode;
END //

DELIMITER ;

-- Stored Procedure for SteelThickness CRUD Operations
DROP PROCEDURE IF EXISTS SpSteelThickness;

DELIMITER //

CREATE PROCEDURE SpSteelThickness(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_ThicknessMm DECIMAL(5,2),
    IN p_TolerancePlusMm DECIMAL(5,2),
    IN p_ToleranceMinusMm DECIMAL(5,2),
    IN p_MaxDrawRatio DECIMAL(5,2),
    IN p_UsedFor VARCHAR(255),
    IN p_Status VARCHAR(30),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_Revision INT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, ThicknessMm, TolerancePlusMm, ToleranceMinusMm, MaxDrawRatio, UsedFor,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelThickness
        WHERE IsDeleted = 0
        ORDER BY Code ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, ThicknessMm, TolerancePlusMm, ToleranceMinusMm, MaxDrawRatio, UsedFor,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelThickness
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO SteelThickness (
            Code, Name, ThicknessMm, TolerancePlusMm, ToleranceMinusMm, MaxDrawRatio, UsedFor,
            Status, EffectiveFrom, EffectiveTo,
            Revision, CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_ThicknessMm, p_TolerancePlusMm, p_ToleranceMinusMm, p_MaxDrawRatio, p_UsedFor,
            COALESCE(p_Status, 'ACTIVE'), p_EffectiveFrom, p_EffectiveTo,
            COALESCE(p_Revision, 1), p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, ThicknessMm, TolerancePlusMm, ToleranceMinusMm, MaxDrawRatio, UsedFor,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelThickness
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE SteelThickness SET
            Name             = COALESCE(p_Name, Name),
            ThicknessMm      = p_ThicknessMm,
            TolerancePlusMm  = p_TolerancePlusMm,
            ToleranceMinusMm = p_ToleranceMinusMm,
            MaxDrawRatio     = p_MaxDrawRatio,
            UsedFor          = p_UsedFor,
            Status           = COALESCE(p_Status, Status),
            EffectiveFrom    = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo      = p_EffectiveTo,
            Revision         = COALESCE(p_Revision, Revision),
            ModifiedBy       = p_ModifiedBy,
            ModifiedDate     = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- Return the updated record
        SELECT Id, Code, Name, ThicknessMm, TolerancePlusMm, ToleranceMinusMm, MaxDrawRatio, UsedFor,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM SteelThickness
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE SteelThickness 
        SET IsDeleted = 1, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
        
    END IF;
END //

DELIMITER ;
