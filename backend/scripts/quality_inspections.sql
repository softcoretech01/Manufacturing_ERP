USE ERP_Quality;

CREATE TABLE IF NOT EXISTS Inspection (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    DocNo VARCHAR(50) UNIQUE,
    Stage VARCHAR(20),
    SourceType VARCHAR(50),
    SourceDocNo VARCHAR(50),
    ItemCode VARCHAR(50),
    ItemName VARCHAR(150),
    Uom VARCHAR(20),
    BatchNo VARCHAR(50),
    SupplierCode VARCHAR(50),
    SupplierName VARCHAR(150),
    OperationCode VARCHAR(50),
    WorkCentreCode VARCHAR(50),
    MachineCode VARCHAR(50),
    Shift VARCHAR(10),
    PlanDocNo VARCHAR(50),
    PlanRevision INT,
    LotSize DECIMAL(15,3),
    SampleSize DECIMAL(15,3),
    AcceptNumber INT,
    RejectNumber INT,
    SamplingMethod VARCHAR(30),
    Aql DECIMAL(10,2),
    AcceptedQty DECIMAL(15,3),
    RejectedQty DECIMAL(15,3),
    ReworkQty DECIMAL(15,3),
    Status VARCHAR(20),
    Disposition VARCHAR(30),
    DispositionReason VARCHAR(255),
    Inspector VARCHAR(100),
    InspectedAt DATETIME,
    ApprovedBy VARCHAR(100),
    ApprovedAt DATETIME,
    NcrDocNo VARCHAR(50),
    Remarks TEXT,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    Version INT DEFAULT 1,
    DeletedAt DATETIME NULL
);

CREATE TABLE IF NOT EXISTS InspectionReading (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    InspectionId INT,
    CharacteristicId INT,
    Name VARCHAR(150),
    Type VARCHAR(30),
    Uom VARCHAR(20),
    Target DECIMAL(15,3),
    LowerLimit DECIMAL(15,3),
    UpperLimit DECIMAL(15,3),
    InstrumentCode VARCHAR(50),
    Severity VARCHAR(20),
    IsMandatory BOOLEAN,
    RequiresPhoto BOOLEAN,
    Actual DECIMAL(15,3),
    Verdict VARCHAR(20),
    PhotoAttached BOOLEAN,
    Remarks VARCHAR(255),
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    FOREIGN KEY (InspectionId) REFERENCES Inspection(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS InspectionDefect (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    InspectionId INT,
    DefectCode VARCHAR(50),
    DefectName VARCHAR(150),
    Severity VARCHAR(20),
    Qty DECIMAL(15,3),
    Source VARCHAR(100),
    Remarks VARCHAR(255),
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    FOREIGN KEY (InspectionId) REFERENCES Inspection(Id) ON DELETE CASCADE
);

DROP PROCEDURE IF EXISTS SpManageInspection;

DELIMITER //

CREATE PROCEDURE SpManageInspection(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_Stage VARCHAR(20),
    IN p_SourceType VARCHAR(50),
    IN p_SourceDocNo VARCHAR(50),
    IN p_ItemCode VARCHAR(50),
    IN p_ItemName VARCHAR(150),
    IN p_Uom VARCHAR(20),
    IN p_BatchNo VARCHAR(50),
    IN p_SupplierCode VARCHAR(50),
    IN p_SupplierName VARCHAR(150),
    IN p_OperationCode VARCHAR(50),
    IN p_WorkCentreCode VARCHAR(50),
    IN p_MachineCode VARCHAR(50),
    IN p_Shift VARCHAR(10),
    IN p_PlanDocNo VARCHAR(50),
    IN p_PlanRevision INT,
    IN p_LotSize DECIMAL(15,3),
    IN p_SampleSize DECIMAL(15,3),
    IN p_AcceptNumber INT,
    IN p_RejectNumber INT,
    IN p_SamplingMethod VARCHAR(30),
    IN p_Aql DECIMAL(10,2),
    IN p_AcceptedQty DECIMAL(15,3),
    IN p_RejectedQty DECIMAL(15,3),
    IN p_ReworkQty DECIMAL(15,3),
    IN p_Status VARCHAR(20),
    IN p_Disposition VARCHAR(30),
    IN p_DispositionReason VARCHAR(255),
    IN p_Inspector VARCHAR(100),
    IN p_InspectedAt DATETIME,
    IN p_ApprovedBy VARCHAR(100),
    IN p_ApprovedAt DATETIME,
    IN p_NcrDocNo VARCHAR(50),
    IN p_Remarks TEXT,
    IN p_User VARCHAR(100),
    IN p_ReadingsJson JSON,
    IN p_DefectsJson JSON
)
BEGIN
    DECLARE v_YearCode VARCHAR(10);
    DECLARE v_LastId INT DEFAULT 0;
    DECLARE v_NewDocNo VARCHAR(50);
    DECLARE v_Prefix VARCHAR(10);
    
    SET v_YearCode = '26-27';

    IF p_Action = 'CREATE' THEN
        SET v_Prefix = CASE 
            WHEN p_Stage = 'IQC' THEN 'IQC'
            WHEN p_Stage = 'FIRST_PIECE' THEN 'FAI'
            ELSE p_Stage
        END;

        SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(DocNo, '/', -1) AS UNSIGNED)), 0) INTO v_LastId 
        FROM Inspection 
        WHERE DocNo LIKE CONCAT(v_Prefix, '/', v_YearCode, '/%');
        
        SET v_NewDocNo = CONCAT(v_Prefix, '/', v_YearCode, '/', LPAD(v_LastId + 1, 4, '0'));

        INSERT INTO Inspection (
            DocNo, Stage, SourceType, SourceDocNo, ItemCode, ItemName, Uom, BatchNo, SupplierCode, SupplierName,
            OperationCode, WorkCentreCode, MachineCode, Shift, PlanDocNo, PlanRevision, LotSize, SampleSize,
            AcceptNumber, RejectNumber, SamplingMethod, Aql, AcceptedQty, RejectedQty, ReworkQty, Status,
            Disposition, DispositionReason, Inspector, InspectedAt, ApprovedBy, ApprovedAt, NcrDocNo, Remarks,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            v_NewDocNo, p_Stage, p_SourceType, p_SourceDocNo, p_ItemCode, p_ItemName, p_Uom, p_BatchNo, p_SupplierCode, p_SupplierName,
            p_OperationCode, p_WorkCentreCode, p_MachineCode, p_Shift, p_PlanDocNo, p_PlanRevision, p_LotSize, p_SampleSize,
            p_AcceptNumber, p_RejectNumber, p_SamplingMethod, p_Aql, p_AcceptedQty, p_RejectedQty, p_ReworkQty, p_Status,
            p_Disposition, p_DispositionReason, p_Inspector, p_InspectedAt, p_ApprovedBy, p_ApprovedAt, p_NcrDocNo, p_Remarks,
            p_User, NOW(), p_User, NOW()
        );

        SET p_Id = LAST_INSERT_ID();
        SELECT p_Id AS Id, v_NewDocNo AS DocNo;

    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Inspection SET
            Stage = COALESCE(p_Stage, Stage),
            SourceType = COALESCE(p_SourceType, SourceType),
            SourceDocNo = COALESCE(p_SourceDocNo, SourceDocNo),
            ItemCode = COALESCE(p_ItemCode, ItemCode),
            ItemName = COALESCE(p_ItemName, ItemName),
            Uom = COALESCE(p_Uom, Uom),
            BatchNo = COALESCE(p_BatchNo, BatchNo),
            SupplierCode = COALESCE(p_SupplierCode, SupplierCode),
            SupplierName = COALESCE(p_SupplierName, SupplierName),
            OperationCode = COALESCE(p_OperationCode, OperationCode),
            WorkCentreCode = COALESCE(p_WorkCentreCode, WorkCentreCode),
            MachineCode = COALESCE(p_MachineCode, MachineCode),
            Shift = COALESCE(p_Shift, Shift),
            PlanDocNo = COALESCE(p_PlanDocNo, PlanDocNo),
            PlanRevision = COALESCE(p_PlanRevision, PlanRevision),
            LotSize = COALESCE(p_LotSize, LotSize),
            SampleSize = COALESCE(p_SampleSize, SampleSize),
            AcceptNumber = COALESCE(p_AcceptNumber, AcceptNumber),
            RejectNumber = COALESCE(p_RejectNumber, RejectNumber),
            SamplingMethod = COALESCE(p_SamplingMethod, SamplingMethod),
            Aql = COALESCE(p_Aql, Aql),
            AcceptedQty = COALESCE(p_AcceptedQty, AcceptedQty),
            RejectedQty = COALESCE(p_RejectedQty, RejectedQty),
            ReworkQty = COALESCE(p_ReworkQty, ReworkQty),
            Status = COALESCE(p_Status, Status),
            Disposition = COALESCE(p_Disposition, Disposition),
            DispositionReason = COALESCE(p_DispositionReason, DispositionReason),
            Inspector = COALESCE(p_Inspector, Inspector),
            InspectedAt = COALESCE(p_InspectedAt, InspectedAt),
            ApprovedBy = COALESCE(p_ApprovedBy, ApprovedBy),
            ApprovedAt = COALESCE(p_ApprovedAt, ApprovedAt),
            NcrDocNo = COALESCE(p_NcrDocNo, NcrDocNo),
            Remarks = COALESCE(p_Remarks, Remarks),
            ModifiedBy = p_User,
            ModifiedDate = NOW(),
            Version = Version + 1
        WHERE Id = p_Id AND DeletedAt IS NULL;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Inspection SET 
            DeletedAt = NOW(), 
            ModifiedBy = p_User, 
            ModifiedDate = NOW(),
            Version = Version + 1 
        WHERE Id = p_Id AND DeletedAt IS NULL;
    END IF;

    IF p_Action IN ('CREATE', 'UPDATE') AND p_ReadingsJson IS NOT NULL THEN
        DELETE FROM InspectionReading WHERE InspectionId = p_Id;

        INSERT INTO InspectionReading (
            InspectionId, CharacteristicId, Name, Type, Uom, Target, LowerLimit, UpperLimit,
            InstrumentCode, Severity, IsMandatory, RequiresPhoto, Actual, Verdict, PhotoAttached, Remarks,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        )
        SELECT 
            p_Id,
            jt.CharacteristicId,
            jt.Name,
            jt.Type,
            jt.Uom,
            jt.Target,
            jt.LowerLimit,
            jt.UpperLimit,
            jt.InstrumentCode,
            jt.Severity,
            jt.IsMandatory,
            jt.RequiresPhoto,
            jt.Actual,
            jt.Verdict,
            jt.PhotoAttached,
            jt.Remarks,
            p_User, NOW(), p_User, NOW()
        FROM JSON_TABLE(
            p_ReadingsJson,
            '$[*]' COLUMNS (
                CharacteristicId INT PATH '$.CharacteristicId',
                Name VARCHAR(150) PATH '$.Name',
                Type VARCHAR(30) PATH '$.Type',
                Uom VARCHAR(20) PATH '$.Uom',
                Target DECIMAL(15,3) PATH '$.Target',
                LowerLimit DECIMAL(15,3) PATH '$.LowerLimit',
                UpperLimit DECIMAL(15,3) PATH '$.UpperLimit',
                InstrumentCode VARCHAR(50) PATH '$.InstrumentCode',
                Severity VARCHAR(20) PATH '$.Severity',
                IsMandatory BOOLEAN PATH '$.IsMandatory',
                RequiresPhoto BOOLEAN PATH '$.RequiresPhoto',
                Actual DECIMAL(15,3) PATH '$.Actual',
                Verdict VARCHAR(20) PATH '$.Verdict',
                PhotoAttached BOOLEAN PATH '$.PhotoAttached',
                Remarks VARCHAR(255) PATH '$.Remarks'
            )
        ) AS jt;
    END IF;
    
    IF p_Action IN ('CREATE', 'UPDATE') AND p_DefectsJson IS NOT NULL THEN
        DELETE FROM InspectionDefect WHERE InspectionId = p_Id;

        INSERT INTO InspectionDefect (
            InspectionId, DefectCode, DefectName, Severity, Qty, Source, Remarks,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        )
        SELECT 
            p_Id,
            jt.DefectCode,
            jt.DefectName,
            jt.Severity,
            jt.Qty,
            jt.Source,
            jt.Remarks,
            p_User, NOW(), p_User, NOW()
        FROM JSON_TABLE(
            p_DefectsJson,
            '$[*]' COLUMNS (
                DefectCode VARCHAR(50) PATH '$.DefectCode',
                DefectName VARCHAR(150) PATH '$.DefectName',
                Severity VARCHAR(20) PATH '$.Severity',
                Qty DECIMAL(15,3) PATH '$.Qty',
                Source VARCHAR(100) PATH '$.Source',
                Remarks VARCHAR(255) PATH '$.Remarks'
            )
        ) AS jt;
    END IF;

END //
DELIMITER ;
