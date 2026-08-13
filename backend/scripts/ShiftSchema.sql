-- Table: Shift
CREATE TABLE IF NOT EXISTS Shift (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    StartTime VARCHAR(5) NOT NULL,
    EndTime VARCHAR(5) NOT NULL,
    BreakMinutes INT NULL,
    NetHours DECIMAL(5,2) NULL,
    CrossesMidnight BIT NULL DEFAULT 0,
    NightAllowance BIT NULL DEFAULT 0,
    EffectiveFrom DATETIME NOT NULL,
    EffectiveTo DATETIME NULL,
    UsageCount INT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    IsDeleted BIT NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

DROP PROCEDURE IF EXISTS SpShift;
CREATE PROCEDURE SpShift(
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50),
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_StartTime VARCHAR(5),
    IN p_EndTime VARCHAR(5),
    IN p_BreakMinutes INT,
    IN p_NetHours DECIMAL(5,2),
    IN p_CrossesMidnight BIT,
    IN p_NightAllowance BIT,
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_IsActive BIT,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Uid, Code, Name, StartTime, EndTime, BreakMinutes, NetHours, CrossesMidnight, NightAllowance, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Shift
        WHERE IsDeleted = 0;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT Uid, Code, Name, StartTime, EndTime, BreakMinutes, NetHours, CrossesMidnight, NightAllowance, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Shift
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Shift (
            Uid, Code, Name, StartTime, EndTime, BreakMinutes, NetHours, CrossesMidnight, NightAllowance, EffectiveFrom, EffectiveTo, IsActive, CreatedBy, ModifiedBy
        ) VALUES (
            p_Uid, p_Code, p_Name, p_StartTime, p_EndTime, p_BreakMinutes, p_NetHours, p_CrossesMidnight, p_NightAllowance, COALESCE(p_EffectiveFrom, CURRENT_TIMESTAMP), p_EffectiveTo, COALESCE(p_IsActive, 1), p_ModifiedBy, p_ModifiedBy
        );
        
        SELECT Uid, Code, Name, StartTime, EndTime, BreakMinutes, NetHours, CrossesMidnight, NightAllowance, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Shift
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Shift SET
            Code = COALESCE(p_Code, Code),
            Name = COALESCE(p_Name, Name),
            StartTime = COALESCE(p_StartTime, StartTime),
            EndTime = COALESCE(p_EndTime, EndTime),
            BreakMinutes = p_BreakMinutes,
            NetHours = p_NetHours,
            CrossesMidnight = p_CrossesMidnight,
            NightAllowance = p_NightAllowance,
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo = p_EffectiveTo,
            IsActive = COALESCE(p_IsActive, IsActive),
            ModifiedBy = p_ModifiedBy,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Uid = p_Uid;
        
        SELECT Uid, Code, Name, StartTime, EndTime, BreakMinutes, NetHours, CrossesMidnight, NightAllowance, EffectiveFrom, EffectiveTo, UsageCount, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Shift
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Shift 
        SET IsDeleted = 1,
            ModifiedBy = p_ModifiedBy, 
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Uid = p_Uid;
    END IF;
END
