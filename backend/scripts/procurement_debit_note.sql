-- Supplier Debit Note (Vol 3 Ch 7 §PRT) — the financial claim raised on a supplier,
-- a document in its own right (SRS 11.10 prc_debit_note). It most often arises from a
-- goods return, but can also stand alone (rate difference, short quantity, quality
-- penalty, late-delivery LD, freight claim, job-work loss). It carries no stock effect
-- — it recovers value. Extends the legacy ERP_Procurement stored-procedure module.
--
-- Auto-drafted from an APPROVED purchase return (debit_note_draft.py), and linkable
-- to a GRN, PO and/or supplier invoice so the payable can be reconciled. Approving it
-- issues the claim; the actual AP posting/netting is Finance (Vol 9), out of scope here.
--
-- Segments split on `-- @@GO`. Re-runnable: table IF NOT EXISTS, proc dropped/recreated.

USE ERP_Procurement;
-- @@GO
CREATE TABLE IF NOT EXISTS DebitNote (
  Id                 INT(11) NOT NULL AUTO_INCREMENT,
  DocNo              VARCHAR(30) NOT NULL,
  DocDate            DATE NOT NULL,
  Status             VARCHAR(30) NOT NULL DEFAULT 'DRAFT',      -- DRAFT|APPROVED|CANCELLED
  DebitNoteType      VARCHAR(30) NOT NULL DEFAULT 'GOODS_RETURN', -- GOODS_RETURN|RATE_DIFFERENCE|SHORT_QUANTITY|QUALITY_PENALTY|LATE_DELIVERY_LD|FREIGHT_CLAIM|JOB_WORK_LOSS|OTHER
  SupplierUid        VARCHAR(50) NOT NULL,
  SupplierName       VARCHAR(200) NOT NULL,
  PurchaseReturnId   INT(11) DEFAULT NULL,
  ReturnNo           VARCHAR(30) DEFAULT NULL,
  GrnNo              VARCHAR(30) DEFAULT NULL,
  PoNo               VARCHAR(30) DEFAULT NULL,
  SupplierInvoiceId  INT(11) DEFAULT NULL,
  SupplierInvoiceNo  VARCHAR(100) DEFAULT NULL,
  OriginalInvoiceNo  VARCHAR(100) DEFAULT NULL,
  IsPendingInvoice   BIT(1) NOT NULL DEFAULT b'0',              -- claim raised before the invoice arrived
  ReasonCode         VARCHAR(50) DEFAULT NULL,
  Narration          VARCHAR(2000) DEFAULT NULL,
  TaxableAmount      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  CgstAmount         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  SgstAmount         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  IgstAmount         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TaxAmount          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TotalAmount        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  SupplierAckStatus  VARCHAR(20) DEFAULT NULL,                  -- PENDING|ACKNOWLEDGED|DISPUTED
  ApprovedAt         DATETIME DEFAULT NULL,
  Remarks            VARCHAR(500) DEFAULT NULL,
  Version            INT(11) NOT NULL DEFAULT 1,
  Attachments        INT(11) NOT NULL DEFAULT 0,
  Comments           INT(11) NOT NULL DEFAULT 0,
  CreatedBy          VARCHAR(100) DEFAULT NULL,
  CreatedDate        DATETIME DEFAULT NULL,
  ModifiedBy         VARCHAR(100) DEFAULT NULL,
  ModifiedDate       DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY DocNo (DocNo),
  KEY ix_dn_supplier (SupplierUid),
  KEY ix_dn_return (PurchaseReturnId),
  KEY ix_dn_invoice (SupplierInvoiceId),
  KEY ix_dn_status (Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
CREATE TABLE IF NOT EXISTS DebitNoteLine (
  Id             INT(11) NOT NULL AUTO_INCREMENT,
  DebitNoteId    INT(11) NOT NULL,
  ItemCode       VARCHAR(50) DEFAULT NULL,
  ItemName       VARCHAR(200) DEFAULT NULL,
  Uom            VARCHAR(20) DEFAULT NULL,
  Quantity       DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  Rate           DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  HsnCode        VARCHAR(20) DEFAULT NULL,
  TaxPct         DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  TaxableAmount  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TaxAmount      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  LineTotal      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  SourceReference VARCHAR(200) DEFAULT NULL,
  Remarks        VARCHAR(500) DEFAULT NULL,
  CreatedBy      VARCHAR(100) DEFAULT NULL,
  CreatedDate    DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  KEY DebitNoteId (DebitNoteId),
  CONSTRAINT DebitNoteLine_ibfk_1 FOREIGN KEY (DebitNoteId) REFERENCES DebitNote (Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
DROP PROCEDURE IF EXISTS SpManageDebitNote;
-- @@GO
CREATE PROCEDURE SpManageDebitNote(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_JsonPayload JSON
)
proc_label:BEGIN
    DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;
    DECLARE v_CreatedBy VARCHAR(100);
    DECLARE v_ModifiedBy VARCHAR(100);
    DECLARE v_NewId INT;
    DECLARE v_DocNo VARCHAR(30);
    DECLARE v_NextNum INT DEFAULT 0;

    IF p_Action = 'CREATE' THEN
        SET v_CreatedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy')), 'System');
        SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));
        IF v_DocNo IS NULL OR v_DocNo = '' OR v_DocNo = 'null' THEN
            SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 10) AS UNSIGNED)), 0) + 1
              INTO v_NextNum FROM DebitNote WHERE DocNo LIKE 'DN/26-27/%';
            SET v_DocNo = CONCAT('DN/26-27/', LPAD(v_NextNum, 5, '0'));
        END IF;

        INSERT INTO DebitNote (
            DocNo, DocDate, Status, DebitNoteType, SupplierUid, SupplierName,
            PurchaseReturnId, ReturnNo, GrnNo, PoNo, SupplierInvoiceId, SupplierInvoiceNo,
            OriginalInvoiceNo, IsPendingInvoice, ReasonCode, Narration,
            SupplierAckStatus, Remarks, Version, Attachments, Comments, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo,
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), 'DRAFT'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.debitNoteType')), 'GOODS_RETURN'),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')),
            CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.purchaseReturnId')), 'null') AS SIGNED),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.returnNo')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.grnNo')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poNo')), 'null'),
            CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceId')), 'null') AS SIGNED),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceNo')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.originalInvoiceNo')), 'null'),
            IF(JSON_EXTRACT(p_JsonPayload, '$.isPendingInvoice') IN (true,1,'1','true'), b'1', b'0'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.reasonCode')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.narration')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierAckStatus')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), 'null'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), 1),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
            v_CreatedBy, v_CurrentDate
        );
        SET v_NewId = LAST_INSERT_ID();

        IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
            INSERT INTO DebitNoteLine (
                DebitNoteId, ItemCode, ItemName, Uom, Quantity, Rate, HsnCode, TaxPct,
                TaxableAmount, TaxAmount, LineTotal, SourceReference, Remarks, CreatedBy, CreatedDate
            )
            SELECT
                v_NewId, NULLIF(itemCode,'null'), NULLIF(itemName,'null'), NULLIF(uom,'null'),
                IFNULL(quantity,0), IFNULL(rate,0), NULLIF(hsnCode,'null'), IFNULL(taxPct,0),
                ROUND(IFNULL(quantity,0) * IFNULL(rate,0), 2),
                ROUND(IFNULL(quantity,0) * IFNULL(rate,0) * IFNULL(taxPct,0)/100, 2),
                ROUND(IFNULL(quantity,0) * IFNULL(rate,0) * (1 + IFNULL(taxPct,0)/100), 2),
                NULLIF(sourceReference,'null'), NULLIF(remarks,'null'), v_CreatedBy, v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    quantity DECIMAL(18,4) PATH '$.quantity',
                    rate DECIMAL(18,4) PATH '$.rate',
                    hsnCode VARCHAR(20) PATH '$.hsnCode',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    sourceReference VARCHAR(200) PATH '$.sourceReference',
                    remarks VARCHAR(500) PATH '$.remarks'
                )
            ) AS jt;
        END IF;

        UPDATE DebitNote d
           SET TaxableAmount = IFNULL((SELECT SUM(TaxableAmount) FROM DebitNoteLine WHERE DebitNoteId = v_NewId),0),
               TaxAmount     = IFNULL((SELECT SUM(TaxAmount) FROM DebitNoteLine WHERE DebitNoteId = v_NewId),0),
               TotalAmount   = IFNULL((SELECT SUM(LineTotal) FROM DebitNoteLine WHERE DebitNoteId = v_NewId),0)
         WHERE d.Id = v_NewId;

        SELECT JSON_OBJECT('uid', v_NewId, 'docNo', v_DocNo) AS Result;

    ELSEIF p_Action = 'READ' THEN
        SELECT JSON_OBJECT(
            'uid', d.Id, 'docNo', d.DocNo, 'docDate', d.DocDate, 'status', d.Status,
            'debitNoteType', d.DebitNoteType, 'supplierUid', d.SupplierUid, 'supplierName', d.SupplierName,
            'purchaseReturnId', d.PurchaseReturnId, 'returnNo', d.ReturnNo, 'grnNo', d.GrnNo, 'poNo', d.PoNo,
            'supplierInvoiceId', d.SupplierInvoiceId, 'supplierInvoiceNo', d.SupplierInvoiceNo,
            'originalInvoiceNo', d.OriginalInvoiceNo, 'isPendingInvoice', d.IsPendingInvoice = b'1',
            'reasonCode', d.ReasonCode, 'narration', d.Narration,
            'taxableAmount', d.TaxableAmount, 'cgstAmount', d.CgstAmount, 'sgstAmount', d.SgstAmount,
            'igstAmount', d.IgstAmount, 'taxAmount', d.TaxAmount, 'totalAmount', d.TotalAmount,
            'supplierAckStatus', d.SupplierAckStatus, 'approvedAt', d.ApprovedAt,
            'remarks', d.Remarks, 'version', d.Version, 'attachments', d.Attachments, 'comments', d.Comments,
            'createdBy', d.CreatedBy, 'createdAt', d.CreatedDate, 'modifiedAt', d.ModifiedDate,
            'lines', IFNULL((
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'uid', l.Id, 'itemCode', l.ItemCode, 'itemName', l.ItemName, 'uom', l.Uom,
                    'quantity', l.Quantity, 'rate', l.Rate, 'hsnCode', l.HsnCode, 'taxPct', l.TaxPct,
                    'taxableAmount', l.TaxableAmount, 'taxAmount', l.TaxAmount, 'lineTotal', l.LineTotal,
                    'sourceReference', l.SourceReference, 'remarks', l.Remarks
                )) FROM DebitNoteLine l WHERE l.DebitNoteId = d.Id
            ), JSON_ARRAY())
        ) AS Result
        FROM DebitNote d WHERE d.Id = p_Id;

    ELSEIF p_Action = 'READ_ALL' THEN
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'uid', d.Id, 'docNo', d.DocNo, 'docDate', d.DocDate, 'status', d.Status,
            'debitNoteType', d.DebitNoteType, 'supplierUid', d.SupplierUid, 'supplierName', d.SupplierName,
            'returnNo', d.ReturnNo, 'grnNo', d.GrnNo, 'supplierInvoiceNo', d.SupplierInvoiceNo,
            'totalAmount', d.TotalAmount, 'supplierAckStatus', d.SupplierAckStatus,
            'version', d.Version, 'createdAt', d.CreatedDate,
            'lineCount', (SELECT COUNT(*) FROM DebitNoteLine l WHERE l.DebitNoteId = d.Id)
        )) AS Result
        FROM DebitNote d ORDER BY d.Id DESC;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System');
        UPDATE DebitNote SET
            DebitNoteType = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.debitNoteType')), DebitNoteType),
            SupplierUid = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')), SupplierUid),
            SupplierName = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')), SupplierName),
            SupplierInvoiceId = IFNULL(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceId')), 'null') AS SIGNED), SupplierInvoiceId),
            SupplierInvoiceNo = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceNo')), 'null'),
            OriginalInvoiceNo = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.originalInvoiceNo')), 'null'),
            IsPendingInvoice = IF(JSON_EXTRACT(p_JsonPayload, '$.isPendingInvoice') IN (true,1,'1','true'), b'1', b'0'),
            ReasonCode = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.reasonCode')), 'null'),
            Narration = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.narration')), 'null'),
            Remarks = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), 'null'),
            Version = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), Version) + 1,
            ModifiedBy = v_ModifiedBy, ModifiedDate = v_CurrentDate
        WHERE Id = p_Id;

        DELETE FROM DebitNoteLine WHERE DebitNoteId = p_Id;
        IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
            INSERT INTO DebitNoteLine (
                DebitNoteId, ItemCode, ItemName, Uom, Quantity, Rate, HsnCode, TaxPct,
                TaxableAmount, TaxAmount, LineTotal, SourceReference, Remarks, CreatedBy, CreatedDate
            )
            SELECT
                p_Id, NULLIF(itemCode,'null'), NULLIF(itemName,'null'), NULLIF(uom,'null'),
                IFNULL(quantity,0), IFNULL(rate,0), NULLIF(hsnCode,'null'), IFNULL(taxPct,0),
                ROUND(IFNULL(quantity,0) * IFNULL(rate,0), 2),
                ROUND(IFNULL(quantity,0) * IFNULL(rate,0) * IFNULL(taxPct,0)/100, 2),
                ROUND(IFNULL(quantity,0) * IFNULL(rate,0) * (1 + IFNULL(taxPct,0)/100), 2),
                NULLIF(sourceReference,'null'), NULLIF(remarks,'null'), v_ModifiedBy, v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    quantity DECIMAL(18,4) PATH '$.quantity',
                    rate DECIMAL(18,4) PATH '$.rate',
                    hsnCode VARCHAR(20) PATH '$.hsnCode',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    sourceReference VARCHAR(200) PATH '$.sourceReference',
                    remarks VARCHAR(500) PATH '$.remarks'
                )
            ) AS jt;
        END IF;

        UPDATE DebitNote d
           SET TaxableAmount = IFNULL((SELECT SUM(TaxableAmount) FROM DebitNoteLine WHERE DebitNoteId = p_Id),0),
               TaxAmount     = IFNULL((SELECT SUM(TaxAmount) FROM DebitNoteLine WHERE DebitNoteId = p_Id),0),
               TotalAmount   = IFNULL((SELECT SUM(LineTotal) FROM DebitNoteLine WHERE DebitNoteId = p_Id),0)
         WHERE d.Id = p_Id;

        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'SET_STATUS' THEN
        UPDATE DebitNote
           SET Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
               SupplierAckStatus = IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierAckStatus')),'null'), SupplierAckStatus),
               ApprovedAt = IF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')) = 'APPROVED', v_CurrentDate, ApprovedAt),
               ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System'),
               ModifiedDate = v_CurrentDate,
               Version = IFNULL(Version,1) + 1
         WHERE Id = p_Id;
        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM DebitNote WHERE Id = p_Id;
        SELECT JSON_OBJECT('success', true) AS Result;
    END IF;
END
