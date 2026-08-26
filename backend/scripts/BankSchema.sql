-- Database: ERP_Master
-- Drop SP and Table if they exist for clean execution
DROP PROCEDURE IF EXISTS SpBank;
DROP TABLE IF EXISTS Bank;

CREATE TABLE Bank (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(20) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    IfscPrefix VARCHAR(4) NULL,
    BankType VARCHAR(20) NOT NULL,
    Swift VARCHAR(15) NULL,
    SupportsNeft BOOLEAN NOT NULL DEFAULT 0,
    
    -- Audit & tracking columns
    IsDeleted BOOLEAN NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

DELIMITER //

CREATE PROCEDURE SpBank(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(20),
    IN p_Name VARCHAR(150),
    IN p_Status VARCHAR(20),
    IN p_IfscPrefix VARCHAR(4),
    IN p_BankType VARCHAR(20),
    IN p_Swift VARCHAR(15),
    IN p_SupportsNeft BOOLEAN,
    IN p_User VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT 
            Id, Code, Name, Status, IfscPrefix, BankType, Swift, SupportsNeft,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Bank
        WHERE IsDeleted = 0
        ORDER BY Name ASC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT 
            Id, Code, Name, Status, IfscPrefix, BankType, Swift, SupportsNeft,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Bank
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Bank (
            Code, Name, Status, IfscPrefix, BankType, Swift, SupportsNeft, CreatedBy
        ) VALUES (
            p_Code, p_Name, p_Status, p_IfscPrefix, p_BankType, p_Swift, p_SupportsNeft, p_User
        );
        
        SELECT 
            Id, Code, Name, Status, IfscPrefix, BankType, Swift, SupportsNeft,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Bank
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Bank 
        SET 
            Name = p_Name,
            Status = p_Status,
            IfscPrefix = p_IfscPrefix,
            BankType = p_BankType,
            Swift = p_Swift,
            SupportsNeft = p_SupportsNeft,
            ModifiedBy = p_User,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        SELECT 
            Id, Code, Name, Status, IfscPrefix, BankType, Swift, SupportsNeft,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM Bank
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Bank 
        SET 
            IsDeleted = 1,
            ModifiedBy = p_User,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;

-- Insert initial mock data mapping from the original frontend state
INSERT INTO Bank (Code, Name, Status, IfscPrefix, BankType, Swift, SupportsNeft, CreatedBy) VALUES
('HDFC', 'HDFC Bank', 'ACTIVE', 'HDFC', 'PRIVATE', 'HDFCINBB', 1, 'system'),
('ICIC', 'ICICI Bank', 'ACTIVE', 'ICIC', 'PRIVATE', 'ICICINBB', 1, 'system'),
('SBIN', 'State Bank of India', 'ACTIVE', 'SBIN', 'PUBLIC', 'SBININBB', 1, 'system'),
('UTIB', 'Axis Bank', 'ACTIVE', 'UTIB', 'PRIVATE', 'AXISINBB', 1, 'system'),
('KKBK', 'Kotak Mahindra Bank', 'ACTIVE', 'KKBK', 'PRIVATE', 'KKBKINBB', 1, 'system'),
('IDIB', 'Indian Bank', 'ACTIVE', 'IDIB', 'PUBLIC', 'IDIBINBB', 1, 'system'),
('CNRB', 'Canara Bank', 'ACTIVE', 'CNRB', 'PUBLIC', 'CNRBINBB', 1, 'system'),
('MAHB', 'Bank of Maharashtra', 'ACTIVE', 'MAHB', 'PUBLIC', 'MAHBINBB', 1, 'system'),
('YESB', 'Yes Bank', 'ACTIVE', 'YESB', 'PRIVATE', 'YESBINBB', 1, 'system'),
('CITI', 'Citibank NA', 'ACTIVE', 'CITI', 'FOREIGN', 'CITIINBX', 1, 'system'),
('NDEA', 'Nordea Bank', 'ACTIVE', '', 'FOREIGN', 'NDEASESS', 0, 'system'),
('COBA', 'Commerzbank AG', 'ACTIVE', '', 'FOREIGN', 'COBADEFF', 0, 'system');
