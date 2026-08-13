-- SQL Schema Script for Supplier Master Module
-- Database: ERP_Master

USE ERP_Master;

-- Drop foreign keys if tables exist to ensure clean execution
DROP TABLE IF EXISTS SupplierWhereUsed;
DROP TABLE IF EXISTS SupplierRevision;
DROP TABLE IF EXISTS SupplierComplianceDoc;
DROP TABLE IF EXISTS SupplierBankAccount;
DROP TABLE IF EXISTS SupplierContact;
DROP TABLE IF EXISTS SupplierAddress;
DROP TABLE IF EXISTS Supplier;

-- =========================================================================
-- 1. Create Tables
-- =========================================================================

CREATE TABLE Supplier (
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
    VendorType VARCHAR(20) NOT NULL,
    Category VARCHAR(50) NOT NULL,
    Gstin VARCHAR(15) NULL,
    GstRegistrationType VARCHAR(20) NOT NULL,
    Pan VARCHAR(10) NULL,
    MsmeNumber VARCHAR(50) NULL,
    MsmeCategory VARCHAR(20) NULL,
    Currency CHAR(3) NOT NULL DEFAULT 'INR',
    PaymentTermsCode VARCHAR(50) NOT NULL,
    CreditDays INT UNSIGNED NOT NULL DEFAULT 0,
    CreditLimit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    Rating INT UNSIGNED NOT NULL DEFAULT 0,
    RatingGrade CHAR(1) NOT NULL DEFAULT 'C',
    OnTimeDeliveryPct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    QualityAcceptancePct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    IsBlacklisted TINYINT(1) NOT NULL DEFAULT 0,
    BlacklistReason TEXT NULL,
    IsApprovedVendor TINYINT(1) NOT NULL DEFAULT 0,
    SuppliedCategories JSON NULL,
    IsDeleted TINYINT(1) NOT NULL DEFAULT 0,
    Version INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    DeletedAt DATETIME NULL,
    DeletedBy VARCHAR(100) NULL,
    CONSTRAINT chk_Supplier_Pan CHECK (Pan IS NULL OR (CHAR_LENGTH(Pan) = 10)),
    CONSTRAINT chk_Supplier_Gstin CHECK (Gstin IS NULL OR (CHAR_LENGTH(Gstin) = 15))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SupplierAddress (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,

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
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id) ON DELETE CASCADE,
    CONSTRAINT chk_SupplierAddress_Gstin CHECK (Gstin IS NULL OR (CHAR_LENGTH(Gstin) = 15))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SupplierContact (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,

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
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id) ON DELETE CASCADE,
    CONSTRAINT chk_SupplierContact_Mobile CHECK (CHAR_LENGTH(Mobile) = 10 AND Mobile REGEXP '^[0-9]+$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SupplierBankAccount (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,

    BankName VARCHAR(100) NOT NULL,
    BranchName VARCHAR(100) NOT NULL,
    AccountNumber VARCHAR(50) NOT NULL,
    Ifsc VARCHAR(20) NOT NULL,
    AccountType VARCHAR(20) NOT NULL,
    Swift VARCHAR(20) NULL,
    Currency CHAR(3) NOT NULL DEFAULT 'INR',
    IsPrimary TINYINT(1) NOT NULL DEFAULT 0,
    IsVerified TINYINT(1) NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SupplierComplianceDoc (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,

    Type VARCHAR(50) NOT NULL,
    DocumentNo VARCHAR(50) NOT NULL,
    IssuedBy VARCHAR(100) NOT NULL,
    ValidFrom DATETIME NOT NULL,
    ValidTo DATETIME NULL,
    Status VARCHAR(20) NULL,
    FileName VARCHAR(255) NULL,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SupplierRevision (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,

    Revision INT UNSIGNED NOT NULL,
    At DATETIME NOT NULL,
    By_User VARCHAR(100) NOT NULL,
    Reason TEXT NOT NULL,
    ChangesJson JSON NOT NULL,
    ApprovedBy VARCHAR(100) NULL,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SupplierWhereUsed (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,

    Module VARCHAR(50) NOT NULL,
    DocumentType VARCHAR(50) NOT NULL,
    DocumentNo VARCHAR(50) NOT NULL,
    Status VARCHAR(20) NOT NULL,
    Date DATETIME NOT NULL,
    IsOpen TINYINT(1) NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL,
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- 2. Create Stored Procedure (CRUD)
-- =========================================================================
DELIMITER //

DROP PROCEDURE IF EXISTS SpSupplier //
CREATE PROCEDURE SpSupplier(
    IN VarAction VARCHAR(20),
    IN VarSupplierId BIGINT,
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
    IN VarVendorType VARCHAR(20),
    IN VarCategory VARCHAR(50),
    IN VarGstin VARCHAR(15),
    IN VarGstRegistrationType VARCHAR(20),
    IN VarPan VARCHAR(10),
    IN VarMsmeNumber VARCHAR(50),
    IN VarMsmeCategory VARCHAR(20),
    IN VarCurrency CHAR(3),
    IN VarPaymentTermsCode VARCHAR(50),
    IN VarCreditDays INT,
    IN VarCreditLimit DECIMAL(18,2),
    IN VarRating INT,
    IN VarRatingGrade CHAR(1),
    IN VarOnTimeDeliveryPct DECIMAL(5,2),
    IN VarQualityAcceptancePct DECIMAL(5,2),
    IN VarIsBlacklisted TINYINT(1),
    IN VarBlacklistReason TEXT,
    IN VarIsApprovedVendor TINYINT(1),
    IN VarSuppliedCategories JSON,
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
    DECLARE DbVersion INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF VarAction = 'CREATE' THEN
        START TRANSACTION;

        INSERT INTO Supplier (
            Code, Name, ShortName, Description, Status, EffectiveFrom, EffectiveTo, Revision,
            CompanyUid, BranchUid, AttachmentCount, CommentCount, UsageCount, LegalName, VendorType, Category,
            Gstin, GstRegistrationType, Pan, MsmeNumber, MsmeCategory, Currency, PaymentTermsCode,
            CreditDays, CreditLimit, Rating, RatingGrade, OnTimeDeliveryPct, QualityAcceptancePct,
            IsBlacklisted, BlacklistReason, IsApprovedVendor, SuppliedCategories, IsDeleted, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            VarCode, VarName, VarShortName, VarDescription, VarStatus, VarEffectiveFrom, VarEffectiveTo, VarRevision,
            VarCompanyUid, VarBranchUid, VarAttachmentCount, VarCommentCount, VarUsageCount, VarLegalName, VarVendorType, VarCategory,
            VarGstin, VarGstRegistrationType, VarPan, VarMsmeNumber, VarMsmeCategory, VarCurrency, VarPaymentTermsCode,
            VarCreditDays, VarCreditLimit, VarRating, VarRatingGrade, VarOnTimeDeliveryPct, VarQualityAcceptancePct,
            VarIsBlacklisted, VarBlacklistReason, VarIsApprovedVendor, VarSuppliedCategories, 0, 1, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
        );

        SET VarSupplierId = LAST_INSERT_ID();

        -- Insert Addresses
        IF VarAddressesJson IS NOT NULL AND JSON_LENGTH(VarAddressesJson) > 0 THEN
            INSERT INTO SupplierAddress (
                SupplierId, Type, Label, Line1, Line2, City, State, StateCode, Pincode,
                Country, Gstin, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Type, Label, Line1, Line2, City, State, StateCode, Pincode,
                Country, Gstin, IsDefault, IsActive, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
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
                IsDefault TINYINT(1) PATH '$.isDefault',
                IsActive TINYINT(1) PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Insert Contacts
        IF VarContactsJson IS NOT NULL AND JSON_LENGTH(VarContactsJson) > 0 THEN
            INSERT INTO SupplierContact (
                SupplierId, Name, Designation, Department, Email, Mobile, Landline,
                IsPrimary, Purpose, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Name, Designation, Department, Email, Mobile, Landline,
                IsPrimary, Purpose, IsActive, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarContactsJson, '$[*]' COLUMNS(
                Name VARCHAR(100) PATH '$.name',
                Designation VARCHAR(50) PATH '$.designation',
                Department VARCHAR(50) PATH '$.department',
                Email VARCHAR(100) PATH '$.email',
                Mobile VARCHAR(20) PATH '$.mobile',
                Landline VARCHAR(20) PATH '$.landline',
                IsPrimary TINYINT(1) PATH '$.isPrimary',
                Purpose VARCHAR(20) PATH '$.purpose',
                IsActive TINYINT(1) PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Insert Bank Accounts
        IF VarBankAccountsJson IS NOT NULL AND JSON_LENGTH(VarBankAccountsJson) > 0 THEN
            INSERT INTO SupplierBankAccount (
                SupplierId, BankName, BranchName, AccountNumber, Ifsc, AccountType, Swift,
                Currency, IsPrimary, IsVerified, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, BankName, BranchName, AccountNumber, Ifsc, AccountType, Swift,
                Currency, IsPrimary, IsVerified, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarBankAccountsJson, '$[*]' COLUMNS(
                BankName VARCHAR(100) PATH '$.bankName',
                BranchName VARCHAR(100) PATH '$.branchName',
                AccountNumber VARCHAR(50) PATH '$.accountNumber',
                Ifsc VARCHAR(20) PATH '$.ifsc',
                AccountType VARCHAR(20) PATH '$.accountType',
                Swift VARCHAR(20) PATH '$.swift',
                Currency CHAR(3) PATH '$.currency',
                IsPrimary TINYINT(1) PATH '$.isPrimary',
                IsVerified TINYINT(1) PATH '$.isVerified'
            )) AS jt;
        END IF;

        -- Insert Compliance Docs
        IF VarComplianceDocsJson IS NOT NULL AND JSON_LENGTH(VarComplianceDocsJson) > 0 THEN
            INSERT INTO SupplierComplianceDoc (
                SupplierId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo,
                Status, FileName, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo,
                Status, FileName, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarComplianceDocsJson, '$[*]' COLUMNS(
                Type VARCHAR(50) PATH '$.type',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                IssuedBy VARCHAR(100) PATH '$.issuedBy',
                ValidFrom DATETIME PATH '$.validFrom',
                ValidTo DATETIME PATH '$.validTo',
                Status VARCHAR(20) PATH '$.status',
                FileName VARCHAR(255) PATH '$.fileName'
            )) AS jt;
        END IF;

        -- Insert Revisions
        IF VarRevisionsJson IS NOT NULL AND JSON_LENGTH(VarRevisionsJson) > 0 THEN
            INSERT INTO SupplierRevision (
                SupplierId, Revision, At, By_User, Reason, ChangesJson, ApprovedBy,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Revision, At, By_User, Reason, ChangesJson, ApprovedBy,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarRevisionsJson, '$[*]' COLUMNS(
                Revision INT PATH '$.revision',
                At DATETIME PATH '$.at',
                By_User VARCHAR(100) PATH '$.by',
                Reason TEXT PATH '$.reason',
                ChangesJson JSON PATH '$.changes',
                ApprovedBy VARCHAR(100) PATH '$.approvedBy'
            )) AS jt;
        END IF;

        -- Insert Where Used
        IF VarWhereUsedJson IS NOT NULL AND JSON_LENGTH(VarWhereUsedJson) > 0 THEN
            INSERT INTO SupplierWhereUsed (
                SupplierId, Module, DocumentType, DocumentNo, Status, Date, IsOpen,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Module, DocumentType, DocumentNo, Status, Date, IsOpen,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarWhereUsedJson, '$[*]' COLUMNS(
                Module VARCHAR(50) PATH '$.module',
                DocumentType VARCHAR(50) PATH '$.documentType',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                Status VARCHAR(20) PATH '$.status',
                Date DATETIME PATH '$.date',
                IsOpen TINYINT(1) PATH '$.isOpen'
            )) AS jt;
        END IF;

        COMMIT;
    ELSEIF VarAction = 'UPDATE' THEN
        START TRANSACTION;

        SELECT Version INTO DbVersion FROM Supplier WHERE Id = VarSupplierId FOR UPDATE;

        IF DbVersion IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Supplier not found';
        ELSEIF DbVersion != VarVersion THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Optimistic locking failure: Version mismatch';
        END IF;

        UPDATE Supplier SET
            Code = VarCode,
            Name = VarName,
            ShortName = VarShortName,
            Description = VarDescription,
            Status = VarStatus,
            EffectiveFrom = VarEffectiveFrom,
            EffectiveTo = VarEffectiveTo,
            Revision = VarRevision,
            CompanyUid = VarCompanyUid,
            BranchUid = VarBranchUid,
            AttachmentCount = VarAttachmentCount,
            CommentCount = VarCommentCount,
            UsageCount = VarUsageCount,
            LegalName = VarLegalName,
            VendorType = VarVendorType,
            Category = VarCategory,
            Gstin = VarGstin,
            GstRegistrationType = VarGstRegistrationType,
            Pan = VarPan,
            MsmeNumber = VarMsmeNumber,
            MsmeCategory = VarMsmeCategory,
            Currency = VarCurrency,
            PaymentTermsCode = VarPaymentTermsCode,
            CreditDays = VarCreditDays,
            CreditLimit = VarCreditLimit,
            Rating = VarRating,
            RatingGrade = VarRatingGrade,
            OnTimeDeliveryPct = VarOnTimeDeliveryPct,
            QualityAcceptancePct = VarQualityAcceptancePct,
            IsBlacklisted = VarIsBlacklisted,
            BlacklistReason = VarBlacklistReason,
            IsApprovedVendor = VarIsApprovedVendor,
            SuppliedCategories = VarSuppliedCategories,
            Version = Version + 1,
            ModifiedBy = VarUserIdentifier,
            ModifiedDate = NOW()
        WHERE Id = VarSupplierId;

        -- Address update (replace all)
        DELETE FROM SupplierAddress WHERE SupplierId = VarSupplierId;
        IF VarAddressesJson IS NOT NULL AND JSON_LENGTH(VarAddressesJson) > 0 THEN
            INSERT INTO SupplierAddress (
                SupplierId, Type, Label, Line1, Line2, City, State, StateCode, Pincode,
                Country, Gstin, IsDefault, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Type, Label, Line1, Line2, City, State, StateCode, Pincode,
                Country, Gstin, IsDefault, IsActive, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
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
                IsDefault TINYINT(1) PATH '$.isDefault',
                IsActive TINYINT(1) PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Contacts update (replace all)
        DELETE FROM SupplierContact WHERE SupplierId = VarSupplierId;
        IF VarContactsJson IS NOT NULL AND JSON_LENGTH(VarContactsJson) > 0 THEN
            INSERT INTO SupplierContact (
                SupplierId, Name, Designation, Department, Email, Mobile, Landline,
                IsPrimary, Purpose, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Name, Designation, Department, Email, Mobile, Landline,
                IsPrimary, Purpose, IsActive, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarContactsJson, '$[*]' COLUMNS(
                Name VARCHAR(100) PATH '$.name',
                Designation VARCHAR(50) PATH '$.designation',
                Department VARCHAR(50) PATH '$.department',
                Email VARCHAR(100) PATH '$.email',
                Mobile VARCHAR(20) PATH '$.mobile',
                Landline VARCHAR(20) PATH '$.landline',
                IsPrimary TINYINT(1) PATH '$.isPrimary',
                Purpose VARCHAR(20) PATH '$.purpose',
                IsActive TINYINT(1) PATH '$.isActive'
            )) AS jt;
        END IF;

        -- Bank Accounts update (replace all)
        DELETE FROM SupplierBankAccount WHERE SupplierId = VarSupplierId;
        IF VarBankAccountsJson IS NOT NULL AND JSON_LENGTH(VarBankAccountsJson) > 0 THEN
            INSERT INTO SupplierBankAccount (
                SupplierId, BankName, BranchName, AccountNumber, Ifsc, AccountType, Swift,
                Currency, IsPrimary, IsVerified, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, BankName, BranchName, AccountNumber, Ifsc, AccountType, Swift,
                Currency, IsPrimary, IsVerified, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarBankAccountsJson, '$[*]' COLUMNS(
                BankName VARCHAR(100) PATH '$.bankName',
                BranchName VARCHAR(100) PATH '$.branchName',
                AccountNumber VARCHAR(50) PATH '$.accountNumber',
                Ifsc VARCHAR(20) PATH '$.ifsc',
                AccountType VARCHAR(20) PATH '$.accountType',
                Swift VARCHAR(20) PATH '$.swift',
                Currency CHAR(3) PATH '$.currency',
                IsPrimary TINYINT(1) PATH '$.isPrimary',
                IsVerified TINYINT(1) PATH '$.isVerified'
            )) AS jt;
        END IF;

        -- Compliance Docs update (replace all)
        DELETE FROM SupplierComplianceDoc WHERE SupplierId = VarSupplierId;
        IF VarComplianceDocsJson IS NOT NULL AND JSON_LENGTH(VarComplianceDocsJson) > 0 THEN
            INSERT INTO SupplierComplianceDoc (
                SupplierId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo,
                Status, FileName, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Type, DocumentNo, IssuedBy, ValidFrom, ValidTo,
                Status, FileName, VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarComplianceDocsJson, '$[*]' COLUMNS(
                Type VARCHAR(50) PATH '$.type',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                IssuedBy VARCHAR(100) PATH '$.issuedBy',
                ValidFrom DATETIME PATH '$.validFrom',
                ValidTo DATETIME PATH '$.validTo',
                Status VARCHAR(20) PATH '$.status',
                FileName VARCHAR(255) PATH '$.fileName'
            )) AS jt;
        END IF;

        -- Revisions update (replace all)
        DELETE FROM SupplierRevision WHERE SupplierId = VarSupplierId;
        IF VarRevisionsJson IS NOT NULL AND JSON_LENGTH(VarRevisionsJson) > 0 THEN
            INSERT INTO SupplierRevision (
                SupplierId, Revision, At, By_User, Reason, ChangesJson, ApprovedBy,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Revision, At, By_User, Reason, ChangesJson, ApprovedBy,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarRevisionsJson, '$[*]' COLUMNS(
                Revision INT PATH '$.revision',
                At DATETIME PATH '$.at',
                By_User VARCHAR(100) PATH '$.by',
                Reason TEXT PATH '$.reason',
                ChangesJson JSON PATH '$.changes',
                ApprovedBy VARCHAR(100) PATH '$.approvedBy'
            )) AS jt;
        END IF;

        -- Where Used update (replace all)
        DELETE FROM SupplierWhereUsed WHERE SupplierId = VarSupplierId;
        IF VarWhereUsedJson IS NOT NULL AND JSON_LENGTH(VarWhereUsedJson) > 0 THEN
            INSERT INTO SupplierWhereUsed (
                SupplierId, Module, DocumentType, DocumentNo, Status, Date, IsOpen,
                CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
            )
            SELECT
                VarSupplierId, Module, DocumentType, DocumentNo, Status, Date, IsOpen,
                VarUserIdentifier, NOW(), VarUserIdentifier, NOW()
            FROM JSON_TABLE(VarWhereUsedJson, '$[*]' COLUMNS(
                Module VARCHAR(50) PATH '$.module',
                DocumentType VARCHAR(50) PATH '$.documentType',
                DocumentNo VARCHAR(50) PATH '$.documentNo',
                Status VARCHAR(20) PATH '$.status',
                Date DATETIME PATH '$.date',
                IsOpen TINYINT(1) PATH '$.isOpen'
            )) AS jt;
        END IF;

        COMMIT;
    ELSEIF VarAction = 'DELETE' THEN
        START TRANSACTION;

        SELECT Version INTO DbVersion FROM Supplier WHERE Id = VarSupplierId FOR UPDATE;
        IF DbVersion IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Supplier not found';
        END IF;

        UPDATE Supplier SET 
            IsDeleted = 1,
            DeletedAt = NOW(),
            DeletedBy = VarUserIdentifier
        WHERE Id = VarSupplierId;

        COMMIT;
    ELSEIF VarAction = 'LIST' THEN
        SELECT 
            s.*,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', a.Id, 'type', a.Type, 'label', a.Label, 'line1', a.Line1, 'line2', a.Line2,
                'city', a.City, 'state', a.State, 'stateCode', a.StateCode, 'pincode', a.Pincode,
                'country', a.Country, 'gstin', a.Gstin, 'isDefault', a.IsDefault = 1, 'isActive', a.IsActive = 1
            )) FROM SupplierAddress a WHERE a.SupplierId = s.Id) AS AddressesJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', co.Id, 'name', co.Name, 'designation', co.Designation, 'department', co.Department,
                'email', co.Email, 'mobile', co.Mobile, 'landline', co.Landline, 'isPrimary', co.IsPrimary = 1,
                'purpose', co.Purpose, 'isActive', co.IsActive = 1
            )) FROM SupplierContact co WHERE co.SupplierId = s.Id) AS ContactsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', b.Id, 'bankName', b.BankName, 'branchName', b.BranchName, 'accountNumber', b.AccountNumber,
                'ifsc', b.Ifsc, 'accountType', b.AccountType, 'swift', b.Swift, 'currency', b.Currency,
                'isPrimary', b.IsPrimary = 1, 'isVerified', b.IsVerified = 1
            )) FROM SupplierBankAccount b WHERE b.SupplierId = s.Id) AS BankAccountsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', d.Id, 'type', d.Type, 'documentNo', d.DocumentNo, 'issuedBy', d.IssuedBy,
                'validFrom', DATE_FORMAT(d.ValidFrom, '%Y-%m-%dT%H:%i:%sZ'), 'validTo', DATE_FORMAT(d.ValidTo, '%Y-%m-%dT%H:%i:%sZ'), 
                'status', d.Status, 'fileName', d.FileName
            )) FROM SupplierComplianceDoc d WHERE d.SupplierId = s.Id) AS ComplianceDocsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', r.Id, 'revision', r.Revision, 'at', DATE_FORMAT(r.At, '%Y-%m-%dT%H:%i:%sZ'),
                'by', r.By_User, 'reason', r.Reason, 'changes', r.ChangesJson, 'approvedBy', r.ApprovedBy
            )) FROM SupplierRevision r WHERE r.SupplierId = s.Id) AS RevisionsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', w.Id, 'module', w.Module, 'documentType', w.DocumentType, 'documentNo', w.DocumentNo,
                'status', w.Status, 'date', DATE_FORMAT(w.Date, '%Y-%m-%dT%H:%i:%sZ'), 'isOpen', w.IsOpen = 1
            )) FROM SupplierWhereUsed w WHERE w.SupplierId = s.Id) AS WhereUsedJson
        FROM Supplier s
        WHERE s.IsDeleted = 0;
    ELSEIF VarAction = 'READ' THEN
        SELECT 
            s.*,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', a.Id, 'type', a.Type, 'label', a.Label, 'line1', a.Line1, 'line2', a.Line2,
                'city', a.City, 'state', a.State, 'stateCode', a.StateCode, 'pincode', a.Pincode,
                'country', a.Country, 'gstin', a.Gstin, 'isDefault', a.IsDefault = 1, 'isActive', a.IsActive = 1
            )) FROM SupplierAddress a WHERE a.SupplierId = s.Id) AS AddressesJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', co.Id, 'name', co.Name, 'designation', co.Designation, 'department', co.Department,
                'email', co.Email, 'mobile', co.Mobile, 'landline', co.Landline, 'isPrimary', co.IsPrimary = 1,
                'purpose', co.Purpose, 'isActive', co.IsActive = 1
            )) FROM SupplierContact co WHERE co.SupplierId = s.Id) AS ContactsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', b.Id, 'bankName', b.BankName, 'branchName', b.BranchName, 'accountNumber', b.AccountNumber,
                'ifsc', b.Ifsc, 'accountType', b.AccountType, 'swift', b.Swift, 'currency', b.Currency,
                'isPrimary', b.IsPrimary = 1, 'isVerified', b.IsVerified = 1
            )) FROM SupplierBankAccount b WHERE b.SupplierId = s.Id) AS BankAccountsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', d.Id, 'type', d.Type, 'documentNo', d.DocumentNo, 'issuedBy', d.IssuedBy,
                'validFrom', DATE_FORMAT(d.ValidFrom, '%Y-%m-%dT%H:%i:%sZ'), 'validTo', DATE_FORMAT(d.ValidTo, '%Y-%m-%dT%H:%i:%sZ'), 
                'status', d.Status, 'fileName', d.FileName
            )) FROM SupplierComplianceDoc d WHERE d.SupplierId = s.Id) AS ComplianceDocsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', r.Id, 'revision', r.Revision, 'at', DATE_FORMAT(r.At, '%Y-%m-%dT%H:%i:%sZ'),
                'by', r.By_User, 'reason', r.Reason, 'changes', r.ChangesJson, 'approvedBy', r.ApprovedBy
            )) FROM SupplierRevision r WHERE r.SupplierId = s.Id) AS RevisionsJson,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'uid', w.Id, 'module', w.Module, 'documentType', w.DocumentType, 'documentNo', w.DocumentNo,
                'status', w.Status, 'date', DATE_FORMAT(w.Date, '%Y-%m-%dT%H:%i:%sZ'), 'isOpen', w.IsOpen = 1
            )) FROM SupplierWhereUsed w WHERE w.SupplierId = s.Id) AS WhereUsedJson
        FROM Supplier s
        WHERE s.Id = VarSupplierId AND s.IsDeleted = 0;
    END IF;
END //

DELIMITER ;

-- =========================================================================
-- 3. Insert Mock Data
-- =========================================================================
-- Not adding mock data as requested, just tables and procedure.
