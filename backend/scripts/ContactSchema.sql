-- Database: ERP_Master
-- Drop SP and Table if they exist for clean execution
DROP PROCEDURE IF EXISTS SpContactPerson;
DROP TABLE IF EXISTS ContactPerson;

CREATE TABLE ContactPerson (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(20) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    Partner VARCHAR(150) NOT NULL,
    PartnerType VARCHAR(20) NOT NULL,
    Designation VARCHAR(100) NULL,
    Purpose VARCHAR(50) NOT NULL,
    Email VARCHAR(150) NOT NULL UNIQUE,
    Mobile VARCHAR(10) NOT NULL,
    HasPortalAccess BOOLEAN NOT NULL DEFAULT 0,
    
    -- Audit & tracking columns
    IsDeleted BOOLEAN NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

DELIMITER //

CREATE PROCEDURE SpContactPerson(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(20),
    IN p_Name VARCHAR(150),
    IN p_Status VARCHAR(20),
    IN p_Partner VARCHAR(150),
    IN p_PartnerType VARCHAR(20),
    IN p_Designation VARCHAR(100),
    IN p_Purpose VARCHAR(50),
    IN p_Email VARCHAR(150),
    IN p_Mobile VARCHAR(10),
    IN p_HasPortalAccess BOOLEAN,
    IN p_User VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT 
            Id, Code, Name, Status, Partner, PartnerType, Designation, Purpose, Email, Mobile, HasPortalAccess,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM ContactPerson
        WHERE IsDeleted = 0
        ORDER BY Id DESC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT 
            Id, Code, Name, Status, Partner, PartnerType, Designation, Purpose, Email, Mobile, HasPortalAccess,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM ContactPerson
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        IF p_Code = 'AUTO' OR p_Code IS NULL THEN
            SELECT IFNULL(MAX(Id), 0) + 1 INTO @next_id FROM ContactPerson;
            SET p_Code = CONCAT('CNT-', LPAD(@next_id, 4, '0'));
        END IF;
        
        INSERT INTO ContactPerson (
            Code, Name, Status, Partner, PartnerType, Designation, Purpose, Email, Mobile, HasPortalAccess, CreatedBy
        ) VALUES (
            p_Code, p_Name, p_Status, p_Partner, p_PartnerType, p_Designation, p_Purpose, p_Email, p_Mobile, p_HasPortalAccess, p_User
        );
        
        SELECT 
            Id, Code, Name, Status, Partner, PartnerType, Designation, Purpose, Email, Mobile, HasPortalAccess,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM ContactPerson
        WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE ContactPerson 
        SET 
            Name = p_Name,
            Status = p_Status,
            Partner = p_Partner,
            PartnerType = p_PartnerType,
            Designation = p_Designation,
            Purpose = p_Purpose,
            Email = p_Email,
            Mobile = p_Mobile,
            HasPortalAccess = p_HasPortalAccess,
            ModifiedBy = p_User,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        SELECT 
            Id, Code, Name, Status, Partner, PartnerType, Designation, Purpose, Email, Mobile, HasPortalAccess,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM ContactPerson
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE ContactPerson 
        SET 
            IsDeleted = 1,
            ModifiedBy = p_User,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;

-- Insert initial mock data
INSERT INTO ContactPerson (Code, Name, Status, Partner, PartnerType, Designation, Purpose, Email, Mobile, HasPortalAccess, CreatedBy) VALUES
('CNT-0001', 'Rakesh Sharma', 'ACTIVE', 'Jindal Stainless Limited', 'SUPPLIER', 'Regional Sales Manager', 'COMMERCIAL', 'rakesh.sharma@jindalstainless.com', '9811022114', 1, 'system'),
('CNT-0002', 'Vinod Gupta', 'ACTIVE', 'Jindal Stainless Limited', 'SUPPLIER', 'Quality Head', 'QUALITY', 'vinod.gupta@jindalstainless.com', '9811088420', 0, 'system'),
('CNT-0003', 'S. Balaji', 'ACTIVE', 'Perfect Polymers Pvt Ltd', 'SUPPLIER', 'Director', 'COMMERCIAL', 'balaji@perfectpolymers.in', '9840411223', 1, 'system'),
('CNT-0004', 'Deepak Nair', 'ACTIVE', 'Hydro Retail Private Limited', 'CUSTOMER', 'Category Head', 'COMMERCIAL', 'deepak.nair@hydroretail.in', '9986011223', 1, 'system'),
('CNT-0005', 'Anitha Reddy', 'ACTIVE', 'Hydro Retail Private Limited', 'CUSTOMER', 'Accounts Payable', 'ACCOUNTS', 'ap@hydroretail.in', '9986044118', 0, 'system');
