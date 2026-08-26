USE ERP_Quality;

CREATE TABLE IF NOT EXISTS DefectType (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) UNIQUE NOT NULL,
    Name VARCHAR(150) NOT NULL,
    Severity VARCHAR(20) NOT NULL,
    Category VARCHAR(100) NOT NULL,
    DefaultCause VARCHAR(50) NOT NULL,
    ScrapCostPerUnit DECIMAL(15,3) DEFAULT 0,
    ReworkCostPerUnit DECIMAL(15,3) DEFAULT 0,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    Version INT DEFAULT 1,
    DeletedAt DATETIME NULL
);

DROP PROCEDURE IF EXISTS SpManageDefectType;

DELIMITER //

CREATE PROCEDURE SpManageDefectType(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_Severity VARCHAR(20),
    IN p_Category VARCHAR(100),
    IN p_DefaultCause VARCHAR(50),
    IN p_ScrapCostPerUnit DECIMAL(15,3),
    IN p_ReworkCostPerUnit DECIMAL(15,3),
    IN p_IsActive BOOLEAN,
    IN p_User VARCHAR(100)
)
BEGIN

    IF p_Action = 'CREATE' THEN
        INSERT INTO DefectType (
            Code, Name, Severity, Category, DefaultCause, ScrapCostPerUnit, ReworkCostPerUnit, IsActive,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            p_Code, p_Name, p_Severity, p_Category, p_DefaultCause, p_ScrapCostPerUnit, p_ReworkCostPerUnit, p_IsActive,
            p_User, NOW(), p_User, NOW()
        );

        SET p_Id = LAST_INSERT_ID();
        SELECT p_Id AS Id;

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE DefectType SET
            Code = COALESCE(p_Code, Code),
            Name = COALESCE(p_Name, Name),
            Severity = COALESCE(p_Severity, Severity),
            Category = COALESCE(p_Category, Category),
            DefaultCause = COALESCE(p_DefaultCause, DefaultCause),
            ScrapCostPerUnit = COALESCE(p_ScrapCostPerUnit, ScrapCostPerUnit),
            ReworkCostPerUnit = COALESCE(p_ReworkCostPerUnit, ReworkCostPerUnit),
            IsActive = COALESCE(p_IsActive, IsActive),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE DefectType SET 
            DeletedAt = NOW(), 
            ModifiedBy = p_User, 
            ModifiedDate = NOW(),
            Version = Version + 1 
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

END //
DELIMITER ;
