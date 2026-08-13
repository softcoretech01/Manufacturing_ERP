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
        CREATE TABLE IF NOT EXISTS SupplierQuotation (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            DocNo VARCHAR(30) UNIQUE NOT NULL,
            DocDate DATE NOT NULL,
            RfqNo VARCHAR(30) NOT NULL,
            SupplierUid VARCHAR(50) NOT NULL,
            SupplierName VARCHAR(200) NOT NULL,
            Status VARCHAR(30) NOT NULL,
            Currency VARCHAR(10) NOT NULL DEFAULT 'INR',
            ExchangeRate DECIMAL(18,8) NOT NULL DEFAULT 1,
            ValidTill DATE NOT NULL,
            PaymentTerms VARCHAR(200) NULL,
            DeliveryTerms VARCHAR(200) NULL,
            WarrantyMonths INT NOT NULL DEFAULT 0,
            BasicValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            TaxValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            FreightValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            LandedValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            LeadTimeDays INT NOT NULL DEFAULT 0,
            TechnicalScore DECIMAL(5,2) DEFAULT 0,
            CommercialScore DECIMAL(5,2) DEFAULT 0,
            TotalScore DECIMAL(5,2) DEFAULT 0,
            Rank INT DEFAULT 0,
            Attachments INT DEFAULT 0,
            NegotiationRounds INT DEFAULT 0,
            IsDeleted BIT DEFAULT 0,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL
        );

        CREATE TABLE IF NOT EXISTS SupplierQuotationLine (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            SupplierQuotationId INT NOT NULL,
            ItemCode VARCHAR(50) NOT NULL,
            ItemName VARCHAR(200) NOT NULL,
            Uom VARCHAR(20) NOT NULL,
            Qty DECIMAL(18,4) NOT NULL,
            Rate DECIMAL(18,4) NOT NULL,
            DiscountPct DECIMAL(5,2) DEFAULT 0,
            TaxPct DECIMAL(5,2) DEFAULT 18,
            Freight DECIMAL(18,2) DEFAULT 0,
            LandedRate DECIMAL(18,4) DEFAULT 0,
            LeadTimeDays INT DEFAULT 0,
            Moq DECIMAL(18,4) DEFAULT 0,
            Remarks VARCHAR(500) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (SupplierQuotationId) REFERENCES SupplierQuotation(Id) ON DELETE CASCADE
        );
        """
        cursor.execute(tables_sql)
        print("Tables validated/created.")

        # Stored Procedure setup
        sp_sql = """
        DROP PROCEDURE IF EXISTS SpManageSupplierQuotation;
        
        CREATE PROCEDURE SpManageSupplierQuotation(
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

                INSERT INTO SupplierQuotation (
                    DocNo, DocDate, RfqNo, SupplierUid, SupplierName, Status, Currency, ExchangeRate, 
                    ValidTill, PaymentTerms, DeliveryTerms, WarrantyMonths, BasicValue, TaxValue, FreightValue, LandedValue, 
                    LeadTimeDays, TechnicalScore, CommercialScore, TotalScore, Rank, Attachments, NegotiationRounds, 
                    CreatedBy, CreatedDate
                ) VALUES (
                    v_DocNo,
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rfqNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierUid')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.supplierName')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')), 'INR'),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.exchangeRate')), 1),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.validTill')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.paymentTerms')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryTerms')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.warrantyMonths')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.basicValue')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.taxValue')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.freightValue')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.landedValue')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.leadTimeDays')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.technicalScore')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.commercialScore')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalScore')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rank')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.negotiationRounds')), 0),
                    v_CreatedBy,
                    v_CurrentDate
                );

                SET v_NewId = LAST_INSERT_ID();

                INSERT INTO SupplierQuotationLine (
                    SupplierQuotationId, ItemCode, ItemName, Uom, Qty, Rate, DiscountPct, TaxPct, Freight, LandedRate, LeadTimeDays, Moq, Remarks, CreatedBy, CreatedDate
                )
                SELECT 
                    v_NewId,
                    itemCode,
                    itemName,
                    uom,
                    qty,
                    rate,
                    discountPct,
                    taxPct,
                    freight,
                    landedRate,
                    leadTimeDays,
                    moq,
                    remarks,
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
                        taxPct DECIMAL(5,2) PATH '$.taxPct',
                        freight DECIMAL(18,2) PATH '$.freight',
                        landedRate DECIMAL(18,4) PATH '$.landedRate',
                        leadTimeDays INT PATH '$.leadTimeDays',
                        moq DECIMAL(18,4) PATH '$.moq',
                        remarks VARCHAR(500) PATH '$.remarks'
                    )
                ) AS jt;

                SELECT 
                    JSON_OBJECT(
                        'uid', q.Id,
                        'docNo', q.DocNo,
                        'docDate', q.DocDate,
                        'rfqNo', q.RfqNo,
                        'supplierUid', q.SupplierUid,
                        'supplierName', q.SupplierName,
                        'status', q.Status,
                        'currency', q.Currency,
                        'exchangeRate', q.ExchangeRate,
                        'validTill', q.ValidTill,
                        'paymentTerms', q.PaymentTerms,
                        'deliveryTerms', q.DeliveryTerms,
                        'warrantyMonths', q.WarrantyMonths,
                        'basicValue', q.BasicValue,
                        'taxValue', q.TaxValue,
                        'freightValue', q.FreightValue,
                        'landedValue', q.LandedValue,
                        'leadTimeDays', q.LeadTimeDays,
                        'technicalScore', q.TechnicalScore,
                        'commercialScore', q.CommercialScore,
                        'totalScore', q.TotalScore,
                        'rank', q.Rank,
                        'attachments', q.Attachments,
                        'negotiationRounds', q.NegotiationRounds,
                        'createdBy', q.CreatedBy,
                        'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'uid', l.Id,
                                    'itemCode', l.ItemCode,
                                    'itemName', l.ItemName,
                                    'uom', l.Uom,
                                    'qty', l.Qty,
                                    'rate', l.Rate,
                                    'discountPct', l.DiscountPct,
                                    'taxPct', l.TaxPct,
                                    'freight', l.Freight,
                                    'landedRate', l.LandedRate,
                                    'leadTimeDays', l.LeadTimeDays,
                                    'moq', l.Moq,
                                    'remarks', l.Remarks
                                )
                            ) FROM SupplierQuotationLine l WHERE l.SupplierQuotationId = q.Id
                        ), JSON_ARRAY())
                    ) AS Result
                FROM SupplierQuotation q
                WHERE q.Id = v_NewId AND q.IsDeleted = 0;

            ELSEIF p_Action = 'READ' THEN
                SELECT 
                    JSON_OBJECT(
                        'uid', q.Id,
                        'docNo', q.DocNo,
                        'docDate', q.DocDate,
                        'rfqNo', q.RfqNo,
                        'supplierUid', q.SupplierUid,
                        'supplierName', q.SupplierName,
                        'status', q.Status,
                        'currency', q.Currency,
                        'exchangeRate', q.ExchangeRate,
                        'validTill', q.ValidTill,
                        'paymentTerms', q.PaymentTerms,
                        'deliveryTerms', q.DeliveryTerms,
                        'warrantyMonths', q.WarrantyMonths,
                        'basicValue', q.BasicValue,
                        'taxValue', q.TaxValue,
                        'freightValue', q.FreightValue,
                        'landedValue', q.LandedValue,
                        'leadTimeDays', q.LeadTimeDays,
                        'technicalScore', q.TechnicalScore,
                        'commercialScore', q.CommercialScore,
                        'totalScore', q.TotalScore,
                        'rank', q.Rank,
                        'attachments', q.Attachments,
                        'negotiationRounds', q.NegotiationRounds,
                        'createdBy', q.CreatedBy,
                        'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'uid', l.Id,
                                    'itemCode', l.ItemCode,
                                    'itemName', l.ItemName,
                                    'uom', l.Uom,
                                    'qty', l.Qty,
                                    'rate', l.Rate,
                                    'discountPct', l.DiscountPct,
                                    'taxPct', l.TaxPct,
                                    'freight', l.Freight,
                                    'landedRate', l.LandedRate,
                                    'leadTimeDays', l.LeadTimeDays,
                                    'moq', l.Moq,
                                    'remarks', l.Remarks
                                )
                            ) FROM SupplierQuotationLine l WHERE l.SupplierQuotationId = q.Id
                        ), JSON_ARRAY())
                    ) AS Result
                FROM SupplierQuotation q
                WHERE q.Id = p_Id AND q.IsDeleted = 0;

            ELSEIF p_Action = 'READ_ALL' THEN
                SELECT 
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'uid', q.Id,
                            'docNo', q.DocNo,
                            'docDate', q.DocDate,
                            'rfqNo', q.RfqNo,
                            'supplierUid', q.SupplierUid,
                            'supplierName', q.SupplierName,
                            'status', q.Status,
                            'currency', q.Currency,
                            'exchangeRate', q.ExchangeRate,
                            'validTill', q.ValidTill,
                            'paymentTerms', q.PaymentTerms,
                            'deliveryTerms', q.DeliveryTerms,
                            'warrantyMonths', q.WarrantyMonths,
                            'basicValue', q.BasicValue,
                            'taxValue', q.TaxValue,
                            'freightValue', q.FreightValue,
                            'landedValue', q.LandedValue,
                            'leadTimeDays', q.LeadTimeDays,
                            'technicalScore', q.TechnicalScore,
                            'commercialScore', q.CommercialScore,
                            'totalScore', q.TotalScore,
                            'rank', q.Rank,
                            'attachments', q.Attachments,
                            'negotiationRounds', q.NegotiationRounds,
                            'createdBy', q.CreatedBy,
                            'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                            'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                            'lines', IFNULL((
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'uid', l.Id,
                                        'itemCode', l.ItemCode,
                                        'itemName', l.ItemName,
                                        'uom', l.Uom,
                                        'qty', l.Qty,
                                        'rate', l.Rate,
                                        'discountPct', l.DiscountPct,
                                        'taxPct', l.TaxPct,
                                        'freight', l.Freight,
                                        'landedRate', l.LandedRate,
                                        'leadTimeDays', l.LeadTimeDays,
                                        'moq', l.Moq,
                                        'remarks', l.Remarks
                                    )
                                ) FROM SupplierQuotationLine l WHERE l.SupplierQuotationId = q.Id
                            ), JSON_ARRAY())
                        )
                    ) AS Result
                FROM SupplierQuotation q
                WHERE q.IsDeleted = 0;

            ELSEIF p_Action = 'UPDATE' THEN
                SET v_ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy'));
                
                UPDATE SupplierQuotation SET
                    Status = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')), Status),
                    ValidTill = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.validTill')), ValidTill),
                    PaymentTerms = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.paymentTerms')), PaymentTerms),
                    DeliveryTerms = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.deliveryTerms')), DeliveryTerms),
                    WarrantyMonths = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.warrantyMonths')), WarrantyMonths),
                    BasicValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.basicValue')), BasicValue),
                    TaxValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.taxValue')), TaxValue),
                    FreightValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.freightValue')), FreightValue),
                    LandedValue = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.landedValue')), LandedValue),
                    LeadTimeDays = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.leadTimeDays')), LeadTimeDays),
                    TechnicalScore = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.technicalScore')), TechnicalScore),
                    CommercialScore = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.commercialScore')), CommercialScore),
                    TotalScore = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.totalScore')), TotalScore),
                    Rank = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.rank')), Rank),
                    Attachments = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), Attachments),
                    NegotiationRounds = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.negotiationRounds')), NegotiationRounds),
                    ModifiedBy = v_ModifiedBy,
                    ModifiedDate = v_CurrentDate
                WHERE Id = p_Id AND IsDeleted = 0;

                -- Only update lines if 'lines' array is present in payload
                IF JSON_CONTAINS_PATH(p_JsonPayload, 'one', '$.lines') THEN
                    DELETE FROM SupplierQuotationLine WHERE SupplierQuotationId = p_Id;

                    INSERT INTO SupplierQuotationLine (
                        SupplierQuotationId, ItemCode, ItemName, Uom, Qty, Rate, DiscountPct, TaxPct, Freight, LandedRate, LeadTimeDays, Moq, Remarks, CreatedBy, CreatedDate
                    )
                    SELECT 
                        p_Id,
                        itemCode,
                        itemName,
                        uom,
                        qty,
                        rate,
                        discountPct,
                        taxPct,
                        freight,
                        landedRate,
                        leadTimeDays,
                        moq,
                        remarks,
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
                            taxPct DECIMAL(5,2) PATH '$.taxPct',
                            freight DECIMAL(18,2) PATH '$.freight',
                            landedRate DECIMAL(18,4) PATH '$.landedRate',
                            leadTimeDays INT PATH '$.leadTimeDays',
                            moq DECIMAL(18,4) PATH '$.moq',
                            remarks VARCHAR(500) PATH '$.remarks'
                        )
                    ) AS jt;
                END IF;

                SELECT 
                    JSON_OBJECT(
                        'uid', q.Id,
                        'docNo', q.DocNo,
                        'docDate', q.DocDate,
                        'rfqNo', q.RfqNo,
                        'supplierUid', q.SupplierUid,
                        'supplierName', q.SupplierName,
                        'status', q.Status,
                        'currency', q.Currency,
                        'exchangeRate', q.ExchangeRate,
                        'validTill', q.ValidTill,
                        'paymentTerms', q.PaymentTerms,
                        'deliveryTerms', q.DeliveryTerms,
                        'warrantyMonths', q.WarrantyMonths,
                        'basicValue', q.BasicValue,
                        'taxValue', q.TaxValue,
                        'freightValue', q.FreightValue,
                        'landedValue', q.LandedValue,
                        'leadTimeDays', q.LeadTimeDays,
                        'technicalScore', q.TechnicalScore,
                        'commercialScore', q.CommercialScore,
                        'totalScore', q.TotalScore,
                        'rank', q.Rank,
                        'attachments', q.Attachments,
                        'negotiationRounds', q.NegotiationRounds,
                        'createdBy', q.CreatedBy,
                        'createdAt', DATE_FORMAT(q.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'modifiedAt', DATE_FORMAT(q.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'uid', l.Id,
                                    'itemCode', l.ItemCode,
                                    'itemName', l.ItemName,
                                    'uom', l.Uom,
                                    'qty', l.Qty,
                                    'rate', l.Rate,
                                    'discountPct', l.DiscountPct,
                                    'taxPct', l.TaxPct,
                                    'freight', l.Freight,
                                    'landedRate', l.LandedRate,
                                    'leadTimeDays', l.LeadTimeDays,
                                    'moq', l.Moq,
                                    'remarks', l.Remarks
                                )
                            ) FROM SupplierQuotationLine l WHERE l.SupplierQuotationId = q.Id
                        ), JSON_ARRAY())
                    ) AS Result
                FROM SupplierQuotation q
                WHERE q.Id = p_Id AND q.IsDeleted = 0;

            ELSEIF p_Action = 'DELETE' THEN
                UPDATE SupplierQuotation 
                SET IsDeleted = 1, ModifiedDate = v_CurrentDate, ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy'))
                WHERE Id = p_Id;
                
                SELECT JSON_OBJECT('success', true) AS Result;
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
