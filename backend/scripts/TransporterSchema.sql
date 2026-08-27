USE admin_erp;

-- 1. Create Transporter Table
CREATE TABLE IF NOT EXISTS Transporter (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) UNIQUE NOT NULL,
    Name VARCHAR(150) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    EffectiveFrom DATE NOT NULL,
    EffectiveTo DATE NULL,
    TransporterId VARCHAR(15) NOT NULL,
    Mode VARCHAR(20) NOT NULL,
    IsGta BOOLEAN NOT NULL DEFAULT 0,
    FleetSize INT NOT NULL DEFAULT 0,
    ServiceZones VARCHAR(500) NULL,
    ContactMobile VARCHAR(10) NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Create Stored Procedures

-- Get All Transporters
DELIMITER //
CREATE PROCEDURE SpGetTransporters()
BEGIN
    SELECT 
        Id,
        Code,
        Name,
        Status,
        EffectiveFrom,
        EffectiveTo,
        TransporterId,
        Mode,
        IsGta,
        FleetSize,
        ServiceZones,
        ContactMobile,
        CreatedAt,
        UpdatedAt
    FROM Transporter
    ORDER BY Id DESC;
END //
DELIMITER ;

-- Insert Transporter
DELIMITER //
CREATE PROCEDURE SpInsertTransporter(
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_Status VARCHAR(20),
    IN p_EffectiveFrom DATE,
    IN p_EffectiveTo DATE,
    IN p_TransporterId VARCHAR(15),
    IN p_Mode VARCHAR(20),
    IN p_IsGta BOOLEAN,
    IN p_FleetSize INT,
    IN p_ServiceZones VARCHAR(500),
    IN p_ContactMobile VARCHAR(10)
)
BEGIN
    INSERT INTO Transporter (
        Code,
        Name,
        Status,
        EffectiveFrom,
        EffectiveTo,
        TransporterId,
        Mode,
        IsGta,
        FleetSize,
        ServiceZones,
        ContactMobile
    ) VALUES (
        p_Code,
        p_Name,
        p_Status,
        p_EffectiveFrom,
        p_EffectiveTo,
        p_TransporterId,
        p_Mode,
        p_IsGta,
        p_FleetSize,
        p_ServiceZones,
        p_ContactMobile
    );
    
    SELECT 
        Id, Code, Name, Status, EffectiveFrom, EffectiveTo, 
        TransporterId, Mode, IsGta, FleetSize, ServiceZones, ContactMobile, 
        CreatedAt, UpdatedAt 
    FROM Transporter 
    WHERE Id = LAST_INSERT_ID();
END //
DELIMITER ;

-- Update Transporter
DELIMITER //
CREATE PROCEDURE SpUpdateTransporter(
    IN p_Id INT,
    IN p_Name VARCHAR(150),
    IN p_Status VARCHAR(20),
    IN p_EffectiveFrom DATE,
    IN p_EffectiveTo DATE,
    IN p_TransporterId VARCHAR(15),
    IN p_Mode VARCHAR(20),
    IN p_IsGta BOOLEAN,
    IN p_FleetSize INT,
    IN p_ServiceZones VARCHAR(500),
    IN p_ContactMobile VARCHAR(10)
)
BEGIN
    UPDATE Transporter
    SET 
        Name = p_Name,
        Status = p_Status,
        EffectiveFrom = p_EffectiveFrom,
        EffectiveTo = p_EffectiveTo,
        TransporterId = p_TransporterId,
        Mode = p_Mode,
        IsGta = p_IsGta,
        FleetSize = p_FleetSize,
        ServiceZones = p_ServiceZones,
        ContactMobile = p_ContactMobile
    WHERE Id = p_Id;

    SELECT 
        Id, Code, Name, Status, EffectiveFrom, EffectiveTo, 
        TransporterId, Mode, IsGta, FleetSize, ServiceZones, ContactMobile, 
        CreatedAt, UpdatedAt 
    FROM Transporter 
    WHERE Id = p_Id;
END //
DELIMITER ;

-- Delete Transporter
DELIMITER //
CREATE PROCEDURE SpDeleteTransporter(
    IN p_Id INT
)
BEGIN
    DELETE FROM Transporter WHERE Id = p_Id;
END //
DELIMITER ;
