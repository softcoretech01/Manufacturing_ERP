-- Supplier Invoice Verification (3-way match) — the settlement stage of the
-- procurement value chain (Vol 3 Ch 7, menu 8). Extends the existing legacy
-- ERP_Procurement stored-procedure module (matches SpManageGrn/SpManagePurchaseOrder).
--
-- A supplier invoice is booked against an approved purchase order and reconciled
-- against what was actually received (GRN accepted quantity) and what was ordered
-- (PO rate/quantity):
--   * RATE     — invoice unit price vs PO rate, within tolerance
--   * QTY/OVER — billed quantity cannot exceed received-accepted-not-yet-billed
--   * NO_PO    — an invoiced item that is not on the PO
-- MATCH writes exception rows and a header MatchStatus; APPROVE rolls BilledQty
-- back onto the PO lines (activating PurchaseOrder.BilledPct) and clears the
-- invoice for finance.
--
-- Segments are separated by a line reading exactly `-- @@GO`. apply_procurement_invoice.py
-- splits on that marker and executes each segment as one statement (no client
-- DELIMITER needed). Re-runnable: tables use IF NOT EXISTS, the proc is dropped
-- and recreated.

USE ERP_Procurement;
-- @@GO
CREATE TABLE IF NOT EXISTS SupplierInvoice (
  Id                   INT(11) NOT NULL AUTO_INCREMENT,
  DocNo                VARCHAR(30) NOT NULL,
  DocDate              DATE NOT NULL,
  Status               VARCHAR(30) NOT NULL DEFAULT 'DRAFT',     -- DRAFT|MATCHED|APPROVED|BLOCKED|CANCELLED
  PoNo                 VARCHAR(30) NOT NULL,
  SupplierUid          VARCHAR(50) NOT NULL,
  SupplierName         VARCHAR(200) NOT NULL,
  SupplierInvoiceNo    VARCHAR(100) NOT NULL,                    -- the vendor's own invoice number
  SupplierInvoiceDate  DATE NOT NULL,
  Currency             VARCHAR(10) NOT NULL DEFAULT 'INR',
  ExchangeRate         DECIMAL(18,8) NOT NULL DEFAULT 1.00000000,
  BasicValue           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  DiscountValue        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TaxValue             DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  FreightValue         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TotalValue           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  SupplierStatedTotal  DECIMAL(18,2) NOT NULL DEFAULT 0.00,      -- what the vendor claims; drives discrepancy
  MatchStatus          VARCHAR(20) NOT NULL DEFAULT 'NOT_MATCHED', -- NOT_MATCHED|MATCHED|EXCEPTION
  MatchedAt            DATETIME DEFAULT NULL,
  IsBlocked            BIT(1) NOT NULL DEFAULT b'0',
  BlockReason          VARCHAR(500) DEFAULT NULL,
  DueDate              DATE DEFAULT NULL,
  Remarks              VARCHAR(500) DEFAULT NULL,
  Version              INT(11) NOT NULL DEFAULT 1,
  Attachments          INT(11) NOT NULL DEFAULT 0,
  Comments             INT(11) NOT NULL DEFAULT 0,
  CreatedBy            VARCHAR(100) DEFAULT NULL,
  CreatedDate          DATETIME DEFAULT NULL,
  ModifiedBy           VARCHAR(100) DEFAULT NULL,
  ModifiedDate         DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY DocNo (DocNo),
  KEY ix_supinv_po (PoNo),
  KEY ix_supinv_supplier (SupplierUid),
  KEY ix_supinv_status (Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
CREATE TABLE IF NOT EXISTS SupplierInvoiceLine (
  Id                   INT(11) NOT NULL AUTO_INCREMENT,
  InvoiceId            INT(11) NOT NULL,
  PoLineRef            INT(11) DEFAULT NULL,                     -- PurchaseOrderLine.Id, set at creation
  GrnNo                VARCHAR(30) DEFAULT NULL,
  ItemCode             VARCHAR(50) NOT NULL,
  ItemName             VARCHAR(200) NOT NULL,
  Uom                  VARCHAR(20) NOT NULL,
  PoQty                DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  ReceivedAcceptedQty  DECIMAL(18,4) NOT NULL DEFAULT 0.0000,    -- snapshot at match, informational
  BilledQty            DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  PoRate               DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  InvoiceRate          DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  DiscountPct          DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  TaxPct               DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  Amount               DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  TaxAmount            DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  LineTotal            DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  QtyVariancePct       DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  RateVariancePct      DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  MatchStatus          VARCHAR(20) NOT NULL DEFAULT 'NOT_MATCHED', -- NOT_MATCHED|MATCHED|EXCEPTION
  ExceptionNote        VARCHAR(500) DEFAULT NULL,
  Remarks              VARCHAR(500) DEFAULT NULL,
  CreatedBy            VARCHAR(100) DEFAULT NULL,
  CreatedDate          DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  KEY InvoiceId (InvoiceId),
  CONSTRAINT SupplierInvoiceLine_ibfk_1 FOREIGN KEY (InvoiceId) REFERENCES SupplierInvoice (Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
CREATE TABLE IF NOT EXISTS SupplierInvoiceException (
  Id            INT(11) NOT NULL AUTO_INCREMENT,
  InvoiceId     INT(11) NOT NULL,
  LineRef       INT(11) DEFAULT NULL,
  ItemCode      VARCHAR(50) DEFAULT NULL,
  ExceptionType VARCHAR(30) NOT NULL,                            -- RATE|OVER_BILL|NO_PO_LINE|NO_RECEIPT|AMOUNT
  ExpectedVal   VARCHAR(100) DEFAULT NULL,
  ActualVal     VARCHAR(100) DEFAULT NULL,
  VariancePct   DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  Status        VARCHAR(20) NOT NULL DEFAULT 'OPEN',             -- OPEN|ACCEPTED|RESOLVED
  Remarks       VARCHAR(500) DEFAULT NULL,
  CreatedBy     VARCHAR(100) DEFAULT NULL,
  CreatedDate   DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  KEY InvoiceId (InvoiceId),
  CONSTRAINT SupplierInvoiceException_ibfk_1 FOREIGN KEY (InvoiceId) REFERENCES SupplierInvoice (Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
DROP PROCEDURE IF EXISTS SpManageSupplierInvoice;
-- @@GO
CREATE PROCEDURE SpManageSupplierInvoice(
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
    DECLARE v_RateTol DECIMAL(9,4) DEFAULT 2.0000;  -- allowed rate variance %, see Vol 3 (should be master data)
    DECLARE v_ExcCount INT DEFAULT 0;

    IF p_Action = 'CREATE' THEN
        SET v_CreatedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy')), 'System');
        SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));
        IF v_DocNo IS NULL OR v_DocNo = '' OR v_DocNo = 'null' THEN
            SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 12) AS UNSIGNED)), 0) + 1
              INTO v_NextNum FROM SupplierInvoice WHERE DocNo LIKE 'PINV/26-27/%';
            SET v_DocNo = CONCAT('PINV/26-27/', LPAD(v_NextNum, 5, '0'));
        END IF;

        INSERT INTO SupplierInvoice (
            DocNo, DocDate, Status, PoNo, SupplierUid, SupplierName, SupplierInvoiceNo,
            SupplierInvoiceDate, Currency, ExchangeRate, SupplierStatedTotal, DueDate, Remarks,
            Version, Attachments, Comments, MatchStatus, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo,
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), 'DRAFT'),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poNo')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceNo')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceDate')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')), 'INR'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.exchangeRate')), 1),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierStatedTotal')), 0),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.dueDate')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), 'null'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), 1),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
            'NOT_MATCHED',
            v_CreatedBy,
            v_CurrentDate
        );
        SET v_NewId = LAST_INSERT_ID();

        IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
            INSERT INTO SupplierInvoiceLine (
                InvoiceId, PoLineRef, GrnNo, ItemCode, ItemName, Uom, PoQty, ReceivedAcceptedQty,
                BilledQty, PoRate, InvoiceRate, DiscountPct, TaxPct, Amount, TaxAmount, LineTotal,
                Remarks, MatchStatus, CreatedBy, CreatedDate
            )
            SELECT
                v_NewId, NULLIF(poLineRef, 0), NULLIF(grnNo, 'null'), IFNULL(itemCode,''), IFNULL(itemName,''), IFNULL(uom,''),
                IFNULL(poQty,0), IFNULL(receivedAcceptedQty,0), IFNULL(billedQty,0), IFNULL(poRate,0), IFNULL(invoiceRate,0), IFNULL(discountPct,0), IFNULL(taxPct,0),
                ROUND(IFNULL(billedQty,0) * IFNULL(invoiceRate,0) * (1 - IFNULL(discountPct,0)/100), 2) AS Amount,
                ROUND(IFNULL(billedQty,0) * IFNULL(invoiceRate,0) * (1 - IFNULL(discountPct,0)/100) * IFNULL(taxPct,0)/100, 2) AS TaxAmount,
                ROUND(IFNULL(billedQty,0) * IFNULL(invoiceRate,0) * (1 - IFNULL(discountPct,0)/100) * (1 + IFNULL(taxPct,0)/100), 2) AS LineTotal,
                NULLIF(remarks, 'null'), 'NOT_MATCHED', v_CreatedBy, v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    poLineRef INT PATH '$.poLineRef',
                    grnNo VARCHAR(30) PATH '$.grnNo',
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    poQty DECIMAL(18,4) PATH '$.poQty',
                    receivedAcceptedQty DECIMAL(18,4) PATH '$.receivedAcceptedQty',
                    billedQty DECIMAL(18,4) PATH '$.billedQty',
                    poRate DECIMAL(18,4) PATH '$.poRate',
                    invoiceRate DECIMAL(18,4) PATH '$.invoiceRate',
                    discountPct DECIMAL(5,2) PATH '$.discountPct',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    remarks VARCHAR(500) PATH '$.remarks'
                )
            ) AS jt;
        END IF;

        -- Header money is always recomputed from the stored lines — never trusted from the client.
        UPDATE SupplierInvoice si
           SET BasicValue = IFNULL((SELECT SUM(Amount) FROM SupplierInvoiceLine WHERE InvoiceId = v_NewId), 0),
               TaxValue   = IFNULL((SELECT SUM(TaxAmount) FROM SupplierInvoiceLine WHERE InvoiceId = v_NewId), 0),
               TotalValue = IFNULL((SELECT SUM(LineTotal) FROM SupplierInvoiceLine WHERE InvoiceId = v_NewId), 0)
         WHERE si.Id = v_NewId;

        SELECT JSON_OBJECT('uid', v_NewId, 'docNo', v_DocNo) AS Result;

    ELSEIF p_Action = 'READ' THEN
        SELECT JSON_OBJECT(
            'uid', si.Id, 'docNo', si.DocNo, 'docDate', si.DocDate, 'status', si.Status,
            'poNo', si.PoNo, 'supplierUid', si.SupplierUid, 'supplierName', si.SupplierName,
            'supplierInvoiceNo', si.SupplierInvoiceNo, 'supplierInvoiceDate', si.SupplierInvoiceDate,
            'currency', si.Currency, 'exchangeRate', si.ExchangeRate,
            'basicValue', si.BasicValue, 'discountValue', si.DiscountValue, 'taxValue', si.TaxValue,
            'freightValue', si.FreightValue, 'totalValue', si.TotalValue,
            'supplierStatedTotal', si.SupplierStatedTotal,
            'matchStatus', si.MatchStatus, 'matchedAt', si.MatchedAt,
            'isBlocked', si.IsBlocked = b'1', 'blockReason', si.BlockReason,
            'dueDate', si.DueDate, 'remarks', si.Remarks, 'version', si.Version,
            'attachments', si.Attachments, 'comments', si.Comments,
            'createdBy', si.CreatedBy, 'createdAt', si.CreatedDate, 'modifiedAt', si.ModifiedDate,
            'lines', IFNULL((
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'uid', l.Id, 'poLineRef', l.PoLineRef, 'grnNo', l.GrnNo,
                    'itemCode', l.ItemCode, 'itemName', l.ItemName, 'uom', l.Uom,
                    'poQty', l.PoQty, 'receivedAcceptedQty', l.ReceivedAcceptedQty, 'billedQty', l.BilledQty,
                    'poRate', l.PoRate, 'invoiceRate', l.InvoiceRate,
                    'discountPct', l.DiscountPct, 'taxPct', l.TaxPct,
                    'amount', l.Amount, 'taxAmount', l.TaxAmount, 'lineTotal', l.LineTotal,
                    'qtyVariancePct', l.QtyVariancePct, 'rateVariancePct', l.RateVariancePct,
                    'matchStatus', l.MatchStatus, 'exceptionNote', l.ExceptionNote, 'remarks', l.Remarks
                )) FROM SupplierInvoiceLine l WHERE l.InvoiceId = si.Id
            ), JSON_ARRAY()),
            'exceptions', IFNULL((
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'uid', e.Id, 'lineRef', e.LineRef, 'itemCode', e.ItemCode,
                    'type', e.ExceptionType, 'expected', e.ExpectedVal, 'actual', e.ActualVal,
                    'variancePct', e.VariancePct, 'status', e.Status, 'remarks', e.Remarks
                )) FROM SupplierInvoiceException e WHERE e.InvoiceId = si.Id
            ), JSON_ARRAY())
        ) AS Result
        FROM SupplierInvoice si WHERE si.Id = p_Id;

    ELSEIF p_Action = 'READ_ALL' THEN
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'uid', si.Id, 'docNo', si.DocNo, 'docDate', si.DocDate, 'status', si.Status,
            'poNo', si.PoNo, 'supplierUid', si.SupplierUid, 'supplierName', si.SupplierName,
            'supplierInvoiceNo', si.SupplierInvoiceNo, 'supplierInvoiceDate', si.SupplierInvoiceDate,
            'currency', si.Currency, 'basicValue', si.BasicValue, 'taxValue', si.TaxValue,
            'totalValue', si.TotalValue, 'supplierStatedTotal', si.SupplierStatedTotal,
            'matchStatus', si.MatchStatus, 'isBlocked', si.IsBlocked = b'1',
            'dueDate', si.DueDate, 'version', si.Version, 'createdAt', si.CreatedDate,
            'lineCount', (SELECT COUNT(*) FROM SupplierInvoiceLine l WHERE l.InvoiceId = si.Id),
            'exceptionCount', (SELECT COUNT(*) FROM SupplierInvoiceException e WHERE e.InvoiceId = si.Id AND e.Status = 'OPEN')
        )) AS Result
        FROM SupplierInvoice si ORDER BY si.Id DESC;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System');
        UPDATE SupplierInvoice SET
            Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
            PoNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poNo')), PoNo),
            SupplierUid = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')), SupplierUid),
            SupplierName = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')), SupplierName),
            SupplierInvoiceNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceNo')), SupplierInvoiceNo),
            SupplierInvoiceDate = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierInvoiceDate')), SupplierInvoiceDate),
            SupplierStatedTotal = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierStatedTotal')), SupplierStatedTotal),
            DueDate = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.dueDate')), 'null'),
            Remarks = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), 'null'),
            Version = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), Version) + 1,
            MatchStatus = 'NOT_MATCHED',
            ModifiedBy = v_ModifiedBy, ModifiedDate = v_CurrentDate
        WHERE Id = p_Id;

        DELETE FROM SupplierInvoiceLine WHERE InvoiceId = p_Id;
        DELETE FROM SupplierInvoiceException WHERE InvoiceId = p_Id;
        IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.lines')) > 0 THEN
            INSERT INTO SupplierInvoiceLine (
                InvoiceId, PoLineRef, GrnNo, ItemCode, ItemName, Uom, PoQty, ReceivedAcceptedQty,
                BilledQty, PoRate, InvoiceRate, DiscountPct, TaxPct, Amount, TaxAmount, LineTotal,
                Remarks, MatchStatus, CreatedBy, CreatedDate
            )
            SELECT
                p_Id, NULLIF(poLineRef, 0), NULLIF(grnNo, 'null'), IFNULL(itemCode,''), IFNULL(itemName,''), IFNULL(uom,''),
                IFNULL(poQty,0), IFNULL(receivedAcceptedQty,0), IFNULL(billedQty,0), IFNULL(poRate,0), IFNULL(invoiceRate,0), IFNULL(discountPct,0), IFNULL(taxPct,0),
                ROUND(IFNULL(billedQty,0) * IFNULL(invoiceRate,0) * (1 - IFNULL(discountPct,0)/100), 2),
                ROUND(IFNULL(billedQty,0) * IFNULL(invoiceRate,0) * (1 - IFNULL(discountPct,0)/100) * IFNULL(taxPct,0)/100, 2),
                ROUND(IFNULL(billedQty,0) * IFNULL(invoiceRate,0) * (1 - IFNULL(discountPct,0)/100) * (1 + IFNULL(taxPct,0)/100), 2),
                NULLIF(remarks, 'null'), 'NOT_MATCHED', v_ModifiedBy, v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    poLineRef INT PATH '$.poLineRef',
                    grnNo VARCHAR(30) PATH '$.grnNo',
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    poQty DECIMAL(18,4) PATH '$.poQty',
                    receivedAcceptedQty DECIMAL(18,4) PATH '$.receivedAcceptedQty',
                    billedQty DECIMAL(18,4) PATH '$.billedQty',
                    poRate DECIMAL(18,4) PATH '$.poRate',
                    invoiceRate DECIMAL(18,4) PATH '$.invoiceRate',
                    discountPct DECIMAL(5,2) PATH '$.discountPct',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    remarks VARCHAR(500) PATH '$.remarks'
                )
            ) AS jt;
        END IF;

        UPDATE SupplierInvoice si
           SET BasicValue = IFNULL((SELECT SUM(Amount) FROM SupplierInvoiceLine WHERE InvoiceId = p_Id), 0),
               TaxValue   = IFNULL((SELECT SUM(TaxAmount) FROM SupplierInvoiceLine WHERE InvoiceId = p_Id), 0),
               TotalValue = IFNULL((SELECT SUM(LineTotal) FROM SupplierInvoiceLine WHERE InvoiceId = p_Id), 0)
         WHERE si.Id = p_Id;

        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'MATCH' THEN
        -- 3-way match: recompute per line against the PO rate and the received-accepted
        -- quantity, write exception rows, and set line + header MatchStatus.
        SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System');
        DELETE FROM SupplierInvoiceException WHERE InvoiceId = p_Id;

        -- Snapshot the received-accepted quantity per item from POSTED GRNs on this PO.
        UPDATE SupplierInvoiceLine l
        JOIN SupplierInvoice si ON si.Id = l.InvoiceId
        SET l.ReceivedAcceptedQty = IFNULL((
                SELECT SUM(gl.AcceptedQty)
                  FROM Grn g JOIN GrnLine gl ON gl.GrnId = g.Id
                 WHERE g.PoNo = si.PoNo AND g.Status = 'POSTED' AND gl.ItemCode = l.ItemCode
            ), 0),
            l.RateVariancePct = CASE WHEN l.PoRate > 0
                THEN ROUND((l.InvoiceRate - l.PoRate) / l.PoRate * 100, 4) ELSE 0 END,
            l.QtyVariancePct = CASE WHEN l.PoQty > 0
                THEN ROUND((l.BilledQty - l.PoQty) / l.PoQty * 100, 4) ELSE 0 END
        WHERE l.InvoiceId = p_Id;

        -- RATE exceptions: invoice rate outside tolerance of PO rate.
        INSERT INTO SupplierInvoiceException (InvoiceId, LineRef, ItemCode, ExceptionType, ExpectedVal, ActualVal, VariancePct, Status, CreatedBy, CreatedDate)
        SELECT p_Id, l.Id, l.ItemCode, 'RATE', l.PoRate, l.InvoiceRate, ABS(l.RateVariancePct), 'OPEN', v_ModifiedBy, v_CurrentDate
          FROM SupplierInvoiceLine l
         WHERE l.InvoiceId = p_Id AND l.PoRate > 0 AND ABS(l.RateVariancePct) > v_RateTol;

        -- NO_PO_LINE exceptions: item billed that has no PO rate reference.
        INSERT INTO SupplierInvoiceException (InvoiceId, LineRef, ItemCode, ExceptionType, ExpectedVal, ActualVal, VariancePct, Status, CreatedBy, CreatedDate)
        SELECT p_Id, l.Id, l.ItemCode, 'NO_PO_LINE', 'on PO', 'not found', 0, 'OPEN', v_ModifiedBy, v_CurrentDate
          FROM SupplierInvoiceLine l
         WHERE l.InvoiceId = p_Id AND (l.PoRate IS NULL OR l.PoRate = 0);

        -- OVER_BILL exceptions: billing more than received-and-accepted minus what the
        -- PO line was already billed on earlier invoices.
        INSERT INTO SupplierInvoiceException (InvoiceId, LineRef, ItemCode, ExceptionType, ExpectedVal, ActualVal, VariancePct, Status, CreatedBy, CreatedDate)
        SELECT p_Id, l.Id, l.ItemCode, 'OVER_BILL',
               CAST(l.ReceivedAcceptedQty - IFNULL(pol.BilledQty, 0) AS CHAR), CAST(l.BilledQty AS CHAR), 0, 'OPEN', v_ModifiedBy, v_CurrentDate
          FROM SupplierInvoiceLine l
          LEFT JOIN PurchaseOrderLine pol ON pol.Id = l.PoLineRef
         WHERE l.InvoiceId = p_Id
           AND l.BilledQty > (l.ReceivedAcceptedQty - IFNULL(pol.BilledQty, 0)) + 0.0001;

        -- Per-line status from whether it produced any exception.
        UPDATE SupplierInvoiceLine l SET l.MatchStatus =
            CASE WHEN EXISTS (SELECT 1 FROM SupplierInvoiceException e WHERE e.InvoiceId = p_Id AND e.LineRef = l.Id)
                 THEN 'EXCEPTION' ELSE 'MATCHED' END,
            l.ExceptionNote = (SELECT GROUP_CONCAT(e.ExceptionType SEPARATOR ', ')
                                 FROM SupplierInvoiceException e WHERE e.InvoiceId = p_Id AND e.LineRef = l.Id)
        WHERE l.InvoiceId = p_Id;

        SELECT COUNT(*) INTO v_ExcCount FROM SupplierInvoiceException WHERE InvoiceId = p_Id;
        UPDATE SupplierInvoice
           SET MatchStatus = IF(v_ExcCount = 0, 'MATCHED', 'EXCEPTION'),
               Status = CASE WHEN Status IN ('DRAFT','MATCHED','BLOCKED')
                             THEN IF(v_ExcCount = 0, 'MATCHED', 'BLOCKED') ELSE Status END,
               IsBlocked = IF(v_ExcCount = 0, b'0', b'1'),
               MatchedAt = v_CurrentDate, ModifiedBy = v_ModifiedBy, ModifiedDate = v_CurrentDate
         WHERE Id = p_Id;

        SELECT JSON_OBJECT('uid', p_Id, 'exceptionCount', v_ExcCount,
                           'matchStatus', IF(v_ExcCount = 0, 'MATCHED', 'EXCEPTION')) AS Result;

    ELSEIF p_Action = 'APPROVE' THEN
        -- Roll billed quantity onto the PO lines and recompute PurchaseOrder.BilledPct.
        SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System');

        UPDATE PurchaseOrderLine pol
        JOIN SupplierInvoiceLine l ON l.PoLineRef = pol.Id
        SET pol.BilledQty = IFNULL(pol.BilledQty, 0) + l.BilledQty,
            pol.ModifiedBy = v_ModifiedBy, pol.ModifiedDate = v_CurrentDate
        WHERE l.InvoiceId = p_Id;

        UPDATE PurchaseOrder po
        SET po.BilledPct = IFNULL((
                SELECT ROUND(SUM(pol.BilledQty) / NULLIF(SUM(pol.Qty), 0) * 100, 2)
                  FROM PurchaseOrderLine pol WHERE pol.PurchaseOrderId = po.Id
            ), 0),
            po.ModifiedBy = v_ModifiedBy, po.ModifiedDate = v_CurrentDate
        WHERE po.DocNo = (SELECT PoNo FROM SupplierInvoice WHERE Id = p_Id);

        UPDATE SupplierInvoice
           SET Status = 'APPROVED', IsBlocked = b'0',
               ModifiedBy = v_ModifiedBy, ModifiedDate = v_CurrentDate
         WHERE Id = p_Id;

        SELECT JSON_OBJECT('uid', p_Id, 'status', 'APPROVED') AS Result;

    ELSEIF p_Action = 'SET_STATUS' THEN
        UPDATE SupplierInvoice
           SET Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
               BlockReason = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.blockReason')), 'null'),
               ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System'),
               ModifiedDate = v_CurrentDate,
               Version = IFNULL(Version, 1) + 1
         WHERE Id = p_Id;
        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM SupplierInvoice WHERE Id = p_Id;
        SELECT JSON_OBJECT('success', true) AS Result;
    END IF;
END
