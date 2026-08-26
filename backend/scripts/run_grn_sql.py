import pymysql
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

db_host = os.getenv('DB_HOST', '187.127.131.38')
db_port = int(os.getenv('DB_PORT', 3308))
db_user = os.getenv('DB_USER', 'root')
db_password = os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026')
db_name = 'ERP_Procurement'

def run():
    print(f"Connecting to MySQL ({db_host}:{db_port})...")
    conn = pymysql.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        database=db_name,
        client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
    )
    cursor = conn.cursor()

    tables_sql = """
        CREATE TABLE IF NOT EXISTS Grn (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            DocNo VARCHAR(100) NOT NULL UNIQUE,
            DocDate DATE NOT NULL,
            Status VARCHAR(50) NOT NULL,
            PoNo VARCHAR(100) NOT NULL,
            AsnNo VARCHAR(100) NULL,
            SupplierUid VARCHAR(100) NOT NULL,
            SupplierName VARCHAR(200) NOT NULL,
            Warehouse VARCHAR(200) NOT NULL,
            GateEntryNo VARCHAR(100) NOT NULL,
            GateEntryAt DATETIME NOT NULL,
            InvoiceNo VARCHAR(50) NOT NULL,
            InvoiceDate DATE NOT NULL,
            InvoiceValue DECIMAL(15, 2) NOT NULL DEFAULT 0,
            VehicleNo VARCHAR(20) NOT NULL,
            LrNo VARCHAR(100) NULL,
            ReceivedBy VARCHAR(100) NOT NULL,
            QcStatus VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            TotalReceived DECIMAL(15, 2) NOT NULL DEFAULT 0,
            TotalAccepted DECIMAL(15, 2) NOT NULL DEFAULT 0,
            TotalRejected DECIMAL(15, 2) NOT NULL DEFAULT 0,
            GrnValue DECIMAL(15, 2) NOT NULL DEFAULT 0,
            DelayDays INT NOT NULL DEFAULT 0,
            Version INT NOT NULL DEFAULT 1,
            Attachments INT NOT NULL DEFAULT 0,
            Comments INT NOT NULL DEFAULT 0,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL
        );

        CREATE TABLE IF NOT EXISTS GrnLine (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            GrnId INT NOT NULL,
            ItemCode VARCHAR(100) NOT NULL,
            ItemName VARCHAR(200) NOT NULL,
            Uom VARCHAR(50) NOT NULL,
            PoQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            ChallanQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            ReceivedQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            AcceptedQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            RejectedQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            ShortQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            ExcessQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            Rate DECIMAL(15, 4) NOT NULL DEFAULT 0,
            BatchNo VARCHAR(100) NULL,
            HeatNo VARCHAR(100) NULL,
            MfgDate DATE NULL,
            ExpiryDate DATE NULL,
            BinCode VARCHAR(50) NULL,
            QcStatus VARCHAR(50) NOT NULL DEFAULT 'NOT_REQUIRED',
            RejectionReason VARCHAR(500) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (GrnId) REFERENCES Grn(Id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS GrnApproval (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            GrnId INT NOT NULL,
            Level INT NOT NULL,
            Role VARCHAR(100) NOT NULL,
            Approver VARCHAR(100) NOT NULL,
            Status VARCHAR(50) NOT NULL,
            ActedAt DATETIME NULL,
            Remarks VARCHAR(500) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (GrnId) REFERENCES Grn(Id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS IncomingInspection (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            DocNo VARCHAR(100) NOT NULL UNIQUE,
            DocDate DATE NOT NULL,
            GrnNo VARCHAR(100) NOT NULL,
            PoNo VARCHAR(100) NOT NULL,
            SupplierUid VARCHAR(100) NOT NULL,
            SupplierName VARCHAR(200) NOT NULL,
            ItemCode VARCHAR(100) NOT NULL,
            ItemName VARCHAR(200) NOT NULL,
            BatchNo VARCHAR(100) NULL,
            HeatNo VARCHAR(100) NULL,
            LotQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            SampleSize DECIMAL(15, 2) NOT NULL DEFAULT 0,
            SamplingPlan VARCHAR(100) NULL,
            Aql VARCHAR(50) NULL,
            InspectedBy VARCHAR(100) NOT NULL,
            Status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            AcceptedQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            RejectedQty DECIMAL(15, 2) NOT NULL DEFAULT 0,
            DefectsFound INT NOT NULL DEFAULT 0,
            MtcReceived BOOLEAN NOT NULL DEFAULT FALSE,
            MtcVerified BOOLEAN NOT NULL DEFAULT FALSE,
            NcrNo VARCHAR(100) NULL,
            DeviationApprovedBy VARCHAR(100) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL
        );

        CREATE TABLE IF NOT EXISTS IncomingInspectionParameter (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            IncomingInspectionId INT NOT NULL,
            Name VARCHAR(200) NOT NULL,
            Method VARCHAR(200) NULL,
            Spec VARCHAR(200) NULL,
            Observed VARCHAR(200) NULL,
            Result VARCHAR(50) NOT NULL,
            Critical BOOLEAN NOT NULL DEFAULT FALSE,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (IncomingInspectionId) REFERENCES IncomingInspection(Id) ON DELETE CASCADE
        );
    """
    cursor.execute(tables_sql)


    print("Tables validated/created.")

    sp_grn_sql = """
        DROP PROCEDURE IF EXISTS SpManageGrn;
        CREATE PROCEDURE SpManageGrn (
            IN p_Action VARCHAR(20),
            IN p_Id INT,
            IN p_JsonPayload JSON
        )
        proc_label:BEGIN
            DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;
            DECLARE v_CreatedBy VARCHAR(100);
            DECLARE v_ModifiedBy VARCHAR(100);
            DECLARE v_NewId INT;

            IF p_Action = 'CREATE' THEN
                SET v_CreatedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy')), 'System');
                
                INSERT INTO Grn (
                    DocNo, DocDate, Status, PoNo, AsnNo, SupplierUid, SupplierName, Warehouse, 
                    GateEntryNo, GateEntryAt, InvoiceNo, InvoiceDate, InvoiceValue, VehicleNo, LrNo, ReceivedBy, 
                    QcStatus, TotalReceived, TotalAccepted, TotalRejected, GrnValue, DelayDays, Version, 
                    Attachments, Comments, CreatedBy, CreatedDate
                ) VALUES (
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.asnNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.warehouse')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.gateEntryNo')),
                    REPLACE(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.gateEntryAt')), 'T', ' '), 'Z', ''),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.invoiceNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.invoiceDate')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.invoiceValue')), 0),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.vehicleNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.lrNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.receivedBy')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.qcStatus')), 'PENDING'),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalReceived')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalAccepted')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalRejected')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.grnValue')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.delayDays')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), 1),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
                    v_CreatedBy,
                    v_CurrentDate
                );

                SET v_NewId = LAST_INSERT_ID();

                IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
                    INSERT INTO GrnLine (
                        GrnId, ItemCode, ItemName, Uom, PoQty, ChallanQty, ReceivedQty, AcceptedQty,
                        RejectedQty, ShortQty, ExcessQty, Rate, BatchNo, HeatNo, MfgDate, ExpiryDate, 
                        BinCode, QcStatus, RejectionReason, CreatedBy, CreatedDate
                    )
                    SELECT 
                        v_NewId, itemCode, itemName, uom, poQty, challanQty, receivedQty, acceptedQty,
                        rejectedQty, shortQty, excessQty, rate, batchNo, heatNo, 
                        NULLIF(mfgDate, 'null'), NULLIF(expiryDate, 'null'), 
                        binCode, qcStatus, rejectionReason, v_CreatedBy, v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.lines[*]' COLUMNS (
                            itemCode VARCHAR(100) PATH '$.itemCode',
                            itemName VARCHAR(200) PATH '$.itemName',
                            uom VARCHAR(50) PATH '$.uom',
                            poQty DECIMAL(15,2) PATH '$.poQty',
                            challanQty DECIMAL(15,2) PATH '$.challanQty',
                            receivedQty DECIMAL(15,2) PATH '$.receivedQty',
                            acceptedQty DECIMAL(15,2) PATH '$.acceptedQty',
                            rejectedQty DECIMAL(15,2) PATH '$.rejectedQty',
                            shortQty DECIMAL(15,2) PATH '$.shortQty',
                            excessQty DECIMAL(15,2) PATH '$.excessQty',
                            rate DECIMAL(15,4) PATH '$.rate',
                            batchNo VARCHAR(100) PATH '$.batchNo',
                            heatNo VARCHAR(100) PATH '$.heatNo',
                            mfgDate VARCHAR(50) PATH '$.mfgDate',
                            expiryDate VARCHAR(50) PATH '$.expiryDate',
                            binCode VARCHAR(50) PATH '$.binCode',
                            qcStatus VARCHAR(50) PATH '$.qcStatus',
                            rejectionReason VARCHAR(500) PATH '$.rejectionReason'
                        )
                    ) AS jt;
                END IF;

                IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.approvals')) > 0 THEN
                    INSERT INTO GrnApproval (
                        GrnId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
                    )
                    SELECT 
                        v_NewId, level, role, approver, status, 
                        NULLIF(REPLACE(REPLACE(actedAt, 'T', ' '), 'Z', ''), 'null'), 
                        remarks, v_CreatedBy, v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.approvals[*]' COLUMNS (
                            level INT PATH '$.level',
                            role VARCHAR(100) PATH '$.role',
                            approver VARCHAR(100) PATH '$.approver',
                            status VARCHAR(50) PATH '$.status',
                            actedAt VARCHAR(50) PATH '$.actedAt',
                            remarks VARCHAR(500) PATH '$.remarks'
                        )
                    ) AS jt;
                END IF;

                SELECT JSON_OBJECT('uid', v_NewId) AS Result;
            
            ELSEIF p_Action = 'READ' THEN
                SELECT JSON_OBJECT(
                    'uid', g.Id,
                    'docNo', g.DocNo,
                    'docDate', g.DocDate,
                    'status', g.Status,
                    'poNo', g.PoNo,
                    'asnNo', g.AsnNo,
                    'supplierUid', g.SupplierUid,
                    'supplierName', g.SupplierName,
                    'warehouse', g.Warehouse,
                    'gateEntryNo', g.GateEntryNo,
                    'gateEntryAt', g.GateEntryAt,
                    'invoiceNo', g.InvoiceNo,
                    'invoiceDate', g.InvoiceDate,
                    'invoiceValue', g.InvoiceValue,
                    'vehicleNo', g.VehicleNo,
                    'lrNo', g.LrNo,
                    'receivedBy', g.ReceivedBy,
                    'qcStatus', g.QcStatus,
                    'totalReceived', g.TotalReceived,
                    'totalAccepted', g.TotalAccepted,
                    'totalRejected', g.TotalRejected,
                    'grnValue', g.GrnValue,
                    'delayDays', g.DelayDays,
                    'version', g.Version,
                    'attachments', g.Attachments,
                    'comments', g.Comments,
                    'createdBy', g.CreatedBy,
                    'createdAt', g.CreatedDate,
                    'lines', IFNULL((
                        SELECT JSON_ARRAYAGG(JSON_OBJECT(
                            'uid', gl.Id,
                            'itemCode', gl.ItemCode,
                            'itemName', gl.ItemName,
                            'uom', gl.Uom,
                            'poQty', gl.PoQty,
                            'challanQty', gl.ChallanQty,
                            'receivedQty', gl.ReceivedQty,
                            'acceptedQty', gl.AcceptedQty,
                            'rejectedQty', gl.RejectedQty,
                            'shortQty', gl.ShortQty,
                            'excessQty', gl.ExcessQty,
                            'rate', gl.Rate,
                            'batchNo', gl.BatchNo,
                            'heatNo', gl.HeatNo,
                            'mfgDate', gl.MfgDate,
                            'expiryDate', gl.ExpiryDate,
                            'binCode', gl.BinCode,
                            'qcStatus', gl.QcStatus,
                            'rejectionReason', gl.RejectionReason
                        )) FROM GrnLine gl WHERE gl.GrnId = g.Id
                    ), JSON_ARRAY()),
                    'approvals', IFNULL((
                        SELECT JSON_ARRAYAGG(JSON_OBJECT(
                            'level', ga.Level,
                            'role', ga.Role,
                            'approver', ga.Approver,
                            'status', ga.Status,
                            'actedAt', ga.ActedAt,
                            'remarks', ga.Remarks
                        )) FROM GrnApproval ga WHERE ga.GrnId = g.Id
                    ), JSON_ARRAY())
                ) AS Result
                FROM Grn g
                WHERE g.Id = p_Id;

            ELSEIF p_Action = 'READ_ALL' THEN
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'uid', g.Id,
                        'docNo', g.DocNo,
                        'docDate', g.DocDate,
                        'status', g.Status,
                        'poNo', g.PoNo,
                        'asnNo', g.AsnNo,
                        'supplierUid', g.SupplierUid,
                        'supplierName', g.SupplierName,
                        'warehouse', g.Warehouse,
                        'gateEntryNo', g.GateEntryNo,
                        'gateEntryAt', g.GateEntryAt,
                        'invoiceNo', g.InvoiceNo,
                        'invoiceDate', g.InvoiceDate,
                        'invoiceValue', g.InvoiceValue,
                        'vehicleNo', g.VehicleNo,
                        'lrNo', g.LrNo,
                        'receivedBy', g.ReceivedBy,
                        'qcStatus', g.QcStatus,
                        'totalReceived', g.TotalReceived,
                        'totalAccepted', g.TotalAccepted,
                        'totalRejected', g.TotalRejected,
                        'grnValue', g.GrnValue,
                        'delayDays', g.DelayDays,
                        'version', g.Version,
                        'attachments', g.Attachments,
                        'comments', g.Comments,
                        'createdBy', g.CreatedBy,
                        'createdAt', g.CreatedDate,
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'uid', gl.Id,
                                'itemCode', gl.ItemCode,
                                'itemName', gl.ItemName,
                                'uom', gl.Uom,
                                'poQty', gl.PoQty,
                                'challanQty', gl.ChallanQty,
                                'receivedQty', gl.ReceivedQty,
                                'acceptedQty', gl.AcceptedQty,
                                'rejectedQty', gl.RejectedQty,
                                'shortQty', gl.ShortQty,
                                'excessQty', gl.ExcessQty,
                                'rate', gl.Rate,
                                'batchNo', gl.BatchNo,
                                'heatNo', gl.HeatNo,
                                'mfgDate', gl.MfgDate,
                                'expiryDate', gl.ExpiryDate,
                                'binCode', gl.BinCode,
                                'qcStatus', gl.QcStatus,
                                'rejectionReason', gl.RejectionReason
                            )) FROM GrnLine gl WHERE gl.GrnId = g.Id
                        ), JSON_ARRAY()),
                        'approvals', IFNULL((
                            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'level', ga.Level,
                                'role', ga.Role,
                                'approver', ga.Approver,
                                'status', ga.Status,
                                'actedAt', ga.ActedAt,
                                'remarks', ga.Remarks
                            )) FROM GrnApproval ga WHERE ga.GrnId = g.Id
                        ), JSON_ARRAY())
                    )
                ) AS Result
                FROM Grn g
                ORDER BY g.Id DESC;

            ELSEIF p_Action = 'UPDATE' THEN
                SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System');
                
                UPDATE Grn 
                SET Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
                    InvoiceNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.invoiceNo')), InvoiceNo),
                    InvoiceDate = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.invoiceDate')), InvoiceDate),
                    InvoiceValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.invoiceValue')), InvoiceValue),
                    VehicleNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.vehicleNo')), VehicleNo),
                    LrNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.lrNo')), LrNo),
                    ReceivedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.receivedBy')), ReceivedBy),
                    QcStatus = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.qcStatus')), QcStatus),
                    TotalReceived = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalReceived')), TotalReceived),
                    TotalAccepted = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalAccepted')), TotalAccepted),
                    TotalRejected = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalRejected')), TotalRejected),
                    GrnValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.grnValue')), GrnValue),
                    DelayDays = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.delayDays')), DelayDays),
                    Version = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), Version),
                    ModifiedBy = v_ModifiedBy,
                    ModifiedDate = v_CurrentDate
                WHERE Id = p_Id;

                -- Replace Lines
                DELETE FROM GrnLine WHERE GrnId = p_Id;
                IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
                    INSERT INTO GrnLine (
                        GrnId, ItemCode, ItemName, Uom, PoQty, ChallanQty, ReceivedQty, AcceptedQty,
                        RejectedQty, ShortQty, ExcessQty, Rate, BatchNo, HeatNo, MfgDate, ExpiryDate, 
                        BinCode, QcStatus, RejectionReason, CreatedBy, CreatedDate
                    )
                    SELECT 
                        p_Id, itemCode, itemName, uom, poQty, challanQty, receivedQty, acceptedQty,
                        rejectedQty, shortQty, excessQty, rate, batchNo, heatNo, 
                        NULLIF(mfgDate, 'null'), NULLIF(expiryDate, 'null'), 
                        binCode, qcStatus, rejectionReason, v_ModifiedBy, v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.lines[*]' COLUMNS (
                            itemCode VARCHAR(100) PATH '$.itemCode',
                            itemName VARCHAR(200) PATH '$.itemName',
                            uom VARCHAR(50) PATH '$.uom',
                            poQty DECIMAL(15,2) PATH '$.poQty',
                            challanQty DECIMAL(15,2) PATH '$.challanQty',
                            receivedQty DECIMAL(15,2) PATH '$.receivedQty',
                            acceptedQty DECIMAL(15,2) PATH '$.acceptedQty',
                            rejectedQty DECIMAL(15,2) PATH '$.rejectedQty',
                            shortQty DECIMAL(15,2) PATH '$.shortQty',
                            excessQty DECIMAL(15,2) PATH '$.excessQty',
                            rate DECIMAL(15,4) PATH '$.rate',
                            batchNo VARCHAR(100) PATH '$.batchNo',
                            heatNo VARCHAR(100) PATH '$.heatNo',
                            mfgDate VARCHAR(50) PATH '$.mfgDate',
                            expiryDate VARCHAR(50) PATH '$.expiryDate',
                            binCode VARCHAR(50) PATH '$.binCode',
                            qcStatus VARCHAR(50) PATH '$.qcStatus',
                            rejectionReason VARCHAR(500) PATH '$.rejectionReason'
                        )
                    ) AS jt;
                END IF;

                -- Replace Approvals
                DELETE FROM GrnApproval WHERE GrnId = p_Id;
                IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.approvals')) > 0 THEN
                    INSERT INTO GrnApproval (
                        GrnId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
                    )
                    SELECT 
                        p_Id, level, role, approver, status, 
                        NULLIF(REPLACE(REPLACE(actedAt, 'T', ' '), 'Z', ''), 'null'), 
                        remarks, v_ModifiedBy, v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.approvals[*]' COLUMNS (
                            level INT PATH '$.level',
                            role VARCHAR(100) PATH '$.role',
                            approver VARCHAR(100) PATH '$.approver',
                            status VARCHAR(50) PATH '$.status',
                            actedAt VARCHAR(50) PATH '$.actedAt',
                            remarks VARCHAR(500) PATH '$.remarks'
                        )
                    ) AS jt;
                END IF;

                SELECT JSON_OBJECT('uid', p_Id) AS Result;

            ELSEIF p_Action = 'DELETE' THEN
                DELETE FROM Grn WHERE Id = p_Id;
                SELECT JSON_OBJECT('success', true) AS Result;
            END IF;
        END //
    """

    cursor.execute(sp_grn_sql.replace('//', ''))
    print("SpManageGrn created.")
    
    sp_iqc_sql = """
        DROP PROCEDURE IF EXISTS SpManageIqc;
        CREATE PROCEDURE SpManageIqc (
            IN p_Action VARCHAR(20),
            IN p_Id INT,
            IN p_JsonPayload JSON
        )
        proc_label:BEGIN
            DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;
            DECLARE v_CreatedBy VARCHAR(100);
            DECLARE v_ModifiedBy VARCHAR(100);
            DECLARE v_NewId INT;

            IF p_Action = 'CREATE' THEN
                SET v_CreatedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy')), 'System');
                
                INSERT INTO IncomingInspection (
                    DocNo, DocDate, GrnNo, PoNo, SupplierUid, SupplierName, ItemCode, ItemName, 
                    BatchNo, HeatNo, LotQty, SampleSize, SamplingPlan, Aql, InspectedBy, 
                    Status, AcceptedQty, RejectedQty, DefectsFound, MtcReceived, MtcVerified, 
                    NcrNo, DeviationApprovedBy, CreatedBy, CreatedDate
                ) VALUES (
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.grnNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.itemCode')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.itemName')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.batchNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.heatNo')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.lotQty')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.sampleSize')), 0),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.samplingPlan')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.aql')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.inspectedBy')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), 'PENDING'),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.acceptedQty')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rejectedQty')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.defectsFound')), 0),
                    IF(JSON_EXTRACT(p_JsonPayload, '$.mtcReceived') = true, 1, 0),
                    IF(JSON_EXTRACT(p_JsonPayload, '$.mtcVerified') = true, 1, 0),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.ncrNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deviationApprovedBy')),
                    v_CreatedBy,
                    v_CurrentDate
                );

                SET v_NewId = LAST_INSERT_ID();

                IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.parameters')) > 0 THEN
                    INSERT INTO IncomingInspectionParameter (
                        IncomingInspectionId, Name, Method, Spec, Observed, Result, Critical, CreatedBy, CreatedDate
                    )
                    SELECT 
                        v_NewId, name, method, spec, observed, result, IF(critical = true, 1, 0), v_CreatedBy, v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.parameters[*]' COLUMNS (
                            name VARCHAR(200) PATH '$.name',
                            method VARCHAR(200) PATH '$.method',
                            spec VARCHAR(200) PATH '$.spec',
                            observed VARCHAR(200) PATH '$.observed',
                            result VARCHAR(50) PATH '$.result',
                            critical BOOLEAN PATH '$.critical'
                        )
                    ) AS jt;
                END IF;

                SELECT JSON_OBJECT('uid', v_NewId) AS Result;
            
            ELSEIF p_Action = 'READ' THEN
                SELECT JSON_OBJECT(
                    'uid', i.Id,
                    'docNo', i.DocNo,
                    'docDate', i.DocDate,
                    'grnNo', i.GrnNo,
                    'poNo', i.PoNo,
                    'supplierUid', i.SupplierUid,
                    'supplierName', i.SupplierName,
                    'itemCode', i.ItemCode,
                    'itemName', i.ItemName,
                    'batchNo', i.BatchNo,
                    'heatNo', i.HeatNo,
                    'lotQty', i.LotQty,
                    'sampleSize', i.SampleSize,
                    'samplingPlan', i.SamplingPlan,
                    'aql', i.Aql,
                    'inspectedBy', i.InspectedBy,
                    'status', i.Status,
                    'acceptedQty', i.AcceptedQty,
                    'rejectedQty', i.RejectedQty,
                    'defectsFound', i.DefectsFound,
                    'mtcReceived', i.MtcReceived = 1,
                    'mtcVerified', i.MtcVerified = 1,
                    'ncrNo', i.NcrNo,
                    'deviationApprovedBy', i.DeviationApprovedBy,
                    'createdBy', i.CreatedBy,
                    'createdAt', i.CreatedDate,
                    'parameters', IFNULL((
                        SELECT JSON_ARRAYAGG(JSON_OBJECT(
                            'uid', p.Id,
                            'name', p.Name,
                            'method', p.Method,
                            'spec', p.Spec,
                            'observed', p.Observed,
                            'result', p.Result,
                            'critical', p.Critical = 1
                        )) FROM IncomingInspectionParameter p WHERE p.IncomingInspectionId = i.Id
                    ), JSON_ARRAY())
                ) AS Result
                FROM IncomingInspection i
                WHERE i.Id = p_Id;

            ELSEIF p_Action = 'READ_ALL' THEN
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'uid', i.Id,
                        'docNo', i.DocNo,
                        'docDate', i.DocDate,
                        'grnNo', i.GrnNo,
                        'poNo', i.PoNo,
                        'supplierUid', i.SupplierUid,
                        'supplierName', i.SupplierName,
                        'itemCode', i.ItemCode,
                        'itemName', i.ItemName,
                        'batchNo', i.BatchNo,
                        'heatNo', i.HeatNo,
                        'lotQty', i.LotQty,
                        'sampleSize', i.SampleSize,
                        'samplingPlan', i.SamplingPlan,
                        'aql', i.Aql,
                        'inspectedBy', i.InspectedBy,
                        'status', i.Status,
                        'acceptedQty', i.AcceptedQty,
                        'rejectedQty', i.RejectedQty,
                        'defectsFound', i.DefectsFound,
                        'mtcReceived', i.MtcReceived = 1,
                        'mtcVerified', i.MtcVerified = 1,
                        'ncrNo', i.NcrNo,
                        'deviationApprovedBy', i.DeviationApprovedBy,
                        'createdBy', i.CreatedBy,
                        'createdAt', i.CreatedDate,
                        'parameters', IFNULL((
                            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'uid', p.Id,
                                'name', p.Name,
                                'method', p.Method,
                                'spec', p.Spec,
                                'observed', p.Observed,
                                'result', p.Result,
                                'critical', p.Critical = 1
                            )) FROM IncomingInspectionParameter p WHERE p.IncomingInspectionId = i.Id
                        ), JSON_ARRAY())
                    )
                ) AS Result
                FROM IncomingInspection i
                ORDER BY i.Id DESC;

            ELSEIF p_Action = 'UPDATE' THEN
                SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System');
                
                UPDATE IncomingInspection 
                SET Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
                    AcceptedQty = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.acceptedQty')), AcceptedQty),
                    RejectedQty = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rejectedQty')), RejectedQty),
                    DefectsFound = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.defectsFound')), DefectsFound),
                    MtcReceived = IF(JSON_EXTRACT(p_JsonPayload, '$.mtcReceived') IS NOT NULL, IF(JSON_EXTRACT(p_JsonPayload, '$.mtcReceived') = true, 1, 0), MtcReceived),
                    MtcVerified = IF(JSON_EXTRACT(p_JsonPayload, '$.mtcVerified') IS NOT NULL, IF(JSON_EXTRACT(p_JsonPayload, '$.mtcVerified') = true, 1, 0), MtcVerified),
                    NcrNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.ncrNo')), NcrNo),
                    DeviationApprovedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deviationApprovedBy')), DeviationApprovedBy),
                    ModifiedBy = v_ModifiedBy,
                    ModifiedDate = v_CurrentDate
                WHERE Id = p_Id;

                -- Replace Parameters
                DELETE FROM IncomingInspectionParameter WHERE IncomingInspectionId = p_Id;
                IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.parameters')) > 0 THEN
                    INSERT INTO IncomingInspectionParameter (
                        IncomingInspectionId, Name, Method, Spec, Observed, Result, Critical, CreatedBy, CreatedDate
                    )
                    SELECT 
                        p_Id, name, method, spec, observed, result, IF(critical = true, 1, 0), v_ModifiedBy, v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.parameters[*]' COLUMNS (
                            name VARCHAR(200) PATH '$.name',
                            method VARCHAR(200) PATH '$.method',
                            spec VARCHAR(200) PATH '$.spec',
                            observed VARCHAR(200) PATH '$.observed',
                            result VARCHAR(50) PATH '$.result',
                            critical BOOLEAN PATH '$.critical'
                        )
                    ) AS jt;
                END IF;

                SELECT JSON_OBJECT('uid', p_Id) AS Result;

            ELSEIF p_Action = 'DELETE' THEN
                DELETE FROM IncomingInspection WHERE Id = p_Id;
                SELECT JSON_OBJECT('success', true) AS Result;
            END IF;
        END //
    """

    cursor.execute(sp_iqc_sql.replace('//', ''))
    print("SpManageIqc created.")

    conn.commit()
    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()
