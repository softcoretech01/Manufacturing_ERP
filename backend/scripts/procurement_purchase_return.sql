-- Purchase Return (Vol 3 Ch 7, menu 7 "Purchase Return") — rejected/damaged/
-- wrong material leaving the plant against a document, the counterpart to the
-- GRN. Extends the legacy ERP_Procurement stored-procedure module (matches
-- SpManageGrn / SpManageSupplierInvoice).
--
-- A return is raised against a GRN. Two kinds of returned material:
--   * FromStock = 0  — material rejected AT the GRN, which never entered the
--     stock ledger (GrnPostingService posts only accepted qty). Returning it is
--     paper-only: no ledger movement, validated against GrnLine.RejectedQty.
--   * FromStock = 1  — accepted material later found bad; it IS in stock, so
--     APPROVE posts an OUT movement through the inventory engine (StockService).
-- APPROVE (done in Python: purchase_return_posting.py) posts the stock-out, rolls
-- ReturnedQty onto the GRN and PO lines, and auto-drafts a debit note. This proc
-- owns only CRUD + status; SET_STATUS records the posting/debit-note back-links.
--
-- Segments split on a line reading exactly `-- @@GO` (see apply_procurement_invoice.py,
-- reused by apply). Re-runnable: tables IF NOT EXISTS, columns ADD IF NOT EXISTS,
-- proc dropped and recreated.

USE ERP_Procurement;
-- @@GO
-- Additive: let the GRN and PO lines carry how much has been returned, so open-qty
-- math stays correct. MariaDB supports ADD COLUMN IF NOT EXISTS.
ALTER TABLE PurchaseOrderLine ADD COLUMN IF NOT EXISTS ReturnedQty DECIMAL(18,4) NOT NULL DEFAULT 0.0000;
-- @@GO
ALTER TABLE GrnLine ADD COLUMN IF NOT EXISTS ReturnedQty DECIMAL(18,4) NOT NULL DEFAULT 0.0000;
-- @@GO
CREATE TABLE IF NOT EXISTS PurchaseReturn (
  Id                 INT(11) NOT NULL AUTO_INCREMENT,
  DocNo              VARCHAR(30) NOT NULL,
  DocDate            DATE NOT NULL,
  Status             VARCHAR(30) NOT NULL DEFAULT 'DRAFT',      -- DRAFT|APPROVED|DISPATCHED|CANCELLED
  GrnNo              VARCHAR(30) NOT NULL,
  PoNo               VARCHAR(30) DEFAULT NULL,
  SupplierUid        VARCHAR(50) NOT NULL,
  SupplierName       VARCHAR(200) NOT NULL,
  Warehouse          VARCHAR(200) NOT NULL,
  ReturnType         VARCHAR(30) NOT NULL DEFAULT 'REJECTION',  -- REJECTION|EXCESS|DAMAGE|WRONG_ITEM|QUALITY_FAILURE|EXPIRY
  ReasonCode         VARCHAR(50) DEFAULT NULL,
  Disposition        VARCHAR(30) NOT NULL DEFAULT 'RETURN_TO_SUPPLIER', -- RETURN_TO_SUPPLIER|REPLACEMENT_EXPECTED|REWORK_AT_SUPPLIER|SCRAP_AT_OUR_END|USE_AS_IS_WITH_CONCESSION
  TransporterName    VARCHAR(200) DEFAULT NULL,
  VehicleNo          VARCHAR(30) DEFAULT NULL,
  EwayBillNo         VARCHAR(20) DEFAULT NULL,
  EwayBillDate       DATE DEFAULT NULL,
  ReplacementExpected BIT(1) NOT NULL DEFAULT b'0',
  ReplacementPoNo    VARCHAR(30) DEFAULT NULL,
  TaxableAmount      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TaxAmount          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TotalAmount        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  DebitNoteId        INT(11) DEFAULT NULL,                      -- set when the debit note is auto-drafted
  DebitNoteNo        VARCHAR(30) DEFAULT NULL,
  StockPostedAt      DATETIME DEFAULT NULL,
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
  KEY ix_pret_grn (GrnNo),
  KEY ix_pret_supplier (SupplierUid),
  KEY ix_pret_status (Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
CREATE TABLE IF NOT EXISTS PurchaseReturnLine (
  Id             INT(11) NOT NULL AUTO_INCREMENT,
  ReturnId       INT(11) NOT NULL,
  GrnLineRef     INT(11) DEFAULT NULL,                          -- GrnLine.Id this return draws from
  PoLineRef      INT(11) DEFAULT NULL,                          -- PurchaseOrderLine.Id
  ItemCode       VARCHAR(50) NOT NULL,
  ItemName       VARCHAR(200) NOT NULL,
  Uom            VARCHAR(20) NOT NULL,
  BatchNo        VARCHAR(100) DEFAULT NULL,
  HeatNo         VARCHAR(100) DEFAULT NULL,
  Rate           DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  ReturnQty      DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  FromStock      BIT(1) NOT NULL DEFAULT b'0',                  -- 1 = reduce the ledger; 0 = rejected-at-GRN, paper only
  StockStatus    VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',      -- bucket to pull from when FromStock=1
  MaxReturnable  DECIMAL(18,4) NOT NULL DEFAULT 0.0000,         -- snapshot for the audit trail
  TaxPct         DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  TaxableAmount  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TaxAmount      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  LineTotal      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  ReasonCode     VARCHAR(50) DEFAULT NULL,
  Remarks        VARCHAR(500) DEFAULT NULL,
  CreatedBy      VARCHAR(100) DEFAULT NULL,
  CreatedDate    DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  KEY ReturnId (ReturnId),
  CONSTRAINT PurchaseReturnLine_ibfk_1 FOREIGN KEY (ReturnId) REFERENCES PurchaseReturn (Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
DROP PROCEDURE IF EXISTS SpManagePurchaseReturn;
-- @@GO
CREATE PROCEDURE SpManagePurchaseReturn(
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
            SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 12) AS UNSIGNED)), 0) + 1
              INTO v_NextNum FROM PurchaseReturn WHERE DocNo LIKE 'PRET/26-27/%';
            SET v_DocNo = CONCAT('PRET/26-27/', LPAD(v_NextNum, 5, '0'));
        END IF;

        INSERT INTO PurchaseReturn (
            DocNo, DocDate, Status, GrnNo, PoNo, SupplierUid, SupplierName, Warehouse,
            ReturnType, ReasonCode, Disposition, TransporterName, VehicleNo, EwayBillNo, EwayBillDate,
            ReplacementExpected, ReplacementPoNo, Remarks, Version, Attachments, Comments,
            CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo,
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), 'DRAFT'),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.grnNo')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poNo')), 'null'),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.warehouse')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.returnType')), 'REJECTION'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.reasonCode')), 'null'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.disposition')), 'RETURN_TO_SUPPLIER'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.transporterName')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.vehicleNo')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.ewayBillNo')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.ewayBillDate')), 'null'),
            IF(JSON_EXTRACT(p_JsonPayload, '$.replacementExpected') IN (true, 1, '1', 'true'), b'1', b'0'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.replacementPoNo')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), 'null'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), 1),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
            v_CreatedBy, v_CurrentDate
        );
        SET v_NewId = LAST_INSERT_ID();

        IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
            INSERT INTO PurchaseReturnLine (
                ReturnId, GrnLineRef, PoLineRef, ItemCode, ItemName, Uom, BatchNo, HeatNo,
                Rate, ReturnQty, FromStock, StockStatus, MaxReturnable, TaxPct,
                TaxableAmount, TaxAmount, LineTotal, ReasonCode, Remarks, CreatedBy, CreatedDate
            )
            SELECT
                v_NewId, NULLIF(grnLineRef,0), NULLIF(poLineRef,0), IFNULL(itemCode,''), IFNULL(itemName,''), IFNULL(uom,''),
                NULLIF(batchNo,'null'), NULLIF(heatNo,'null'),
                IFNULL(rate,0), IFNULL(returnQty,0),
                IF(fromStock IN ('1','true'), b'1', b'0'),
                IFNULL(NULLIF(stockStatus,'null'),'AVAILABLE'), IFNULL(maxReturnable,0), IFNULL(taxPct,0),
                ROUND(IFNULL(returnQty,0) * IFNULL(rate,0), 2),
                ROUND(IFNULL(returnQty,0) * IFNULL(rate,0) * IFNULL(taxPct,0)/100, 2),
                ROUND(IFNULL(returnQty,0) * IFNULL(rate,0) * (1 + IFNULL(taxPct,0)/100), 2),
                NULLIF(reasonCode,'null'), NULLIF(remarks,'null'), v_CreatedBy, v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    grnLineRef INT PATH '$.grnLineRef',
                    poLineRef INT PATH '$.poLineRef',
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    batchNo VARCHAR(100) PATH '$.batchNo',
                    heatNo VARCHAR(100) PATH '$.heatNo',
                    rate DECIMAL(18,4) PATH '$.rate',
                    returnQty DECIMAL(18,4) PATH '$.returnQty',
                    fromStock VARCHAR(10) PATH '$.fromStock',
                    stockStatus VARCHAR(20) PATH '$.stockStatus',
                    maxReturnable DECIMAL(18,4) PATH '$.maxReturnable',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    reasonCode VARCHAR(50) PATH '$.reasonCode',
                    remarks VARCHAR(500) PATH '$.remarks'
                )
            ) AS jt;
        END IF;

        UPDATE PurchaseReturn r
           SET TaxableAmount = IFNULL((SELECT SUM(TaxableAmount) FROM PurchaseReturnLine WHERE ReturnId = v_NewId),0),
               TaxAmount     = IFNULL((SELECT SUM(TaxAmount) FROM PurchaseReturnLine WHERE ReturnId = v_NewId),0),
               TotalAmount   = IFNULL((SELECT SUM(LineTotal) FROM PurchaseReturnLine WHERE ReturnId = v_NewId),0)
         WHERE r.Id = v_NewId;

        SELECT JSON_OBJECT('uid', v_NewId, 'docNo', v_DocNo) AS Result;

    ELSEIF p_Action = 'READ' THEN
        SELECT JSON_OBJECT(
            'uid', r.Id, 'docNo', r.DocNo, 'docDate', r.DocDate, 'status', r.Status,
            'grnNo', r.GrnNo, 'poNo', r.PoNo, 'supplierUid', r.SupplierUid, 'supplierName', r.SupplierName,
            'warehouse', r.Warehouse, 'returnType', r.ReturnType, 'reasonCode', r.ReasonCode,
            'disposition', r.Disposition, 'transporterName', r.TransporterName, 'vehicleNo', r.VehicleNo,
            'ewayBillNo', r.EwayBillNo, 'ewayBillDate', r.EwayBillDate,
            'replacementExpected', r.ReplacementExpected = b'1', 'replacementPoNo', r.ReplacementPoNo,
            'taxableAmount', r.TaxableAmount, 'taxAmount', r.TaxAmount, 'totalAmount', r.TotalAmount,
            'debitNoteId', r.DebitNoteId, 'debitNoteNo', r.DebitNoteNo,
            'stockPostedAt', r.StockPostedAt, 'approvedAt', r.ApprovedAt,
            'remarks', r.Remarks, 'version', r.Version,
            'attachments', r.Attachments, 'comments', r.Comments,
            'createdBy', r.CreatedBy, 'createdAt', r.CreatedDate, 'modifiedAt', r.ModifiedDate,
            'lines', IFNULL((
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'uid', l.Id, 'grnLineRef', l.GrnLineRef, 'poLineRef', l.PoLineRef,
                    'itemCode', l.ItemCode, 'itemName', l.ItemName, 'uom', l.Uom,
                    'batchNo', l.BatchNo, 'heatNo', l.HeatNo, 'rate', l.Rate, 'returnQty', l.ReturnQty,
                    'fromStock', l.FromStock = b'1', 'stockStatus', l.StockStatus, 'maxReturnable', l.MaxReturnable,
                    'taxPct', l.TaxPct, 'taxableAmount', l.TaxableAmount, 'taxAmount', l.TaxAmount,
                    'lineTotal', l.LineTotal, 'reasonCode', l.ReasonCode, 'remarks', l.Remarks
                )) FROM PurchaseReturnLine l WHERE l.ReturnId = r.Id
            ), JSON_ARRAY())
        ) AS Result
        FROM PurchaseReturn r WHERE r.Id = p_Id;

    ELSEIF p_Action = 'READ_ALL' THEN
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'uid', r.Id, 'docNo', r.DocNo, 'docDate', r.DocDate, 'status', r.Status,
            'grnNo', r.GrnNo, 'poNo', r.PoNo, 'supplierUid', r.SupplierUid, 'supplierName', r.SupplierName,
            'warehouse', r.Warehouse, 'returnType', r.ReturnType, 'disposition', r.Disposition,
            'totalAmount', r.TotalAmount, 'debitNoteNo', r.DebitNoteNo,
            'replacementExpected', r.ReplacementExpected = b'1',
            'version', r.Version, 'createdAt', r.CreatedDate,
            'lineCount', (SELECT COUNT(*) FROM PurchaseReturnLine l WHERE l.ReturnId = r.Id)
        )) AS Result
        FROM PurchaseReturn r ORDER BY r.Id DESC;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System');
        UPDATE PurchaseReturn SET
            GrnNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.grnNo')), GrnNo),
            PoNo = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poNo')), 'null'),
            SupplierUid = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')), SupplierUid),
            SupplierName = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')), SupplierName),
            Warehouse = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.warehouse')), Warehouse),
            ReturnType = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.returnType')), ReturnType),
            ReasonCode = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.reasonCode')), 'null'),
            Disposition = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.disposition')), Disposition),
            TransporterName = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.transporterName')), 'null'),
            VehicleNo = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.vehicleNo')), 'null'),
            EwayBillNo = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.ewayBillNo')), 'null'),
            EwayBillDate = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.ewayBillDate')), 'null'),
            ReplacementExpected = IF(JSON_EXTRACT(p_JsonPayload, '$.replacementExpected') IN (true,1,'1','true'), b'1', b'0'),
            ReplacementPoNo = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.replacementPoNo')), 'null'),
            Remarks = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), 'null'),
            Version = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), Version) + 1,
            ModifiedBy = v_ModifiedBy, ModifiedDate = v_CurrentDate
        WHERE Id = p_Id;

        DELETE FROM PurchaseReturnLine WHERE ReturnId = p_Id;
        IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
            INSERT INTO PurchaseReturnLine (
                ReturnId, GrnLineRef, PoLineRef, ItemCode, ItemName, Uom, BatchNo, HeatNo,
                Rate, ReturnQty, FromStock, StockStatus, MaxReturnable, TaxPct,
                TaxableAmount, TaxAmount, LineTotal, ReasonCode, Remarks, CreatedBy, CreatedDate
            )
            SELECT
                p_Id, NULLIF(grnLineRef,0), NULLIF(poLineRef,0), IFNULL(itemCode,''), IFNULL(itemName,''), IFNULL(uom,''),
                NULLIF(batchNo,'null'), NULLIF(heatNo,'null'),
                IFNULL(rate,0), IFNULL(returnQty,0),
                IF(fromStock IN ('1','true'), b'1', b'0'),
                IFNULL(NULLIF(stockStatus,'null'),'AVAILABLE'), IFNULL(maxReturnable,0), IFNULL(taxPct,0),
                ROUND(IFNULL(returnQty,0) * IFNULL(rate,0), 2),
                ROUND(IFNULL(returnQty,0) * IFNULL(rate,0) * IFNULL(taxPct,0)/100, 2),
                ROUND(IFNULL(returnQty,0) * IFNULL(rate,0) * (1 + IFNULL(taxPct,0)/100), 2),
                NULLIF(reasonCode,'null'), NULLIF(remarks,'null'), v_ModifiedBy, v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    grnLineRef INT PATH '$.grnLineRef',
                    poLineRef INT PATH '$.poLineRef',
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    batchNo VARCHAR(100) PATH '$.batchNo',
                    heatNo VARCHAR(100) PATH '$.heatNo',
                    rate DECIMAL(18,4) PATH '$.rate',
                    returnQty DECIMAL(18,4) PATH '$.returnQty',
                    fromStock VARCHAR(10) PATH '$.fromStock',
                    stockStatus VARCHAR(20) PATH '$.stockStatus',
                    maxReturnable DECIMAL(18,4) PATH '$.maxReturnable',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    reasonCode VARCHAR(50) PATH '$.reasonCode',
                    remarks VARCHAR(500) PATH '$.remarks'
                )
            ) AS jt;
        END IF;

        UPDATE PurchaseReturn r
           SET TaxableAmount = IFNULL((SELECT SUM(TaxableAmount) FROM PurchaseReturnLine WHERE ReturnId = p_Id),0),
               TaxAmount     = IFNULL((SELECT SUM(TaxAmount) FROM PurchaseReturnLine WHERE ReturnId = p_Id),0),
               TotalAmount   = IFNULL((SELECT SUM(LineTotal) FROM PurchaseReturnLine WHERE ReturnId = p_Id),0)
         WHERE r.Id = p_Id;

        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'SET_STATUS' THEN
        UPDATE PurchaseReturn
           SET Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
               DebitNoteId = IFNULL(JSON_EXTRACT(p_JsonPayload, '$.debitNoteId'), DebitNoteId),
               DebitNoteNo = IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.debitNoteNo')),'null'), DebitNoteNo),
               StockPostedAt = IF(JSON_EXTRACT(p_JsonPayload, '$.stockPosted') IN (true,1,'1','true'), v_CurrentDate, StockPostedAt),
               ApprovedAt = IF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')) = 'APPROVED', v_CurrentDate, ApprovedAt),
               ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System'),
               ModifiedDate = v_CurrentDate,
               Version = IFNULL(Version,1) + 1
         WHERE Id = p_Id;
        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM PurchaseReturn WHERE Id = p_Id;
        SELECT JSON_OBJECT('success', true) AS Result;
    END IF;
END
