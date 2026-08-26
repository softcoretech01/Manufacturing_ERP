USE ERP_Packing;

CREATE TABLE IF NOT EXISTS TransporterScore (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Transporter VARCHAR(150) UNIQUE NOT NULL,
    Trips INT DEFAULT 0,
    OnTimePct DECIMAL(5,2) DEFAULT 0,
    DamagePct DECIMAL(5,2) DEFAULT 0,
    AvgTransitDays DECIMAL(5,2) DEFAULT 0,
    FreightPerKg DECIMAL(10,2) DEFAULT 0,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

CREATE TABLE IF NOT EXISTS TransporterRegDispatch (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Region VARCHAR(50) UNIQUE NOT NULL,
    Cartons INT DEFAULT 0,
    WeightKg DECIMAL(12,2) DEFAULT 0,
    Value DECIMAL(15,2) DEFAULT 0,
    OnTimePct DECIMAL(5,2) DEFAULT 0,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME
);

DELIMITER //

DROP PROCEDURE IF EXISTS SpManageTransporterAnalytics //
CREATE PROCEDURE SpManageTransporterAnalytics(
    IN p_EntityType VARCHAR(20),
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    
    -- Score fields
    IN p_Transporter VARCHAR(150),
    IN p_Trips INT,
    IN p_ScoreOnTimePct DECIMAL(5,2),
    IN p_DamagePct DECIMAL(5,2),
    IN p_AvgTransitDays DECIMAL(5,2),
    IN p_FreightPerKg DECIMAL(10,2),
    
    -- Region fields
    IN p_Region VARCHAR(50),
    IN p_Cartons INT,
    IN p_WeightKg DECIMAL(12,2),
    IN p_Value DECIMAL(15,2),
    IN p_RegOnTimePct DECIMAL(5,2),
    
    IN p_User VARCHAR(100)
)
BEGIN
    IF p_EntityType = 'SCORE' THEN
        IF p_Action = 'GET_ALL' THEN
            SELECT * FROM TransporterScore;
        ELSEIF p_Action = 'GET_BY_ID' THEN
            SELECT * FROM TransporterScore WHERE Id = p_Id;
        ELSEIF p_Action = 'CREATE' THEN
            INSERT INTO TransporterScore (
                Transporter, Trips, OnTimePct, DamagePct, AvgTransitDays, FreightPerKg, CreatedBy, CreatedDate
            ) VALUES (
                p_Transporter, p_Trips, p_ScoreOnTimePct, p_DamagePct, p_AvgTransitDays, p_FreightPerKg, p_User, NOW()
            );
            SELECT * FROM TransporterScore WHERE Id = LAST_INSERT_ID();
        ELSEIF p_Action = 'UPDATE' THEN
            UPDATE TransporterScore
            SET Transporter = COALESCE(p_Transporter, Transporter),
                Trips = COALESCE(p_Trips, Trips),
                OnTimePct = COALESCE(p_ScoreOnTimePct, OnTimePct),
                DamagePct = COALESCE(p_DamagePct, DamagePct),
                AvgTransitDays = COALESCE(p_AvgTransitDays, AvgTransitDays),
                FreightPerKg = COALESCE(p_FreightPerKg, FreightPerKg),
                ModifiedBy = p_User,
                ModifiedDate = NOW()
            WHERE Id = p_Id;
            SELECT * FROM TransporterScore WHERE Id = p_Id;
        ELSEIF p_Action = 'DELETE' THEN
            DELETE FROM TransporterScore WHERE Id = p_Id;
            SELECT p_Id AS DeletedId;
        END IF;

    ELSEIF p_EntityType = 'REGION' THEN
        IF p_Action = 'GET_ALL' THEN
            SELECT * FROM TransporterRegDispatch;
        ELSEIF p_Action = 'GET_BY_ID' THEN
            SELECT * FROM TransporterRegDispatch WHERE Id = p_Id;
        ELSEIF p_Action = 'CREATE' THEN
            INSERT INTO TransporterRegDispatch (
                Region, Cartons, WeightKg, Value, OnTimePct, CreatedBy, CreatedDate
            ) VALUES (
                p_Region, p_Cartons, p_WeightKg, p_Value, p_RegOnTimePct, p_User, NOW()
            );
            SELECT * FROM TransporterRegDispatch WHERE Id = LAST_INSERT_ID();
        ELSEIF p_Action = 'UPDATE' THEN
            UPDATE TransporterRegDispatch
            SET Region = COALESCE(p_Region, Region),
                Cartons = COALESCE(p_Cartons, Cartons),
                WeightKg = COALESCE(p_WeightKg, WeightKg),
                Value = COALESCE(p_Value, Value),
                OnTimePct = COALESCE(p_RegOnTimePct, OnTimePct),
                ModifiedBy = p_User,
                ModifiedDate = NOW()
            WHERE Id = p_Id;
            SELECT * FROM TransporterRegDispatch WHERE Id = p_Id;
        ELSEIF p_Action = 'DELETE' THEN
            DELETE FROM TransporterRegDispatch WHERE Id = p_Id;
            SELECT p_Id AS DeletedId;
        END IF;
    END IF;
END //

DELIMITER ;
