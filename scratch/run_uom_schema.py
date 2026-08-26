import pymysql

queries = [
    """
    CREATE TABLE IF NOT EXISTS Uom (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        Code VARCHAR(50) NOT NULL UNIQUE,
        Name VARCHAR(250) NOT NULL,
        Symbol VARCHAR(50) NOT NULL,
        UomType VARCHAR(50) NOT NULL,
        Decimals INT DEFAULT 0,
        IsBase BIT DEFAULT b'0',
        Status VARCHAR(20) DEFAULT 'ACTIVE',
        EffectiveFrom DATETIME,
        EffectiveTo DATETIME NULL,
        Revision INT DEFAULT 1,
        UsageCount INT DEFAULT 0,
        IsDeleted BIT DEFAULT b'0',
        CreatedBy VARCHAR(100),
        CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        ModifiedBy VARCHAR(100),
        ModifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    """,
    "DROP PROCEDURE IF EXISTS SpGetNextUomCode",
    """
    CREATE PROCEDURE SpGetNextUomCode()
    BEGIN
        DECLARE next_id INT;
        DECLARE next_code VARCHAR(50);
        SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM Uom;
        SET next_code = CONCAT('UOM-', LPAD(next_id, 4, '0'));
        SELECT next_code AS nextCode;
    END
    """,
    "DROP PROCEDURE IF EXISTS SpUom",
    """
    CREATE PROCEDURE SpUom (
        IN p_Action VARCHAR(20),
        IN p_Id INT,
        IN p_Code VARCHAR(50),
        IN p_Name VARCHAR(250),
        IN p_Symbol VARCHAR(50),
        IN p_UomType VARCHAR(50),
        IN p_Decimals INT,
        IN p_IsBase BIT,
        IN p_Status VARCHAR(20),
        IN p_EffectiveFrom DATETIME,
        IN p_EffectiveTo DATETIME,
        IN p_ModifiedBy VARCHAR(100)
    )
    BEGIN
        IF p_Action = 'LIST' THEN
            SELECT * FROM Uom WHERE IsDeleted = 0;
        ELSEIF p_Action = 'READ' THEN
            SELECT * FROM Uom WHERE Id = p_Id AND IsDeleted = 0;
        ELSEIF p_Action = 'CREATE' THEN
            INSERT INTO Uom (
                Code, Name, Symbol, UomType, Decimals, IsBase, Status, 
                EffectiveFrom, EffectiveTo, CreatedBy, ModifiedBy
            ) VALUES (
                p_Code, p_Name, p_Symbol, p_UomType, p_Decimals, p_IsBase, p_Status,
                p_EffectiveFrom, p_EffectiveTo, p_ModifiedBy, p_ModifiedBy
            );
            SELECT * FROM Uom WHERE Id = LAST_INSERT_ID();
        ELSEIF p_Action = 'UPDATE' THEN
            UPDATE Uom SET
                Code = p_Code, Name = p_Name, Symbol = p_Symbol, UomType = p_UomType,
                Decimals = p_Decimals, IsBase = p_IsBase, Status = p_Status, 
                EffectiveFrom = p_EffectiveFrom, EffectiveTo = p_EffectiveTo, ModifiedBy = p_ModifiedBy
            WHERE Id = p_Id AND IsDeleted = 0;
            SELECT * FROM Uom WHERE Id = p_Id;
        ELSEIF p_Action = 'DELETE' THEN
            UPDATE Uom SET IsDeleted = 1, ModifiedBy = p_ModifiedBy WHERE Id = p_Id;
        END IF;
    END
    """
]

connection = pymysql.connect(
    host='187.127.131.38',
    port=3308,
    user='root',
    password='Ener9y_Demo@2026',
    database='ERP_Master',
    cursorclass=pymysql.cursors.DictCursor
)

try:
    with connection.cursor() as cursor:
        for query in queries:
            cursor.execute(query)
    connection.commit()
    print("Uom schema created successfully.")
except Exception as e:
    print(f"An error occurred: {e}")
finally:
    connection.close()
