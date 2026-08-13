-- SQL Schema Script for Customer Master Module
-- Database: ERP_Master

USE ERP_Master;

-- Drop foreign keys if tables exist to ensure clean execution
DROP TABLE IF EXISTS CustomerWhereUsed;
DROP TABLE IF EXISTS CustomerRevision;
DROP TABLE IF EXISTS CustomerComplianceDoc;
DROP TABLE IF EXISTS CustomerBankAccount;
DROP TABLE IF EXISTS CustomerContact;
DROP TABLE IF EXISTS CustomerAddress;
DROP TABLE IF EXISTS Customer;

-- =========================================================================
-- 1. Create Tables
-- =========================================================================

CREATE TABLE Customer (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    ShortName VARCHAR(50) NOT NULL,
    Description TEXT NULL,
    Status VARCHAR(20) NOT NULL,
    EffectiveFrom DATETIME NOT NULL,
    EffectiveTo DATETIME NULL,
    Revision INT UNSIGNED NOT NULL DEFAULT 1,
    CompanyUid CHAR(26) NOT NULL,
    BranchUid CHAR(26) NULL,
    AttachmentCount INT UNSIGNED NOT NULL DEFAULT 0,
    CommentCount INT UNSIGNED NOT NULL DEFAULT 0,
    UsageCount INT UNSIGNED NOT NULL DEFAULT 0,
    LegalName VARCHAR(150) NOT NULL,
    CustomerType VARCHAR(20) NOT NULL,
    CustomerGroup VARCHAR(50) NOT NULL,
    Category VARCHAR(50) NOT NULL,
    Gstin VARCHAR(15) NULL,
    GstRegistrationType VARCHAR(20) NOT NULL,
    Pan VARCHAR(10) NULL,
    Currency CHAR(3) NOT NULL DEFAULT 'INR',
    PriceListCode VARCHAR(50) NOT NULL,
    PaymentTermsCode VARCHAR(50) NOT NULL,
    CreditDays INT UNSIGNED NOT NULL DEFAULT 0,
    CreditLimit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    CreditUsed DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    CreditHold TINYINT(1) NOT NULL DEFAULT 0,
    Territory VARCHAR(100) NOT NULL,
    SalesPerson VARCHAR(100) NOT NULL,
    OutstandingAmount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    OverdueAmount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    IsDeleted TINYINT(1) NOT NULL DEFAULT 0,
    Version INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    DeletedAt DATETIME NULL,
    DeletedBy VARCHAR(100) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CustomerAddress (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CustomerId BIGINT UNSIGNED NOT NULL,

    Type VARCHAR(20) NOT NULL,
    Label VARCHAR(50) NOT NULL,
    Line1 VARCHAR(150) NOT NULL,
    Line2 VARCHAR(150) NULL,
    City VARCHAR(50) NOT NULL,
    State VARCHAR(50) NOT NULL,
    StateCode VARCHAR(10) NULL,
    Pincode VARCHAR(10) NOT NULL,
    Country VARCHAR(50) NOT NULL DEFAULT 'India',
    Gstin VARCHAR(15) NULL,
    IsDefault TINYINT(1) NOT NULL DEFAULT 0,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (CustomerId) REFERENCES Customer(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CustomerContact (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CustomerId BIGINT UNSIGNED NOT NULL,

    Name VARCHAR(100) NOT NULL,
    Designation VARCHAR(50) NOT NULL,
    Department VARCHAR(50) NOT NULL,
    Email VARCHAR(100) NOT NULL,
    Mobile VARCHAR(20) NOT NULL,
    Landline VARCHAR(20) NULL,
    IsPrimary TINYINT(1) NOT NULL DEFAULT 0,
    Purpose VARCHAR(20) NOT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (CustomerId) REFERENCES Customer(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CustomerBankAccount (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CustomerId BIGINT UNSIGNED NOT NULL,

    BankName VARCHAR(100) NOT NULL,
    BranchName VARCHAR(100) NOT NULL,
    AccountNumber VARCHAR(50) NOT NULL,
    Ifsc VARCHAR(20) NOT NULL,
    AccountType VARCHAR(20) NOT NULL DEFAULT 'CURRENT',
    Swift VARCHAR(20) NULL,
    Currency CHAR(3) NOT NULL DEFAULT 'INR',
    IsPrimary TINYINT(1) NOT NULL DEFAULT 0,
    IsVerified TINYINT(1) NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (CustomerId) REFERENCES Customer(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CustomerComplianceDoc (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CustomerId BIGINT UNSIGNED NOT NULL,

    Type VARCHAR(100) NOT NULL,
    DocumentNo VARCHAR(50) NOT NULL,
    IssuedBy VARCHAR(100) NOT NULL,
    ValidFrom DATE NOT NULL,
    ValidTo DATE NULL,
    Status VARCHAR(20) NOT NULL,
    FileName VARCHAR(150) NULL,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (CustomerId) REFERENCES Customer(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CustomerRevision (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CustomerId BIGINT UNSIGNED NOT NULL,
    Revision INT UNSIGNED NOT NULL,
    At DATETIME NOT NULL,
    `By` VARCHAR(100) NOT NULL,
    Reason VARCHAR(250) NOT NULL,
    ChangesJson JSON NOT NULL,
    ApprovedBy VARCHAR(100) NULL,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (CustomerId) REFERENCES Customer(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE CustomerWhereUsed (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CustomerId BIGINT UNSIGNED NOT NULL,
    Module VARCHAR(50) NOT NULL,
    DocumentType VARCHAR(50) NOT NULL,
    DocumentNo VARCHAR(50) NOT NULL,
    Status VARCHAR(20) NOT NULL,
    `Date` DATE NOT NULL,
    IsOpen TINYINT(1) NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (CustomerId) REFERENCES Customer(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =========================================================================
-- 2. Create Stored Procedure SpCustomer
-- =========================================================================

DROP PROCEDURE IF EXISTS SpCustomer;

DELIMITER $$

CREATE PROCEDURE SpCustomer(
    IN VarAction VARCHAR(20),
    IN VarCustomerId BIGINT,
    IN VarCode VARCHAR(50),
    IN VarName VARCHAR(150),
    IN VarShortName VARCHAR(50),
    IN VarDescription TEXT,
    IN VarStatus VARCHAR(20),
    IN VarEffectiveFrom DATETIME,
    IN VarEffectiveTo DATETIME,
    IN VarRevision INT,
    IN VarCompanyUid CHAR(26),
    IN VarBranchUid CHAR(26),
    IN VarAttachmentCount INT,
    IN VarCommentCount INT,
    IN VarUsageCount INT,
    IN VarLegalName VARCHAR(150),
    IN VarCustomerType VARCHAR(20),
    IN VarCustomerGroup VARCHAR(50),
    IN VarCategory VARCHAR(50),
    IN VarGstin VARCHAR(15),
    IN VarGstRegistrationType VARCHAR(20),
    IN VarPan VARCHAR(10),
    IN VarCurrency CHAR(3),
    IN VarPriceListCode VARCHAR(50),
    IN VarPaymentTermsCode VARCHAR(50),
    IN VarCreditDays INT,
    IN VarCreditLimit DECIMAL(18,2),
    IN VarCreditUsed DECIMAL(18,2),
    IN VarCreditHold TINYINT,
    IN VarTerritory VARCHAR(100),
    IN VarSalesPerson VARCHAR(100),
    IN VarOutstandingAmount DECIMAL(18,2),
    IN VarOverdueAmount DECIMAL(18,2),
    IN VarVersion INT,
    IN VarUserIdentifier VARCHAR(100),
    IN VarAddressesJson JSON,
    IN VarContactsJson JSON,
    IN VarBankAccountsJson JSON,
    IN VarComplianceDocsJson JSON,
    IN VarRevisionsJson JSON,
    IN VarWhereUsedJson JSON
)
BEGIN
    -- -------------------------------------------------------------------------
    -- CREATE CUSTOMER
    -- -------------------------------------------------------------------------
    IF VarAction = 'CREATE' THEN
        INSERT INTO Customer (
            Code, Name, ShortName, Description, Status, EffectiveFrom, EffectiveTo, Revision,
            CompanyUid, BranchUid, AttachmentCount, CommentCount, UsageCount, LegalName, CustomerType,
            CustomerGroup, Category, Gstin, GstRegistrationType, Pan, Currency, PriceListCode,
            PaymentTermsCode, CreditDays, CreditLimit, CreditUsed, CreditHold, Territory, SalesPerson,
            OutstandingAmount, OverdueAmount, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            VarCode, VarName, VarShortName, VarDescription, VarStatus, VarEffectiveFrom, VarEffectiveTo, VarRevision,
            VarCompanyUid, VarBranchUid, VarAttachmentCount, VarCommentCount, VarUsageCount, VarLegalName, VarCustomerType,
            VarCustomerGroup, VarCategory, VarGstin, VarGstRegistrationType, VarPan, VarCurrency, VarPriceListCode,
            VarPaymentTermsCode, VarCreditDays, VarCreditLimit, VarCreditUsed, VarCreditHold, VarTerritory, VarSalesPerson,
            VarOutstandingAmount, VarOverdueAmount, VarVersion, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
        );
        
        SET @NewCustomerId = LAST_INSERT_ID();
        
        -- Insert Addresses
        IF VarAddressesJson IS NOT NULL AND JSON_LENGTH(VarAddressesJson) > 0 THEN
            INSERT INTO CustomerAddress (
                CustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @NewCustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarAddressesJson, '$[*]' COLUMNS(
                Type VARCHAR(20) PATH '$.type',
                Label VARCHAR(50) PATH '$.label',
                Line1 VARCHAR(150) PATH '$.line1',
                Line2 VARCHAR(150) PATH '$.line2',
                City VARCHAR(50) PATH '$.city',
                State VARCHAR(50) PATH '$.state',
                StateCode VARCHAR(10) PATH '$.stateCode',
                Pincode VARCHAR(10) PATH '$.pincode',
                Country VARCHAR(50) PATH '$.country',
                Gstin VARCHAR(15) PATH '$.gstin',
                IsDefault TINYINT PATH '$.isDefault',
                IsActive TINYINT PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Insert Contacts
        IF VarContactsJson IS NOT NULL AND JSON_LENGTH(VarContactsJson) > 0 THEN
            INSERT INTO CustomerContact (
                CustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @NewCustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarContactsJson, '$[*]' COLUMNS(
                Name VARCHAR(100) PATH '$.name',
                Designation VARCHAR(50) PATH '$.designation',
                Department VARCHAR(50) PATH '$.department',
                Email VARCHAR(100) PATH '$.email',
                Mobile VARCHAR(20) PATH '$.mobile',
                Landline VARCHAR(20) PATH '$.landline',
                IsPrimary TINYINT PATH '$.isPrimary',
                Purpose VARCHAR(20) PATH '$.purpose',
                IsActive TINYINT PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Insert Bank Accounts
        IF VarBankAccountsJson IS NOT NULL AND JSON_LENGTH(VarBankAccountsJson) > 0 THEN
            INSERT INTO CustomerBankAccount (
                CustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @NewCustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarBankAccountsJson, '$[*]' COLUMNS(
                BankName VARCHAR(100) PATH '$.bankName',
                BranchName VARCHAR(100) PATH '$.branchName',
                AccountNumber VARCHAR(50) PATH '$.accountNumber',
                IFSC VARCHAR(20) PATH '$.ifsc',
                AccountType VARCHAR(20) PATH '$.accountType',
                Swift VARCHAR(20) PATH '$.swift',
                Currency CHAR(3) PATH '$.currency',
                IsPrimary TINYINT PATH '$.isPrimary',
                IsVerified TINYINT PATH '$.isVerified'
            )) AS jt;
        END IF;

        -- Insert Compliance Docs
        IF VarComplianceDocsJson IS NOT NULL AND JSON_LENGTH(VarComplianceDocsJson) > 0 THEN
            INSERT INTO CustomerComplianceDoc (
                CustomerId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo, Status, FileName,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @NewCustomerId, Type, DocumentNo, IssuedBy, STR_TO_DATE(ValidFrom, '%Y-%m-%d'), STR_TO_DATE(ValidTo, '%Y-%m-%d'), Status, FileName,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarComplianceDocsJson, '$[*]' COLUMNS(
                Type VARCHAR(100) PATH '$.type',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                IssuedBy VARCHAR(100) PATH '$.issuedBy',
                ValidFrom VARCHAR(20) PATH '$.validFrom',
                ValidTo VARCHAR(20) PATH '$.validTo',
                Status VARCHAR(20) PATH '$.status',
                FileName VARCHAR(150) PATH '$.fileName'
            )) AS jt;
        END IF;

        -- Insert Revisions
        IF VarRevisionsJson IS NOT NULL AND JSON_LENGTH(VarRevisionsJson) > 0 THEN
            INSERT INTO CustomerRevision (
                CustomerId, Revision, At, `By`, Reason, ChangesJson, ApprovedBy,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @NewCustomerId, Revision, STR_TO_DATE(At, '%Y-%m-%dT%H:%i:%sZ'), `By`, Reason, ChangesJson, ApprovedBy,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarRevisionsJson, '$[*]' COLUMNS(
                Revision INT PATH '$.revision',
                At VARCHAR(30) PATH '$.at',
                `By` VARCHAR(100) PATH '$.by',
                Reason VARCHAR(250) PATH '$.reason',
                ChangesJson JSON PATH '$.changes',
                ApprovedBy VARCHAR(100) PATH '$.approvedBy'
            )) AS jt;
        END IF;

        -- Insert Where Used
        IF VarWhereUsedJson IS NOT NULL AND JSON_LENGTH(VarWhereUsedJson) > 0 THEN
            INSERT INTO CustomerWhereUsed (
                CustomerId, Module, DocumentType, DocumentNo, Status, `Date`, IsOpen,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @NewCustomerId, Module, DocumentType, DocumentNo, Status, STR_TO_DATE(`Date`, '%Y-%m-%d'), IsOpen,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarWhereUsedJson, '$[*]' COLUMNS(
                Module VARCHAR(50) PATH '$.module',
                DocumentType VARCHAR(50) PATH '$.documentType',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                Status VARCHAR(20) PATH '$.status',
                `Date` VARCHAR(20) PATH '$.date',
                IsOpen TINYINT PATH '$.isOpen'
            )) AS jt;
        END IF;

        -- Return the newly created record ID
        SELECT @NewCustomerId AS NewCustomerId;

    -- -------------------------------------------------------------------------
    -- UPDATE CUSTOMER
    -- -------------------------------------------------------------------------
    ELSEIF VarAction = 'UPDATE' THEN
        UPDATE Customer SET
            Name = VarName, ShortName = VarShortName, Description = VarDescription, Status = VarStatus,
            EffectiveFrom = VarEffectiveFrom, EffectiveTo = VarEffectiveTo, Revision = VarRevision,
            AttachmentCount = VarAttachmentCount, CommentCount = VarCommentCount, UsageCount = VarUsageCount,
            LegalName = VarLegalName, CustomerType = VarCustomerType, CustomerGroup = VarCustomerGroup,
            Category = VarCategory, Gstin = VarGstin, GstRegistrationType = VarGstRegistrationType,
            Pan = VarPan, Currency = VarCurrency, PriceListCode = VarPriceListCode, PaymentTermsCode = VarPaymentTermsCode,
            CreditDays = VarCreditDays, CreditLimit = VarCreditLimit, CreditUsed = VarCreditUsed, CreditHold = VarCreditHold,
            Territory = VarTerritory, SalesPerson = VarSalesPerson, OutstandingAmount = VarOutstandingAmount,
            OverdueAmount = VarOverdueAmount, Version = VarVersion + 1, ModifiedBy = VarUserIdentifier, ModifiedDate = NOW()
        WHERE Id = VarCustomerId AND Version = VarVersion;
        
        IF ROW_COUNT() = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CONCURRENT_MODIFICATION_OR_NOT_FOUND';
        END IF;
        
        SELECT Id INTO @UpdatedCustomerId FROM Customer WHERE Id = VarCustomerId;
        
        -- Sync Addresses (Delete and Re-insert)
        DELETE FROM CustomerAddress WHERE CustomerId = @UpdatedCustomerId;
        IF VarAddressesJson IS NOT NULL AND JSON_LENGTH(VarAddressesJson) > 0 THEN
            INSERT INTO CustomerAddress (
                CustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @UpdatedCustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarAddressesJson, '$[*]' COLUMNS(
                Type VARCHAR(20) PATH '$.type',
                Label VARCHAR(50) PATH '$.label',
                Line1 VARCHAR(150) PATH '$.line1',
                Line2 VARCHAR(150) PATH '$.line2',
                City VARCHAR(50) PATH '$.city',
                State VARCHAR(50) PATH '$.state',
                StateCode VARCHAR(10) PATH '$.stateCode',
                Pincode VARCHAR(10) PATH '$.pincode',
                Country VARCHAR(50) PATH '$.country',
                Gstin VARCHAR(15) PATH '$.gstin',
                IsDefault TINYINT PATH '$.isDefault',
                IsActive TINYINT PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Sync Contacts
        DELETE FROM CustomerContact WHERE CustomerId = @UpdatedCustomerId;
        IF VarContactsJson IS NOT NULL AND JSON_LENGTH(VarContactsJson) > 0 THEN
            INSERT INTO CustomerContact (
                CustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @UpdatedCustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarContactsJson, '$[*]' COLUMNS(
                Name VARCHAR(100) PATH '$.name',
                Designation VARCHAR(50) PATH '$.designation',
                Department VARCHAR(50) PATH '$.department',
                Email VARCHAR(100) PATH '$.email',
                Mobile VARCHAR(20) PATH '$.mobile',
                Landline VARCHAR(20) PATH '$.landline',
                IsPrimary TINYINT PATH '$.isPrimary',
                Purpose VARCHAR(20) PATH '$.purpose',
                IsActive TINYINT PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Sync Bank Accounts
        DELETE FROM CustomerBankAccount WHERE CustomerId = @UpdatedCustomerId;
        IF VarBankAccountsJson IS NOT NULL AND JSON_LENGTH(VarBankAccountsJson) > 0 THEN
            INSERT INTO CustomerBankAccount (
                CustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @UpdatedCustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarBankAccountsJson, '$[*]' COLUMNS(
                BankName VARCHAR(100) PATH '$.bankName',
                BranchName VARCHAR(100) PATH '$.branchName',
                AccountNumber VARCHAR(50) PATH '$.accountNumber',
                IFSC VARCHAR(20) PATH '$.ifsc',
                AccountType VARCHAR(20) PATH '$.accountType',
                Swift VARCHAR(20) PATH '$.swift',
                Currency CHAR(3) PATH '$.currency',
                IsPrimary TINYINT PATH '$.isPrimary',
                IsVerified TINYINT PATH '$.isVerified'
            )) AS jt;
        END IF;

        -- Sync Compliance Docs
        DELETE FROM CustomerComplianceDoc WHERE CustomerId = @UpdatedCustomerId;
        IF VarComplianceDocsJson IS NOT NULL AND JSON_LENGTH(VarComplianceDocsJson) > 0 THEN
            INSERT INTO CustomerComplianceDoc (
                CustomerId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo, Status, FileName,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @UpdatedCustomerId, Type, DocumentNo, IssuedBy, STR_TO_DATE(ValidFrom, '%Y-%m-%d'), STR_TO_DATE(ValidTo, '%Y-%m-%d'), Status, FileName,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarComplianceDocsJson, '$[*]' COLUMNS(
                Type VARCHAR(100) PATH '$.type',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                IssuedBy VARCHAR(100) PATH '$.issuedBy',
                ValidFrom VARCHAR(20) PATH '$.validFrom',
                ValidTo VARCHAR(20) PATH '$.validTo',
                Status VARCHAR(20) PATH '$.status',
                FileName VARCHAR(150) PATH '$.fileName'
            )) AS jt;
        END IF;

        -- Sync Revisions
        DELETE FROM CustomerRevision WHERE CustomerId = @UpdatedCustomerId;
        IF VarRevisionsJson IS NOT NULL AND JSON_LENGTH(VarRevisionsJson) > 0 THEN
            INSERT INTO CustomerRevision (
                CustomerId, Revision, At, `By`, Reason, ChangesJson, ApprovedBy,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @UpdatedCustomerId, Revision, STR_TO_DATE(At, '%Y-%m-%dT%H:%i:%sZ'), `By`, Reason, ChangesJson, ApprovedBy,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarRevisionsJson, '$[*]' COLUMNS(
                Revision INT PATH '$.revision',
                At VARCHAR(30) PATH '$.at',
                `By` VARCHAR(100) PATH '$.by',
                Reason VARCHAR(250) PATH '$.reason',
                ChangesJson JSON PATH '$.changes',
                ApprovedBy VARCHAR(100) PATH '$.approvedBy'
            )) AS jt;
        END IF;

        -- Sync Where Used
        DELETE FROM CustomerWhereUsed WHERE CustomerId = @UpdatedCustomerId;
        IF VarWhereUsedJson IS NOT NULL AND JSON_LENGTH(VarWhereUsedJson) > 0 THEN
            INSERT INTO CustomerWhereUsed (
                CustomerId, Module, DocumentType, DocumentNo, Status, `Date`, IsOpen,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT 
                @UpdatedCustomerId, Module, DocumentType, DocumentNo, Status, STR_TO_DATE(`Date`, '%Y-%m-%d'), IsOpen,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarWhereUsedJson, '$[*]' COLUMNS(
                Module VARCHAR(50) PATH '$.module',
                DocumentType VARCHAR(50) PATH '$.documentType',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                Status VARCHAR(20) PATH '$.status',
                `Date` VARCHAR(20) PATH '$.date',
                IsOpen TINYINT PATH '$.isOpen'
            )) AS jt;
        END IF;

    -- -------------------------------------------------------------------------
    -- DELETE CUSTOMER (SOFT DELETE)
    -- -------------------------------------------------------------------------
    ELSEIF VarAction = 'DELETE' THEN
        UPDATE Customer SET
            IsDeleted  = 1,
            DeletedAt  = NOW(),
            DeletedBy  = VarUserIdentifier,
            Status     = 'INACTIVE'
        WHERE Id = VarCustomerId;

    -- -------------------------------------------------------------------------
    -- READ CUSTOMER
    -- -------------------------------------------------------------------------
    ELSEIF VarAction = 'READ' THEN
        SELECT 
            c.*,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', a.Id, 'type', a.Type, 'label', a.Label, 'line1', a.Line1, 'line2', a.Line2,
                'city', a.City, 'state', a.State, 'stateCode', a.StateCode, 'pincode', a.Pincode,
                'country', a.Country, 'gstin', a.Gstin, 'isDefault', a.IsDefault = 1, 'isActive', a.IsActive = 1
            )) FROM CustomerAddress a WHERE a.CustomerId = c.Id) AS AddressesJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', co.Id, 'name', co.Name, 'designation', co.Designation, 'department', co.Department,
                'email', co.Email, 'mobile', co.Mobile, 'landline', co.Landline, 'isPrimary', co.IsPrimary = 1,
                'purpose', co.Purpose, 'isActive', co.IsActive = 1
            )) FROM CustomerContact co WHERE co.CustomerId = c.Id) AS ContactsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', b.Id, 'bankName', b.BankName, 'branchName', b.BranchName, 'accountNumber', b.AccountNumber,
                'ifsc', b.Ifsc, 'accountType', b.AccountType, 'swift', b.Swift, 'currency', b.Currency,
                'isPrimary', b.IsPrimary = 1, 'isVerified', b.IsVerified = 1
            )) FROM CustomerBankAccount b WHERE b.CustomerId = c.Id) AS BankAccountsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', d.Id, 'type', d.Type, 'documentNo', d.DocumentNo, 'issuedBy', d.IssuedBy,
                'validFrom', DATE_FORMAT(d.ValidFrom, '%Y-%m-%d'), 'validTo', DATE_FORMAT(d.ValidTo, '%Y-%m-%d'), 'status', d.Status, 'fileName', d.FileName
            )) FROM CustomerComplianceDoc d WHERE d.CustomerId = c.Id) AS ComplianceDocsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'revision', r.Revision, 'at', DATE_FORMAT(r.At, '%Y-%m-%dT%H:%i:%sZ'), 'by', r.`By`, 'reason', r.Reason,
                'changes', JSON_QUERY(r.ChangesJson, '$'), 'approvedBy', r.ApprovedBy
            )) FROM CustomerRevision r WHERE r.CustomerId = c.Id) AS RevisionsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'module', w.Module, 'documentType', w.DocumentType, 'documentNo', w.DocumentNo,
                'status', w.Status, 'date', DATE_FORMAT(w.`Date`, '%Y-%m-%d'), 'isOpen', w.IsOpen = 1
            )) FROM CustomerWhereUsed w WHERE w.CustomerId = c.Id) AS WhereUsedJson
        FROM Customer c
        WHERE c.Id = VarCustomerId AND c.IsDeleted = 0;

    -- -------------------------------------------------------------------------
    -- LIST CUSTOMERS
    -- -------------------------------------------------------------------------
    ELSEIF VarAction = 'LIST' THEN
        SELECT 
            c.*,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', a.Id, 'type', a.Type, 'label', a.Label, 'line1', a.Line1, 'line2', a.Line2,
                'city', a.City, 'state', a.State, 'stateCode', a.StateCode, 'pincode', a.Pincode,
                'country', a.Country, 'gstin', a.Gstin, 'isDefault', a.IsDefault = 1, 'isActive', a.IsActive = 1
            )) FROM CustomerAddress a WHERE a.CustomerId = c.Id) AS AddressesJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', co.Id, 'name', co.Name, 'designation', co.Designation, 'department', co.Department,
                'email', co.Email, 'mobile', co.Mobile, 'landline', co.Landline, 'isPrimary', co.IsPrimary = 1,
                'purpose', co.Purpose, 'isActive', co.IsActive = 1
            )) FROM CustomerContact co WHERE co.CustomerId = c.Id) AS ContactsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', b.Id, 'bankName', b.BankName, 'branchName', b.BranchName, 'accountNumber', b.AccountNumber,
                'ifsc', b.Ifsc, 'accountType', b.AccountType, 'swift', b.Swift, 'currency', b.Currency,
                'isPrimary', b.IsPrimary = 1, 'isVerified', b.IsVerified = 1
            )) FROM CustomerBankAccount b WHERE b.CustomerId = c.Id) AS BankAccountsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', d.Id, 'type', d.Type, 'documentNo', d.DocumentNo, 'issuedBy', d.IssuedBy,
                'validFrom', DATE_FORMAT(d.ValidFrom, '%Y-%m-%d'), 'validTo', DATE_FORMAT(d.ValidTo, '%Y-%m-%d'), 'status', d.Status, 'fileName', d.FileName
            )) FROM CustomerComplianceDoc d WHERE d.CustomerId = c.Id) AS ComplianceDocsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'revision', r.Revision, 'at', DATE_FORMAT(r.At, '%Y-%m-%dT%H:%i:%sZ'), 'by', r.`By`, 'reason', r.Reason,
                'changes', JSON_QUERY(r.ChangesJson, '$'), 'approvedBy', r.ApprovedBy
            )) FROM CustomerRevision r WHERE r.CustomerId = c.Id) AS RevisionsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'module', w.Module, 'documentType', w.DocumentType, 'documentNo', w.DocumentNo,
                'status', w.Status, 'date', DATE_FORMAT(w.`Date`, '%Y-%m-%d'), 'isOpen', w.IsOpen = 1
            )) FROM CustomerWhereUsed w WHERE w.CustomerId = c.Id) AS WhereUsedJson
        FROM Customer c
        WHERE c.IsDeleted = 0
        ORDER BY c.Id DESC;
    END IF;
END$$

DELIMITER ;


-- =========================================================================
-- 3. Seed Mock Data
-- =========================================================================

-- Insert customer cus-01
INSERT INTO Customer (
    Id, Code, Name, ShortName, Description, Status, EffectiveFrom, EffectiveTo, Revision,
    CompanyUid, BranchUid, AttachmentCount, CommentCount, UsageCount, LegalName, CustomerType,
    CustomerGroup, Category, Gstin, GstRegistrationType, Pan, Currency, PriceListCode,
    PaymentTermsCode, CreditDays, CreditLimit, CreditUsed, CreditHold, Territory, SalesPerson,
    OutstandingAmount, OverdueAmount, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
) VALUES (
    1, 'CUS-00001', 'Hydro Retail Private Limited', 'Hydro Retail', '', 'ACTIVE', '2023-12-05 10:00:00', NULL, 3,
    'cmp-01', NULL, 4, 6, 46, 'Hydro Retail Private Limited', 'DISTRIBUTOR',
    'Modern Trade', 'Key Account', '29AAFCH9911L1ZM', 'REGULAR', 'AAFCH9911L', 'INR', 'PL-DIST-2026',
    'PT-45D', 45, 15000000.00, 11240000.00, 0, 'South India', 'Priya Menon',
    11240000.00, 1840000.00, 1, 'Anand Krishnan', '2023-12-05 10:00:00', 'Anand Krishnan', NOW()
);

INSERT INTO CustomerAddress (CustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(1, 'BILLING', 'Billing address', '4th Floor, Prestige Towers, MG Road', '', 'Bengaluru', 'Karnataka', '29', '560001', 'India', '29AAFCH9911L1ZM', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()),
(1, 'SHIPPING', 'Bengaluru DC', 'Warehouse 7, Nelamangala Industrial Area', '', 'Bengaluru', 'Karnataka', '29', '562123', 'India', '29AAFCH9911L1ZM', 0, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()),
(1, 'adr-13', 'SHIPPING', 'Hyderabad DC', 'Plot 22, Medchal Logistics Park', '', 'Hyderabad', 'Telangana', '36', '501401', 'India', '36AAFCH9911L1ZK', 0, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerContact (CustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(1, 'cnt-12', 'Deepak Nair', 'Category Head', 'Commercial', 'deepak.nair@hydroretail.in', '+91 99860 11223', '', 1, 'COMMERCIAL', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()),
(1, 'cnt-13', 'Anitha Reddy', 'Accounts Payable', 'Finance', 'ap@hydroretail.in', '+91 99860 44118', '', 0, 'ACCOUNTS', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerBankAccount (CustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(1, 'bnk-09', 'HDFC Bank', 'MG Road Bengaluru', '50200011223344', 'HDFC0000123', 'CURRENT', NULL, 'INR', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerComplianceDoc (CustomerId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo, Status, FileName, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(1, 'GST Registration Certificate', '29AAFCH9911L1ZM', 'GSTN', '2023-12-05', '2028-12-05', 'VALID', 'gst-registration-certificate.pdf', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerRevision (CustomerId, Revision, At, `By`, Reason, ChangesJson, ApprovedBy, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(1, 3, NOW(), 'Priya Menon', 'Credit limit increase approved by finance', '[{"field": "creditLimit", "old": "1,20,00,000", "new": "1,50,00,000"}]', 'Meera Rajan', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerWhereUsed (CustomerId, Module, DocumentType, DocumentNo, Status, `Date`, IsOpen, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(1, 'Sales', 'Sales Order', 'SO/HO/2627/00512', 'IN_PROGRESS', '2026-08-07', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()),
(1, 'Dispatch', 'Delivery Challan', 'DC/P1/2627/00912', 'COMPLETED', '2026-08-10', 0, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()),
(1, 'Finance', 'Tax Invoice', 'INV/HO/2627/00841', 'APPROVED', '2026-08-10', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());


-- Insert customer cus-02
INSERT INTO Customer (
    Id, Code, Name, ShortName, Description, Status, EffectiveFrom, EffectiveTo, Revision,
    CompanyUid, BranchUid, AttachmentCount, CommentCount, UsageCount, LegalName, CustomerType,
    CustomerGroup, Category, Gstin, GstRegistrationType, Pan, Currency, PriceListCode,
    PaymentTermsCode, CreditDays, CreditLimit, CreditUsed, CreditHold, Territory, SalesPerson,
    OutstandingAmount, OverdueAmount, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
) VALUES (
    2, 'CUS-00002', 'GreenBottle Europe GmbH', 'GreenBottle EU', '', 'ACTIVE', '2024-12-10 10:00:00', NULL, 2,
    'cmp-01', NULL, 7, 0, 18, 'GreenBottle Europe GmbH', 'EXPORT',
    'Export — EU', 'Key Account', '', 'OVERSEAS', '', 'EUR', 'PL-EXP-EUR-2026',
    'PT-LC60', 60, 40000000.00, 18600000.00, 0, 'Europe', 'Priya Menon',
    18600000.00, 0.00, 1, 'Anand Krishnan', '2024-12-10 10:00:00', 'Anand Krishnan', NOW()
);

INSERT INTO CustomerAddress (CustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(2, 'adr-14', 'BILLING', 'Head office', 'Hafenstraße 88', '', 'Hamburg', 'Hamburg', '', '20359', 'Germany', NULL, 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerContact (CustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(2, 'cnt-14', 'Katrin Weber', 'Head of Sourcing', 'Commercial', 'k.weber@greenbottle.eu', '+49 40 7788 2200', '', 1, 'COMMERCIAL', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerBankAccount (CustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(2, 'bnk-10', 'Commerzbank', 'Hamburg', 'DE89370400440532013000', 'COBADEFF', 'CURRENT', 'COBADEFF', 'EUR', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerComplianceDoc (CustomerId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo, Status, FileName, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(2, 'doc-17', 'EU Food Contact Declaration', 'EU-1935/2004-0114', 'Notified Body', '2025-12-10', '2027-12-10', 'VALID', 'eu-food-contact-declaration.pdf', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()),
(2, 'doc-18', 'REACH Compliance Statement', 'REACH-2026-0088', 'Supplier', '2025-12-10', '2027-12-10', 'VALID', 'reach-compliance-statement.pdf', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerRevision (CustomerId, Revision, At, `By`, Reason, ChangesJson, ApprovedBy, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(2, 2, NOW(), 'Priya Menon', 'Payment terms changed to LC at 60 days', '[{"field": "paymentTermsCode", "old": "PT-LC90", "new": "PT-LC60"}]', 'Meera Rajan', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerWhereUsed (CustomerId, Module, DocumentType, DocumentNo, Status, `Date`, IsOpen, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(2, 'Sales', 'Sales Order', 'SO/HO/2627/00498', 'IN_PROGRESS', '2026-07-25', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()),
(2, 'Dispatch', 'Export Invoice', 'EXP/HO/2627/00062', 'APPROVED', '2026-07-30', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());


-- Insert customer cus-03
INSERT INTO Customer (
    Id, Code, Name, ShortName, Description, Status, EffectiveFrom, EffectiveTo, Revision,
    CompanyUid, BranchUid, AttachmentCount, CommentCount, UsageCount, LegalName, CustomerType,
    CustomerGroup, Category, Gstin, GstRegistrationType, Pan, Currency, PriceListCode,
    PaymentTermsCode, CreditDays, CreditLimit, CreditUsed, CreditHold, Territory, SalesPerson,
    OutstandingAmount, OverdueAmount, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
) VALUES (
    3, 'cus-03', 'CUS-00003', 'Sundaram Gifting Solutions', 'Sundaram Gifting', '', 'ACTIVE', '2025-06-17 10:00:00', NULL, 1,
    'cmp-01', NULL, 1, 0, 27, 'Sundaram Gifting Solutions Private Limited', 'OEM',
    'Corporate Gifting', 'Standard', '33AAJCS3344R1ZN', 'REGULAR', 'AAJCS3344R', 'INR', 'PL-OEM-2026',
    'PT-30D', 30, 6000000.00, 6180000.00, 1, 'Tamil Nadu', 'Vignesh Kumar',
    6180000.00, 2410000.00, 1, 'Anand Krishnan', '2025-06-17 10:00:00', 'Anand Krishnan', NOW()
);

INSERT INTO CustomerAddress (CustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(3, 'adr-15', 'BILLING', 'Registered office', '14 Cathedral Road', '', 'Chennai', 'Tamil Nadu', '33', '600086', 'India', '33AAJCS3344R1ZN', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerContact (CustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(3, 'cnt-15', 'R. Sundaram', 'Managing Director', 'Commercial', 'sundaram@sgs.co.in', '+91 98400 11445', '', 1, 'COMMERCIAL', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerBankAccount (CustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(3, 'bnk-11', 'State Bank of India', 'Cathedral Road', '30114455221', 'SBIN0001234', 'CURRENT', NULL, 'INR', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerComplianceDoc (CustomerId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo, Status, FileName, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(3, 'doc-19', 'GST Registration Certificate', '33AAJCS3344R1ZN', 'GSTN', '2025-06-17', '2030-06-17', 'VALID', 'gst-registration-certificate.pdf', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerRevision (CustomerId, Revision, At, `By`, Reason, ChangesJson, ApprovedBy, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(3, 1, NOW(), 'Vignesh Kumar', 'Initial creation', '[]', 'Meera Rajan', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerWhereUsed (CustomerId, Module, DocumentType, DocumentNo, Status, `Date`, IsOpen, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(3, 'Sales', 'Sales Order', 'SO/HO/2627/00503', 'ON_HOLD', '2026-08-01', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());


-- Insert customer cus-04
INSERT INTO Customer (
    Id, Code, Name, ShortName, Description, Status, EffectiveFrom, EffectiveTo, Revision,
    CompanyUid, BranchUid, AttachmentCount, CommentCount, UsageCount, LegalName, CustomerType,
    CustomerGroup, Category, Gstin, GstRegistrationType, Pan, Currency, PriceListCode,
    PaymentTermsCode, CreditDays, CreditLimit, CreditUsed, CreditHold, Territory, SalesPerson,
    OutstandingAmount, OverdueAmount, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
) VALUES (
    4, 'cus-04', 'CUS-00004', 'Aqua Mart Retail Chain', 'Aqua Mart', '', 'ACTIVE', '2026-01-23 10:00:00', NULL, 1,
    'cmp-01', NULL, 1, 0, 12, 'Aqua Mart Retail Chain LLP', 'RETAIL',
    'General Trade', 'Standard', '27AAKFA7788M1ZQ', 'REGULAR', 'AAKFA7788M', 'INR', 'PL-RETAIL-2026',
    'PT-COD', 0, 500000.00, 122000.00, 0, 'West India', 'Vignesh Kumar',
    122000.00, 0.00, 1, 'Anand Krishnan', '2026-01-23 10:00:00', 'Anand Krishnan', NOW()
);

INSERT INTO CustomerAddress (CustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(4, 'adr-16', 'BILLING', 'Head office', '22 Linking Road, Bandra West', '', 'Mumbai', 'Maharashtra', '27', '400050', 'India', '27AAKFA7788M1ZQ', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerContact (CustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(4, 'cnt-16', 'Farhan Shaikh', 'Purchase Manager', 'Commercial', 'purchase@aquamart.in', '+91 98200 44117', '', 1, 'COMMERCIAL', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerBankAccount (CustomerId, BankName, BranchName, AccountNumber, IFSC, AccountType, Swift, Currency, IsPrimary, IsVerified, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(4, 'bnk-12', 'Yes Bank', 'Bandra', '004488112233', 'YESB0000044', 'CURRENT', NULL, 'INR', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerComplianceDoc (CustomerId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo, Status, FileName, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(4, 'doc-20', 'GST Registration Certificate', '27AAKFA7788M1ZQ', 'GSTN', '2026-01-23', '2031-01-23', 'VALID', 'gst-registration-certificate.pdf', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerRevision (CustomerId, Revision, At, `By`, Reason, ChangesJson, ApprovedBy, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(4, 1, NOW(), 'Vignesh Kumar', 'Initial creation', '[]', 'Meera Rajan', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerWhereUsed (CustomerId, Module, DocumentType, DocumentNo, Status, `Date`, IsOpen, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(4, 'Sales', 'Sales Order', 'SO/HO/2627/00509', 'COMPLETED', '2026-08-02', 0, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());


-- Insert customer cus-05
INSERT INTO Customer (
    Id, Code, Name, ShortName, Description, Status, EffectiveFrom, EffectiveTo, Revision,
    CompanyUid, BranchUid, AttachmentCount, CommentCount, UsageCount, LegalName, CustomerType,
    CustomerGroup, Category, Gstin, GstRegistrationType, Pan, Currency, PriceListCode,
    PaymentTermsCode, CreditDays, CreditLimit, CreditUsed, CreditHold, Territory, SalesPerson,
    OutstandingAmount, OverdueAmount, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
) VALUES (
    5, 'cus-05', 'CUS-00005', 'Bharat E-Commerce Marketplace', 'Bharat ECom', '', 'DRAFT', NOW(), NULL, 1,
    'cmp-01', NULL, 0, 1, 0, 'Bharat E-Commerce Marketplace Private Limited', 'ECOMMERCE',
    'Marketplace', 'Key Account', '06AADCB1122K1Z8', 'REGULAR', 'AADCB1122K', 'INR', 'PL-ECOM-2026',
    'PT-15D', 15, 10000000.00, 0.00, 0, 'All India', 'Priya Menon',
    0.00, 0.00, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW()
);

INSERT INTO CustomerAddress (CustomerId, Type, Label, Line1, Line2, City, State, StateCode, Pincode, Country, Gstin, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(5, 'adr-17', 'BILLING', 'Registered office', 'Tower B, Cyber Hub, DLF Phase 2', '', 'Gurugram', 'Haryana', '06', '122002', 'India', '06AADCB1122K1Z8', 1, 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerContact (CustomerId, Name, Designation, Department, Email, Mobile, Landline, IsPrimary, Purpose, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(5, 'cnt-17', 'Neha Bansal', 'Vendor Manager', 'Commercial', 'neha.bansal@bharatecom.in', '+91 98100 77441', '', 1, 'COMMERCIAL', 1, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerComplianceDoc (CustomerId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo, Status, FileName, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(5, 'doc-21', 'GST Registration Certificate', '06AADCB1122K1Z8', 'GSTN', NOW(), NULL, 'VALID', 'gst-registration-certificate.pdf', 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());

INSERT INTO CustomerRevision (CustomerId, Revision, At, `By`, Reason, ChangesJson, ApprovedBy, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate) VALUES
(5, 1, NOW(), 'Priya Menon', 'Draft — awaiting bank details and credit approval', '[]', NULL, 'Anand Krishnan', NOW(), 'Anand Krishnan', NOW());
