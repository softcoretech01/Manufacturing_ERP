-- Table: HolidayCalendar
CREATE TABLE IF NOT EXISTS HolidayCalendar (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    FinancialYear VARCHAR(10) NOT NULL,
    Plant VARCHAR(10) NOT NULL,
    HolidayCount INT DEFAULT 0,
    NationalCount INT DEFAULT 0,
    WorkingDays INT DEFAULT 0,
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

-- Stored Procedure: SpHolidayCalendar
DROP PROCEDURE IF EXISTS SpHolidayCalendar;
DELIMITER //

CREATE PROCEDURE SpHolidayCalendar (
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50),
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_FinancialYear VARCHAR(10),
    IN p_Plant VARCHAR(10),
    IN p_HolidayCount INT,
    IN p_NationalCount INT,
    IN p_WorkingDays INT,
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_IsActive BIT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, Code, Name, FinancialYear, Plant, HolidayCount, NationalCount, WorkingDays, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM HolidayCalendar
        WHERE IsDeleted = 0;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, Code, Name, FinancialYear, Plant, HolidayCount, NationalCount, WorkingDays, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM HolidayCalendar
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO HolidayCalendar (
            Uid, Code, Name, FinancialYear, Plant, HolidayCount, NationalCount, WorkingDays, EffectiveFrom, EffectiveTo, IsActive, CreatedBy, ModifiedBy
        ) VALUES (
            p_Uid, p_Code, p_Name, p_FinancialYear, p_Plant, p_HolidayCount, p_NationalCount, p_WorkingDays, p_EffectiveFrom, p_EffectiveTo, p_IsActive, p_ModifiedBy, p_ModifiedBy
        );
        
        SELECT Uid, Code, Name, FinancialYear, Plant, HolidayCount, NationalCount, WorkingDays, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM HolidayCalendar
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE HolidayCalendar
        SET 
            Code = p_Code,
            Name = p_Name,
            FinancialYear = p_FinancialYear,
            Plant = p_Plant,
            HolidayCount = p_HolidayCount,
            NationalCount = p_NationalCount,
            WorkingDays = p_WorkingDays,
            EffectiveFrom = p_EffectiveFrom,
            EffectiveTo = p_EffectiveTo,
            IsActive = p_IsActive,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
        SELECT Uid, Code, Name, FinancialYear, Plant, HolidayCount, NationalCount, WorkingDays, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM HolidayCalendar
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE HolidayCalendar
        SET 
            IsDeleted = 1,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;
