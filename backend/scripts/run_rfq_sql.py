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
        DROP TABLE IF EXISTS RfqApprovalStep;
        DROP TABLE IF EXISTS RfqSupplier;
        DROP TABLE IF EXISTS RfqLine;
        DROP TABLE IF EXISTS Rfq;
        
        CREATE TABLE IF NOT EXISTS Rfq (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            DocNo VARCHAR(30) UNIQUE NOT NULL,
            DocDate DATE NOT NULL,
            Status VARCHAR(30) NOT NULL,
            Plant VARCHAR(100) NOT NULL,
            Title VARCHAR(200) NOT NULL,
            Category VARCHAR(100) NOT NULL,
            QuoteDueBy DATE NOT NULL,
            Buyer VARCHAR(100) NOT NULL,
            Sealed BIT NOT NULL DEFAULT 1,
            Currency VARCHAR(10) NOT NULL DEFAULT 'INR',
            EstimatedValue DECIMAL(18,2) NOT NULL DEFAULT 0,
            AwardedTo VARCHAR(100) NULL,
            PrRefs JSON NULL,
            Version INT NOT NULL DEFAULT 1,
            Remarks VARCHAR(500) NULL,
            Attachments INT DEFAULT 0,
            Comments INT DEFAULT 0,
            IsDeleted BIT DEFAULT 0,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL
        );

        CREATE TABLE IF NOT EXISTS RfqLine (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            RfqId INT NOT NULL,
            ItemCode VARCHAR(50) NOT NULL,
            ItemName VARCHAR(200) NOT NULL,
            Uom VARCHAR(20) NOT NULL,
            Qty DECIMAL(18,4) NOT NULL,
            RequiredBy DATE NOT NULL,
            Specification VARCHAR(1000) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (RfqId) REFERENCES Rfq(Id)
        );

        CREATE TABLE IF NOT EXISTS RfqSupplier (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            RfqId INT NOT NULL,
            SupplierUid VARCHAR(50) NOT NULL,
            SupplierName VARCHAR(200) NOT NULL,
            InvitedAt DATETIME NOT NULL,
            RespondedAt DATETIME NULL,
            ResponseStatus VARCHAR(30) NOT NULL,
            QuotationUid VARCHAR(50) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (RfqId) REFERENCES Rfq(Id)
        );

        CREATE TABLE IF NOT EXISTS RfqApprovalStep (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            RfqId INT NOT NULL,
            Level INT NOT NULL,
            Role VARCHAR(100) NOT NULL,
            Approver VARCHAR(100) NOT NULL,
            Status VARCHAR(30) NOT NULL,
            ActedAt DATETIME NULL,
            Remarks VARCHAR(500) NULL,
            CreatedBy VARCHAR(100) NULL,
            CreatedDate DATETIME NULL,
            ModifiedBy VARCHAR(100) NULL,
            ModifiedDate DATETIME NULL,
            FOREIGN KEY (RfqId) REFERENCES Rfq(Id)
        );
        """
        
        cursor.execute(tables_sql)
        
        # Drop PROCEDURE
        cursor.execute("DROP PROCEDURE IF EXISTS SpManageRfq")
        
        # Create Procedure
        procedure_sql = """
        CREATE PROCEDURE SpManageRfq(
            IN p_Action VARCHAR(20),
            IN p_Id INT,
            IN p_JsonPayload JSON
        )
        BEGIN
            DECLARE v_RfqId INT;
            DECLARE v_CurrentDate DATETIME DEFAULT CURRENT_TIMESTAMP;
            DECLARE v_CreatedBy VARCHAR(100);
            
            IF p_Action = 'CREATE' THEN
                SET v_CreatedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy'));
                
                INSERT INTO Rfq (
                    DocNo, DocDate, Status, Plant, Title, Category, QuoteDueBy, Buyer,
                    Sealed, Currency, EstimatedValue, AwardedTo, PrRefs,
                    Version, Remarks, Attachments, Comments, IsDeleted,
                    CreatedBy, CreatedDate
                ) VALUES (
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docNo')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.docDate')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.title')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.category')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.quoteDueBy')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.buyer')),
                    IF(JSON_EXTRACT(p_JsonPayload, '$.sealed') = TRUE, 1, 0),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.estimatedValue')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardedTo')),
                    JSON_EXTRACT(p_JsonPayload, '$.prRefs'),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')),
                    JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
                    0,
                    v_CreatedBy,
                    v_CurrentDate
                );
                
                SET v_RfqId = LAST_INSERT_ID();
                
                INSERT INTO RfqLine (
                    RfqId, ItemCode, ItemName, Uom, Qty, RequiredBy, Specification,
                    CreatedBy, CreatedDate
                )
                SELECT 
                    v_RfqId, jt.itemCode, jt.itemName, jt.uom, jt.qty, jt.requiredBy, jt.specification,
                    v_CreatedBy, v_CurrentDate
                FROM JSON_TABLE(
                    p_JsonPayload, '$.lines[*]' COLUMNS (
                        itemCode VARCHAR(50) PATH '$.itemCode',
                        itemName VARCHAR(200) PATH '$.itemName',
                        uom VARCHAR(20) PATH '$.uom',
                        qty DECIMAL(18,4) PATH '$.qty',
                        requiredBy DATE PATH '$.requiredBy',
                        specification VARCHAR(1000) PATH '$.specification'
                    )
                ) AS jt;

                INSERT INTO RfqSupplier (
                    RfqId, SupplierUid, SupplierName, InvitedAt, RespondedAt, ResponseStatus, QuotationUid,
                    CreatedBy, CreatedDate
                )
                SELECT 
                    v_RfqId, jt.supplierUid, jt.supplierName, 
                    NULLIF(REPLACE(REPLACE(jt.invitedAt, 'T', ' '), 'Z', ''), 'null'), 
                    NULLIF(REPLACE(REPLACE(jt.respondedAt, 'T', ' '), 'Z', ''), 'null'), 
                    jt.responseStatus, jt.quotationUid,
                    v_CreatedBy, v_CurrentDate
                FROM JSON_TABLE(
                    p_JsonPayload, '$.suppliers[*]' COLUMNS (
                        supplierUid VARCHAR(50) PATH '$.supplierUid',
                        supplierName VARCHAR(200) PATH '$.supplierName',
                        invitedAt VARCHAR(50) PATH '$.invitedAt',
                        respondedAt VARCHAR(50) PATH '$.respondedAt',
                        responseStatus VARCHAR(30) PATH '$.responseStatus',
                        quotationUid VARCHAR(50) PATH '$.quotationUid'
                    )
                ) AS jt;

                INSERT INTO RfqApprovalStep (
                    RfqId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
                )
                SELECT 
                    v_RfqId, jt.level, jt.role, jt.approver, jt.status, 
                    NULLIF(REPLACE(REPLACE(jt.actedAt, 'T', ' '), 'Z', ''), 'null'), jt.remarks, v_CreatedBy, v_CurrentDate
                FROM JSON_TABLE(
                    p_JsonPayload, '$.approvals[*]' COLUMNS (
                        level INT PATH '$.level',
                        role VARCHAR(100) PATH '$.role',
                        approver VARCHAR(100) PATH '$.approver',
                        status VARCHAR(30) PATH '$.status',
                        actedAt VARCHAR(50) PATH '$.actedAt',
                        remarks VARCHAR(500) PATH '$.remarks'
                    )
                ) AS jt;

                SELECT 
                    JSON_OBJECT(
                        'uid', r.Id,
                        'docNo', r.DocNo,
                        'docDate', r.DocDate,
                        'status', r.Status,
                        'plant', r.Plant,
                        'title', r.Title,
                        'category', r.Category,
                        'quoteDueBy', r.QuoteDueBy,
                        'buyer', r.Buyer,
                        'sealed', IF(r.Sealed = 1, true, false),
                        'currency', r.Currency,
                        'estimatedValue', r.EstimatedValue,
                        'awardedTo', r.AwardedTo,
                        'prRefs', r.PrRefs,
                        'version', r.Version,
                        'remarks', r.Remarks,
                        'attachments', r.Attachments,
                        'comments', r.Comments,
                        'createdBy', r.CreatedBy,
                        'createdAt', DATE_FORMAT(r.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'modifiedAt', DATE_FORMAT(r.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'uid', l.Id,
                                    'itemCode', l.ItemCode,
                                    'itemName', l.ItemName,
                                    'uom', l.Uom,
                                    'qty', l.Qty,
                                    'requiredBy', l.RequiredBy,
                                    'specification', l.Specification
                                )
                            ) FROM RfqLine l WHERE l.RfqId = r.Id
                        ), JSON_ARRAY()),
                        'suppliers', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'supplierUid', s.SupplierUid,
                                    'supplierName', s.SupplierName,
                                    'invitedAt', DATE_FORMAT(s.InvitedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'respondedAt', DATE_FORMAT(s.RespondedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'responseStatus', s.ResponseStatus,
                                    'quotationUid', s.QuotationUid
                                )
                            ) FROM RfqSupplier s WHERE s.RfqId = r.Id
                        ), JSON_ARRAY()),
                        'approvals', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'level', a.Level,
                                    'role', a.Role,
                                    'approver', a.Approver,
                                    'status', a.Status,
                                    'actedAt', a.ActedAt,
                                    'remarks', a.Remarks
                                )
                            ) FROM RfqApprovalStep a WHERE a.RfqId = r.Id
                        ), JSON_ARRAY())
                    ) AS Result
                FROM Rfq r
                WHERE r.Id = v_RfqId AND r.IsDeleted = 0;

            ELSEIF p_Action = 'UPDATE' THEN
                SET v_RfqId = p_Id;
                SET v_CreatedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.createdBy'));
                
                UPDATE Rfq SET
                    Status = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.status')),
                    Plant = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.plant')),
                    Title = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.title')),
                    Category = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.category')),
                    QuoteDueBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.quoteDueBy')),
                    Buyer = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.buyer')),
                    Sealed = IF(JSON_EXTRACT(p_JsonPayload, '$.sealed') = TRUE, 1, 0),
                    Currency = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.currency')),
                    EstimatedValue = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.estimatedValue')),
                    AwardedTo = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.awardedTo')),
                    PrRefs = JSON_EXTRACT(p_JsonPayload, '$.prRefs'),
                    Version = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.version')),
                    Remarks = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.remarks')),
                    Attachments = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.attachments')), 0),
                    Comments = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.comments')), 0),
                    ModifiedBy = v_CreatedBy,
                    ModifiedDate = v_CurrentDate
                WHERE Id = v_RfqId;

                -- Delete existing lines, suppliers, and approvals
                DELETE FROM RfqLine WHERE RfqId = v_RfqId;
                DELETE FROM RfqSupplier WHERE RfqId = v_RfqId;
                DELETE FROM RfqApprovalStep WHERE RfqId = v_RfqId;

                -- Re-insert
                INSERT INTO RfqLine (
                    RfqId, ItemCode, ItemName, Uom, Qty, RequiredBy, Specification,
                    CreatedBy, CreatedDate
                )
                SELECT 
                    v_RfqId, jt.itemCode, jt.itemName, jt.uom, jt.qty, jt.requiredBy, jt.specification,
                    v_CreatedBy, v_CurrentDate
                FROM JSON_TABLE(
                    p_JsonPayload, '$.lines[*]' COLUMNS (
                        itemCode VARCHAR(50) PATH '$.itemCode',
                        itemName VARCHAR(200) PATH '$.itemName',
                        uom VARCHAR(20) PATH '$.uom',
                        qty DECIMAL(18,4) PATH '$.qty',
                        requiredBy DATE PATH '$.requiredBy',
                        specification VARCHAR(1000) PATH '$.specification'
                    )
                ) AS jt;

                INSERT INTO RfqSupplier (
                    RfqId, SupplierUid, SupplierName, InvitedAt, RespondedAt, ResponseStatus, QuotationUid,
                    CreatedBy, CreatedDate
                )
                SELECT 
                    v_RfqId, jt.supplierUid, jt.supplierName, 
                    NULLIF(REPLACE(REPLACE(jt.invitedAt, 'T', ' '), 'Z', ''), 'null'), 
                    NULLIF(REPLACE(REPLACE(jt.respondedAt, 'T', ' '), 'Z', ''), 'null'), 
                    jt.responseStatus, jt.quotationUid,
                    v_CreatedBy, v_CurrentDate
                FROM JSON_TABLE(
                    p_JsonPayload, '$.suppliers[*]' COLUMNS (
                        supplierUid VARCHAR(50) PATH '$.supplierUid',
                        supplierName VARCHAR(200) PATH '$.supplierName',
                        invitedAt VARCHAR(50) PATH '$.invitedAt',
                        respondedAt VARCHAR(50) PATH '$.respondedAt',
                        responseStatus VARCHAR(30) PATH '$.responseStatus',
                        quotationUid VARCHAR(50) PATH '$.quotationUid'
                    )
                ) AS jt;

                INSERT INTO RfqApprovalStep (
                    RfqId, Level, Role, Approver, Status, ActedAt, Remarks, CreatedBy, CreatedDate
                )
                SELECT 
                    v_RfqId, jt.level, jt.role, jt.approver, jt.status, 
                    NULLIF(REPLACE(REPLACE(jt.actedAt, 'T', ' '), 'Z', ''), 'null'), jt.remarks, v_CreatedBy, v_CurrentDate
                FROM JSON_TABLE(
                    p_JsonPayload, '$.approvals[*]' COLUMNS (
                        level INT PATH '$.level',
                        role VARCHAR(100) PATH '$.role',
                        approver VARCHAR(100) PATH '$.approver',
                        status VARCHAR(30) PATH '$.status',
                        actedAt VARCHAR(50) PATH '$.actedAt',
                        remarks VARCHAR(500) PATH '$.remarks'
                    )
                ) AS jt;

                SELECT 
                    JSON_OBJECT(
                        'uid', r.Id,
                        'docNo', r.DocNo,
                        'docDate', r.DocDate,
                        'status', r.Status,
                        'plant', r.Plant,
                        'title', r.Title,
                        'category', r.Category,
                        'quoteDueBy', r.QuoteDueBy,
                        'buyer', r.Buyer,
                        'sealed', IF(r.Sealed = 1, true, false),
                        'currency', r.Currency,
                        'estimatedValue', r.EstimatedValue,
                        'awardedTo', r.AwardedTo,
                        'prRefs', r.PrRefs,
                        'version', r.Version,
                        'remarks', r.Remarks,
                        'attachments', r.Attachments,
                        'comments', r.Comments,
                        'createdBy', r.CreatedBy,
                        'createdAt', DATE_FORMAT(r.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'modifiedAt', DATE_FORMAT(r.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'uid', l.Id,
                                    'itemCode', l.ItemCode,
                                    'itemName', l.ItemName,
                                    'uom', l.Uom,
                                    'qty', l.Qty,
                                    'requiredBy', l.RequiredBy,
                                    'specification', l.Specification
                                )
                            ) FROM RfqLine l WHERE l.RfqId = r.Id
                        ), JSON_ARRAY()),
                        'suppliers', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'supplierUid', s.SupplierUid,
                                    'supplierName', s.SupplierName,
                                    'invitedAt', DATE_FORMAT(s.InvitedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'respondedAt', DATE_FORMAT(s.RespondedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'responseStatus', s.ResponseStatus,
                                    'quotationUid', s.QuotationUid
                                )
                            ) FROM RfqSupplier s WHERE s.RfqId = r.Id
                        ), JSON_ARRAY()),
                        'approvals', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'level', a.Level,
                                    'role', a.Role,
                                    'approver', a.Approver,
                                    'status', a.Status,
                                    'actedAt', a.ActedAt,
                                    'remarks', a.Remarks
                                )
                            ) FROM RfqApprovalStep a WHERE a.RfqId = r.Id
                        ), JSON_ARRAY())
                    ) AS Result
                FROM Rfq r
                WHERE r.Id = v_RfqId AND r.IsDeleted = 0;

            ELSEIF p_Action = 'DELETE' THEN
                UPDATE Rfq 
                SET IsDeleted = 1, ModifiedDate = v_CurrentDate, ModifiedBy = JSON_UNQUOTE(JSON_EXTRACT(p_JsonPayload, '$.modifiedBy'))
                WHERE Id = p_Id;

            ELSEIF p_Action = 'READ' THEN
                SELECT 
                    JSON_OBJECT(
                        'uid', r.Id,
                        'docNo', r.DocNo,
                        'docDate', r.DocDate,
                        'status', r.Status,
                        'plant', r.Plant,
                        'title', r.Title,
                        'category', r.Category,
                        'quoteDueBy', r.QuoteDueBy,
                        'buyer', r.Buyer,
                        'sealed', IF(r.Sealed = 1, true, false),
                        'currency', r.Currency,
                        'estimatedValue', r.EstimatedValue,
                        'awardedTo', r.AwardedTo,
                        'prRefs', r.PrRefs,
                        'version', r.Version,
                        'remarks', r.Remarks,
                        'attachments', r.Attachments,
                        'comments', r.Comments,
                        'createdBy', r.CreatedBy,
                        'createdAt', DATE_FORMAT(r.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'modifiedAt', DATE_FORMAT(r.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                        'lines', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'uid', l.Id,
                                    'itemCode', l.ItemCode,
                                    'itemName', l.ItemName,
                                    'uom', l.Uom,
                                    'qty', l.Qty,
                                    'requiredBy', l.RequiredBy,
                                    'specification', l.Specification
                                )
                            ) FROM RfqLine l WHERE l.RfqId = r.Id
                        ), JSON_ARRAY()),
                        'suppliers', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'supplierUid', s.SupplierUid,
                                    'supplierName', s.SupplierName,
                                    'invitedAt', DATE_FORMAT(s.InvitedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'respondedAt', DATE_FORMAT(s.RespondedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                    'responseStatus', s.ResponseStatus,
                                    'quotationUid', s.QuotationUid
                                )
                            ) FROM RfqSupplier s WHERE s.RfqId = r.Id
                        ), JSON_ARRAY()),
                        'approvals', IFNULL((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'level', a.Level,
                                    'role', a.Role,
                                    'approver', a.Approver,
                                    'status', a.Status,
                                    'actedAt', a.ActedAt,
                                    'remarks', a.Remarks
                                )
                            ) FROM RfqApprovalStep a WHERE a.RfqId = r.Id
                        ), JSON_ARRAY())
                    ) AS Result
                FROM Rfq r
                WHERE r.Id = p_Id AND r.IsDeleted = 0;

            ELSEIF p_Action = 'READ_ALL' THEN
                SELECT 
                    IFNULL(JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'uid', r.Id,
                            'docNo', r.DocNo,
                            'docDate', r.DocDate,
                            'status', r.Status,
                            'plant', r.Plant,
                            'title', r.Title,
                            'category', r.Category,
                            'quoteDueBy', r.QuoteDueBy,
                            'buyer', r.Buyer,
                            'sealed', IF(r.Sealed = 1, true, false),
                            'currency', r.Currency,
                            'estimatedValue', r.EstimatedValue,
                            'awardedTo', r.AwardedTo,
                            'prRefs', r.PrRefs,
                            'version', r.Version,
                            'remarks', r.Remarks,
                            'attachments', r.Attachments,
                            'comments', r.Comments,
                            'createdBy', r.CreatedBy,
                            'createdAt', DATE_FORMAT(r.CreatedDate, '%Y-%m-%dT%H:%i:%sZ'),
                            'modifiedAt', DATE_FORMAT(r.ModifiedDate, '%Y-%m-%dT%H:%i:%sZ'),
                            'lines', IFNULL((
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'uid', l.Id,
                                        'itemCode', l.ItemCode,
                                        'itemName', l.ItemName,
                                        'uom', l.Uom,
                                        'qty', l.Qty,
                                        'requiredBy', l.RequiredBy,
                                        'specification', l.Specification
                                    )
                                ) FROM RfqLine l WHERE l.RfqId = r.Id
                            ), JSON_ARRAY()),
                            'suppliers', IFNULL((
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'supplierUid', s.SupplierUid,
                                        'supplierName', s.SupplierName,
                                        'invitedAt', DATE_FORMAT(s.InvitedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                        'respondedAt', DATE_FORMAT(s.RespondedAt, '%Y-%m-%dT%H:%i:%sZ'),
                                        'responseStatus', s.ResponseStatus,
                                        'quotationUid', s.QuotationUid
                                    )
                                ) FROM RfqSupplier s WHERE s.RfqId = r.Id
                            ), JSON_ARRAY()),
                            'approvals', IFNULL((
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'level', a.Level,
                                        'role', a.Role,
                                        'approver', a.Approver,
                                        'status', a.Status,
                                        'actedAt', a.ActedAt,
                                        'remarks', a.Remarks
                                    )
                                ) FROM RfqApprovalStep a WHERE a.RfqId = r.Id
                            ), JSON_ARRAY())
                        )
                    ), JSON_ARRAY()) AS Result
                FROM Rfq r
                WHERE r.IsDeleted = 0
                ORDER BY r.Id DESC;
                
            END IF;
        END;
        """
        
        cursor.execute(procedure_sql)
        
        connection.commit()
        print("SQL executed successfully.")
        
    except pymysql.MySQLError as e:
        print(f"Error: {e}")
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()

if __name__ == "__main__":
    setup_db()
