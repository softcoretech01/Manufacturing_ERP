USE ERP_Quality;

CREATE TABLE IF NOT EXISTS QualityAudit (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    AuditType VARCHAR(50) NOT NULL,
    Title VARCHAR(200) NOT NULL,
    Scope TEXT,
    Auditee VARCHAR(100),
    Auditor VARCHAR(100),
    PlannedOn DATE NOT NULL,
    ConductedOn DATE,
    Status VARCHAR(50) DEFAULT 'PLANNED',
    ScorePct DECIMAL(5,2),
    ReportRef VARCHAR(100),
    Remarks TEXT,
    Version INT DEFAULT 1,
    DeletedAt DATETIME,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

CREATE TABLE IF NOT EXISTS QualityAuditFinding (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    AuditId INT NOT NULL,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    Clause VARCHAR(100),
    Area VARCHAR(100),
    Grade VARCHAR(50) NOT NULL,
    Description TEXT,
    Action TEXT,
    Owner VARCHAR(100),
    DueOn DATE,
    ClosedOn DATE,
    FOREIGN KEY (AuditId) REFERENCES QualityAudit(Id) ON DELETE CASCADE
);
