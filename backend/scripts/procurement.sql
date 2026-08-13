CREATE TABLE IF NOT EXISTS PurchaseRequisition (
    Id VARCHAR(50) PRIMARY KEY,
    DocNo VARCHAR(30) UNIQUE NOT NULL,
    DocDate DATE NOT NULL,
    Status VARCHAR(30) NOT NULL,
    Plant VARCHAR(100) NOT NULL,
    Version INT NOT NULL DEFAULT 1,
    Remarks VARCHAR(500) NULL,
    Attachments INT DEFAULT 0,
    Comments INT DEFAULT 0,
    Source VARCHAR(30) NOT NULL,
    Department VARCHAR(100) NOT NULL,
    RequestedBy VARCHAR(100) NOT NULL,
    Priority VARCHAR(20) NOT NULL,
    RequiredBy DATE NOT NULL,
    Justification VARCHAR(1000) NOT NULL,
    EstimatedValue DECIMAL(18,2) NOT NULL DEFAULT 0,
    BudgetCode VARCHAR(50) NULL,
    BudgetAvailable DECIMAL(18,2) NULL,
    ConvertedTo VARCHAR(50) NULL,
    IsDeleted BIT DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NULL,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NULL
);

CREATE TABLE IF NOT EXISTS PrLine (
    Id VARCHAR(50) PRIMARY KEY,
    PurchaseRequisitionId VARCHAR(50) NOT NULL,
    ItemCode VARCHAR(50) NOT NULL,
    ItemName VARCHAR(200) NOT NULL,
    Uom VARCHAR(20) NOT NULL,
    Qty DECIMAL(18,4) NOT NULL,
    QtyOrdered DECIMAL(18,4) NOT NULL DEFAULT 0,
    RequiredBy DATE NOT NULL,
    EstimatedRate DECIMAL(18,2) NOT NULL,
    CostCentre VARCHAR(100) NULL,
    SuggestedSupplier VARCHAR(200) NULL,
    Specification VARCHAR(1000) NULL,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NULL,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NULL,
    FOREIGN KEY (PurchaseRequisitionId) REFERENCES PurchaseRequisition(Id)
);

CREATE TABLE IF NOT EXISTS ApprovalStep (
    Id VARCHAR(50) PRIMARY KEY,
    PurchaseRequisitionId VARCHAR(50) NOT NULL,
    Level INT NOT NULL,
    Role VARCHAR(100) NOT NULL,
    Approver VARCHAR(100) NOT NULL,
    Status VARCHAR(30) NOT NULL,
    ActedAt DATETIME NULL,
    Remarks VARCHAR(500) NULL,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NULL,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NULL,
    FOREIGN KEY (PurchaseRequisitionId) REFERENCES PurchaseRequisition(Id)
);

DELIMITER $$

DROP PROCEDURE IF EXISTS SpManagePurchaseRequisition$$

CREATE PROCEDURE SpManagePurchaseRequisition(
    IN p_Action VARCHAR(20),
    IN p_Id VARCHAR(50),
    IN p_JsonPayload JSON
)
BEGIN
    DECLARE v_PrId VARCHAR(50);
    DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;
    DECLARE v_CreatedBy VARCHAR(100);
    
    IF p_Action = 'CREATE' THEN
        SET v_PrId = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.uid'));
        SET v_CreatedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy'));
        
        INSERT INTO PurchaseRequisition (
            Id, DocNo, DocDate, Status, Plant, Version, Remarks, Attachments, Comments,
            Source, Department, RequestedBy, Priority, RequiredBy, Justification,
            EstimatedValue, BudgetCode, BudgetAvailable, ConvertedTo, IsDeleted,
            CreatedBy, CreatedDate
        ) VALUES (
            v_PrId,
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.source')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.department')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.requestedBy')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.priority')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.requiredBy')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.justification')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.estimatedValue')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.budgetCode')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.budgetAvailable')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.convertedTo')),
            0,
            v_CreatedBy,
            v_CurrentDate
        );
        
        INSERT INTO PrLine (
            Id, PurchaseRequisitionId, ItemCode, ItemName, Uom, Qty, QtyOrdered,
            RequiredBy, EstimatedRate, CostCentre, SuggestedSupplier, Specification,
            CreatedBy, CreatedDate
        )
        SELECT 
            jt.uid, v_PrId, jt.itemCode, jt.itemName, jt.uom, jt.qty, jt.qtyOrdered,
            jt.requiredBy, jt.estimatedRate, jt.costCentre, jt.suggestedSupplier, jt.specification,
            v_CreatedBy, v_CurrentDate
        FROM JSON_TABLE(
            p_JsonPayload, '$.lines[*]' COLUMNS (
                uid VARCHAR(50) PATH '$.uid',
                itemCode VARCHAR(50) PATH '$.itemCode',
                itemName VARCHAR(200) PATH '$.itemName',
                uom VARCHAR(20) PATH '$.uom',
                qty DECIMAL(18,4) PATH '$.qty',
                qtyOrdered DECIMAL(18,4) PATH '$.qtyOrdered',
                requiredBy DATE PATH '$.requiredBy',
                estimatedRate DECIMAL(18,2) PATH '$.estimatedRate',
                costCentre VARCHAR(100) PATH '$.costCentre',
                suggestedSupplier VARCHAR(200) PATH '$.suggestedSupplier',
                specification VARCHAR(1000) PATH '$.specification'
            )
        ) AS jt;

        INSERT INTO ApprovalStep (
            Id, PurchaseRequisitionId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
        )
        SELECT 
            UUID(), v_PrId, jt.level, jt.role, jt.approver, jt.status, 
            NULLIF(jt.actedAt, 'null'), jt.remarks, v_CreatedBy, v_CurrentDate
        FROM JSON_TABLE(
            p_JsonPayload, '$.approvals[*]' COLUMNS (
                level INT PATH '$.level',
                role VARCHAR(100) PATH '$.role',
                approver VARCHAR(100) PATH '$.approver',
                status VARCHAR(30) PATH '$.status',
                actedAt VARCHAR(50) PATH '$.actedAt',
                remarks VARCHAR(500) PATH '$.remarks'
            )
        ) AS jt;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_PrId = p_Id;
        SET v_CreatedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy'));
        
        UPDATE PurchaseRequisition SET
            Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
            Plant = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')),
            Version = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')),
            Remarks = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')),
            Attachments = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
            Comments = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
            Source = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.source')),
            Department = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.department')),
            RequestedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.requestedBy')),
            Priority = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.priority')),
            RequiredBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.requiredBy')),
            Justification = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.justification')),
            EstimatedValue = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.estimatedValue')),
            BudgetCode = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.budgetCode')),
            BudgetAvailable = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.budgetAvailable')),
            ConvertedTo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.convertedTo')),
            ModifiedBy = v_CreatedBy,
            ModifiedDate = v_CurrentDate
        WHERE Id = v_PrId;

        -- Delete existing lines and approvals
        DELETE FROM PrLine WHERE PurchaseRequisitionId = v_PrId;
        DELETE FROM ApprovalStep WHERE PurchaseRequisitionId = v_PrId;

        -- Re-insert lines
        INSERT INTO PrLine (
            Id, PurchaseRequisitionId, ItemCode, ItemName, Uom, Qty, QtyOrdered,
            RequiredBy, EstimatedRate, CostCentre, SuggestedSupplier, Specification,
            CreatedBy, CreatedDate
        )
        SELECT 
            jt.uid, v_PrId, jt.itemCode, jt.itemName, jt.uom, jt.qty, jt.qtyOrdered,
            jt.requiredBy, jt.estimatedRate, jt.costCentre, jt.suggestedSupplier, jt.specification,
            v_CreatedBy, v_CurrentDate
        FROM JSON_TABLE(
            p_JsonPayload, '$.lines[*]' COLUMNS (
                uid VARCHAR(50) PATH '$.uid',
                itemCode VARCHAR(50) PATH '$.itemCode',
                itemName VARCHAR(200) PATH '$.itemName',
                uom VARCHAR(20) PATH '$.uom',
                qty DECIMAL(18,4) PATH '$.qty',
                qtyOrdered DECIMAL(18,4) PATH '$.qtyOrdered',
                requiredBy DATE PATH '$.requiredBy',
                estimatedRate DECIMAL(18,2) PATH '$.estimatedRate',
                costCentre VARCHAR(100) PATH '$.costCentre',
                suggestedSupplier VARCHAR(200) PATH '$.suggestedSupplier',
                specification VARCHAR(1000) PATH '$.specification'
            )
        ) AS jt;

        -- Re-insert approvals
        INSERT INTO ApprovalStep (
            Id, PurchaseRequisitionId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
        )
        SELECT 
            UUID(), v_PrId, jt.level, jt.role, jt.approver, jt.status, 
            NULLIF(jt.actedAt, 'null'), jt.remarks, v_CreatedBy, v_CurrentDate
        FROM JSON_TABLE(
            p_JsonPayload, '$.approvals[*]' COLUMNS (
                level INT PATH '$.level',
                role VARCHAR(100) PATH '$.role',
                approver VARCHAR(100) PATH '$.approver',
                status VARCHAR(30) PATH '$.status',
                actedAt VARCHAR(50) PATH '$.actedAt',
                remarks VARCHAR(500) PATH '$.remarks'
            )
        ) AS jt;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE PurchaseRequisition 
        SET IsDeleted = 1, ModifiedDate = v_CurrentDate
        WHERE Id = p_Id;

    ELSEIF p_Action = 'READ' THEN
        SELECT 
            JSON_OBJECT(
                'uid', pr.Id,
                'docNo', pr.DocNo,
                'docDate', pr.DocDate,
                'status', pr.Status,
                'plant', pr.Plant,
                'version', pr.Version,
                'remarks', pr.Remarks,
                'attachments', pr.Attachments,
                'comments', pr.Comments,
                'source', pr.Source,
                'department', pr.Department,
                'requestedBy', pr.RequestedBy,
                'priority', pr.Priority,
                'requiredBy', pr.RequiredBy,
                'justification', pr.Justification,
                'estimatedValue', pr.EstimatedValue,
                'budgetCode', pr.BudgetCode,
                'budgetAvailable', pr.BudgetAvailable,
                'convertedTo', pr.ConvertedTo,
                'createdBy', pr.CreatedBy,
                'createdAt', DATE_FORMAT(pr.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                'modifiedAt', DATE_FORMAT(pr.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                'lines', IFNULL((
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'uid', l.Id,
                            'itemCode', l.ItemCode,
                            'itemName', l.ItemName,
                            'uom', l.Uom,
                            'qty', l.Qty,
                            'qtyOrdered', l.QtyOrdered,
                            'requiredBy', l.RequiredBy,
                            'estimatedRate', l.EstimatedRate,
                            'costCentre', l.CostCentre,
                            'suggestedSupplier', l.SuggestedSupplier,
                            'specification', l.Specification
                        )
                    ) FROM PrLine l WHERE l.PurchaseRequisitionId = pr.Id
                ), JSON_ARRAY()),
                'approvals', IFNULL((
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'level', a.Level,
                            'role', a.Role,
                            'approver', a.Approver,
                            'status', a.Status,
                            'actedAt', a.ActedAt,
                            'remarks', a.Remarks
                        )
                    ) FROM ApprovalStep a WHERE a.PurchaseRequisitionId = pr.Id
                ), JSON_ARRAY())
            ) AS Result
        FROM PurchaseRequisition pr
        WHERE pr.Id = p_Id AND pr.IsDeleted = 0;

    ELSEIF p_Action = 'READ_ALL' THEN
        SELECT 
            IFNULL(JSON_ARRAYAGG(
                JSON_OBJECT(
                    'uid', pr.Id,
                    'docNo', pr.DocNo,
                    'docDate', pr.DocDate,
                    'status', pr.Status,
                    'plant', pr.Plant,
                    'version', pr.Version,
                    'remarks', pr.Remarks,
                    'attachments', pr.Attachments,
                    'comments', pr.Comments,
                    'source', pr.Source,
                    'department', pr.Department,
                    'requestedBy', pr.RequestedBy,
                    'priority', pr.Priority,
                    'requiredBy', pr.RequiredBy,
                    'justification', pr.Justification,
                    'estimatedValue', pr.EstimatedValue,
                    'budgetCode', pr.BudgetCode,
                    'budgetAvailable', pr.BudgetAvailable,
                    'convertedTo', pr.ConvertedTo,
                    'createdBy', pr.CreatedBy,
                    'createdAt', DATE_FORMAT(pr.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                    'modifiedAt', DATE_FORMAT(pr.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                    'lines', IFNULL((
                        SELECT JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'uid', l.Id,
                                'itemCode', l.ItemCode,
                                'itemName', l.ItemName,
                                'uom', l.Uom,
                                'qty', l.Qty,
                                'qtyOrdered', l.QtyOrdered,
                                'requiredBy', l.RequiredBy,
                                'estimatedRate', l.EstimatedRate,
                                'costCentre', l.CostCentre,
                                'suggestedSupplier', l.SuggestedSupplier,
                                'specification', l.Specification
                            )
                        ) FROM PrLine l WHERE l.PurchaseRequisitionId = pr.Id
                    ), JSON_ARRAY()),
                    'approvals', IFNULL((
                        SELECT JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'level', a.Level,
                                'role', a.Role,
                                'approver', a.Approver,
                                'status', a.Status,
                                'actedAt', a.ActedAt,
                                'remarks', a.Remarks
                            )
                        ) FROM ApprovalStep a WHERE a.PurchaseRequisitionId = pr.Id
                    ), JSON_ARRAY())
                )
            ), JSON_ARRAY()) AS Result
        FROM PurchaseRequisition pr
        WHERE pr.IsDeleted = 0;
        
    END IF;
END$$

DELIMITER ;
