-- ============================================================
-- Bottle Model Master — Database Schema
-- Database: ERP_Master
-- ============================================================

USE ERP_Master;

-- ─────────────────────────── Table ───────────────────────────

CREATE TABLE IF NOT EXISTS BottleModel (
    Id              INT             AUTO_INCREMENT PRIMARY KEY,
    Code            VARCHAR(50)     NOT NULL,
    Name            VARCHAR(150)    NOT NULL,
    Series          VARCHAR(50)     NULL,
    ShellShape      VARCHAR(50)     NULL,
    DieSet          VARCHAR(100)    NULL,
    OdMm            DECIMAL(10,2)   NULL,
    HeightMm        DECIMAL(10,2)   NULL,
    IsVacuum        TINYINT(1)      NOT NULL DEFAULT 0,
    LaunchYear      INT             NULL,
    Status          VARCHAR(30)     NOT NULL DEFAULT 'ACTIVE',
    EffectiveFrom   DATE            NULL,
    EffectiveTo     DATE            NULL,
    Revision        INT             NOT NULL DEFAULT 1,
    UsageCount      INT             NOT NULL DEFAULT 0,
    CreatedBy       VARCHAR(100)    NOT NULL DEFAULT 'System',
    CreatedDate     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy      VARCHAR(100)    NULL,
    ModifiedDate    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    IsDeleted       TINYINT(1)      NOT NULL DEFAULT 0,
    UNIQUE KEY UQ_BottleModel_Code (Code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────── CRUD SP ────────────────────────

DROP PROCEDURE IF EXISTS SpBottleModel;

DELIMITER $$
CREATE PROCEDURE SpBottleModel(
    IN p_Action         VARCHAR(10),
    IN p_Id             INT,
    IN p_Code           VARCHAR(50),
    IN p_Name           VARCHAR(150),
    IN p_Series         VARCHAR(50),
    IN p_ShellShape     VARCHAR(50),
    IN p_DieSet         VARCHAR(100),
    IN p_OdMm           DECIMAL(10,2),
    IN p_HeightMm       DECIMAL(10,2),
    IN p_IsVacuum       TINYINT(1),
    IN p_LaunchYear     INT,
    IN p_Status         VARCHAR(30),
    IN p_EffectiveFrom  DATE,
    IN p_EffectiveTo    DATE,
    IN p_Revision       INT,
    IN p_ModifiedBy     VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT Id, Code, Name, Series, ShellShape, DieSet, OdMm, HeightMm,
               IsVacuum, LaunchYear, Status, EffectiveFrom, EffectiveTo,
               Revision, UsageCount, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleModel
        WHERE IsDeleted = 0
        ORDER BY Id DESC;

    ELSEIF p_Action = 'READ' THEN
        SELECT Id, Code, Name, Series, ShellShape, DieSet, OdMm, HeightMm,
               IsVacuum, LaunchYear, Status, EffectiveFrom, EffectiveTo,
               Revision, UsageCount, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleModel
        WHERE Id = p_Id AND IsDeleted = 0;

    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO BottleModel (
            Code, Name, Series, ShellShape, DieSet, OdMm, HeightMm,
            IsVacuum, LaunchYear, Status, EffectiveFrom, EffectiveTo,
            Revision, CreatedBy, ModifiedBy
        ) VALUES (
            p_Code, p_Name, p_Series, p_ShellShape, p_DieSet, p_OdMm, p_HeightMm,
            COALESCE(p_IsVacuum, 0), p_LaunchYear, COALESCE(p_Status, 'ACTIVE'),
            p_EffectiveFrom, p_EffectiveTo,
            COALESCE(p_Revision, 1), p_ModifiedBy, p_ModifiedBy
        );
        -- Return the newly created record
        SELECT Id, Code, Name, Series, ShellShape, DieSet, OdMm, HeightMm,
               IsVacuum, LaunchYear, Status, EffectiveFrom, EffectiveTo,
               Revision, UsageCount, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleModel
        WHERE Id = LAST_INSERT_ID();

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE BottleModel SET
            Name          = COALESCE(p_Name, Name),
            Series        = COALESCE(p_Series, Series),
            ShellShape    = COALESCE(p_ShellShape, ShellShape),
            DieSet        = COALESCE(p_DieSet, DieSet),
            OdMm          = COALESCE(p_OdMm, OdMm),
            HeightMm      = COALESCE(p_HeightMm, HeightMm),
            IsVacuum      = COALESCE(p_IsVacuum, IsVacuum),
            LaunchYear    = COALESCE(p_LaunchYear, LaunchYear),
            Status        = COALESCE(p_Status, Status),
            EffectiveFrom = COALESCE(p_EffectiveFrom, EffectiveFrom),
            EffectiveTo   = COALESCE(p_EffectiveTo, EffectiveTo),
            Revision      = COALESCE(p_Revision, Revision),
            ModifiedBy    = p_ModifiedBy
        WHERE Id = p_Id AND IsDeleted = 0;
        -- Return the updated record
        SELECT Id, Code, Name, Series, ShellShape, DieSet, OdMm, HeightMm,
               IsVacuum, LaunchYear, Status, EffectiveFrom, EffectiveTo,
               Revision, UsageCount, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM BottleModel
        WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE BottleModel SET
            IsDeleted  = 1,
            ModifiedBy = p_ModifiedBy
        WHERE Id = p_Id AND IsDeleted = 0;

    END IF;
END$$
DELIMITER ;

-- ──────────────────── Next Code SP ──────────────────────────

DROP PROCEDURE IF EXISTS SpGetNextBottleModelCode;

DELIMITER $$
CREATE PROCEDURE SpGetNextBottleModelCode()
BEGIN
    DECLARE v_MaxNum INT DEFAULT 0;

    SELECT COALESCE(MAX(CAST(SUBSTRING(Code, 5) AS UNSIGNED)), 0)
    INTO v_MaxNum
    FROM BottleModel
    WHERE Code REGEXP '^MDL-[0-9]+$';

    SET v_MaxNum = v_MaxNum + 1;
    SELECT CONCAT('MDL-', LPAD(v_MaxNum, 4, '0')) AS NextCode;
END$$
DELIMITER ;
