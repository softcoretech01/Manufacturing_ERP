import pymysql

queries = [
    """
    CREATE TABLE IF NOT EXISTS City (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        Code VARCHAR(50) NOT NULL UNIQUE,
        Name VARCHAR(250) NOT NULL,
        State VARCHAR(50) NOT NULL,
        PincodeRange VARCHAR(50) NULL,
        DeliveryZone VARCHAR(50) NULL,
        TransitDays INT DEFAULT 0,
        IsPort BIT DEFAULT b'0',
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
    "DROP PROCEDURE IF EXISTS SpGetNextCityCode",
    """
    CREATE PROCEDURE SpGetNextCityCode()
    BEGIN
        DECLARE next_id INT;
        DECLARE next_code VARCHAR(50);
        SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM City;
        SET next_code = CONCAT('CTY-', LPAD(next_id, 4, '0'));
        SELECT next_code AS nextCode;
    END
    """,
    "DROP PROCEDURE IF EXISTS SpCity",
    """
    CREATE PROCEDURE SpCity (
        IN p_Action VARCHAR(20),
        IN p_Id INT,
        IN p_Code VARCHAR(50),
        IN p_Name VARCHAR(250),
        IN p_State VARCHAR(50),
        IN p_PincodeRange VARCHAR(50),
        IN p_DeliveryZone VARCHAR(50),
        IN p_TransitDays INT,
        IN p_IsPort BIT,
        IN p_Status VARCHAR(20),
        IN p_EffectiveFrom DATETIME,
        IN p_EffectiveTo DATETIME,
        IN p_ModifiedBy VARCHAR(100)
    )
    BEGIN
        IF p_Action = 'LIST' THEN
            SELECT * FROM City WHERE IsDeleted = 0;
        ELSEIF p_Action = 'READ' THEN
            SELECT * FROM City WHERE Id = p_Id AND IsDeleted = 0;
        ELSEIF p_Action = 'CREATE' THEN
            INSERT INTO City (
                Code, Name, State, PincodeRange, DeliveryZone, TransitDays, IsPort, Status, 
                EffectiveFrom, EffectiveTo, CreatedBy, ModifiedBy
            ) VALUES (
                p_Code, p_Name, p_State, p_PincodeRange, p_DeliveryZone, p_TransitDays, p_IsPort, p_Status,
                p_EffectiveFrom, p_EffectiveTo, p_ModifiedBy, p_ModifiedBy
            );
            SELECT * FROM City WHERE Id = LAST_INSERT_ID();
        ELSEIF p_Action = 'UPDATE' THEN
            UPDATE City SET
                Code = p_Code, Name = p_Name, State = p_State, PincodeRange = p_PincodeRange,
                DeliveryZone = p_DeliveryZone, TransitDays = p_TransitDays, IsPort = p_IsPort, Status = p_Status, 
                EffectiveFrom = p_EffectiveFrom, EffectiveTo = p_EffectiveTo, ModifiedBy = p_ModifiedBy
            WHERE Id = p_Id AND IsDeleted = 0;
            SELECT * FROM City WHERE Id = p_Id;
        ELSEIF p_Action = 'DELETE' THEN
            UPDATE City SET IsDeleted = 1, ModifiedBy = p_ModifiedBy WHERE Id = p_Id;
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
    print("City schema created successfully.")
except Exception as e:
    print(f"An error occurred: {e}")
finally:
    connection.close()
