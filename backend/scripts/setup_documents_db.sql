CREATE TABLE IF NOT EXISTS EngineeringDocument (
    Id INT PRIMARY KEY AUTO_INCREMENT,
    DocumentCode VARCHAR(50) UNIQUE NOT NULL,
    Title VARCHAR(150) NOT NULL,
    DocType VARCHAR(50) NOT NULL,
    ProductCode VARCHAR(25) NOT NULL,
    Revision INT NOT NULL DEFAULT 1,
    FileName VARCHAR(255) NOT NULL,
    SizeKb INT NOT NULL DEFAULT 0,
    Status VARCHAR(50) NOT NULL,
    ApprovedBy VARCHAR(100) NULL,
    ApprovedOn DATETIME NULL,
    Remarks VARCHAR(1000) NULL,
    Version INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NULL,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NULL,
    DeletedAt DATETIME NULL
);

DROP PROCEDURE IF EXISTS SpManageEngineeringDocument;

DELIMITER //

CREATE PROCEDURE SpManageEngineeringDocument (
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_DocumentCode VARCHAR(50),
    IN p_Title VARCHAR(150),
    IN p_DocType VARCHAR(50),
    IN p_ProductCode VARCHAR(25),
    IN p_Revision INT,
    IN p_FileName VARCHAR(255),
    IN p_SizeKb INT,
    IN p_Status VARCHAR(50),
    IN p_ApprovedBy VARCHAR(100),
    IN p_ApprovedOn DATETIME,
    IN p_Remarks VARCHAR(1000),
    IN p_Version INT,
    IN p_CreatedBy VARCHAR(100)
)
BEGIN
    DECLARE v_NextId INT;
    DECLARE v_NewDocumentCode VARCHAR(50);
    
    IF p_Action = 'INSERT' THEN
        -- Get the next auto-increment ID to format DocumentCode
        SELECT AUTO_INCREMENT INTO v_NextId 
        FROM information_schema.tables 
        WHERE table_name = 'EngineeringDocument' 
          AND table_schema = DATABASE();
          
        IF v_NextId IS NULL THEN
            SET v_NextId = 1;
        END IF;
        
        SET v_NewDocumentCode = CONCAT('DOC-', LPAD(v_NextId, 4, '0'));
        
        INSERT INTO EngineeringDocument (
            DocumentCode, Title, DocType, ProductCode, Revision,
            FileName, SizeKb, Status, Remarks, Version,
            CreatedBy, CreatedDate
        ) VALUES (
            v_NewDocumentCode, p_Title, p_DocType, p_ProductCode, p_Revision,
            p_FileName, p_SizeKb, p_Status, p_Remarks, 1,
            p_CreatedBy, NOW()
        );
        
        SELECT LAST_INSERT_ID() AS Id, v_NewDocumentCode AS DocumentCode;
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE EngineeringDocument
        SET Title = COALESCE(p_Title, Title),
            DocType = COALESCE(p_DocType, DocType),
            ProductCode = COALESCE(p_ProductCode, ProductCode),
            Revision = COALESCE(p_Revision, Revision),
            FileName = COALESCE(p_FileName, FileName),
            SizeKb = COALESCE(p_SizeKb, SizeKb),
            Status = COALESCE(p_Status, Status),
            Remarks = COALESCE(p_Remarks, Remarks),
            Version = Version + 1,
            ModifiedBy = p_CreatedBy,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND DeletedAt IS NULL;
        
        SELECT p_Id AS Id, p_DocumentCode AS DocumentCode;
        
    ELSEIF p_Action = 'APPROVE' THEN
        UPDATE EngineeringDocument
        SET Status = p_Status,
            ApprovedBy = p_ApprovedBy,
            ApprovedOn = p_ApprovedOn,
            ModifiedBy = p_CreatedBy,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND DeletedAt IS NULL;
        
        SELECT p_Id AS Id, p_DocumentCode AS DocumentCode;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE EngineeringDocument
        SET DeletedAt = NOW(),
            ModifiedBy = p_CreatedBy,
            ModifiedDate = NOW()
        WHERE Id = p_Id;
        
        SELECT p_Id AS Id, p_DocumentCode AS DocumentCode;
        
    ELSEIF p_Action = 'SELECT' THEN
        IF p_Id IS NOT NULL THEN
            SELECT * FROM EngineeringDocument WHERE Id = p_Id AND DeletedAt IS NULL;
        ELSEIF p_ProductCode IS NOT NULL THEN
            SELECT * FROM EngineeringDocument WHERE ProductCode = p_ProductCode AND DeletedAt IS NULL ORDER BY Id DESC;
        ELSE
            SELECT * FROM EngineeringDocument WHERE DeletedAt IS NULL ORDER BY Id DESC;
        END IF;
    END IF;
END //
DELIMITER ;
