USE admin_erp;

-- Create Supplier tables in admin_erp (mirrors SupplierSchema.sql but for correct DB)

CREATE TABLE IF NOT EXISTS Supplier (
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
    GstRegistrationType VARCHAR(20) NOT NULL DEFAULT 'REGULAR',
    Pan VARCHAR(10) NULL,
    MsmeNumber VARCHAR(50) NULL,
    MsmeCategory VARCHAR(20) NULL,
    Currency CHAR(3) NOT NULL DEFAULT 'INR',
    PaymentTermsCode VARCHAR(50) NOT NULL,
    CreditDays INT UNSIGNED NOT NULL DEFAULT 0,
    CreditLimit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    Rating INT NULL,
    RatingGrade CHAR(1) NULL,
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
    DeletedBy VARCHAR(100) NULL
);

CREATE TABLE IF NOT EXISTS SupplierAddress (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,
    Type VARCHAR(20) NOT NULL,
    Label VARCHAR(50) NULL,
    Line1 VARCHAR(150) NOT NULL,
    Line2 VARCHAR(150) NULL,
    City VARCHAR(50) NOT NULL,
    State VARCHAR(50) NOT NULL,
    StateCode VARCHAR(10) NOT NULL,
    Pincode VARCHAR(10) NOT NULL,
    Country VARCHAR(50) NOT NULL DEFAULT 'India',
    Gstin VARCHAR(15) NULL,
    IsDefault TINYINT(1) NOT NULL DEFAULT 0,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS SupplierContact (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,
    Name VARCHAR(100) NOT NULL,
    Designation VARCHAR(50) NULL,
    Department VARCHAR(50) NULL,
    Email VARCHAR(100) NULL,
    Mobile VARCHAR(20) NULL,
    Landline VARCHAR(20) NULL,
    IsPrimary TINYINT(1) NOT NULL DEFAULT 0,
    Purpose VARCHAR(20) NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS SupplierBankAccount (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,
    BankName VARCHAR(100) NOT NULL,
    BranchName VARCHAR(100) NULL,
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
    ModifiedDate DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS SupplierComplianceDoc (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,
    Type VARCHAR(50) NOT NULL,
    DocumentNo VARCHAR(50) NULL,
    IssuedBy VARCHAR(100) NULL,
    ValidFrom DATETIME NULL,
    ValidTo DATETIME NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'VALID',
    FileName VARCHAR(255) NULL,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS SupplierRevision (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,
    Revision INT NOT NULL,
    At DATETIME NOT NULL,
    By_User VARCHAR(100) NOT NULL,
    Reason TEXT NULL,
    ChangesJson JSON NULL,
    ApprovedBy VARCHAR(100) NULL,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS SupplierWhereUsed (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    SupplierId BIGINT UNSIGNED NOT NULL,
    Module VARCHAR(50) NOT NULL,
    DocumentType VARCHAR(50) NOT NULL,
    DocumentNo VARCHAR(50) NOT NULL,
    Status VARCHAR(20) NOT NULL,
    Date DATETIME NOT NULL,
    IsOpen TINYINT(1) NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME NOT NULL,
    ModifiedBy VARCHAR(100) NOT NULL,
    ModifiedDate DATETIME NOT NULL
);

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

    IF VarAction = 'LIST' THEN
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
    ELSEIF VarAction = 'CREATE' THEN
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
        COMMIT;
    ELSEIF VarAction = 'UPDATE' THEN
        START TRANSACTION;
        SELECT Version INTO DbVersion FROM Supplier WHERE Id = VarSupplierId FOR UPDATE;
        IF DbVersion IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Supplier not found';
        END IF;
        UPDATE Supplier SET
            Name = VarName, ShortName = VarShortName, Description = VarDescription, Status = VarStatus,
            EffectiveFrom = VarEffectiveFrom, EffectiveTo = VarEffectiveTo, LegalName = VarLegalName,
            VendorType = VarVendorType, Category = VarCategory, Gstin = VarGstin,
            GstRegistrationType = VarGstRegistrationType, Pan = VarPan, MsmeNumber = VarMsmeNumber,
            MsmeCategory = VarMsmeCategory, Currency = VarCurrency, PaymentTermsCode = VarPaymentTermsCode,
            CreditDays = VarCreditDays, CreditLimit = VarCreditLimit, IsBlacklisted = VarIsBlacklisted,
            BlacklistReason = VarBlacklistReason, IsApprovedVendor = VarIsApprovedVendor,
            SuppliedCategories = VarSuppliedCategories, Version = Version + 1,
            ModifiedBy = VarUserIdentifier, ModifiedDate = NOW()
        WHERE Id = VarSupplierId;
        COMMIT;
    ELSEIF VarAction = 'DELETE' THEN
        UPDATE Supplier SET IsDeleted = 1, DeletedAt = NOW(), DeletedBy = VarUserIdentifier
        WHERE Id = VarSupplierId;
    END IF;
END //

DELIMITER ;
