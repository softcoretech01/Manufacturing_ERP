USE ERP_Packing;

CREATE TABLE IF NOT EXISTS LabelFormat (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) NOT NULL UNIQUE,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(255) NOT NULL,
    Kind VARCHAR(20) NOT NULL,
    Standard VARCHAR(20) NOT NULL,
    Customer VARCHAR(255) NULL,
    WidthMm DECIMAL(10,2) NOT NULL,
    HeightMm DECIMAL(10,2) NOT NULL,
    Fields TEXT NOT NULL,
    HasBarcode BOOLEAN DEFAULT FALSE,
    HasQrCode BOOLEAN DEFAULT FALSE,
    HasCustomerLogo BOOLEAN DEFAULT FALSE,
    Languages VARCHAR(500) DEFAULT 'English',
    PrintedCount INT DEFAULT 0,
    LastPrintedOn DATETIME NULL,
    IsActive BOOLEAN DEFAULT TRUE,
    IsDeleted BOOLEAN DEFAULT FALSE,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManageLabelFormat //

CREATE PROCEDURE SpManageLabelFormat(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(255),
    IN p_Kind VARCHAR(20),
    IN p_Standard VARCHAR(20),
    IN p_Customer VARCHAR(255),
    IN p_WidthMm DECIMAL(10,2),
    IN p_HeightMm DECIMAL(10,2),
    IN p_Fields TEXT,
    IN p_HasBarcode BOOLEAN,
    IN p_HasQrCode BOOLEAN,
    IN p_HasCustomerLogo BOOLEAN,
    IN p_Languages VARCHAR(500),
    IN p_PrintedCount INT,
    IN p_LastPrintedOn DATETIME,
    IN p_IsActive BOOLEAN,
    IN p_User VARCHAR(100)
)
BEGIN
    DECLARE v_DocNo VARCHAR(50);
    DECLARE v_Count INT;

    IF p_Action = 'INSERT' THEN
        -- Generate auto DocNo like LBL-XXXXX
        SELECT COUNT(*) + 1 INTO v_Count FROM LabelFormat;
        SET v_DocNo = CONCAT('LBL-', LPAD(v_Count, 5, '0'));

        INSERT INTO LabelFormat (
            DocNo, Code, Name, Kind, Standard, Customer, WidthMm, HeightMm, 
            Fields, HasBarcode, HasQrCode, HasCustomerLogo, Languages, 
            PrintedCount, LastPrintedOn, IsActive, IsDeleted,
            CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo, p_Code, p_Name, p_Kind, p_Standard, p_Customer, p_WidthMm, p_HeightMm,
            p_Fields, p_HasBarcode, p_HasQrCode, p_HasCustomerLogo, p_Languages,
            COALESCE(p_PrintedCount, 0), p_LastPrintedOn, COALESCE(p_IsActive, 1), 0,
            p_User, NOW()
        );
        
        SELECT * FROM LabelFormat WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        -- Keep the explicit CUSTOMER logic
        IF p_Standard IS NOT NULL AND p_Standard != 'CUSTOMER' THEN
            SET p_Customer = NULL;
        END IF;

        UPDATE LabelFormat
        SET 
            Code = COALESCE(p_Code, Code),
            Name = COALESCE(p_Name, Name),
            Kind = COALESCE(p_Kind, Kind),
            Standard = COALESCE(p_Standard, Standard),
            Customer = COALESCE(p_Customer, Customer),
            WidthMm = COALESCE(p_WidthMm, WidthMm),
            HeightMm = COALESCE(p_HeightMm, HeightMm),
            Fields = COALESCE(p_Fields, Fields),
            HasBarcode = COALESCE(p_HasBarcode, HasBarcode),
            HasQrCode = COALESCE(p_HasQrCode, HasQrCode),
            HasCustomerLogo = COALESCE(p_HasCustomerLogo, HasCustomerLogo),
            Languages = COALESCE(p_Languages, Languages),
            PrintedCount = COALESCE(p_PrintedCount, PrintedCount),
            LastPrintedOn = CASE WHEN p_LastPrintedOn IS NOT NULL THEN p_LastPrintedOn ELSE LastPrintedOn END,
            IsActive = COALESCE(p_IsActive, IsActive),
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id AND IsDeleted = 0;
        
        -- If p_Standard was changed to something else, make sure customer is NULL
        IF p_Standard IS NOT NULL AND p_Standard != 'CUSTOMER' THEN
            UPDATE LabelFormat SET Customer = NULL WHERE Id = p_Id AND IsDeleted = 0;
        END IF;
        
        SELECT * FROM LabelFormat WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE LabelFormat 
        SET IsDeleted = 1,
            ModifiedBy = p_User,
            ModifiedDate = NOW()
        WHERE Id = p_Id;

    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT * FROM LabelFormat WHERE IsDeleted = 0 ORDER BY Id DESC;

    ELSEIF p_Action = 'SELECT_BY_ID' THEN
        SELECT * FROM LabelFormat WHERE Id = p_Id AND IsDeleted = 0;

    END IF;
END //

DELIMITER ;
