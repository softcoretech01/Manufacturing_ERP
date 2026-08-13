import pymysql
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

conn = pymysql.connect(
    host=os.getenv('DB_HOST', '187.127.131.38'),
    port=int(os.getenv('DB_PORT', 3308)),
    user=os.getenv('DB_USER', 'root'),
    password=os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026'),
    database='ERP_Procurement',
    client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
)

sql = """
-- 1. ProcParameter
CREATE TABLE IF NOT EXISTS ProcParameter (
    Uid VARCHAR(50) PRIMARY KEY,
    Code VARCHAR(50) UNIQUE NOT NULL,
    Name VARCHAR(100) NOT NULL,
    Description VARCHAR(500),
    Value VARCHAR(255) NOT NULL,
    Unit VARCHAR(20),
    ParameterGroup VARCHAR(50) NOT NULL,
    Scope VARCHAR(200) NOT NULL,
    Editable BIT DEFAULT 1,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    DeletedAt DATETIME
);

-- 2. EvalWeight
CREATE TABLE IF NOT EXISTS EvalWeight (
    Uid VARCHAR(50) PRIMARY KEY,
    SetCode VARCHAR(50) NOT NULL,
    SetName VARCHAR(100) NOT NULL,
    Category VARCHAR(100) NOT NULL,
    Criterion VARCHAR(100) NOT NULL,
    WeightPct DECIMAL(5,2) NOT NULL,
    Direction VARCHAR(20) NOT NULL,
    Active BIT DEFAULT 1,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    DeletedAt DATETIME
);

-- 3. ProcReasonCode
CREATE TABLE IF NOT EXISTS ProcReasonCode (
    Uid VARCHAR(50) PRIMARY KEY,
    Code VARCHAR(50) UNIQUE NOT NULL,
    Label VARCHAR(200) NOT NULL,
    DocumentType VARCHAR(100) NOT NULL,
    RequiresComment BIT DEFAULT 0,
    Active BIT DEFAULT 1,
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME,
    DeletedAt DATETIME
);

DROP PROCEDURE IF EXISTS SpManageProcurementSettings;

CREATE PROCEDURE SpManageProcurementSettings (
    IN p_Action VARCHAR(50),
    IN p_Payload JSON
)
BEGIN
    DECLARE v_CreatedBy VARCHAR(100);
    DECLARE v_CreatedDate DATETIME;
    DECLARE v_Uid VARCHAR(50);
    
    SET v_CreatedBy = 'System';
    SET v_CreatedDate = NOW();
    
    -- =======================================
    -- PARAMETERS
    -- =======================================
    IF p_Action = 'GET_PARAMETERS' THEN
        SELECT 
            Uid as uid, Code as code, Name as name, Description as description,
            Value as value, Unit as unit, ParameterGroup as 'group', Scope as scope,
            CAST(Editable AS UNSIGNED) as editable
        FROM ProcParameter
        WHERE DeletedAt IS NULL
        ORDER BY ParameterGroup, Code;
        
    ELSEIF p_Action = 'INSERT_PARAMETER' THEN
        INSERT INTO ProcParameter (
            Uid, Code, Name, Description, Value, Unit, ParameterGroup, Scope, Editable, CreatedBy, CreatedDate
        )
        VALUES (
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uid')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.code')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.name')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.description')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.value')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.unit')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.group')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.scope')),
            JSON_EXTRACT(p_Payload, '$.editable') = 'true',
            v_CreatedBy, v_CreatedDate
        );
        
    ELSEIF p_Action = 'UPDATE_PARAMETER' THEN
        SET v_Uid = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uid'));
        UPDATE ProcParameter
        SET 
            Value = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.value')),
            ModifiedBy = v_CreatedBy,
            ModifiedDate = v_CreatedDate
        WHERE Uid = v_Uid;
        
    -- =======================================
    -- EVALUATION WEIGHTS
    -- =======================================
    ELSEIF p_Action = 'GET_WEIGHTS' THEN
        SELECT 
            Uid as uid, SetCode as setCode, SetName as setName, Category as category,
            Criterion as criterion, WeightPct as weightPct, Direction as direction,
            CAST(Active AS UNSIGNED) as active
        FROM EvalWeight
        WHERE DeletedAt IS NULL AND Active = 1
        ORDER BY SetCode, Criterion;
        
    ELSEIF p_Action = 'INSERT_WEIGHTS_BATCH' THEN
        -- Expects array of objects
        INSERT INTO EvalWeight (
            Uid, SetCode, SetName, Category, Criterion, WeightPct, Direction, Active, CreatedBy, CreatedDate
        )
        SELECT 
            Uid, SetCode, SetName, Category, Criterion, WeightPct, Direction, 1, v_CreatedBy, v_CreatedDate
        FROM JSON_TABLE(
            p_Payload, '$[*]'
            COLUMNS (
                Uid VARCHAR(50) PATH '$.uid',
                SetCode VARCHAR(50) PATH '$.setCode',
                SetName VARCHAR(100) PATH '$.setName',
                Category VARCHAR(100) PATH '$.category',
                Criterion VARCHAR(100) PATH '$.criterion',
                WeightPct DECIMAL(5,2) PATH '$.weightPct',
                Direction VARCHAR(20) PATH '$.direction'
            )
        ) jt;
        
    ELSEIF p_Action = 'SAVE_WEIGHTS_VERSION' THEN
        -- Soft delete old active weights for this set
        UPDATE EvalWeight 
        SET Active = 0, ModifiedBy = v_CreatedBy, ModifiedDate = v_CreatedDate
        WHERE SetCode = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$[0].setCode')) AND Active = 1;
        
        -- Insert new version
        INSERT INTO EvalWeight (
            Uid, SetCode, SetName, Category, Criterion, WeightPct, Direction, Active, CreatedBy, CreatedDate
        )
        SELECT 
            Uid, SetCode, SetName, Category, Criterion, WeightPct, Direction, 1, v_CreatedBy, v_CreatedDate
        FROM JSON_TABLE(
            p_Payload, '$[*]'
            COLUMNS (
                Uid VARCHAR(50) PATH '$.uid',
                SetCode VARCHAR(50) PATH '$.setCode',
                SetName VARCHAR(100) PATH '$.setName',
                Category VARCHAR(100) PATH '$.category',
                Criterion VARCHAR(100) PATH '$.criterion',
                WeightPct DECIMAL(5,2) PATH '$.weightPct',
                Direction VARCHAR(20) PATH '$.direction'
            )
        ) jt;

    -- =======================================
    -- REASON CODES
    -- =======================================
    ELSEIF p_Action = 'GET_REASONS' THEN
        SELECT 
            Uid as uid, Code as code, Label as label, DocumentType as documentType,
            CAST(RequiresComment AS UNSIGNED) as requiresComment, CAST(Active AS UNSIGNED) as active
        FROM ProcReasonCode
        WHERE DeletedAt IS NULL
        ORDER BY Code;
        
    ELSEIF p_Action = 'INSERT_REASON' THEN
        INSERT INTO ProcReasonCode (
            Uid, Code, Label, DocumentType, RequiresComment, Active, CreatedBy, CreatedDate
        )
        VALUES (
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uid')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.code')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.label')),
            JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.documentType')),
            JSON_EXTRACT(p_Payload, '$.requiresComment') = 'true',
            JSON_EXTRACT(p_Payload, '$.active') = 'true',
            v_CreatedBy, v_CreatedDate
        );
        
    ELSEIF p_Action = 'UPDATE_REASON_STATUS' THEN
        SET v_Uid = JSON_UNQUOTE(JSON_EXTRACT(p_Payload, '$.uid'));
        UPDATE ProcReasonCode
        SET 
            Active = (JSON_EXTRACT(p_Payload, '$.active') = 'true'),
            ModifiedBy = v_CreatedBy,
            ModifiedDate = v_CreatedDate
        WHERE Uid = v_Uid;
        
    END IF;
END;
"""

try:
    with conn.cursor() as cursor:
        cursor.execute(sql)
    conn.commit()
    print("Tables and procedure created successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
