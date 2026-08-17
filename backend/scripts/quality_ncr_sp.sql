USE ERP_Quality;

DROP PROCEDURE IF EXISTS SpManageNcr;

DELIMITER //

CREATE PROCEDURE SpManageNcr(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Source VARCHAR(50),
    IN p_Severity VARCHAR(20),
    IN p_Title VARCHAR(255),
    IN p_Description TEXT,
    IN p_ItemCode VARCHAR(50),
    IN p_ItemName VARCHAR(255),
    IN p_BatchNo VARCHAR(50),
    IN p_OriginDocNo VARCHAR(50),
    IN p_SupplierCode VARCHAR(50),
    IN p_QuantityAffected DECIMAL(15,3),
    IN p_QuantityScrapped DECIMAL(15,3),
    IN p_QuantityReworked DECIMAL(15,3),
    IN p_Uom VARCHAR(20),
    IN p_Containment TEXT,
    IN p_ContainedAt DATETIME,
    IN p_RootCause TEXT,
    IN p_CauseCategory VARCHAR(50),
    IN p_Status VARCHAR(50),
    IN p_Owner VARCHAR(100),
    IN p_DueOn DATETIME,
    IN p_ClosedOn DATETIME,
    IN p_CapaDocNo VARCHAR(50),
    IN p_CostImpact DECIMAL(15,3),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100),
    OUT p_DocNo VARCHAR(50)
)
BEGIN
    DECLARE v_NextId INT;
    DECLARE v_GeneratedDocNo VARCHAR(50);
    
    SET p_DocNo = NULL;

    IF p_Action = 'CREATE' THEN
        SELECT COALESCE(MAX(Id), 0) + 1 INTO v_NextId FROM Ncr;
        SET v_GeneratedDocNo = CONCAT('NCR-', LPAD(v_NextId, 3, '0'));

        INSERT INTO Ncr (
            DocNo, Source, Severity, Title, Description, ItemCode, ItemName, BatchNo, OriginDocNo,
            SupplierCode, QuantityAffected, QuantityScrapped, QuantityReworked, Uom, Containment,
            ContainedAt, RootCause, CauseCategory, Status, RaisedBy, RaisedOn, Owner, DueOn,
            ClosedOn, CapaDocNo, CostImpact, Remarks, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            v_GeneratedDocNo, p_Source, p_Severity, p_Title, p_Description, p_ItemCode, p_ItemName, p_BatchNo, p_OriginDocNo,
            p_SupplierCode, p_QuantityAffected, p_QuantityScrapped, p_QuantityReworked, p_Uom, p_Containment,
            p_ContainedAt, p_RootCause, p_CauseCategory, p_Status, p_User, NOW(), p_Owner, p_DueOn,
            p_ClosedOn, p_CapaDocNo, p_CostImpact, p_Remarks, 1, p_User, NOW(), p_User, NOW()
        );
        
        SET p_DocNo = v_GeneratedDocNo;

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Ncr SET
            Source = COALESCE(p_Source, Source),
            Severity = COALESCE(p_Severity, Severity),
            Title = COALESCE(p_Title, Title),
            Description = COALESCE(p_Description, Description),
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            ItemName = COALESCE(p_ItemName, ItemName),
            BatchNo = COALESCE(p_BatchNo, BatchNo),
            OriginDocNo = COALESCE(p_OriginDocNo, OriginDocNo),
            SupplierCode = COALESCE(p_SupplierCode, SupplierCode),
            QuantityAffected = COALESCE(p_QuantityAffected, QuantityAffected),
            QuantityScrapped = COALESCE(p_QuantityScrapped, QuantityScrapped),
            QuantityReworked = COALESCE(p_QuantityReworked, QuantityReworked),
            Uom = COALESCE(p_Uom, Uom),
            Containment = COALESCE(p_Containment, Containment),
            ContainedAt = COALESCE(p_ContainedAt, ContainedAt),
            RootCause = COALESCE(p_RootCause, RootCause),
            CauseCategory = COALESCE(p_CauseCategory, CauseCategory),
            Status = COALESCE(p_Status, Status),
            Owner = COALESCE(p_Owner, Owner),
            DueOn = COALESCE(p_DueOn, DueOn),
            ClosedOn = COALESCE(p_ClosedOn, ClosedOn),
            CapaDocNo = COALESCE(p_CapaDocNo, CapaDocNo),
            CostImpact = COALESCE(p_CostImpact, CostImpact),
            Remarks = COALESCE(p_Remarks, Remarks),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;
        
        SELECT DocNo INTO p_DocNo FROM Ncr WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Ncr SET 
            DeletedAt = NOW(), 
            ModifiedBy = p_User, 
            ModifiedDate = NOW(),
            Version = Version + 1 
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

END //
DELIMITER ;
