USE ERP_Packing;

CREATE TABLE IF NOT EXISTS ExportDocument (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    ExportDocNo VARCHAR(50) UNIQUE NOT NULL,
    ExportShipmentNo VARCHAR(50) NOT NULL,
    DocType VARCHAR(50) NOT NULL,
    DocNo VARCHAR(100) NULL,
    IssuedOn DATE NULL,
    IssuedBy VARCHAR(100) NULL,
    FileName VARCHAR(255) NULL,
    IsMandatory BOOLEAN DEFAULT TRUE,
    DependsOn VARCHAR(50) NULL,
    Status VARCHAR(30) DEFAULT 'MISSING',
    Remarks TEXT NULL,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    UNIQUE KEY UQ_Shipment_DocType (ExportShipmentNo, DocType)
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManageExportDocument //
CREATE PROCEDURE SpManageExportDocument(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_ExportShipmentNo VARCHAR(50),
    IN p_DocType VARCHAR(50),
    IN p_DocNo VARCHAR(100),
    IN p_IssuedOn DATE,
    IN p_IssuedBy VARCHAR(100),
    IN p_FileName VARCHAR(255),
    IN p_IsMandatory BOOLEAN,
    IN p_DependsOn VARCHAR(50),
    IN p_Status VARCHAR(30),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE next_id INT;
    DECLARE generated_doc VARCHAR(50);

    IF p_Action = 'CREATE' THEN
        SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM ExportDocument;
        SET generated_doc = CONCAT('EXD/', DATE_FORMAT(NOW(), '%y%m'), '/', LPAD(next_id, 4, '0'));

        INSERT INTO ExportDocument (
            ExportDocNo, ExportShipmentNo, DocType, DocNo, IssuedOn, IssuedBy, FileName,
            IsMandatory, DependsOn, Status, Remarks, CreatedBy, CreatedDate
        ) VALUES (
            generated_doc, p_ExportShipmentNo, p_DocType, p_DocNo, p_IssuedOn, p_IssuedBy, p_FileName,
            COALESCE(p_IsMandatory, TRUE), p_DependsOn, COALESCE(p_Status, 'MISSING'), p_Remarks, p_User, NOW()
        );

        SELECT * FROM ExportDocument WHERE Id = LAST_INSERT_ID();
    
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE ExportDocument
        SET ExportShipmentNo = COALESCE(p_ExportShipmentNo, ExportShipmentNo),
            DocType = COALESCE(p_DocType, DocType),
            DocNo = p_DocNo,
            IssuedOn = p_IssuedOn,
            IssuedBy = p_IssuedBy,
            FileName = p_FileName,
            IsMandatory = COALESCE(p_IsMandatory, IsMandatory),
            DependsOn = p_DependsOn,
            Status = COALESCE(p_Status, Status),
            Remarks = p_Remarks,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;

        SELECT * FROM ExportDocument WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM ExportDocument WHERE Id = p_Id;
        SELECT p_Id AS DeletedId;

    ELSEIF p_Action = 'GET_ALL' THEN
        SELECT * FROM ExportDocument ORDER BY Id DESC;

    ELSEIF p_Action = 'GET_BY_ID' THEN
        SELECT * FROM ExportDocument WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;
