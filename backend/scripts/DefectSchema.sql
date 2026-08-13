-- Table: Defect
CREATE TABLE IF NOT EXISTS Defect (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    Category VARCHAR(50) NOT NULL,
    Stage VARCHAR(50) NOT NULL,
    Severity VARCHAR(20) NOT NULL,
    Disposition VARCHAR(50),
    Reworkable BIT DEFAULT b'0',
    EffectiveFrom DATETIME NOT NULL,
    EffectiveTo DATETIME NULL,
    UsageCount INT DEFAULT 0,
    IsActive BIT DEFAULT b'1',
    IsDeleted BIT DEFAULT b'0',
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stored Procedure: SpGetNextDefectCode
DROP PROCEDURE IF EXISTS SpGetNextDefectCode;
DELIMITER //
CREATE PROCEDURE SpGetNextDefectCode()
BEGIN
    DECLARE next_id INT;
    DECLARE next_code VARCHAR(50);
    
    SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM Defect;
    SET next_code = CONCAT('DEF-', LPAD(next_id, 4, '0'));
    
    SELECT next_code AS nextCode;
END //
DELIMITER ;

-- Stored Procedure: SpDefect
DROP PROCEDURE IF EXISTS SpDefect;
DELIMITER //

CREATE PROCEDURE SpDefect (
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50),
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_Category VARCHAR(50),
    IN p_Stage VARCHAR(50),
    IN p_Severity VARCHAR(20),
    IN p_Disposition VARCHAR(50),
    IN p_Reworkable BIT,
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_IsActive BIT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, Code, Name, Category, Stage, Severity, Disposition, Reworkable, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Defect
        WHERE IsDeleted = 0;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, Code, Name, Category, Stage, Severity, Disposition, Reworkable, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Defect
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Defect (
            Uid, Code, Name, Category, Stage, Severity, Disposition, Reworkable, EffectiveFrom, EffectiveTo, IsActive, CreatedBy, ModifiedBy
        ) VALUES (
            p_Uid, p_Code, p_Name, p_Category, p_Stage, p_Severity, p_Disposition, p_Reworkable, p_EffectiveFrom, p_EffectiveTo, p_IsActive, p_ModifiedBy, p_ModifiedBy
        );
        
        SELECT Uid, Code, Name, Category, Stage, Severity, Disposition, Reworkable, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Defect
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Defect
        SET 
            Code = p_Code,
            Name = p_Name,
            Category = p_Category,
            Stage = p_Stage,
            Severity = p_Severity,
            Disposition = p_Disposition,
            Reworkable = p_Reworkable,
            EffectiveFrom = p_EffectiveFrom,
            EffectiveTo = p_EffectiveTo,
            IsActive = p_IsActive,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
        SELECT Uid, Code, Name, Category, Stage, Severity, Disposition, Reworkable, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Defect
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Defect
        SET 
            IsDeleted = 1,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;
