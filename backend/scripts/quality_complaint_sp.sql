USE ERP_Quality;

DROP PROCEDURE IF EXISTS SpManageComplaint;

DELIMITER //

CREATE PROCEDURE SpManageComplaint(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_CustomerName VARCHAR(100),
    IN p_ComplaintType VARCHAR(100),
    IN p_Severity VARCHAR(50),
    IN p_ItemCode VARCHAR(50),
    IN p_ItemName VARCHAR(100),
    IN p_BatchNo VARCHAR(50),
    IN p_ProductionOrderNo VARCHAR(50),
    IN p_InvoiceNo VARCHAR(50),
    IN p_QtySupplied INT,
    IN p_QtyComplained INT,
    IN p_Description TEXT,
    IN p_LoggedOn DATE,
    IN p_LoggedBy VARCHAR(100),
    IN p_Owner VARCHAR(100),
    IN p_DueOn DATE,
    IN p_Status VARCHAR(50),
    IN p_Resolution VARCHAR(50),
    IN p_ResolutionValue DECIMAL(10,2),
    IN p_RootCause TEXT,
    IN p_CauseCategory VARCHAR(50),
    IN p_NcrDocNo VARCHAR(50),
    IN p_CapaDocNo VARCHAR(50),
    IN p_ClosedOn DATE,
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100),
    OUT p_DocNo VARCHAR(50)
)
BEGIN
    DECLARE v_NextId INT;
    DECLARE v_GeneratedDocNo VARCHAR(50);

    SET p_DocNo = NULL;

    IF p_Action = 'CREATE' THEN
        SELECT COALESCE(MAX(Id), 0) + 1 INTO v_NextId FROM Complaint;
        SET v_GeneratedDocNo = CONCAT('CMP/26-27/', LPAD(v_NextId + 30, 4, '0'));

        INSERT INTO Complaint (
            DocNo, CustomerName, ComplaintType, Severity, ItemCode, ItemName, BatchNo,
            ProductionOrderNo, InvoiceNo, QtySupplied, QtyComplained, Description,
            LoggedOn, LoggedBy, Owner, DueOn, Status, Resolution, ResolutionValue,
            RootCause, CauseCategory, NcrDocNo, CapaDocNo, ClosedOn, Remarks, Version,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            v_GeneratedDocNo, p_CustomerName, p_ComplaintType, p_Severity, p_ItemCode, p_ItemName, p_BatchNo,
            p_ProductionOrderNo, p_InvoiceNo, p_QtySupplied, p_QtyComplained, p_Description,
            p_LoggedOn, p_LoggedBy, p_Owner, p_DueOn, COALESCE(p_Status, 'LOGGED'), COALESCE(p_Resolution, 'PENDING'), p_ResolutionValue,
            p_RootCause, p_CauseCategory, p_NcrDocNo, p_CapaDocNo, p_ClosedOn, p_Remarks, 1,
            p_User, NOW(), p_User, NOW()
        );

        SET p_DocNo = v_GeneratedDocNo;

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Complaint SET
            CustomerName = COALESCE(p_CustomerName, CustomerName),
            ComplaintType = COALESCE(p_ComplaintType, ComplaintType),
            Severity = COALESCE(p_Severity, Severity),
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            ItemName = COALESCE(p_ItemName, ItemName),
            BatchNo = COALESCE(p_BatchNo, BatchNo),
            ProductionOrderNo = COALESCE(p_ProductionOrderNo, ProductionOrderNo),
            InvoiceNo = COALESCE(p_InvoiceNo, InvoiceNo),
            QtySupplied = COALESCE(p_QtySupplied, QtySupplied),
            QtyComplained = COALESCE(p_QtyComplained, QtyComplained),
            Description = COALESCE(p_Description, Description),
            LoggedOn = COALESCE(p_LoggedOn, LoggedOn),
            LoggedBy = COALESCE(p_LoggedBy, LoggedBy),
            Owner = COALESCE(p_Owner, Owner),
            DueOn = COALESCE(p_DueOn, DueOn),
            Status = COALESCE(p_Status, Status),
            Resolution = COALESCE(p_Resolution, Resolution),
            ResolutionValue = COALESCE(p_ResolutionValue, ResolutionValue),
            RootCause = COALESCE(p_RootCause, RootCause),
            CauseCategory = COALESCE(p_CauseCategory, CauseCategory),
            NcrDocNo = COALESCE(p_NcrDocNo, NcrDocNo),
            CapaDocNo = COALESCE(p_CapaDocNo, CapaDocNo),
            ClosedOn = COALESCE(p_ClosedOn, ClosedOn),
            Remarks = COALESCE(p_Remarks, Remarks),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;

        SELECT DocNo INTO p_DocNo FROM Complaint WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Complaint SET
            DeletedAt = NOW(),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

END //
DELIMITER ;
