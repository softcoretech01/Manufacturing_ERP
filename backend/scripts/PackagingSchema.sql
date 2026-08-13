-- Create Packaging Table
CREATE TABLE IF NOT EXISTS Packaging (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    PackType VARCHAR(50) NOT NULL,
    UnitsPerPack INT NOT NULL,
    LengthMm INT NULL,
    WidthMm INT NULL,
    HeightMm INT NULL,
    TareWeightG INT NULL,
    IsExportGrade BIT NOT NULL DEFAULT 0,
    
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
DROP PROCEDURE IF EXISTS SpGetNextPackagingCode;

DELIMITER //

CREATE PROCEDURE SpGetNextPackagingCode()
BEGIN
    DECLARE v_NextNumber INT;
    DECLARE v_NextCode VARCHAR(50);
    
    SELECT COUNT(*) + 1 INTO v_NextNumber FROM Packaging;
    SET v_NextCode = CONCAT('PKG-', LPAD(v_NextNumber, 4, '0'));
    
    SELECT v_NextCode AS nextCode;
END //

DELIMITER ;

-- Stored Procedure for Packaging CRUD Operations
DROP PROCEDURE IF EXISTS SpPackaging;

DELIMITER //

CREATE PROCEDURE SpPackaging(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_PackType VARCHAR(50),
    IN p_UnitsPerPack INT,
    IN p_LengthMm INT,
    IN p_WidthMm INT,
    IN p_HeightMm INT,
    IN p_TareWeightG INT,
    IN p_IsExportGrade BIT,
    IN p_Status VARCHAR(30),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_Revision INT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, PackType, UnitsPerPack, LengthMm, WidthMm, HeightMm, TareWeightG, IsExportGrade,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Packaging
        WHERE IsDeleted = 0
        ORDER BY Code ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, PackType, UnitsPerPack, LengthMm, WidthMm, HeightMm, TareWeightG, IsExportGrade,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Packaging
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Packaging (
            Code, Name, PackType, UnitsPerPack, LengthMm, WidthMm, HeightMm, TareWeightG, IsExportGrade,
            Status, EffectiveFrom, EffectiveTo,
            Revision, CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_PackType, p_UnitsPerPack, p_LengthMm, p_WidthMm, p_HeightMm, p_TareWeightG, p_IsExportGrade,
            COALESCE(p_Status, 'ACTIVE'), p_EffectiveFrom, p_EffectiveTo,
            COALESCE(p_Revision, 1), p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, PackType, UnitsPerPack, LengthMm, WidthMm, HeightMm, TareWeightG, IsExportGrade,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Packaging
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Packaging SET
            Name          = COALESCE(p_Name, Name),
            PackType      = COALESCE(p_PackType, PackType),
            UnitsPerPack  = COALESCE(p_UnitsPerPack, UnitsPerPack),
            LengthMm      = p_LengthMm,
            WidthMm       = p_WidthMm,
            HeightMm      = p_HeightMm,
            TareWeightG   = p_TareWeightG,
            IsExportGrade = COALESCE(p_IsExportGrade, IsExportGrade),
            Status        = COALESCE(p_Status, Status),
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo   = p_EffectiveTo,
            Revision      = COALESCE(p_Revision, Revision),
            ModifiedBy    = p_ModifiedBy,
            ModifiedDate  = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- Return the updated record
        SELECT Id, Code, Name, PackType, UnitsPerPack, LengthMm, WidthMm, HeightMm, TareWeightG, IsExportGrade,
               Status, EffectiveFrom, EffectiveTo, Revision, UsageCount, 
               CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Packaging
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Packaging 
        SET IsDeleted = 1, 
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
        
    END IF;
END //

DELIMITER ;
