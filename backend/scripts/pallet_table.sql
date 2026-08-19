USE ERP_Packing;

CREATE TABLE IF NOT EXISTS Pallet (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    Barcode VARCHAR(100),
    PalletType VARCHAR(20) NOT NULL,
    Customer VARCHAR(255) NOT NULL,
    Destination VARCHAR(255) NOT NULL,
    CartonCount INT DEFAULT 0,
    CartonCapacity INT NOT NULL,
    TotalWeightKg DECIMAL(18,3) DEFAULT 0,
    LengthMm DECIMAL(18,2) NOT NULL,
    WidthMm DECIMAL(18,2) NOT NULL,
    StackHeightMm DECIMAL(18,2) NOT NULL,
    BuiltOn DATETIME,
    BuiltBy VARCHAR(100) NOT NULL,
    Wrapped BOOLEAN DEFAULT FALSE,
    Strapped BOOLEAN DEFAULT FALSE,
    LabelPrinted BOOLEAN DEFAULT FALSE,
    ShipmentNo VARCHAR(50) NULL,
    ContainerNo VARCHAR(50) NULL,
    Status VARCHAR(20) DEFAULT 'BUILDING',
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    IsDeleted BOOLEAN DEFAULT FALSE
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManagePallet //

CREATE PROCEDURE SpManagePallet(
    IN p_Action VARCHAR(50),
    IN p_Id INT,
    IN p_Barcode VARCHAR(100),
    IN p_PalletType VARCHAR(20),
    IN p_Customer VARCHAR(255),
    IN p_Destination VARCHAR(255),
    IN p_CartonCount INT,
    IN p_CartonCapacity INT,
    IN p_TotalWeightKg DECIMAL(18,3),
    IN p_LengthMm DECIMAL(18,2),
    IN p_WidthMm DECIMAL(18,2),
    IN p_StackHeightMm DECIMAL(18,2),
    IN p_BuiltOn DATETIME,
    IN p_BuiltBy VARCHAR(100),
    IN p_Wrapped BOOLEAN,
    IN p_Strapped BOOLEAN,
    IN p_LabelPrinted BOOLEAN,
    IN p_ShipmentNo VARCHAR(50),
    IN p_ContainerNo VARCHAR(50),
    IN p_Status VARCHAR(20),
    IN p_ActionBy VARCHAR(100)
)
BEGIN
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_NextId INT;

    IF p_Action = 'INSERT' THEN
        -- Generate auto-incremented DocNo like PLT-00001
        SELECT IFNULL(MAX(Id), 0) + 1 INTO v_NextId FROM Pallet;
        SET v_DocNo = CONCAT('PLT-', LPAD(v_NextId, 5, '0'));

        INSERT INTO Pallet (
            DocNo, Barcode, PalletType, Customer, Destination, CartonCount, CartonCapacity,
            TotalWeightKg, LengthMm, WidthMm, StackHeightMm, BuiltOn, BuiltBy,
            Wrapped, Strapped, LabelPrinted, ShipmentNo, ContainerNo, Status,
            CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, IFNULL(p_Barcode, CONCAT('(00)3890123400000', LPAD(v_NextId, 4, '0'))),
            p_PalletType, p_Customer, p_Destination, p_CartonCount, p_CartonCapacity,
            p_TotalWeightKg, p_LengthMm, p_WidthMm, p_StackHeightMm, p_BuiltOn, p_BuiltBy,
            p_Wrapped, p_Strapped, p_LabelPrinted, p_ShipmentNo, p_ContainerNo, p_Status,
            p_ActionBy, NOW()
        );

        SELECT * FROM Pallet WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Pallet 
        SET 
            Barcode = IFNULL(p_Barcode, Barcode),
            PalletType = IFNULL(p_PalletType, PalletType),
            Customer = IFNULL(p_Customer, Customer),
            Destination = IFNULL(p_Destination, Destination),
            CartonCount = IFNULL(p_CartonCount, CartonCount),
            CartonCapacity = IFNULL(p_CartonCapacity, CartonCapacity),
            TotalWeightKg = IFNULL(p_TotalWeightKg, TotalWeightKg),
            LengthMm = IFNULL(p_LengthMm, LengthMm),
            WidthMm = IFNULL(p_WidthMm, WidthMm),
            StackHeightMm = IFNULL(p_StackHeightMm, StackHeightMm),
            BuiltOn = IFNULL(p_BuiltOn, BuiltOn),
            BuiltBy = IFNULL(p_BuiltBy, BuiltBy),
            Wrapped = IFNULL(p_Wrapped, Wrapped),
            Strapped = IFNULL(p_Strapped, Strapped),
            LabelPrinted = IFNULL(p_LabelPrinted, LabelPrinted),
            ShipmentNo = IFNULL(p_ShipmentNo, ShipmentNo),
            ContainerNo = IFNULL(p_ContainerNo, ContainerNo),
            Status = IFNULL(p_Status, Status),
            ModifiedBy = p_ActionBy,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND IsDeleted = FALSE;

        SELECT * FROM Pallet WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Pallet 
        SET 
            IsDeleted = TRUE,
            ModifiedBy = p_ActionBy,
            ModifiedDate = NOW()
        WHERE Id = p_Id;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT * FROM Pallet WHERE IsDeleted = FALSE ORDER BY Id DESC;

    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM Pallet WHERE Id = p_Id AND IsDeleted = FALSE;

    END IF;
END //

DELIMITER ;
