USE ERP_Quality;

CREATE TABLE IF NOT EXISTS SupplierQuality (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SupplierCode VARCHAR(50) NOT NULL,
    Period VARCHAR(50) NOT NULL,
    LotsReceived INT DEFAULT 0,
    LotsAccepted INT DEFAULT 0,
    LotsRejected INT DEFAULT 0,
    QtyReceived INT DEFAULT 0,
    QtyRejected INT DEFAULT 0,
    LotsWithValidDocs INT DEFAULT 0,
    NcrsRaised INT DEFAULT 0,
    NcrsClosedOnTime INT DEFAULT 0,
    CapaResponseDays INT DEFAULT 0,
    Version INT DEFAULT 1,
    DeletedAt DATETIME,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    UNIQUE KEY (SupplierCode, Period)
);
