USE ERP_Quality;

CREATE TABLE IF NOT EXISTS Calibration (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Name VARCHAR(100) NOT NULL,
    InstrumentType VARCHAR(100),
    Make VARCHAR(100),
    SerialNo VARCHAR(100),
    RangeVal VARCHAR(100),
    LeastCount VARCHAR(100),
    Location VARCHAR(100),
    Custodian VARCHAR(100),
    CalibrationFrequencyDays INT NOT NULL,
    LastCalibratedOn DATE NOT NULL,
    NextDueOn DATE NOT NULL,
    Agency VARCHAR(100),
    CertificateNo VARCHAR(100),
    ObservedErrorPct DECIMAL(5,2),
    PermittedErrorPct DECIMAL(5,2),
    Status VARCHAR(50) DEFAULT 'VALID',
    Remarks TEXT,
    Version INT DEFAULT 1,
    DeletedAt DATETIME,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);
