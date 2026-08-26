import pymysql
import os
import json
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

db_host = os.getenv('DB_HOST', '187.127.131.38')
db_port = int(os.getenv('DB_PORT', 3308))
db_user = os.getenv('DB_USER', 'root')
db_password = os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026')
db_name = 'ERP_Procurement'

def setup_db():
    print(f"Connecting to MySQL ({db_host}:{db_port})...")
    try:
        connection = pymysql.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name,
            client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
        )
        cursor = connection.cursor()
        
        # Tables setup
        tables_sql = """
        CREATE TABLE IF NOT EXISTS PurchaseOrder (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            DocNo VARCHAR(30) UNIQUE NOT NULL,
            DocDate DATE NOT NULL,
            Status VARCHAR(30) NOT NULL,
            Plant VARCHAR(100) NOT NULL,
            PoType VARCHAR(20) NOT NULL,
            SupplierUid VARCHAR(50) NOT NULL,
            SupplierName VARCHAR(200) NOT NULL,
            Buyer VARCHAR(100) NOT NULL,
            Currency VARCHAR(10) NOT NULL DEFAULT 'INR',
            ExchangeRate DECIMAL(18,8) NOT NULL DEFAULT 1,
            PaymentTerms VARCHAR(200) NOT NULL,
            DeliveryTerms VARCHAR(200) NULL,
            Incoterm VARCHAR(20) NULL,
            DeliveryWarehouse VARCHAR(200) NOT NULL,
            PromisedDate DATE NOT NULL,
            RfqNo VARCHAR(30) NULL,
            PrRefs VARCHAR(500) NULL,
            ContractNo VARCHAR(30) NULL,
            BasicValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            DiscountValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            TaxValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            FreightValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            TotalValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            ReceivedPct DECIMAL(5,2) DEFAULT 0,
            BilledPct DECIMAL(5,2) DEFAULT 0,
            Acknowledged BIT DEFAULT 0,
            AcknowledgedAt DATETIME NULL,
            ShortCloseReason VARCHAR(500) NULL,
            Remarks VARCHAR(500) NULL,
            Version INT DEFAULT 1,
            Attachments INT DEFAULT 0,
            Comments INT DEFAULT 0,
            IsDeleted BIT DEFAULT 0,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL
        );

        CREATE TABLE IF NOT EXISTS PurchaseOrderLine (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            PurchaseOrderId INT NOT NULL,
            ItemCode VARCHAR(50) NOT NULL,
            ItemName VARCHAR(200) NOT NULL,
            Uom VARCHAR(20) NOT NULL,
            Qty DECIMAL(18,4) NOT NULL,
            ReceivedQty DECIMAL(18,4) DEFAULT 0,
            RejectedQty DECIMAL(18,4) DEFAULT 0,
            BilledQty DECIMAL(18,4) DEFAULT 0,
            Rate DECIMAL(18,4) NOT NULL,
            DiscountPct DECIMAL(5,2) DEFAULT 0,
            Hsn VARCHAR(20) NOT NULL,
            TaxPct DECIMAL(5,2) DEFAULT 18,
            Amount DECIMAL(18,2) DEFAULT 0,
            TaxAmount DECIMAL(18,2) DEFAULT 0,
            LineTotal DECIMAL(18,2) DEFAULT 0,
            DueDate DATE NOT NULL,
            QcRequired BIT DEFAULT 0,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (PurchaseOrderId) REFERENCES PurchaseOrder(Id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS PurchaseOrderSchedule (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            PurchaseOrderLineId INT NOT NULL,
            DueDate DATE NOT NULL,
            Qty DECIMAL(18,4) NOT NULL,
            ReceivedQty DECIMAL(18,4) DEFAULT 0,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (PurchaseOrderLineId) REFERENCES PurchaseOrderLine(Id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS PurchaseOrderApproval (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            PurchaseOrderId INT NOT NULL,
            Level INT NOT NULL,
            Role VARCHAR(100) NOT NULL,
            Approver VARCHAR(100) NOT NULL,
            Status VARCHAR(20) NOT NULL,
            ActedAt DATETIME NULL,
            Remarks VARCHAR(500) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (PurchaseOrderId) REFERENCES PurchaseOrder(Id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS PurchaseOrderAmendment (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            PurchaseOrderId INT NOT NULL,
            Revision INT NOT NULL,
            AmendedAt DATETIME NOT NULL,
            AmendedBy VARCHAR(100) NOT NULL,
            Reason VARCHAR(500) NOT NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (PurchaseOrderId) REFERENCES PurchaseOrder(Id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS PurchaseOrderAmendmentChange (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            PurchaseOrderAmendmentId INT NOT NULL,
            Field VARCHAR(200) NOT NULL,
            FromValue VARCHAR(500) NOT NULL,
            ToValue VARCHAR(500) NOT NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (PurchaseOrderAmendmentId) REFERENCES PurchaseOrderAmendment(Id) ON DELETE CASCADE
        );
        """
        cursor.execute(tables_sql)
        print("Tables validated/created.")

        # Stored Procedure setup
        sp_sql = """
        DROP PROCEDURE IF EXISTS SpManagePurchaseOrder;
        
        CREATE PROCEDURE SpManagePurchaseOrder(
            IN p_Action VARCHAR(20),
            IN p_Id INT,
            IN p_JsonPayload JSON
        )
        BEGIN
            DECLARE v_DocNo VARCHAR(30);
            DECLARE v_CreatedBy VARCHAR(100);
            DECLARE v_ModifiedBy VARCHAR(100);
            DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;
            DECLARE v_NewId INT;
            
            IF p_Action = 'CREATE' THEN
                SET v_CreatedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy'));
                SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));

                INSERT INTO PurchaseOrder (
                    DocNo, DocDate, Status, Plant, PoType, SupplierUid, SupplierName, Buyer, Currency, ExchangeRate, 
                    PaymentTerms, DeliveryTerms, Incoterm, DeliveryWarehouse, PromisedDate, RfqNo, PrRefs, ContractNo, 
                    BasicValue, DiscountValue, TaxValue, FreightValue, TotalValue, ReceivedPct, BilledPct, 
                    Acknowledged, AcknowledgedAt, ShortCloseReason, Remarks, Version, Attachments, Comments, 
                    CreatedBy, CreatedDate
                ) VALUES (
                    v_DocNo,
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poType')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.buyer')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')), 'INR'),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.exchangeRate')), 1),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.paymentTerms')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryTerms')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.incoterm')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryWarehouse')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.promisedDate')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rfqNo')),
                    (SELECT GROUP_CONCAT(value SEPARATOR ', ') FROM JSON_TABLE(JSON_EXTRACT(p_JsonPayload, '$.prRefs'), '$[*]' COLUMNS(value VARCHAR(255) PATH '$')) as jt),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.contractNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.basicValue')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.discountValue')), 0),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.taxValue')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.freightValue')), 0),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalValue')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.receivedPct')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.billedPct')), 0),
                    IF(JSON_EXTRACT(p_JsonPayload, '$.acknowledged') = true, 1, 0),
                    NULLIF(REPLACE(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.acknowledgedAt')), 'T', ' '), 'Z', ''), 'null'),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.shortCloseReason')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), 1),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
                    v_CreatedBy,
                    v_CurrentDate
                );

                SET v_NewId = LAST_INSERT_ID();

                -- Insert Approvals
                IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.approvals') THEN
                    INSERT INTO PurchaseOrderApproval (
                        PurchaseOrderId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
                    )
                    SELECT 
                        v_NewId,
                        level,
                        role,
                        approver,
                        status,
                        REPLACE(REPLACE(actedAt, 'T', ' '), 'Z', ''),
                        remarks,
                        v_CreatedBy,
                        v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.approvals[*]' COLUMNS (
                            level INT PATH '$.level',
                            role VARCHAR(100) PATH '$.role',
                            approver VARCHAR(100) PATH '$.approver',
                            status VARCHAR(20) PATH '$.status',
                            actedAt VARCHAR(50) PATH '$.actedAt',
                            remarks VARCHAR(500) PATH '$.remarks'
                        )
                    ) AS jt;
                END IF;

                -- Insert Lines and Schedules
                IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.lines') THEN
                    -- Dynamic SQL is needed to iterate JSON arrays for lines and insert their nested schedules
                    -- Alternatively, we insert lines first, and then schedules by matching item codes
                    -- Since we don't have a reliable primary key mapping, we'll use a cursor if needed.
                    -- But let's try mapping by ItemCode for simplicity (assuming unique per PO)
                    
                    INSERT INTO PurchaseOrderLine (
                        PurchaseOrderId, ItemCode, ItemName, Uom, Qty, ReceivedQty, RejectedQty, BilledQty, Rate, DiscountPct, Hsn, TaxPct, Amount, TaxAmount, LineTotal, DueDate, QcRequired, CreatedBy, CreatedDate
                    )
                    SELECT 
                        v_NewId,
                        itemCode,
                        itemName,
                        uom,
                        qty,
                        receivedQty,
                        rejectedQty,
                        billedQty,
                        rate,
                        discountPct,
                        hsn,
                        taxPct,
                        amount,
                        taxAmount,
                        lineTotal,
                        dueDate,
                        IF(qcRequired = true, 1, 0),
                        v_CreatedBy,
                        v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.lines[*]' COLUMNS (
                            itemCode VARCHAR(50) PATH '$.itemCode',
                            itemName VARCHAR(200) PATH '$.itemName',
                            uom VARCHAR(20) PATH '$.uom',
                            qty DECIMAL(18,4) PATH '$.qty',
                            receivedQty DECIMAL(18,4) PATH '$.receivedQty',
                            rejectedQty DECIMAL(18,4) PATH '$.rejectedQty',
                            billedQty DECIMAL(18,4) PATH '$.billedQty',
                            rate DECIMAL(18,4) PATH '$.rate',
                            discountPct DECIMAL(5,2) PATH '$.discountPct',
                            hsn VARCHAR(20) PATH '$.hsn',
                            taxPct DECIMAL(5,2) PATH '$.taxPct',
                            amount DECIMAL(18,2) PATH '$.amount',
                            taxAmount DECIMAL(18,2) PATH '$.taxAmount',
                            lineTotal DECIMAL(18,2) PATH '$.lineTotal',
                            dueDate DATE PATH '$.dueDate',
                            qcRequired BOOLEAN PATH '$.qcRequired'
                        )
                    ) AS jt;
                    
                    -- Insert schedules joining the newly created lines
                    INSERT INTO PurchaseOrderSchedule (
                        PurchaseOrderLineId, DueDate, Qty, ReceivedQty, CreatedBy, CreatedDate
                    )
                    SELECT 
                        l.Id,
                        jt.dueDate,
                        jt.qty,
                        jt.receivedQty,
                        v_CreatedBy,
                        v_CurrentDate
                    FROM PurchaseOrderLine l
                    JOIN JSON_TABLE(
                        p_JsonPayload, '$.lines[*]' COLUMNS (
                            itemCode VARCHAR(50) PATH '$.itemCode',
                            NESTED PATH '$.schedules[*]' COLUMNS (
                                dueDate DATE PATH '$.dueDate',
                                qty DECIMAL(18,4) PATH '$.qty',
                                receivedQty DECIMAL(18,4) PATH '$.receivedQty'
                            )
                        )
                    ) AS jt ON l.ItemCode = jt.itemCode AND jt.qty IS NOT NULL
                    WHERE l.PurchaseOrderId = v_NewId;
                END IF;

                -- Insert Amendments
                IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.amendments') THEN
                    INSERT INTO PurchaseOrderAmendment (
                        PurchaseOrderId, Revision, AmendedAt, AmendedBy, Reason, CreatedBy, CreatedDate
                    )
                    SELECT 
                        v_NewId,
                        revision,
                        REPLACE(REPLACE(amendedAt, 'T', ' '), 'Z', ''),
                        amendedBy,
                        reason,
                        v_CreatedBy,
                        v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.amendments[*]' COLUMNS (
                            revision INT PATH '$.revision',
                            amendedAt VARCHAR(50) PATH '$.amendedAt',
                            amendedBy VARCHAR(100) PATH '$.amendedBy',
                            reason VARCHAR(500) PATH '$.reason'
                        )
                    ) AS jt;
                    
                    INSERT INTO PurchaseOrderAmendmentChange (
                        PurchaseOrderAmendmentId, Field, FromValue, ToValue, CreatedBy, CreatedDate
                    )
                    SELECT 
                        a.Id,
                        jt.field,
                        jt.fromValue,
                        jt.toValue,
                        v_CreatedBy,
                        v_CurrentDate
                    FROM PurchaseOrderAmendment a
                    JOIN JSON_TABLE(
                        p_JsonPayload, '$.amendments[*]' COLUMNS (
                            revision INT PATH '$.revision',
                            NESTED PATH '$.changes[*]' COLUMNS (
                                field VARCHAR(200) PATH '$.field',
                                fromValue VARCHAR(500) PATH '$.from',
                                toValue VARCHAR(500) PATH '$.to'
                            )
                        )
                    ) AS jt ON a.Revision = jt.revision AND jt.field IS NOT NULL
                    WHERE a.PurchaseOrderId = v_NewId;
                END IF;

                SET p_Id = v_NewId;
            END IF;
            
            IF p_Action = 'UPDATE' THEN
                SET v_ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy'));
                
                UPDATE PurchaseOrder SET
                    Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
                    Plant = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')), Plant),
                    PoType = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poType')), PoType),
                    SupplierName = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')), SupplierName),
                    Buyer = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.buyer')), Buyer),
                    Currency = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')), Currency),
                    PaymentTerms = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.paymentTerms')), PaymentTerms),
                    DeliveryTerms = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryTerms')), DeliveryTerms),
                    Incoterm = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.incoterm')), Incoterm),
                    DeliveryWarehouse = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryWarehouse')), DeliveryWarehouse),
                    PromisedDate = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.promisedDate')), PromisedDate),
                    ContractNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.contractNo')), ContractNo),
                    BasicValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.basicValue')), BasicValue),
                    TaxValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.taxValue')), TaxValue),
                    TotalValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalValue')), TotalValue),
                    ReceivedPct = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.receivedPct')), ReceivedPct),
                    BilledPct = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.billedPct')), BilledPct),
                    Acknowledged = IF(JSON_EXTRACT(p_JsonPayload, '$.acknowledged') IS NOT NULL, IF(JSON_EXTRACT(p_JsonPayload, '$.acknowledged') = true, 1, 0), Acknowledged),
                    AcknowledgedAt = IFNULL(NULLIF(REPLACE(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.acknowledgedAt')), 'T', ' '), 'Z', ''), 'null'), AcknowledgedAt),
                    ShortCloseReason = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.shortCloseReason')), ShortCloseReason),
                    Remarks = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), Remarks),
                    Version = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), Version),
                    Attachments = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), Attachments),
                    Comments = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), Comments),
                    ModifiedBy = v_ModifiedBy,
                    ModifiedDate = v_CurrentDate
                WHERE Id = p_Id AND IsDeleted = 0;
                
                -- Only update approvals if they are provided
                IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.approvals') THEN
                    DELETE FROM PurchaseOrderApproval WHERE PurchaseOrderId = p_Id;
                    
                    INSERT INTO PurchaseOrderApproval (
                        PurchaseOrderId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
                    )
                    SELECT 
                        p_Id,
                        level,
                        role,
                        approver,
                        status,
                        REPLACE(REPLACE(actedAt, 'T', ' '), 'Z', ''),
                        remarks,
                        IFNULL(v_ModifiedBy, 'System'),
                        v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.approvals[*]' COLUMNS (
                            level INT PATH '$.level',
                            role VARCHAR(100) PATH '$.role',
                            approver VARCHAR(100) PATH '$.approver',
                            status VARCHAR(20) PATH '$.status',
                            actedAt VARCHAR(50) PATH '$.actedAt',
                            remarks VARCHAR(500) PATH '$.remarks'
                        )
                    ) AS jt;
                END IF;
                
                -- Note: Complete replacement of lines and schedules would go here if needed.
                -- For most update actions in the workflow (approve, cancel, short-close), lines don't change.
                -- If they do change (e.g. DRAFT edits), we'll do the same delete-insert logic.
                IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.lines') THEN
                    DELETE FROM PurchaseOrderLine WHERE PurchaseOrderId = p_Id;
                    
                    INSERT INTO PurchaseOrderLine (
                        PurchaseOrderId, ItemCode, ItemName, Uom, Qty, ReceivedQty, RejectedQty, BilledQty, Rate, DiscountPct, Hsn, TaxPct, Amount, TaxAmount, LineTotal, DueDate, QcRequired, CreatedBy, CreatedDate
                    )
                    SELECT 
                        p_Id,
                        itemCode,
                        itemName,
                        uom,
                        qty,
                        receivedQty,
                        rejectedQty,
                        billedQty,
                        rate,
                        discountPct,
                        hsn,
                        taxPct,
                        amount,
                        taxAmount,
                        lineTotal,
                        dueDate,
                        IF(qcRequired = true, 1, 0),
                        v_ModifiedBy,
                        v_CurrentDate
                    FROM JSON_TABLE(
                        p_JsonPayload, '$.lines[*]' COLUMNS (
                            itemCode VARCHAR(50) PATH '$.itemCode',
                            itemName VARCHAR(200) PATH '$.itemName',
                            uom VARCHAR(20) PATH '$.uom',
                            qty DECIMAL(18,4) PATH '$.qty',
                            receivedQty DECIMAL(18,4) PATH '$.receivedQty',
                            rejectedQty DECIMAL(18,4) PATH '$.rejectedQty',
                            billedQty DECIMAL(18,4) PATH '$.billedQty',
                            rate DECIMAL(18,4) PATH '$.rate',
                            discountPct DECIMAL(5,2) PATH '$.discountPct',
                            hsn VARCHAR(20) PATH '$.hsn',
                            taxPct DECIMAL(5,2) PATH '$.taxPct',
                            amount DECIMAL(18,2) PATH '$.amount',
                            taxAmount DECIMAL(18,2) PATH '$.taxAmount',
                            lineTotal DECIMAL(18,2) PATH '$.lineTotal',
                            dueDate DATE PATH '$.dueDate',
                            qcRequired BOOLEAN PATH '$.qcRequired'
                        )
                    ) AS jt;
                    
                    INSERT INTO PurchaseOrderSchedule (
                        PurchaseOrderLineId, DueDate, Qty, ReceivedQty, CreatedBy, CreatedDate
                    )
                    SELECT 
                        l.Id,
                        jt.dueDate,
                        jt.qty,
                        jt.receivedQty,
                        v_ModifiedBy,
                        v_CurrentDate
                    FROM PurchaseOrderLine l
                    JOIN JSON_TABLE(
                        p_JsonPayload, '$.lines[*]' COLUMNS (
                            itemCode VARCHAR(50) PATH '$.itemCode',
                            NESTED PATH '$.schedules[*]' COLUMNS (
                                dueDate DATE PATH '$.dueDate',
                                qty DECIMAL(18,4) PATH '$.qty',
                                receivedQty DECIMAL(18,4) PATH '$.receivedQty'
                            )
                        )
                    ) AS jt ON l.ItemCode = jt.itemCode AND jt.qty IS NOT NULL
                    WHERE l.PurchaseOrderId = p_Id;
                END IF;

            ELSEIF p_Action = 'DELETE' THEN
                UPDATE PurchaseOrder 
                SET IsDeleted = 1, ModifiedDate = v_CurrentDate, ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy'))
                WHERE Id = p_Id;
                
                SELECT JSON_OBJECT('success', true) AS Result;
            END IF;

            -- RETURN SINGLE RECORD (CREATE, UPDATE, READ)
            IF p_Action IN ('CREATE', 'UPDATE', 'READ') THEN
                SELECT 
                    JSON_OBJECT(
                        'uid', q.Id,
                        'docNo', q.DocNo,
                        'docDate', q.DocDate,
                        'status', q.Status,
                        'plant', q.Plant,
                        'poType', q.PoType,
                        'supplierUid', q.SupplierUid,
                        'supplierName', q.SupplierName,
                        'buyer', q.Buyer,
                        'currency', q.Currency,
                        'exchangeRate', q.ExchangeRate,
                        'paymentTerms', q.PaymentTerms,
                        'deliveryTerms', q.DeliveryTerms,
                        'incoterm', q.Incoterm,
                        'deliveryWarehouse', q.DeliveryWarehouse,
                        'promisedDate', q.PromisedDate,
                        'rfqNo', q.RfqNo,
                        'prRefs', IFNULL((
                            SELECT JSON_ARRAYAGG(TRIM(value))
                            FROM JSON_TABLE(
                                CONCAT('["', REPLACE(q.PrRefs, ', ', '","'), '"]'),
                                '$[*]' COLUMNS(value VARCHAR(50) PATH '$')
                            ) AS jt WHERE q.PrRefs IS NOT NULL AND q.PrRefs != ''
                        ), JSON_ARRAY()),
                        'contractNo', q.ContractNo,
                        'basicValue', q.BasicValue,
                        'discountValue', q.DiscountValue,
                        'taxValue', q.TaxValue,
                        'freightValue', q.FreightValue,
                        'totalValue', q.TotalValue,
                        'receivedPct', q.ReceivedPct,
                        'billedPct', q.BilledPct,
                        'acknowledged', q.Acknowledged = 1,
                        'acknowledgedAt', DATE_FORMAT(q.AcknowledgedAt, '%Y-%m-%dT%H:%i:%sZ'),
                        'shortCloseReason', q.ShortCloseReason,
                        'remarks', q.Remarks,
                        'version', q.Version,
                        'attachments', q.Attachments,
                        'comments', q.Comments,
                        'createdBy', q.CreatedBy,
                        'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        
                        'approvals', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'level', a.Level,
                                    'role', a.Role,
                                    'approver', a.Approver,
                                    'status', a.Status,
                                    'actedAt', DATE_FORMAT(a.ActedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'remarks', a.Remarks
                                )
                            ) FROM PurchaseOrderApproval a WHERE a.PurchaseOrderId = q.Id
                        ), JSON_ARRAY()),

                        'amendments', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'revision', am.Revision,
                                    'amendedAt', DATE_FORMAT(am.AmendedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'amendedBy', am.AmendedBy,
                                    'reason', am.Reason,
                                    'changes', IFNULL((
                                        SELECT JSON_ARRAYAGG(
                                            JSON_OBJECT(
                                                'field', amc.Field,
                                                'from', amc.FromValue,
                                                'to', amc.ToValue
                                            )
                                        ) FROM PurchaseOrderAmendmentChange amc WHERE amc.PurchaseOrderAmendmentId = am.Id
                                    ), JSON_ARRAY())
                                )
                            ) FROM PurchaseOrderAmendment am WHERE am.PurchaseOrderId = q.Id
                        ), JSON_ARRAY()),
                        
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'uid', l.Id,
                                    'itemCode', l.ItemCode,
                                    'itemName', l.ItemName,
                                    'uom', l.Uom,
                                    'qty', l.Qty,
                                    'receivedQty', l.ReceivedQty,
                                    'rejectedQty', l.RejectedQty,
                                    'billedQty', l.BilledQty,
                                    'rate', l.Rate,
                                    'discountPct', l.DiscountPct,
                                    'hsn', l.Hsn,
                                    'taxPct', l.TaxPct,
                                    'amount', l.Amount,
                                    'taxAmount', l.TaxAmount,
                                    'lineTotal', l.LineTotal,
                                    'dueDate', l.DueDate,
                                    'qcRequired', l.QcRequired = 1,
                                    'schedules', IFNULL((
                                        SELECT JSON_ARRAYAGG(
                                            JSON_OBJECT(
                                                'uid', s.Id,
                                                'dueDate', s.DueDate,
                                                'qty', s.Qty,
                                                'receivedQty', s.ReceivedQty
                                            )
                                        ) FROM PurchaseOrderSchedule s WHERE s.PurchaseOrderLineId = l.Id
                                    ), JSON_ARRAY())
                                )
                            ) FROM PurchaseOrderLine l WHERE l.PurchaseOrderId = q.Id
                        ), JSON_ARRAY())
                    ) AS Result
                FROM PurchaseOrder q
                WHERE q.Id = p_Id AND q.IsDeleted = 0;
            
            ELSEIF p_Action = 'READ_ALL' THEN
                SELECT 
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'uid', q.Id,
                            'docNo', q.DocNo,
                            'docDate', q.DocDate,
                            'status', q.Status,
                            'plant', q.Plant,
                            'poType', q.PoType,
                            'supplierUid', q.SupplierUid,
                            'supplierName', q.SupplierName,
                            'buyer', q.Buyer,
                            'currency', q.Currency,
                            'exchangeRate', q.ExchangeRate,
                            'paymentTerms', q.PaymentTerms,
                            'deliveryTerms', q.DeliveryTerms,
                            'incoterm', q.Incoterm,
                            'deliveryWarehouse', q.DeliveryWarehouse,
                            'promisedDate', q.PromisedDate,
                            'rfqNo', q.RfqNo,
                            'prRefs', IFNULL((
                                SELECT JSON_ARRAYAGG(TRIM(value))
                                FROM JSON_TABLE(
                                    CONCAT('["', REPLACE(q.PrRefs, ', ', '","'), '"]'),
                                    '$[*]' COLUMNS(value VARCHAR(50) PATH '$')
                                ) AS jt WHERE q.PrRefs IS NOT NULL AND q.PrRefs != ''
                            ), JSON_ARRAY()),
                            'contractNo', q.ContractNo,
                            'basicValue', q.BasicValue,
                            'discountValue', q.DiscountValue,
                            'taxValue', q.TaxValue,
                            'freightValue', q.FreightValue,
                            'totalValue', q.TotalValue,
                            'receivedPct', q.ReceivedPct,
                            'billedPct', q.BilledPct,
                            'acknowledged', q.Acknowledged = 1,
                            'acknowledgedAt', DATE_FORMAT(q.AcknowledgedAt, '%Y-%m-%dT%H:%i:%sZ'),
                            'shortCloseReason', q.ShortCloseReason,
                            'remarks', q.Remarks,
                            'version', q.Version,
                            'attachments', q.Attachments,
                            'comments', q.Comments,
                            'createdBy', q.CreatedBy,
                            'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                            'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                            
                            'approvals', IFNULL((
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'level', a.Level,
                                        'role', a.Role,
                                        'approver', a.Approver,
                                        'status', a.Status,
                                        'actedAt', DATE_FORMAT(a.ActedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                        'remarks', a.Remarks
                                    )
                                ) FROM PurchaseOrderApproval a WHERE a.PurchaseOrderId = q.Id
                            ), JSON_ARRAY()),

                            'amendments', IFNULL((
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'revision', am.Revision,
                                        'amendedAt', DATE_FORMAT(am.AmendedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                        'amendedBy', am.AmendedBy,
                                        'reason', am.Reason,
                                        'changes', IFNULL((
                                            SELECT JSON_ARRAYAGG(
                                                JSON_OBJECT(
                                                    'field', amc.Field,
                                                    'from', amc.FromValue,
                                                    'to', amc.ToValue
                                                )
                                            ) FROM PurchaseOrderAmendmentChange amc WHERE amc.PurchaseOrderAmendmentId = am.Id
                                        ), JSON_ARRAY())
                                    )
                                ) FROM PurchaseOrderAmendment am WHERE am.PurchaseOrderId = q.Id
                            ), JSON_ARRAY()),
                            
                            'lines', IFNULL((
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'uid', l.Id,
                                        'itemCode', l.ItemCode,
                                        'itemName', l.ItemName,
                                        'uom', l.Uom,
                                        'qty', l.Qty,
                                        'receivedQty', l.ReceivedQty,
                                        'rejectedQty', l.RejectedQty,
                                        'billedQty', l.BilledQty,
                                        'rate', l.Rate,
                                        'discountPct', l.DiscountPct,
                                        'hsn', l.Hsn,
                                        'taxPct', l.TaxPct,
                                        'amount', l.Amount,
                                        'taxAmount', l.TaxAmount,
                                        'lineTotal', l.LineTotal,
                                        'dueDate', l.DueDate,
                                        'qcRequired', l.QcRequired = 1,
                                        'schedules', IFNULL((
                                            SELECT JSON_ARRAYAGG(
                                                JSON_OBJECT(
                                                    'uid', s.Id,
                                                    'dueDate', s.DueDate,
                                                    'qty', s.Qty,
                                                    'receivedQty', s.ReceivedQty
                                                )
                                            ) FROM PurchaseOrderSchedule s WHERE s.PurchaseOrderLineId = l.Id
                                        ), JSON_ARRAY())
                                    )
                                ) FROM PurchaseOrderLine l WHERE l.PurchaseOrderId = q.Id
                            ), JSON_ARRAY())
                        )
                    ) AS Result
                FROM PurchaseOrder q
                WHERE q.IsDeleted = 0;
            END IF;
        END;
        """
        cursor.execute(sp_sql)
        print("Stored procedure created.")
        
        connection.commit()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'connection' in locals() and connection.open:
            cursor.close()
            connection.close()

if __name__ == "__main__":
    setup_db()
