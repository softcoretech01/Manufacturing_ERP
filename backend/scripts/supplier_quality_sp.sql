USE ERP_Quality;

DROP PROCEDURE IF EXISTS SpManageSupplierQuality;

DELIMITER //

CREATE PROCEDURE SpManageSupplierQuality(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_SupplierCode VARCHAR(50),
    IN p_Period VARCHAR(50),
    IN p_LotsReceived INT,
    IN p_LotsAccepted INT,
    IN p_LotsRejected INT,
    IN p_QtyReceived INT,
    IN p_QtyRejected INT,
    IN p_LotsWithValidDocs INT,
    IN p_NcrsRaised INT,
    IN p_NcrsClosedOnTime INT,
    IN p_CapaResponseDays INT,
    IN p_User VARCHAR(100),
    OUT p_OutId INT
)
BEGIN
    SET p_OutId = p_Id;

    IF p_Action = 'UPSERT' THEN
        -- If Id is provided, try update first
        IF p_Id IS NOT NULL AND EXISTS(SELECT 1 FROM SupplierQuality WHERE Id = p_Id) THEN
            UPDATE SupplierQuality SET
                LotsReceived = COALESCE(p_LotsReceived, LotsReceived),
                LotsAccepted = COALESCE(p_LotsAccepted, LotsAccepted),
                LotsRejected = COALESCE(p_LotsRejected, LotsRejected),
                QtyReceived = COALESCE(p_QtyReceived, QtyReceived),
                QtyRejected = COALESCE(p_QtyRejected, QtyRejected),
                LotsWithValidDocs = COALESCE(p_LotsWithValidDocs, LotsWithValidDocs),
                NcrsRaised = COALESCE(p_NcrsRaised, NcrsRaised),
                NcrsClosedOnTime = COALESCE(p_NcrsClosedOnTime, NcrsClosedOnTime),
                CapaResponseDays = COALESCE(p_CapaResponseDays, CapaResponseDays),
                ModifiedBy = p_User,
                ModifiedDate = NOW(),
                Version = Version + 1
            WHERE Id = p_Id AND DeletedAt IS NULL;
        ELSE
            -- Check if it exists for this Supplier and Period
            IF EXISTS(SELECT 1 FROM SupplierQuality WHERE SupplierCode = p_SupplierCode AND Period = p_Period AND DeletedAt IS NULL) THEN
                UPDATE SupplierQuality SET
                    LotsReceived = COALESCE(p_LotsReceived, LotsReceived),
                    LotsAccepted = COALESCE(p_LotsAccepted, LotsAccepted),
                    LotsRejected = COALESCE(p_LotsRejected, LotsRejected),
                    QtyReceived = COALESCE(p_QtyReceived, QtyReceived),
                    QtyRejected = COALESCE(p_QtyRejected, QtyRejected),
                    LotsWithValidDocs = COALESCE(p_LotsWithValidDocs, LotsWithValidDocs),
                    NcrsRaised = COALESCE(p_NcrsRaised, NcrsRaised),
                    NcrsClosedOnTime = COALESCE(p_NcrsClosedOnTime, NcrsClosedOnTime),
                    CapaResponseDays = COALESCE(p_CapaResponseDays, CapaResponseDays),
                    ModifiedBy = p_User,
                    ModifiedDate = NOW(),
                    Version = Version + 1
                WHERE SupplierCode = p_SupplierCode AND Period = p_Period AND DeletedAt IS NULL;
                SELECT Id INTO p_OutId FROM SupplierQuality WHERE SupplierCode = p_SupplierCode AND Period = p_Period AND DeletedAt IS NULL;
            ELSE
                INSERT INTO SupplierQuality (
                    SupplierCode, Period, LotsReceived, LotsAccepted, LotsRejected,
                    QtyReceived, QtyRejected, LotsWithValidDocs, NcrsRaised, NcrsClosedOnTime,
                    CapaResponseDays, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                ) VALUES (
                    p_SupplierCode, p_Period, COALESCE(p_LotsReceived, 0), COALESCE(p_LotsAccepted, 0), COALESCE(p_LotsRejected, 0),
                    COALESCE(p_QtyReceived, 0), COALESCE(p_QtyRejected, 0), COALESCE(p_LotsWithValidDocs, 0), COALESCE(p_NcrsRaised, 0), COALESCE(p_NcrsClosedOnTime, 0),
                    COALESCE(p_CapaResponseDays, 0), 1, p_User, NOW(), p_User, NOW()
                );
                SET p_OutId = LAST_INSERT_ID();
            END IF;
        END IF;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE SupplierQuality SET
            DeletedAt = NOW(),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

END //
DELIMITER ;
