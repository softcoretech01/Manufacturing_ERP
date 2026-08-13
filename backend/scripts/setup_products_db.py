import pymysql
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

conn = pymysql.connect(
    host=os.getenv('DB_HOST', '187.127.131.38'),
    port=int(os.getenv('DB_PORT', 3308)),
    user=os.getenv('DB_USER', 'root'),
    password=os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026'),
    database='ERP_Product',
    client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
)

sql = """
DROP TABLE IF EXISTS ProductSpec;
DROP TABLE IF EXISTS Product;

CREATE TABLE Product (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    ProductCode VARCHAR(25) UNIQUE NOT NULL,
    ProductName VARCHAR(100) NOT NULL,
    ProductType VARCHAR(20) NOT NULL,
    Family VARCHAR(50),
    Brand VARCHAR(50),
    CapacityMl DECIMAL(10,2),
    Colour VARCHAR(25),
    NetWeightG DECIMAL(10,2),
    BaseUom VARCHAR(10) NOT NULL,
    Lifecycle VARCHAR(20) NOT NULL,
    Revision INT NOT NULL DEFAULT 1,
    EffectiveFrom DATE,
    StandardCost DECIMAL(12,2) DEFAULT 0.00,
    CostRolledAt DATETIME,
    Remarks VARCHAR(500),
    Version INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

CREATE TABLE ProductSpec (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    ProductId INT NOT NULL,
    MaterialGrade VARCHAR(25),
    ThicknessMm DECIMAL(10,2),
    DiameterMm DECIMAL(10,2),
    HeightMm DECIMAL(10,2),
    NeckDiameterMm DECIMAL(10,2),
    BaseDiameterMm DECIMAL(10,2),
    CapacityMl DECIMAL(10,2),
    WallThicknessMm DECIMAL(10,2),
    VacuumType VARCHAR(50),
    InsulationType VARCHAR(50),
    CoatingType VARCHAR(50),
    PaintSpec VARCHAR(50),
    SurfaceFinish VARCHAR(50),
    LogoSpec VARCHAR(50),
    PrintingMethod VARCHAR(50),
    PackagingStandard VARCHAR(100),
    FOREIGN KEY (ProductId) REFERENCES Product(Id) ON DELETE CASCADE
);

DROP PROCEDURE IF EXISTS SpManageProduct;

CREATE PROCEDURE SpManageProduct(
    IN p_Action VARCHAR(50),
    IN p_Payload JSON
)
BEGIN
    DECLARE v_Id INT;
    DECLARE v_ProductCode VARCHAR(25);
    DECLARE v_NewCodeNumber INT;
    
    IF p_Action = 'INSERT' THEN
        -- Auto-increment ProductCode (PRD-0001 format)
        SELECT IFNULL(MAX(CAST(SUBSTRING(ProductCode, 5) AS UNSIGNED)), 0) + 1 INTO v_NewCodeNumber 
        FROM Product WHERE ProductCode LIKE 'PRD-%';
        
        SET v_ProductCode = CONCAT('PRD-', LPAD(v_NewCodeNumber, 4, '0'));

        INSERT INTO Product (
            ProductCode, ProductName, ProductType, Family, Brand, CapacityMl, Colour, NetWeightG, BaseUom, Lifecycle, Revision, EffectiveFrom, StandardCost, CostRolledAt, Remarks, Version, CreatedBy, CreatedDate
        ) VALUES (
            v_ProductCode,
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.name')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productType')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.family')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.brand')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.capacityMl')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.colour')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.netWeightG')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.baseUom')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.lifecycle')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.revision')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.effectiveFrom')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.standardCost')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.costRolledAt')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.remarks')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.version')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.createdBy')),
            NOW()
        );

        SET v_Id = LAST_INSERT_ID();

        INSERT INTO ProductSpec (
            ProductId, MaterialGrade, ThicknessMm, DiameterMm, HeightMm, NeckDiameterMm, BaseDiameterMm, CapacityMl, WallThicknessMm, VacuumType, InsulationType, CoatingType, PaintSpec, SurfaceFinish, LogoSpec, PrintingMethod, PackagingStandard
        ) VALUES (
            v_Id,
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.materialGrade')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.thicknessMm')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.diameterMm')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.heightMm')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.neckDiameterMm')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.baseDiameterMm')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.capacityMl')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.wallThicknessMm')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.vacuumType')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.insulationType')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.coatingType')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.paintSpec')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.surfaceFinish')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.logoSpec')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.printingMethod')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.packagingStandard'))
        );
        
        -- Return the generated product code and Id
        SELECT v_Id AS Id, v_ProductCode AS ProductCode;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_Id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.id')) AS UNSIGNED);
        
        UPDATE Product SET
            ProductName = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.name')),
            ProductType = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.productType')),
            Family = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.family')),
            Brand = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.brand')),
            CapacityMl = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.capacityMl')), 'null'),
            Colour = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.colour')),
            NetWeightG = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.netWeightG')), 'null'),
            Lifecycle = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.lifecycle')),
            Revision = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.revision')), 'null'),
            StandardCost = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.standardCost')), 'null'),
            CostRolledAt = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.costRolledAt')), 'null'),
            Remarks = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.remarks')),
            Version = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.version')), 'null'),
            ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.modifiedBy')),
            ModifiedDate = NOW()
        WHERE Id = v_Id;
        
        UPDATE ProductSpec SET
            MaterialGrade = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.materialGrade')),
            ThicknessMm = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.thicknessMm')), 'null'),
            DiameterMm = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.diameterMm')), 'null'),
            HeightMm = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.heightMm')), 'null'),
            NeckDiameterMm = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.neckDiameterMm')), 'null'),
            BaseDiameterMm = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.baseDiameterMm')), 'null'),
            CapacityMl = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.capacityMl')), 'null'),
            WallThicknessMm = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.wallThicknessMm')), 'null'),
            VacuumType = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.vacuumType')),
            InsulationType = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.insulationType')),
            CoatingType = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.coatingType')),
            PaintSpec = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.paintSpec')),
            SurfaceFinish = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.surfaceFinish')),
            LogoSpec = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.logoSpec')),
            PrintingMethod = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.printingMethod')),
            PackagingStandard = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.spec.packagingStandard'))
        WHERE ProductId = v_Id;

    ELSEIF p_Action = 'DELETE' THEN
        SET v_Id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.id')) AS UNSIGNED);
        DELETE FROM Product WHERE Id = v_Id;
        
    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT 
            p.Id as id, p.ProductCode as code, p.ProductName as name, p.ProductType as productType,
            p.Family as family, p.Brand as brand, p.CapacityMl as capacityMl, p.Colour as colour,
            p.NetWeightG as netWeightG, p.BaseUom as baseUom, p.Lifecycle as lifecycle,
            p.Revision as revision, p.EffectiveFrom as effectiveFrom, p.StandardCost as standardCost,
            p.CostRolledAt as costRolledAt, p.Remarks as remarks, p.Version as version,
            p.CreatedBy as createdBy, p.CreatedDate as createdAt, p.ModifiedBy as modifiedBy, p.ModifiedDate as modifiedAt,
            ps.Id as spec_id, ps.MaterialGrade as spec_materialGrade, ps.ThicknessMm as spec_thicknessMm,
            ps.DiameterMm as spec_diameterMm, ps.HeightMm as spec_heightMm, ps.NeckDiameterMm as spec_neckDiameterMm,
            ps.BaseDiameterMm as spec_baseDiameterMm, ps.CapacityMl as spec_capacityMl, ps.WallThicknessMm as spec_wallThicknessMm,
            ps.VacuumType as spec_vacuumType, ps.InsulationType as spec_insulationType, ps.CoatingType as spec_coatingType,
            ps.PaintSpec as spec_paintSpec, ps.SurfaceFinish as spec_surfaceFinish, ps.LogoSpec as spec_logoSpec,
            ps.PrintingMethod as spec_printingMethod, ps.PackagingStandard as spec_packagingStandard
        FROM Product p
        LEFT JOIN ProductSpec ps ON p.Id = ps.ProductId
        ORDER BY p.CreatedDate DESC;
        
    END IF;
END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
    conn.commit()
    print("Database tables and SpManageProduct created successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
