DELIMITER $$

DROP PROCEDURE IF EXISTS ERP_Procurement.SpManagePurchaseOrder$$

CREATE PROCEDURE ERP_Procurement.SpManagePurchaseOrder(
    IN p_Action VARCHAR(20),
    IN p_Id INT,
    IN p_JsonPayload JSON
)
BEGIN
    DECLARE v_CurrentDate DATETIME DEFAULT NOW();
    DECLARE v_CreatedBy VARCHAR(100);
    DECLARE v_ModifiedBy VARCHAR(100);
    DECLARE v_DocNo VARCHAR(30);
    DECLARE v_NewId INT;
    DECLARE v_FY VARCHAR(10);
    DECLARE v_NextSeq INT;

    IF p_Action = 'CREATE' THEN
        SET v_FY = (SELECT CASE 
            WHEN MONTH(CURDATE()) >= 4 THEN CONCAT(RIGHT(YEAR(CURDATE()), 2), '-', RIGHT(YEAR(CURDATE()) + 1, 2))
            ELSE CONCAT(RIGHT(YEAR(CURDATE()) - 1, 2), '-', RIGHT(YEAR(CURDATE()), 2))
        END);
        SET v_NextSeq = (SELECT IFNULL(MAX(CAST(SUBSTRING_INDEX(DocNo, '/', -1) AS UNSIGNED)), 0) + 1
                         FROM PurchaseOrder WHERE DocNo LIKE CONCAT('PO/', v_FY, '/%'));
        SET v_DocNo = CONCAT('PO/', v_FY, '/', LPAD(v_NextSeq, 5, '0'));
        SET v_CreatedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy')), 'System');

        INSERT INTO PurchaseOrder (
            DocNo, DocDate, Status, Plant, PoType, SupplierUid, SupplierName,
            Buyer, Currency, ExchangeRate, PaymentTerms, DeliveryTerms, Incoterm,
            DeliveryWarehouse, PromisedDate, RfqNo, PrRefs, ContractNo,
            BasicValue, DiscountValue, TaxValue, FreightValue, TotalValue,
            Remarks, Version, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            v_DocNo,
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')), CURDATE()),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), 'DRAFT'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')), 'DEFAULT'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poType')), 'STANDARD'),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')), ''),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.buyer')), 'Procurement'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')), 'INR'),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.exchangeRate')), 1),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.paymentTerms')), ''),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryTerms')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.incoterm')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryWarehouse')), ''),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.promisedDate')), CURDATE()),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rfqNo')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.prRefs')),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.contractNo')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.basicValue')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.discountValue')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.taxValue')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.freightValue')), 0),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalValue')), 0),
            JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')),
            IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), 1),
            v_CreatedBy, v_CurrentDate, v_CreatedBy, v_CurrentDate
        );

        SET v_NewId = LAST_INSERT_ID();

        IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.lines') THEN
            INSERT INTO PurchaseOrderLine (
                PurchaseOrderId, ItemCode, ItemName, Uom, Qty, Rate,
                DiscountPct, Hsn, TaxPct, Amount, TaxAmount, LineTotal,
                DueDate, CreatedBy, CreatedDate
            )
            SELECT
                v_NewId,
                IFNULL(itemCode, ''),
                IFNULL(itemName, ''),
                IFNULL(uom, ''),
                IFNULL(qty, 0),
                IFNULL(rate, 0),
                IFNULL(discountPct, 0),
                IFNULL(hsn, ''),
                IFNULL(taxPct, 0),
                IFNULL(amount, 0),
                IFNULL(taxAmount, 0),
                IFNULL(lineTotal, 0),
                IFNULL(dueDate, CURDATE()),
                v_CreatedBy,
                v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    qty DECIMAL(18,4) PATH '$.qty',
                    rate DECIMAL(18,4) PATH '$.rate',
                    discountPct DECIMAL(5,2) PATH '$.discountPct',
                    hsn VARCHAR(20) PATH '$.hsn',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    amount DECIMAL(18,2) PATH '$.amount',
                    taxAmount DECIMAL(18,2) PATH '$.taxAmount',
                    lineTotal DECIMAL(18,2) PATH '$.lineTotal',
                    dueDate DATE PATH '$.dueDate'
                )
            ) AS jt;
        END IF;

        SELECT JSON_OBJECT('uid', q.Id, 'docNo', q.DocNo, 'docDate', q.DocDate, 'status', q.Status, 'plant', q.Plant, 'poType', q.PoType, 'supplierUid', q.SupplierUid, 'supplierName', q.SupplierName, 'buyer', q.Buyer, 'currency', q.Currency, 'exchangeRate', q.ExchangeRate, 'paymentTerms', q.PaymentTerms, 'deliveryTerms', q.DeliveryTerms, 'incoterm', q.Incoterm, 'deliveryWarehouse', q.DeliveryWarehouse, 'promisedDate', q.PromisedDate, 'rfqNo', q.RfqNo, 'basicValue', q.BasicValue, 'discountValue', q.DiscountValue, 'taxValue', q.TaxValue, 'freightValue', q.FreightValue, 'totalValue', q.TotalValue, 'remarks', q.Remarks, 'version', q.Version, 'createdBy', q.CreatedBy, 'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'), 'lines', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('uid', l.Id, 'itemCode', l.ItemCode, 'itemName', l.ItemName, 'uom', l.Uom, 'qty', l.Qty, 'rate', l.Rate, 'discountPct', l.DiscountPct, 'hsn', l.Hsn, 'taxPct', l.TaxPct, 'amount', l.Amount, 'taxAmount', l.TaxAmount, 'lineTotal', l.LineTotal, 'dueDate', l.DueDate)) FROM PurchaseOrderLine l WHERE l.PurchaseOrderId = q.Id), JSON_ARRAY())) AS Result FROM PurchaseOrder q WHERE q.Id = v_NewId;

    ELSEIF p_Action = 'UPDATE' THEN
        SET v_ModifiedBy = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy')));

        UPDATE PurchaseOrder SET
            DocDate = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')), DocDate),
            Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
            Plant = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')), Plant),
            PoType = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.poType')), PoType),
            SupplierUid = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')), SupplierUid),
            SupplierName = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')), SupplierName),
            Buyer = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.buyer')), Buyer),
            Currency = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')), Currency),
            ExchangeRate = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.exchangeRate')), ExchangeRate),
            PaymentTerms = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.paymentTerms')), PaymentTerms),
            DeliveryTerms = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryTerms')), DeliveryTerms),
            Incoterm = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.incoterm')), Incoterm),
            DeliveryWarehouse = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryWarehouse')), DeliveryWarehouse),
            PromisedDate = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.promisedDate')), PromisedDate),
            RfqNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rfqNo')), RfqNo),
            PrRefs = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.prRefs')), PrRefs),
            ContractNo = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.contractNo')), ContractNo),
            BasicValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.basicValue')), BasicValue),
            DiscountValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.discountValue')), DiscountValue),
            TaxValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.taxValue')), TaxValue),
            FreightValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.freightValue')), FreightValue),
            TotalValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalValue')), TotalValue),
            Remarks = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')), Remarks),
            Version = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')), Version),
            ModifiedBy = v_ModifiedBy,
            ModifiedDate = v_CurrentDate
        WHERE Id = p_Id AND IsDeleted = 0;

        IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.lines') THEN
            DELETE FROM PurchaseOrderLine WHERE PurchaseOrderId = p_Id;

            INSERT INTO PurchaseOrderLine (
                PurchaseOrderId, ItemCode, ItemName, Uom, Qty, Rate,
                DiscountPct, Hsn, TaxPct, Amount, TaxAmount, LineTotal,
                DueDate, CreatedBy, CreatedDate
            )
            SELECT
                p_Id,
                IFNULL(itemCode, ''),
                IFNULL(itemName, ''),
                IFNULL(uom, ''),
                IFNULL(qty, 0),
                IFNULL(rate, 0),
                IFNULL(discountPct, 0),
                IFNULL(hsn, ''),
                IFNULL(taxPct, 0),
                IFNULL(amount, 0),
                IFNULL(taxAmount, 0),
                IFNULL(lineTotal, 0),
                IFNULL(dueDate, CURDATE()),
                IFNULL(v_ModifiedBy, 'System'),
                v_CurrentDate
            FROM JSON_TABLE(
                p_JsonPayload, '$.lines[*]' COLUMNS (
                    itemCode VARCHAR(50) PATH '$.itemCode',
                    itemName VARCHAR(200) PATH '$.itemName',
                    uom VARCHAR(20) PATH '$.uom',
                    qty DECIMAL(18,4) PATH '$.qty',
                    rate DECIMAL(18,4) PATH '$.rate',
                    discountPct DECIMAL(5,2) PATH '$.discountPct',
                    hsn VARCHAR(20) PATH '$.hsn',
                    taxPct DECIMAL(5,2) PATH '$.taxPct',
                    amount DECIMAL(18,2) PATH '$.amount',
                    taxAmount DECIMAL(18,2) PATH '$.taxAmount',
                    lineTotal DECIMAL(18,2) PATH '$.lineTotal',
                    dueDate DATE PATH '$.dueDate'
                )
            ) AS jt;
        END IF;

        SELECT JSON_OBJECT('uid', q.Id, 'docNo', q.DocNo, 'docDate', q.DocDate, 'status', q.Status, 'plant', q.Plant, 'poType', q.PoType, 'supplierUid', q.SupplierUid, 'supplierName', q.SupplierName, 'buyer', q.Buyer, 'currency', q.Currency, 'exchangeRate', q.ExchangeRate, 'paymentTerms', q.PaymentTerms, 'deliveryTerms', q.DeliveryTerms, 'incoterm', q.Incoterm, 'deliveryWarehouse', q.DeliveryWarehouse, 'promisedDate', q.PromisedDate, 'rfqNo', q.RfqNo, 'basicValue', q.BasicValue, 'discountValue', q.DiscountValue, 'taxValue', q.TaxValue, 'freightValue', q.FreightValue, 'totalValue', q.TotalValue, 'remarks', q.Remarks, 'version', q.Version, 'createdBy', q.CreatedBy, 'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'), 'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'), 'lines', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('uid', l.Id, 'itemCode', l.ItemCode, 'itemName', l.ItemName, 'uom', l.Uom, 'qty', l.Qty, 'rate', l.Rate, 'discountPct', l.DiscountPct, 'hsn', l.Hsn, 'taxPct', l.TaxPct, 'amount', l.Amount, 'taxAmount', l.TaxAmount, 'lineTotal', l.LineTotal, 'dueDate', l.DueDate)) FROM PurchaseOrderLine l WHERE l.PurchaseOrderId = q.Id), JSON_ARRAY())) AS Result FROM PurchaseOrder q WHERE q.Id = p_Id AND q.IsDeleted = 0;

    ELSEIF p_Action = 'SET_STATUS' THEN
        UPDATE PurchaseOrder SET Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')), ModifiedDate = v_CurrentDate WHERE Id = p_Id;
        SELECT JSON_OBJECT('uid', p_Id) AS Result;

    ELSEIF p_Action = 'DELETE' THEN
        UPDATE PurchaseOrder SET IsDeleted = 1, ModifiedDate = v_CurrentDate, ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy')) WHERE Id = p_Id;
        SELECT JSON_OBJECT('uid', p_Id, 'docNo', v_DocNo) AS Result;

    ELSEIF p_Action = 'READ' THEN
        SELECT JSON_OBJECT('uid', q.Id, 'docNo', q.DocNo, 'docDate', q.DocDate, 'status', q.Status, 'plant', q.Plant, 'poType', q.PoType, 'supplierUid', q.SupplierUid, 'supplierName', q.SupplierName, 'buyer', q.Buyer, 'currency', q.Currency, 'exchangeRate', q.ExchangeRate, 'paymentTerms', q.PaymentTerms, 'deliveryTerms', q.DeliveryTerms, 'incoterm', q.Incoterm, 'deliveryWarehouse', q.DeliveryWarehouse, 'promisedDate', q.PromisedDate, 'rfqNo', q.RfqNo, 'prRefs', IF(JSON_VALID(q.PrRefs), JSON_EXTRACT(q.PrRefs, '$'), JSON_ARRAY()), 'contractNo', q.ContractNo, 'basicValue', q.BasicValue, 'discountValue', q.DiscountValue, 'taxValue', q.TaxValue, 'freightValue', q.FreightValue, 'totalValue', q.TotalValue, 'receivedPct', q.ReceivedPct, 'billedPct', q.BilledPct, 'acknowledged', q.Acknowledged = 1, 'acknowledgedAt', DATE_FORMAT(q.AcknowledgedAt, '%Y-%m-%dT%H:%i:%sZ'), 'shortCloseReason', q.ShortCloseReason, 'remarks', q.Remarks, 'version', q.Version, 'attachments', q.Attachments, 'comments', q.Comments, 'createdBy', q.CreatedBy, 'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'), 'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'), 'approvals', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('level', a.Level, 'role', a.Role, 'approver', a.Approver, 'status', a.Status, 'actedAt', DATE_FORMAT(a.ActedAt, '%Y-%m-%dT%H:%i:%sZ'), 'remarks', a.Remarks)) FROM PurchaseOrderApproval a WHERE a.PurchaseOrderId = q.Id), JSON_ARRAY()), 'amendments', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('revision', am.Revision, 'amendedAt', DATE_FORMAT(am.AmendedAt, '%Y-%m-%dT%H:%i:%sZ'), 'amendedBy', am.AmendedBy, 'reason', am.Reason, 'changes', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('field', amc.Field, 'from', amc.FromValue, 'to', amc.ToValue)) FROM PurchaseOrderAmendmentChange amc WHERE amc.PurchaseOrderAmendmentId = am.Id), JSON_ARRAY()))) FROM PurchaseOrderAmendment am WHERE am.PurchaseOrderId = q.Id), JSON_ARRAY()), 'lines', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('uid', l.Id, 'itemCode', l.ItemCode, 'itemName', l.ItemName, 'uom', l.Uom, 'qty', l.Qty, 'receivedQty', l.ReceivedQty, 'rejectedQty', l.RejectedQty, 'billedQty', l.BilledQty, 'rate', l.Rate, 'discountPct', l.DiscountPct, 'hsn', l.Hsn, 'taxPct', l.TaxPct, 'amount', l.Amount, 'taxAmount', l.TaxAmount, 'lineTotal', l.LineTotal, 'dueDate', l.DueDate, 'qcRequired', l.QcRequired = 1, 'schedules', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('uid', s.Id, 'dueDate', s.DueDate, 'qty', s.Qty, 'receivedQty', s.ReceivedQty)) FROM PurchaseOrderSchedule s WHERE s.PurchaseOrderLineId = l.Id), JSON_ARRAY()))) FROM PurchaseOrderLine l WHERE l.PurchaseOrderId = q.Id), JSON_ARRAY())) AS Result FROM PurchaseOrder q WHERE q.Id = p_Id AND q.IsDeleted = 0;

    ELSEIF p_Action = 'READ_ALL' THEN
        SELECT JSON_ARRAYAGG(JSON_OBJECT('uid', q.Id, 'docNo', q.DocNo, 'docDate', q.DocDate, 'status', q.Status, 'plant', q.Plant, 'poType', q.PoType, 'supplierUid', q.SupplierUid, 'supplierName', q.SupplierName, 'buyer', q.Buyer, 'currency', q.Currency, 'exchangeRate', q.ExchangeRate, 'paymentTerms', q.PaymentTerms, 'deliveryTerms', q.DeliveryTerms, 'incoterm', q.Incoterm, 'deliveryWarehouse', q.DeliveryWarehouse, 'promisedDate', q.PromisedDate, 'rfqNo', q.RfqNo, 'prRefs', IF(JSON_VALID(q.PrRefs), JSON_EXTRACT(q.PrRefs, '$'), JSON_ARRAY()), 'contractNo', q.ContractNo, 'basicValue', q.BasicValue, 'discountValue', q.DiscountValue, 'taxValue', q.TaxValue, 'freightValue', q.FreightValue, 'totalValue', q.TotalValue, 'receivedPct', q.ReceivedPct, 'billedPct', q.BilledPct, 'acknowledged', q.Acknowledged = 1, 'acknowledgedAt', DATE_FORMAT(q.AcknowledgedAt, '%Y-%m-%dT%H:%i:%sZ'), 'shortCloseReason', q.ShortCloseReason, 'remarks', q.Remarks, 'version', q.Version, 'attachments', q.Attachments, 'comments', q.Comments, 'createdBy', q.CreatedBy, 'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'), 'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'), 'approvals', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('level', a.Level, 'role', a.Role, 'approver', a.Approver, 'status', a.Status, 'actedAt', DATE_FORMAT(a.ActedAt, '%Y-%m-%dT%H:%i:%sZ'), 'remarks', a.Remarks)) FROM PurchaseOrderApproval a WHERE a.PurchaseOrderId = q.Id), JSON_ARRAY()), 'amendments', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('revision', am.Revision, 'amendedAt', DATE_FORMAT(am.AmendedAt, '%Y-%m-%dT%H:%i:%sZ'), 'amendedBy', am.AmendedBy, 'reason', am.Reason, 'changes', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('field', amc.Field, 'from', amc.FromValue, 'to', amc.ToValue)) FROM PurchaseOrderAmendmentChange amc WHERE amc.PurchaseOrderAmendmentId = am.Id), JSON_ARRAY()))) FROM PurchaseOrderAmendment am WHERE am.PurchaseOrderId = q.Id), JSON_ARRAY()), 'lines', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('uid', l.Id, 'itemCode', l.ItemCode, 'itemName', l.ItemName, 'uom', l.Uom, 'qty', l.Qty, 'receivedQty', l.ReceivedQty, 'rejectedQty', l.RejectedQty, 'billedQty', l.BilledQty, 'rate', l.Rate, 'discountPct', l.DiscountPct, 'hsn', l.Hsn, 'taxPct', l.TaxPct, 'amount', l.Amount, 'taxAmount', l.TaxAmount, 'lineTotal', l.LineTotal, 'dueDate', l.DueDate, 'qcRequired', l.QcRequired = 1, 'schedules', IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('uid', s.Id, 'dueDate', s.DueDate, 'qty', s.Qty, 'receivedQty', s.ReceivedQty)) FROM PurchaseOrderSchedule s WHERE s.PurchaseOrderLineId = l.Id), JSON_ARRAY()))) FROM PurchaseOrderLine l WHERE l.PurchaseOrderId = q.Id), JSON_ARRAY()))) AS Result FROM PurchaseOrder q WHERE q.IsDeleted = 0;
    END IF;
END$$

DELIMITER ;
