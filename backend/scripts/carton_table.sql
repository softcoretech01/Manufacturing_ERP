
USE ERP_Packing;

CREATE TABLE IF NOT EXISTS Carton (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    Barcode VARCHAR(100),
    PackingOrderNo VARCHAR(50) NOT NULL,
    Customer VARCHAR(255),
    ItemCode VARCHAR(50),
    ItemName VARCHAR(255),
    BatchNo VARCHAR(50),
    Quantity DECIMAL(18,2) DEFAULT 0,
    Uom VARCHAR(20),
    GrossWeightKg DECIMAL(18,3),
    NetWeightKg DECIMAL(18,3),
    LengthMm DECIMAL(18,2),
    WidthMm DECIMAL(18,2),
    HeightMm DECIMAL(18,2),
    PackedOn DATETIME,
    Operator VARCHAR(100),
    PalletNo VARCHAR(50),
    LabelPrinted BOOLEAN DEFAULT FALSE,
    WeightChecked BOOLEAN DEFAULT FALSE,
    Status VARCHAR(20) DEFAULT 'OPEN',
    Contents JSON,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    DeletedAt DATETIME NULL
);
