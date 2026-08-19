USE ERP_Quality;

DROP PROCEDURE IF EXISTS SpManageQualityAudit;

DELIMITER //

CREATE PROCEDURE SpManageQualityAudit(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_AuditType VARCHAR(50),
    IN p_Title VARCHAR(200),
    IN p_Scope TEXT,
    IN p_Auditee VARCHAR(100),
    IN p_Auditor VARCHAR(100),
    IN p_PlannedOn DATE,
    IN p_ConductedOn DATE,
    IN p_Status VARCHAR(50),
    IN p_ScorePct DECIMAL(5,2),
    IN p_ReportRef VARCHAR(100),
    IN p_Remarks TEXT,
    IN p_FindingsJson JSON,
    IN p_User VARCHAR(100),
    OUT p_DocNo VARCHAR(50)
)
BEGIN
    DECLARE v_NextId INT;
    DECLARE v_GeneratedDocNo VARCHAR(50);
    DECLARE v_AuditId INT;
    DECLARE i INT DEFAULT 0;
    DECLARE finding_count INT;
    
    DECLARE v_Uid VARCHAR(50);
    DECLARE v_Clause VARCHAR(100);
    DECLARE v_Area VARCHAR(100);
    DECLARE v_Grade VARCHAR(50);
    DECLARE v_Description TEXT;
    DECLARE v_Action TEXT;
    DECLARE v_Owner VARCHAR(100);
    DECLARE v_DueOn DATE;
    DECLARE v_ClosedOn DATE;

    SET p_DocNo = NULL;

    IF p_Action = 'CREATE' THEN
        SELECT COALESCE(MAX(Id), 0) + 1 INTO v_NextId FROM QualityAudit;
        SET v_GeneratedDocNo = CONCAT('AUD/26-27/', LPAD(v_NextId + 6, 4, '0'));

        INSERT INTO QualityAudit (
            DocNo, AuditType, Title, Scope, Auditee, Auditor, PlannedOn,
            ConductedOn, Status, ScorePct, ReportRef, Remarks, Version,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            v_GeneratedDocNo, p_AuditType, p_Title, p_Scope, p_Auditee, p_Auditor, p_PlannedOn,
            p_ConductedOn, COALESCE(p_Status, 'PLANNED'), p_ScorePct, p_ReportRef, p_Remarks, 1,
            p_User, NOW(), p_User, NOW()
        );

        SET v_AuditId = LAST_INSERT_ID();
        SET p_DocNo = v_GeneratedDocNo;

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE QualityAudit SET
            AuditType = COALESCE(p_AuditType, AuditType),
            Title = COALESCE(p_Title, Title),
            Scope = COALESCE(p_Scope, Scope),
            Auditee = COALESCE(p_Auditee, Auditee),
            Auditor = COALESCE(p_Auditor, Auditor),
            PlannedOn = COALESCE(p_PlannedOn, PlannedOn),
            ConductedOn = COALESCE(p_ConductedOn, ConductedOn),
            Status = COALESCE(p_Status, Status),
            ScorePct = COALESCE(p_ScorePct, ScorePct),
            ReportRef = COALESCE(p_ReportRef, ReportRef),
            Remarks = COALESCE(p_Remarks, Remarks),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;

        SET v_AuditId = p_Id;
        SELECT DocNo INTO p_DocNo FROM QualityAudit WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE QualityAudit SET
            DeletedAt = NOW(),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

    -- Synchronize Findings if provided
    IF (p_Action = 'CREATE' OR p_Action = 'UPDATE') AND p_FindingsJson IS NOT NULL THEN
        CREATE TEMPORARY TABLE IF NOT EXISTS TempUids (Uid VARCHAR(50));
        TRUNCATE TABLE TempUids;
        
        SET finding_count = JSON_LENGTH(p_FindingsJson);
        SET i = 0;
        
        WHILE i < finding_count DO
            INSERT INTO TempUids (Uid) VALUES (JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].uid'))));
            SET i = i + 1;
        END WHILE;
        
        DELETE FROM QualityAuditFinding WHERE AuditId = v_AuditId AND Uid NOT IN (SELECT Uid FROM TempUids);
        
        SET i = 0;
        WHILE i < finding_count DO
            SET v_Uid = JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].uid')));
            
            -- Helper for null extraction
            SET v_Clause = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].clause'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].clause'))));
            SET v_Area = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].area'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].area'))));
            SET v_Grade = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].grade'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].grade'))));
            SET v_Description = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].description'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].description'))));
            SET v_Action = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].action'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].action'))));
            SET v_Owner = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].owner'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].owner'))));
            SET v_DueOn = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].dueOn'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].dueOn'))));
            SET v_ClosedOn = IF(JSON_TYPE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].closedOn'))) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_FindingsJson, CONCAT('$[', i, '].closedOn'))));
            
            INSERT INTO QualityAuditFinding (
                AuditId, Uid, Clause, Area, Grade, Description, Action, Owner, DueOn, ClosedOn
            ) VALUES (
                v_AuditId, v_Uid, v_Clause, v_Area, v_Grade, v_Description, v_Action, v_Owner, v_DueOn, v_ClosedOn
            ) ON DUPLICATE KEY UPDATE
                Clause = VALUES(Clause),
                Area = VALUES(Area),
                Grade = VALUES(Grade),
                Description = VALUES(Description),
                Action = VALUES(Action),
                Owner = VALUES(Owner),
                DueOn = VALUES(DueOn),
                ClosedOn = VALUES(ClosedOn);
                
            SET i = i + 1;
        END WHILE;
        
        DROP TEMPORARY TABLE IF EXISTS TempUids;
    END IF;

END //
DELIMITER ;
