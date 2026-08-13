-- Table: Hsn
CREATE TABLE IF NOT EXISTS Hsn (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(250) NOT NULL,
    Chapter VARCHAR(10),
    GstRate VARCHAR(5),
    CessRate DECIMAL(5,2) DEFAULT 0,
    IsService BIT DEFAULT b'0',
    Notification VARCHAR(100),
    Status VARCHAR(20) DEFAULT 'ACTIVE',
    EffectiveFrom DATETIME,
    EffectiveTo DATETIME NULL,
    Revision INT DEFAULT 1,
    UsageCount INT DEFAULT 0,
    IsDeleted BIT DEFAULT b'0',
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stored Procedure: SpGetNextHsnCode
DROP PROCEDURE IF EXISTS SpGetNextHsnCode;
DELIMITER //
CREATE PROCEDURE SpGetNextHsnCode()
BEGIN
    DECLARE next_id INT;
    DECLARE next_code VARCHAR(50);
    
    SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM Hsn;
    SET next_code = CONCAT('HSN-', LPAD(next_id, 4, '0'));
    
    SELECT next_code AS nextCode;
END //
DELIMITER ;

-- Stored Procedure: SpHsn
DROP PROCEDURE IF EXISTS SpHsn;
DELIMITER //
CREATE PROCEDURE SpHsn (
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(250),
    IN p_Chapter VARCHAR(10),
    IN p_GstRate VARCHAR(5),
    IN p_CessRate DECIMAL(5,2),
    IN p_IsService BIT,
    IN p_Notification VARCHAR(100),
    IN p_Status VARCHAR(20),
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_Revision INT,
    IN p_UsageCount INT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT * FROM Hsn WHERE IsDeleted = 0;

    ELSEIF p_Action = 'READ' THEN
        SELECT * FROM Hsn WHERE Id = p_Id AND IsDeleted = 0;

    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Hsn (
            Code, Name, Chapter, GstRate, CessRate, IsService, Notification,
            Status, EffectiveFrom, EffectiveTo, Revision, UsageCount,
            CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_Chapter, p_GstRate, p_CessRate, p_IsService, p_Notification,
            p_Status, p_EffectiveFrom, p_EffectiveTo, p_Revision, p_UsageCount,
            p_ModifiedBy, p_ModifiedBy
        );
        SELECT * FROM Hsn WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Hsn SET
            Code = p_Code,
            Name = p_Name,
            Chapter = p_Chapter,
            GstRate = p_GstRate,
            CessRate = p_CessRate,
            IsService = p_IsService,
            Notification = p_Notification,
            Status = p_Status,
            EffectiveFrom = p_EffectiveFrom,
            EffectiveTo = p_EffectiveTo,
            Revision = p_Revision,
            UsageCount = p_UsageCount,
            ModifiedBy = p_ModifiedBy
        WHERE Id = p_Id AND IsDeleted = 0;
        SELECT * FROM Hsn WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Hsn SET IsDeleted = 1, ModifiedBy = p_ModifiedBy WHERE Id = p_Id;
    END IF;
END //
DELIMITER ;
