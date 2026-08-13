-- Table: QualityParameter
CREATE TABLE IF NOT EXISTS QualityParameter (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    ParamType VARCHAR(20) NOT NULL,
    Stage VARCHAR(20) NOT NULL,
    Nominal VARCHAR(100),
    Tolerance VARCHAR(50),
    Uom VARCHAR(20),
    Instrument VARCHAR(100),
    IsCritical BIT DEFAULT b'0',
    Method VARCHAR(500),
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

-- Stored Procedure: SpGetNextQualityParameterCode
DROP PROCEDURE IF EXISTS SpGetNextQualityParameterCode;
DELIMITER //
CREATE PROCEDURE SpGetNextQualityParameterCode()
BEGIN
    DECLARE next_id INT;
    DECLARE next_code VARCHAR(50);
    
    SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM QualityParameter;
    SET next_code = CONCAT('QP-', LPAD(next_id, 4, '0'));
    
    SELECT next_code AS nextCode;
END //
DELIMITER ;

-- Stored Procedure: SpQualityParameter
DROP PROCEDURE IF EXISTS SpQualityParameter;
DELIMITER //

CREATE PROCEDURE SpQualityParameter (
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50),
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_ParamType VARCHAR(20),
    IN p_Stage VARCHAR(20),
    IN p_Nominal VARCHAR(100),
    IN p_Tolerance VARCHAR(50),
    IN p_Uom VARCHAR(20),
    IN p_Instrument VARCHAR(100),
    IN p_IsCritical BIT,
    IN p_Method VARCHAR(500),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_IsActive BIT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, Code, Name, ParamType, Stage, Nominal, Tolerance, Uom, Instrument, IsCritical, Method, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM QualityParameter
        WHERE IsDeleted = 0;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, Code, Name, ParamType, Stage, Nominal, Tolerance, Uom, Instrument, IsCritical, Method, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM QualityParameter
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO QualityParameter (
            Uid, Code, Name, ParamType, Stage, Nominal, Tolerance, Uom, Instrument, IsCritical, Method, EffectiveFrom, EffectiveTo, IsActive, CreatedBy, ModifiedBy
        ) VALUES (
            p_Uid, p_Code, p_Name, p_ParamType, p_Stage, p_Nominal, p_Tolerance, p_Uom, p_Instrument, p_IsCritical, p_Method, p_EffectiveFrom, p_EffectiveTo, p_IsActive, p_ModifiedBy, p_ModifiedBy
        );
        
        SELECT Uid, Code, Name, ParamType, Stage, Nominal, Tolerance, Uom, Instrument, IsCritical, Method, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM QualityParameter
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE QualityParameter
        SET 
            Code = p_Code,
            Name = p_Name,
            ParamType = p_ParamType,
            Stage = p_Stage,
            Nominal = p_Nominal,
            Tolerance = p_Tolerance,
            Uom = p_Uom,
            Instrument = p_Instrument,
            IsCritical = p_IsCritical,
            Method = p_Method,
            EffectiveFrom = p_EffectiveFrom,
            EffectiveTo = p_EffectiveTo,
            IsActive = p_IsActive,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
        SELECT Uid, Code, Name, ParamType, Stage, Nominal, Tolerance, Uom, Instrument, IsCritical, Method, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM QualityParameter
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE QualityParameter
        SET 
            IsDeleted = 1,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;
