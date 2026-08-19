USE ERP_Quality;

DROP PROCEDURE IF EXISTS SpManageCapa;

DELIMITER //

CREATE PROCEDURE SpManageCapa(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Title VARCHAR(255),
    IN p_NcrDocNo VARCHAR(50),
    IN p_ItemCode VARCHAR(50),
    IN p_RootCause TEXT,
    IN p_CauseCategory VARCHAR(50),
    IN p_CorrectiveAction TEXT,
    IN p_PreventiveAction TEXT,
    IN p_Owner VARCHAR(100),
    IN p_DueOn DATETIME,
    IN p_Status VARCHAR(50),
    IN p_VerificationMethod TEXT,
    IN p_VerificationResult TEXT,
    IN p_VerifiedBy VARCHAR(100),
    IN p_VerifiedOn DATETIME,
    IN p_ClosedOn DATETIME,
    IN p_RecurrenceChecked TINYINT(1),
    IN p_EffectivenessPct INT,
    IN p_User VARCHAR(100),
    OUT p_DocNo VARCHAR(50)
)
BEGIN
    DECLARE v_NextId INT;
    DECLARE v_GeneratedDocNo VARCHAR(50);

    SET p_DocNo = NULL;

    IF p_Action = 'CREATE' THEN
        SELECT COALESCE(MAX(Id), 0) + 1 INTO v_NextId FROM Capa;
        SET v_GeneratedDocNo = CONCAT('CAPA-', LPAD(v_NextId, 3, '0'));

        INSERT INTO Capa (
            DocNo, Title, NcrDocNo, ItemCode, RootCause, CauseCategory,
            CorrectiveAction, PreventiveAction, Owner, RaisedOn, DueOn, Status,
            VerificationMethod, VerificationResult, VerifiedBy, VerifiedOn, ClosedOn,
            RecurrenceChecked, EffectivenessPct, Version,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            v_GeneratedDocNo, p_Title, p_NcrDocNo, p_ItemCode, p_RootCause, p_CauseCategory,
            p_CorrectiveAction, p_PreventiveAction, p_Owner, NOW(), p_DueOn, COALESCE(p_Status, 'DRAFT'),
            p_VerificationMethod, p_VerificationResult, p_VerifiedBy, p_VerifiedOn, p_ClosedOn,
            COALESCE(p_RecurrenceChecked, 0), p_EffectivenessPct, 1,
            p_User, NOW(), p_User, NOW()
        );

        SET p_DocNo = v_GeneratedDocNo;

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Capa SET
            Title = COALESCE(p_Title, Title),
            NcrDocNo = COALESCE(p_NcrDocNo, NcrDocNo),
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            RootCause = COALESCE(p_RootCause, RootCause),
            CauseCategory = COALESCE(p_CauseCategory, CauseCategory),
            CorrectiveAction = COALESCE(p_CorrectiveAction, CorrectiveAction),
            PreventiveAction = COALESCE(p_PreventiveAction, PreventiveAction),
            Owner = COALESCE(p_Owner, Owner),
            DueOn = COALESCE(p_DueOn, DueOn),
            Status = COALESCE(p_Status, Status),
            VerificationMethod = COALESCE(p_VerificationMethod, VerificationMethod),
            VerificationResult = COALESCE(p_VerificationResult, VerificationResult),
            VerifiedBy = COALESCE(p_VerifiedBy, VerifiedBy),
            VerifiedOn = COALESCE(p_VerifiedOn, VerifiedOn),
            ClosedOn = COALESCE(p_ClosedOn, ClosedOn),
            RecurrenceChecked = COALESCE(p_RecurrenceChecked, RecurrenceChecked),
            EffectivenessPct = COALESCE(p_EffectivenessPct, EffectivenessPct),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;

        -- If status is being set to CLOSED, also close the linked NCR
        IF p_Status = 'CLOSED' AND p_NcrDocNo IS NOT NULL THEN
            UPDATE Ncr SET
                Status = 'CLOSED',
                ClosedOn = NOW(),
                ModifiedBy = p_User,
                ModifiedDate = NOW(),
                Version = Version + 1
            WHERE DocNo = p_NcrDocNo AND Status != 'CLOSED' AND DeletedAt IS NULL;
        END IF;

        SELECT DocNo INTO p_DocNo FROM Capa WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Capa SET
            DeletedAt = NOW(),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

END //
DELIMITER ;
