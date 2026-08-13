-- Database: ERP_Master
DROP PROCEDURE IF EXISTS SpGetNextItemCode;
DROP PROCEDURE IF EXISTS SpItem;
DROP TABLE IF EXISTS ItemUomConversion;
DROP TABLE IF EXISTS Item;

CREATE TABLE Item (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(20) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    ShortName VARCHAR(50) NOT NULL,
    ItemType VARCHAR(30) NOT NULL,
    Category VARCHAR(100) NOT NULL,
    Family VARCHAR(100) NULL,
    Series VARCHAR(100) NULL,
    BaseUom VARCHAR(20) NOT NULL,
    PurchaseUom VARCHAR(20) NOT NULL,
    SalesUom VARCHAR(20) NOT NULL,
    HsnCode VARCHAR(20) NULL,
    GstRate DECIMAL(5,2) NOT NULL DEFAULT 0,
    
    -- Bottle Attributes
    CapacityMl INT NULL,
    BottleModel VARCHAR(100) NULL,
    Colour VARCHAR(50) NULL,
    FinishType VARCHAR(50) NULL,
    LidType VARCHAR(50) NULL,
    SteelGrade VARCHAR(50) NULL,
    ThicknessMm DECIMAL(6,2) NULL,
    IsVacuumInsulated BOOLEAN NOT NULL DEFAULT 0,
    NetWeightG DECIMAL(10,2) NULL,
    
    -- Inventory Config
    IsBatchTracked BOOLEAN NOT NULL DEFAULT 0,
    IsSerialTracked BOOLEAN NOT NULL DEFAULT 0,
    ShelfLifeDays INT NULL,
    ValuationMethod VARCHAR(20) NOT NULL,
    StandardCost DECIMAL(12,2) NOT NULL DEFAULT 0,
    LastPurchaseRate DECIMAL(12,2) NOT NULL DEFAULT 0,
    SellingPrice DECIMAL(12,2) NOT NULL DEFAULT 0,
    ReorderLevel DECIMAL(10,2) NOT NULL DEFAULT 0,
    ReorderQty DECIMAL(10,2) NOT NULL DEFAULT 0,
    MinStock DECIMAL(10,2) NOT NULL DEFAULT 0,
    MaxStock DECIMAL(10,2) NOT NULL DEFAULT 0,
    LeadTimeDays INT NOT NULL DEFAULT 0,
    
    -- Quality / Mfg
    RequiresIncomingInspection BOOLEAN NOT NULL DEFAULT 0,
    InspectionPlanCode VARCHAR(50) NULL,
    DrawingNo VARCHAR(100) NULL,
    Specification TEXT NULL,
    IsPurchased BOOLEAN NOT NULL DEFAULT 0,
    IsManufactured BOOLEAN NOT NULL DEFAULT 0,
    IsSold BOOLEAN NOT NULL DEFAULT 0,
    PreferredSupplier VARCHAR(150) NULL,
    
    Status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    EffectiveFrom DATE NULL,
    EffectiveTo DATE NULL,
    
    -- Audit fields
    IsDeleted BOOLEAN NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(100) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE ItemUomConversion (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    ItemId INT NOT NULL,
    Uom VARCHAR(20) NOT NULL,
    Factor DECIMAL(12,4) NOT NULL,
    Purpose VARCHAR(20) NOT NULL,
    FOREIGN KEY (ItemId) REFERENCES Item(Id) ON DELETE CASCADE
);

DELIMITER //

CREATE PROCEDURE SpGetNextItemCode()
BEGIN
    SELECT CONCAT('ITM-', LPAD(IFNULL(MAX(Id), 0) + 1, 4, '0')) AS nextCode FROM Item;
END //

CREATE PROCEDURE SpItem(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Code VARCHAR(20),
    IN p_Name VARCHAR(150),
    IN p_ShortName VARCHAR(50),
    IN p_ItemType VARCHAR(30),
    IN p_Category VARCHAR(100),
    IN p_Family VARCHAR(100),
    IN p_Series VARCHAR(100),
    IN p_BaseUom VARCHAR(20),
    IN p_PurchaseUom VARCHAR(20),
    IN p_SalesUom VARCHAR(20),
    IN p_HsnCode VARCHAR(20),
    IN p_GstRate DECIMAL(5,2),
    IN p_CapacityMl INT,
    IN p_BottleModel VARCHAR(100),
    IN p_Colour VARCHAR(50),
    IN p_FinishType VARCHAR(50),
    IN p_LidType VARCHAR(50),
    IN p_SteelGrade VARCHAR(50),
    IN p_ThicknessMm DECIMAL(6,2),
    IN p_IsVacuumInsulated BOOLEAN,
    IN p_NetWeightG DECIMAL(10,2),
    IN p_IsBatchTracked BOOLEAN,
    IN p_IsSerialTracked BOOLEAN,
    IN p_ShelfLifeDays INT,
    IN p_ValuationMethod VARCHAR(20),
    IN p_StandardCost DECIMAL(12,2),
    IN p_LastPurchaseRate DECIMAL(12,2),
    IN p_SellingPrice DECIMAL(12,2),
    IN p_ReorderLevel DECIMAL(10,2),
    IN p_ReorderQty DECIMAL(10,2),
    IN p_MinStock DECIMAL(10,2),
    IN p_MaxStock DECIMAL(10,2),
    IN p_LeadTimeDays INT,
    IN p_RequiresIncomingInspection BOOLEAN,
    IN p_InspectionPlanCode VARCHAR(50),
    IN p_DrawingNo VARCHAR(100),
    IN p_Specification TEXT,
    IN p_IsPurchased BOOLEAN,
    IN p_IsManufactured BOOLEAN,
    IN p_IsSold BOOLEAN,
    IN p_PreferredSupplier VARCHAR(150),
    IN p_Status VARCHAR(20),
    IN p_EffectiveFrom DATE,
    IN p_EffectiveTo DATE,
    IN p_User VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT 
            *
        FROM Item
        WHERE IsDeleted = 0
        ORDER BY Id DESC;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT 
            *
        FROM Item
        WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        IF p_Code = 'AUTO' OR p_Code IS NULL THEN
            SELECT IFNULL(MAX(Id), 0) + 1 INTO @next_id FROM Item;
            SET p_Code = CONCAT('ITM-', LPAD(@next_id, 4, '0'));
        END IF;
        
        INSERT INTO Item (
            Code, Name, ShortName, ItemType, Category, Family, Series, 
            BaseUom, PurchaseUom, SalesUom, HsnCode, GstRate, 
            CapacityMl, BottleModel, Colour, FinishType, LidType, SteelGrade, ThicknessMm, IsVacuumInsulated, NetWeightG, 
            IsBatchTracked, IsSerialTracked, ShelfLifeDays, ValuationMethod, 
            StandardCost, LastPurchaseRate, SellingPrice, ReorderLevel, ReorderQty, MinStock, MaxStock, LeadTimeDays, 
            RequiresIncomingInspection, InspectionPlanCode, DrawingNo, Specification, 
            IsPurchased, IsManufactured, IsSold, PreferredSupplier, 
            Status, EffectiveFrom, EffectiveTo, CreatedBy
        ) VALUES (
            p_Code, p_Name, p_ShortName, p_ItemType, p_Category, p_Family, p_Series, 
            p_BaseUom, p_PurchaseUom, p_SalesUom, p_HsnCode, p_GstRate, 
            p_CapacityMl, p_BottleModel, p_Colour, p_FinishType, p_LidType, p_SteelGrade, p_ThicknessMm, p_IsVacuumInsulated, p_NetWeightG, 
            p_IsBatchTracked, p_IsSerialTracked, p_ShelfLifeDays, p_ValuationMethod, 
            p_StandardCost, p_LastPurchaseRate, p_SellingPrice, p_ReorderLevel, p_ReorderQty, p_MinStock, p_MaxStock, p_LeadTimeDays, 
            p_RequiresIncomingInspection, p_InspectionPlanCode, p_DrawingNo, p_Specification, 
            p_IsPurchased, p_IsManufactured, p_IsSold, p_PreferredSupplier, 
            p_Status, p_EffectiveFrom, p_EffectiveTo, p_User
        );
        
        SELECT * FROM Item WHERE Id = LAST_INSERT_ID();
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Item 
        SET 
            Name = p_Name,
            ShortName = p_ShortName,
            ItemType = p_ItemType,
            Category = p_Category,
            Family = p_Family,
            Series = p_Series,
            BaseUom = p_BaseUom,
            PurchaseUom = p_PurchaseUom,
            SalesUom = p_SalesUom,
            HsnCode = p_HsnCode,
            GstRate = p_GstRate,
            CapacityMl = p_CapacityMl,
            BottleModel = p_BottleModel,
            Colour = p_Colour,
            FinishType = p_FinishType,
            LidType = p_LidType,
            SteelGrade = p_SteelGrade,
            ThicknessMm = p_ThicknessMm,
            IsVacuumInsulated = p_IsVacuumInsulated,
            NetWeightG = p_NetWeightG,
            IsBatchTracked = p_IsBatchTracked,
            IsSerialTracked = p_IsSerialTracked,
            ShelfLifeDays = p_ShelfLifeDays,
            ValuationMethod = p_ValuationMethod,
            StandardCost = p_StandardCost,
            LastPurchaseRate = p_LastPurchaseRate,
            SellingPrice = p_SellingPrice,
            ReorderLevel = p_ReorderLevel,
            ReorderQty = p_ReorderQty,
            MinStock = p_MinStock,
            MaxStock = p_MaxStock,
            LeadTimeDays = p_LeadTimeDays,
            RequiresIncomingInspection = p_RequiresIncomingInspection,
            InspectionPlanCode = p_InspectionPlanCode,
            DrawingNo = p_DrawingNo,
            Specification = p_Specification,
            IsPurchased = p_IsPurchased,
            IsManufactured = p_IsManufactured,
            IsSold = p_IsSold,
            PreferredSupplier = p_PreferredSupplier,
            Status = p_Status,
            EffectiveFrom = p_EffectiveFrom,
            EffectiveTo = p_EffectiveTo,
            ModifiedBy = p_User,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id AND IsDeleted = 0;
        
        SELECT * FROM Item WHERE Id = p_Id AND IsDeleted = 0;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Item 
        SET 
            IsDeleted = 1,
            ModifiedBy = p_User,
            ModifiedDate = CURRENT_TIMESTAMP
        WHERE Id = p_Id;
    END IF;
END //

DELIMITER ;
