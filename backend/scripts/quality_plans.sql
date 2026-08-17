-- backend/scripts/quality_plans.sql

USE ERP_Quality;

-- Create InspectionPlan Table
CREATE TABLE IF NOT EXISTS InspectionPlan (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PlanCode VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(255) NOT NULL,
    Stage VARCHAR(50) NOT NULL,
    ItemCode VARCHAR(100) NOT NULL,
    ItemName VARCHAR(255),
    OperationCode VARCHAR(100),
    SamplingMethod VARCHAR(50) NOT NULL,
    Aql DECIMAL(5,2),
    FixedSampleSize INT,
    RandomPercent DECIMAL(5,2),
    Revision INT NOT NULL DEFAULT 1,
    Status VARCHAR(50) NOT NULL,
    EffectiveFrom DATE,
    InspectorRole VARCHAR(100),
    Frequency VARCHAR(100),
    Remarks TEXT,
    Version INT NOT NULL DEFAULT 1,
    DeletedAt DATETIME NULL,
    ApprovedBy VARCHAR(100),
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

-- Create PlanCharacteristic Table
CREATE TABLE IF NOT EXISTS PlanCharacteristic (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PlanId INT NOT NULL,
    Seq INT NOT NULL,
    Name VARCHAR(255) NOT NULL,
    Type VARCHAR(50) NOT NULL,
    Uom VARCHAR(50),
    Target DECIMAL(10,4),
    LowerLimit DECIMAL(10,4),
    UpperLimit DECIMAL(10,4),
    InstrumentCode VARCHAR(100),
    Severity VARCHAR(50) NOT NULL,
    IsMandatory BOOLEAN NOT NULL DEFAULT 0,
    RequiresPhoto BOOLEAN NOT NULL DEFAULT 0,
    Method VARCHAR(255),
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    FOREIGN KEY (PlanId) REFERENCES InspectionPlan(Id) ON DELETE CASCADE
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManageInspectionPlan //

CREATE PROCEDURE SpManageInspectionPlan(
    IN p_Action VARCHAR(50),
    IN p_Id INT,
    IN p_Name VARCHAR(255),
    IN p_Stage VARCHAR(50),
    IN p_ItemCode VARCHAR(100),
    IN p_ItemName VARCHAR(255),
    IN p_OperationCode VARCHAR(100),
    IN p_SamplingMethod VARCHAR(50),
    IN p_Aql DECIMAL(5,2),
    IN p_FixedSampleSize INT,
    IN p_RandomPercent DECIMAL(5,2),
    IN p_Revision INT,
    IN p_Status VARCHAR(50),
    IN p_EffectiveFrom DATE,
    IN p_InspectorRole VARCHAR(100),
    IN p_Frequency VARCHAR(100),
    IN p_Remarks TEXT,
    IN p_ApprovedBy VARCHAR(100),
    IN p_User VARCHAR(100),
    IN p_CharacteristicsJson JSON
)
BEGIN
    DECLARE v_PlanId INT;
    DECLARE v_PlanCode VARCHAR(50);
    DECLARE v_Index INT DEFAULT 0;
    DECLARE v_TotalChars INT DEFAULT 0;
    DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    IF p_Action = 'CREATE' THEN
        -- Insert dummy PlanCode first
        INSERT INTO InspectionPlan (
            PlanCode, Name, Stage, ItemCode, ItemName, OperationCode, SamplingMethod,
            Aql, FixedSampleSize, RandomPercent, Revision, Status, EffectiveFrom,
            InspectorRole, Frequency, Remarks, Version, ApprovedBy, CreatedBy, CreatedDate
        ) VALUES (
            'TEMP', p_Name, p_Stage, p_ItemCode, p_ItemName, p_OperationCode, p_SamplingMethod,
            p_Aql, p_FixedSampleSize, p_RandomPercent, COALESCE(p_Revision, 1), p_Status, p_EffectiveFrom,
            p_InspectorRole, p_Frequency, p_Remarks, 1, p_ApprovedBy, p_User, v_CurrentDate
        );
        
        SET v_PlanId = LAST_INSERT_ID();
        SET v_PlanCode = CONCAT('QIP/26-27/', LPAD(v_PlanId, 4, '0'));
        
        UPDATE InspectionPlan SET PlanCode = v_PlanCode WHERE Id = v_PlanId;
        
        -- Insert Characteristics if JSON is provided
        IF p_CharacteristicsJson IS NOT NULL AND JSON_LENGTH(p_CharacteristicsJson) > 0 THEN
            SET v_TotalChars = JSON_LENGTH(p_CharacteristicsJson);
            WHILE v_Index < v_TotalChars DO
                INSERT INTO PlanCharacteristic (
                    PlanId, Seq, Name, Type, Uom, Target, LowerLimit, UpperLimit, InstrumentCode,
                    Severity, IsMandatory, RequiresPhoto, Method, CreatedBy, CreatedDate
                ) VALUES (
                    v_PlanId,
                    JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Seq'))),
                    JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Name'))),
                    JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Type'))),
                    JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Uom'))),
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Target'))) AS DECIMAL(10,4)),
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].LowerLimit'))) AS DECIMAL(10,4)),
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].UpperLimit'))) AS DECIMAL(10,4)),
                    JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].InstrumentCode'))),
                    JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Severity'))),
                    JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].IsMandatory')) = true,
                    JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].RequiresPhoto')) = true,
                    JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Method'))),
                    p_User, v_CurrentDate
                );
                SET v_Index = v_Index + 1;
            END WHILE;
        END IF;

        SELECT v_PlanId AS Id, v_PlanCode AS PlanCode;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_PlanId = p_Id;
        
        UPDATE InspectionPlan SET
            Name = COALESCE(p_Name, Name),
            Stage = COALESCE(p_Stage, Stage),
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            ItemName = COALESCE(p_ItemName, ItemName),
            OperationCode = p_OperationCode,
            SamplingMethod = COALESCE(p_SamplingMethod, SamplingMethod),
            Aql = p_Aql,
            FixedSampleSize = p_FixedSampleSize,
            RandomPercent = p_RandomPercent,
            Status = COALESCE(p_Status, Status),
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            InspectorRole = COALESCE(p_InspectorRole, InspectorRole),
            Frequency = COALESCE(p_Frequency, Frequency),
            Remarks = p_Remarks,
            Version = Version + 1,
            ApprovedBy = p_ApprovedBy,
            ModifiedBy = p_User,
            ModifiedDate = v_CurrentDate
        WHERE Id = v_PlanId;
        
        -- Recreate Characteristics if JSON is provided (Assuming full replace on update)
        IF p_CharacteristicsJson IS NOT NULL THEN
            DELETE FROM PlanCharacteristic WHERE PlanId = v_PlanId;
            
            IF JSON_LENGTH(p_CharacteristicsJson) > 0 THEN
                SET v_TotalChars = JSON_LENGTH(p_CharacteristicsJson);
                WHILE v_Index < v_TotalChars DO
                    INSERT INTO PlanCharacteristic (
                        PlanId, Seq, Name, Type, Uom, Target, LowerLimit, UpperLimit, InstrumentCode,
                        Severity, IsMandatory, RequiresPhoto, Method, CreatedBy, CreatedDate
                    ) VALUES (
                        v_PlanId,
                        JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Seq'))),
                        JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Name'))),
                        JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Type'))),
                        JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Uom'))),
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Target'))) AS DECIMAL(10,4)),
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].LowerLimit'))) AS DECIMAL(10,4)),
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].UpperLimit'))) AS DECIMAL(10,4)),
                        JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].InstrumentCode'))),
                        JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Severity'))),
                        JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].IsMandatory')) = true,
                        JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].RequiresPhoto')) = true,
                        JSON_UNQUOTE(JSON_EXTRACT(p_CharacteristicsJson, CONCAT('$[', v_Index, '].Method'))),
                        p_User, v_CurrentDate
                    );
                    SET v_Index = v_Index + 1;
                END WHILE;
            END IF;
        END IF;

        SELECT v_PlanId AS Id;

    ELSEIF p_Action = 'DELETE' THEN
        -- Soft delete
        UPDATE InspectionPlan SET 
            DeletedAt = v_CurrentDate,
            ModifiedBy = p_User,
            ModifiedDate = v_CurrentDate
        WHERE Id = p_Id;

        SELECT p_Id AS Id;
    END IF;

    COMMIT;
END //

DELIMITER ;
