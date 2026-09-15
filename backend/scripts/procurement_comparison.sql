-- Quotation Comparison (Vol 3 Ch 5) — the persisted, scored comparison document
-- that turns the quotations received against an RFQ into a ranked, auditable
-- recommendation and award. Extends the legacy ERP_Procurement stored-procedure
-- module (matches SpManageGrn / SpManageSupplierInvoice).
--
-- The landed-cost normalisation and weighted scoring are computed in Python
-- (comparison_service.py) and SNAPSHOTTED here at creation (SRS V3-CMP-BR-001):
--   * ComparisonBase = basic + freight, EXCLUDING creditable GST (BR-002)
--   * weights (price/delivery/quality) frozen into WeightsJson
--   * per-vendor scores, rank, and the recommendation frozen into rows
-- The recommendation is advisory — awarding is a separate, human decision
-- (BR-005), and awarding off the lowest landed cost needs a deviation reason
-- (BR-011). Award also drives the underlying quotation SELECT (winner SELECTED,
-- others REJECTED, RFQ COMPLETED), done in the router.
--
-- Segments split on `-- @@GO`. Re-runnable: tables IF NOT EXISTS, proc dropped/recreated.

USE ERP_Procurement;
-- @@GO
CREATE TABLE IF NOT EXISTS Comparison (
  Id                     INT(11) NOT NULL AUTO_INCREMENT,
  DocNo                  VARCHAR(30) NOT NULL,
  DocDate                DATE NOT NULL,
  RfqNo                  VARCHAR(30) NOT NULL,
  Title                  VARCHAR(200) DEFAULT NULL,
  Buyer                  VARCHAR(100) DEFAULT NULL,
  WeightsJson            JSON DEFAULT NULL,                    -- frozen {price,delivery,quality}
  Status                 VARCHAR(30) NOT NULL DEFAULT 'RECOMMENDED', -- RECOMMENDED|AWARDED|APPROVED|CANCELLED
  RecommendedQuotationUid VARCHAR(50) DEFAULT NULL,
  RecommendedSupplier    VARCHAR(200) DEFAULT NULL,
  Rationale              VARCHAR(2000) DEFAULT NULL,
  HighestValue           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  LowestValue            DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  SavingsVsHighest       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  AwardedQuotationUid    VARCHAR(50) DEFAULT NULL,
  AwardedSupplier        VARCHAR(200) DEFAULT NULL,
  AwardValue             DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  DeviationReasonCode    VARCHAR(50) DEFAULT NULL,
  DeviationJustification VARCHAR(2000) DEFAULT NULL,
  Remarks                VARCHAR(500) DEFAULT NULL,
  Version                INT(11) NOT NULL DEFAULT 1,
  Attachments            INT(11) NOT NULL DEFAULT 0,
  Comments               INT(11) NOT NULL DEFAULT 0,
  CreatedBy              VARCHAR(100) DEFAULT NULL,
  CreatedDate            DATETIME DEFAULT NULL,
  ModifiedBy             VARCHAR(100) DEFAULT NULL,
  ModifiedDate           DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY DocNo (DocNo),
  KEY ix_cmp_rfq (RfqNo),
  KEY ix_cmp_status (Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
CREATE TABLE IF NOT EXISTS ComparisonVendor (
  Id               INT(11) NOT NULL AUTO_INCREMENT,
  ComparisonId     INT(11) NOT NULL,
  QuotationUid     VARCHAR(50) NOT NULL,
  QuotationNo      VARCHAR(30) DEFAULT NULL,
  SupplierUid      VARCHAR(50) DEFAULT NULL,
  SupplierName     VARCHAR(200) DEFAULT NULL,
  QuotationStatus  VARCHAR(30) DEFAULT NULL,
  LandedValue      DECIMAL(18,2) NOT NULL DEFAULT 0.00,       -- incl tax, for display
  ComparisonBase   DECIMAL(18,2) NOT NULL DEFAULT 0.00,       -- ex creditable GST, for scoring
  LeadTimeDays     INT(11) NOT NULL DEFAULT 0,
  PriceScore       DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  DeliveryScore    DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  QualityScore     DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  TotalScore       DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  Rank_            INT(11) NOT NULL DEFAULT 0,
  IsRecommended    BIT(1) NOT NULL DEFAULT b'0',
  IsAwarded        BIT(1) NOT NULL DEFAULT b'0',
  ByItemJson       JSON DEFAULT NULL,                         -- {itemCode: {rate,taxPct,landedRate,qty,lineTotal}}
  CreatedBy        VARCHAR(100) DEFAULT NULL,
  CreatedDate      DATETIME DEFAULT NULL,
  PRIMARY KEY (Id),
  KEY ComparisonId (ComparisonId),
  CONSTRAINT ComparisonVendor_ibfk_1 FOREIGN KEY (ComparisonId) REFERENCES Comparison (Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- @@GO
DROP PROCEDURE IF EXISTS SpManageComparison;
-- @@GO
CREATE PROCEDURE SpManageComparison(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_JsonPayload JSON
)
proc_label:BEGIN
    DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;
    DECLARE v_CreatedBy VARCHAR(100);
    DECLARE v_NewId INT;
    DECLARE v_DocNo VARCHAR(30);
    DECLARE v_NextNum INT DEFAULT 0;

    IF p_Action = 'CREATE' THEN
        SET v_CreatedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy')), 'System');
        SET v_DocNo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo'));
        IF v_DocNo IS NULL OR v_DocNo = '' OR v_DocNo = 'null' THEN
            SELECT IFNULL(MAX(CAST(SUBSTRING(DocNo, 11) AS UNSIGNED)), 0) + 1
              INTO v_NextNum FROM Comparison WHERE DocNo LIKE 'CMP/26-27/%';
            SET v_DocNo = CONCAT('CMP/26-27/', LPAD(v_NextNum, 5, '0'));
        END IF;

        INSERT INTO Comparison (
            DocNo, DocDate, RfqNo, Title, Buyer, WeightsJson, Status,
            RecommendedQuotationUid, RecommendedSupplier, Rationale,
            HighestValue, LowestValue, SavingsVsHighest, Remarks,
            Version, Attachments, Comments, CreatedBy, CreatedDate
        ) VALUES (
            v_DocNo,
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rfqNo')),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.title')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.buyer')), 'null'),
            JSON_EXTRACT(p_JsonPayload, '$.weights'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), 'RECOMMENDED'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.recommendedQuotationUid')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.recommendedSupplier')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rationale')), 'null'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.highestValue')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.lowestValue')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.savingsVsHighest')), 0),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), 'null'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), 1),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
            v_CreatedBy, v_CurrentDate
        );
        SET v_NewId = LAST_INSERT_ID();

        IF JSON_LENGTH(JSON_EXTRACT(p_JsonPayload, '$.vendors')) > 0 THEN
            INSERT INTO ComparisonVendor (
                ComparisonId, QuotationUid, QuotationNo, SupplierUid, SupplierName, QuotationStatus,
                LandedValue, ComparisonBase, LeadTimeDays, PriceScore, DeliveryScore, QualityScore,
                TotalScore, Rank_, IsRecommended, ByItemJson, CreatedBy, CreatedDate
            )
            SELECT
                v_NewId, quotationUid, NULLIF(quotationNo,'null'), NULLIF(supplierUid,'null'),
                NULLIF(supplierName,'null'), NULLIF(quotationStatus,'null'),
                IFNULL(landedValue,0), IFNULL(comparisonBase,0), IFNULL(leadTimeDays,0),
                IFNULL(priceScore,0), IFNULL(deliveryScore,0), IFNULL(qualityScore,0),
                IFNULL(totalScore,0), IFNULL(rankNo,0),
                IF(isRecommended IN ('1','true'), b'1', b'0'),
                byItem, v_CreatedBy, v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.vendors[*]' COLUMNS (
                    quotationUid VARCHAR(50) PATH '$.quotationUid',
                    quotationNo VARCHAR(30) PATH '$.quotationNo',
                    supplierUid VARCHAR(50) PATH '$.supplierUid',
                    supplierName VARCHAR(200) PATH '$.supplierName',
                    quotationStatus VARCHAR(30) PATH '$.quotationStatus',
                    landedValue DECIMAL(18,2) PATH '$.landedValue',
                    comparisonBase DECIMAL(18,2) PATH '$.comparisonBase',
                    leadTimeDays INT PATH '$.leadTimeDays',
                    priceScore DECIMAL(9,4) PATH '$.priceScore',
                    deliveryScore DECIMAL(9,4) PATH '$.deliveryScore',
                    qualityScore DECIMAL(9,4) PATH '$.qualityScore',
                    totalScore DECIMAL(9,4) PATH '$.totalScore',
                    rankNo INT PATH '$.rank',
                    isRecommended VARCHAR(10) PATH '$.isRecommended',
                    byItem JSON PATH '$.byItem'
                )
            ) AS jt;
        END IF;

        SELECT JSON_OBJECT('uid', v_NewId, 'docNo', v_DocNo) AS Result;

    ELSEIF p_Action = 'READ' THEN
        SELECT JSON_OBJECT(
            'uid', c.Id, 'docNo', c.DocNo, 'docDate', c.DocDate, 'rfqNo', c.RfqNo,
            'title', c.Title, 'buyer', c.Buyer, 'weights', c.WeightsJson, 'status', c.Status,
            'recommendedQuotationUid', c.RecommendedQuotationUid, 'recommendedSupplier', c.RecommendedSupplier,
            'rationale', c.Rationale, 'highestValue', c.HighestValue, 'lowestValue', c.LowestValue,
            'savingsVsHighest', c.SavingsVsHighest,
            'awardedQuotationUid', c.AwardedQuotationUid, 'awardedSupplier', c.AwardedSupplier, 'awardValue', c.AwardValue,
            'deviationReasonCode', c.DeviationReasonCode, 'deviationJustification', c.DeviationJustification,
            'remarks', c.Remarks, 'version', c.Version, 'createdBy', c.CreatedBy,
            'createdAt', c.CreatedDate, 'modifiedAt', c.ModifiedDate,
            'vendors', IFNULL((
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'uid', v.Id, 'quotationUid', v.QuotationUid, 'quotationNo', v.QuotationNo,
                    'supplierUid', v.SupplierUid, 'supplierName', v.SupplierName, 'quotationStatus', v.QuotationStatus,
                    'landedValue', v.LandedValue, 'comparisonBase', v.ComparisonBase, 'leadTimeDays', v.LeadTimeDays,
                    'priceScore', v.PriceScore, 'deliveryScore', v.DeliveryScore, 'qualityScore', v.QualityScore,
                    'totalScore', v.TotalScore, 'rank', v.Rank_,
                    'isRecommended', v.IsRecommended = b'1', 'isAwarded', v.IsAwarded = b'1',
                    'byItem', v.ByItemJson
                ) ORDER BY v.Rank_) FROM ComparisonVendor v WHERE v.ComparisonId = c.Id
            ), JSON_ARRAY())
        ) AS Result
        FROM Comparison c WHERE c.Id = p_Id;

    ELSEIF p_Action = 'READ_ALL' THEN
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'uid', c.Id, 'docNo', c.DocNo, 'docDate', c.DocDate, 'rfqNo', c.RfqNo,
            'title', c.Title, 'status', c.Status,
            'recommendedSupplier', c.RecommendedSupplier, 'awardedSupplier', c.AwardedSupplier,
            'lowestValue', c.LowestValue, 'savingsVsHighest', c.SavingsVsHighest,
            'version', c.Version, 'createdAt', c.CreatedDate,
            'vendorCount', (SELECT COUNT(*) FROM ComparisonVendor v WHERE v.ComparisonId = c.Id)
        )) AS Result
        FROM Comparison c ORDER BY c.Id DESC;

    ELSEIF p_Action = 'SET_STATUS' THEN
        UPDATE Comparison
           SET Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
               AwardedQuotationUid = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardedQuotationUid')), 'null'),
               AwardedSupplier = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardedSupplier')), 'null'),
               AwardValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardValue')), AwardValue),
               DeviationReasonCode = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deviationReasonCode')), 'null'),
               DeviationJustification = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deviationJustification')), 'null'),
               ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), 'System'),
               ModifiedDate = v_CurrentDate,
               Version = IFNULL(Version,1) + 1
         WHERE Id = p_Id;
        -- flag the awarded vendor row
        IF JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardedQuotationUid')) IS NOT NULL THEN
            UPDATE ComparisonVendor SET IsAwarded = b'0' WHERE ComparisonId = p_Id;
            UPDATE ComparisonVendor SET IsAwarded = b'1'
             WHERE ComparisonId = p_Id
               AND QuotationUid = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardedQuotationUid'));
        END IF;
        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'DELETE' THEN
        DELETE FROM Comparison WHERE Id = p_Id;
        SELECT JSON_OBJECT('success', true) AS Result;
    END IF;
END
