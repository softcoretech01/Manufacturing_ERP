USE ERP_Quality;

DROP PROCEDURE IF EXISTS SpManageCalibration;

DELIMITER //

CREATE PROCEDURE SpManageCalibration(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Name VARCHAR(100),
    IN p_InstrumentType VARCHAR(100),
    IN p_Make VARCHAR(100),
    IN p_SerialNo VARCHAR(100),
    IN p_RangeVal VARCHAR(100),
    IN p_LeastCount VARCHAR(100),
    IN p_Location VARCHAR(100),
    IN p_Custodian VARCHAR(100),
    IN p_CalibrationFrequencyDays INT,
    IN p_LastCalibratedOn DATE,
    IN p_NextDueOn DATE,
    IN p_Agency VARCHAR(100),
    IN p_CertificateNo VARCHAR(100),
    IN p_ObservedErrorPct DECIMAL(5,2),
    IN p_PermittedErrorPct DECIMAL(5,2),
    IN p_Status VARCHAR(50),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100),
    OUT p_Code VARCHAR(50)
)
BEGIN
    DECLARE v_NextId INT;
    DECLARE v_GeneratedCode VARCHAR(50);

    SET p_Code = NULL;

    IF p_Action = 'CREATE' THEN
        SELECT COALESCE(MAX(Id), 0) + 1 INTO v_NextId FROM Calibration;
        SET v_GeneratedCode = CONCAT('CAL-', LPAD(v_NextId, 3, '0'));

        INSERT INTO Calibration (
            Code, Name, InstrumentType, Make, SerialNo, RangeVal, LeastCount, Location, Custodian,
            CalibrationFrequencyDays, LastCalibratedOn, NextDueOn, Agency, CertificateNo,
            ObservedErrorPct, PermittedErrorPct, Status, Remarks, Version,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            v_GeneratedCode, p_Name, p_InstrumentType, p_Make, p_SerialNo, p_RangeVal, p_LeastCount, p_Location, p_Custodian,
            p_CalibrationFrequencyDays, p_LastCalibratedOn, p_NextDueOn, p_Agency, p_CertificateNo,
            p_ObservedErrorPct, p_PermittedErrorPct, COALESCE(p_Status, 'VALID'), p_Remarks, 1,
            p_User, NOW(), p_User, NOW()
        );

        SET p_Code = v_GeneratedCode;

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Calibration SET
            Name = COALESCE(p_Name, Name),
            InstrumentType = COALESCE(p_InstrumentType, InstrumentType),
            Make = COALESCE(p_Make, Make),
            SerialNo = COALESCE(p_SerialNo, SerialNo),
            RangeVal = COALESCE(p_RangeVal, RangeVal),
            LeastCount = COALESCE(p_LeastCount, LeastCount),
            Location = COALESCE(p_Location, Location),
            Custodian = COALESCE(p_Custodian, Custodian),
            CalibrationFrequencyDays = COALESCE(p_CalibrationFrequencyDays, CalibrationFrequencyDays),
            LastCalibratedOn = COALESCE(p_LastCalibratedOn, LastCalibratedOn),
            NextDueOn = COALESCE(p_NextDueOn, NextDueOn),
            Agency = COALESCE(p_Agency, Agency),
            CertificateNo = COALESCE(p_CertificateNo, CertificateNo),
            ObservedErrorPct = COALESCE(p_ObservedErrorPct, ObservedErrorPct),
            PermittedErrorPct = COALESCE(p_PermittedErrorPct, PermittedErrorPct),
            Status = COALESCE(p_Status, Status),
            Remarks = COALESCE(p_Remarks, Remarks),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;

        SELECT Code INTO p_Code FROM Calibration WHERE Id = p_Id;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Calibration SET
            DeletedAt = NOW(),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

END //
DELIMITER ;
