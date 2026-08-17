
import pymysql
conn = pymysql.connect(host="187.127.131.38", port=3308, user="root", password="Ener9y_Demo@2026", db="ERP_Master")
cursor = conn.cursor()
sql = """
CREATE TABLE Country (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50),
    Name VARCHAR(250),
    Iso3 VARCHAR(10),
    Currency VARCHAR(10),
    DialCode VARCHAR(20),
    Region VARCHAR(50),
    IsExportMarket BIT,
    Status VARCHAR(20),
    EffectiveFrom DATETIME,
    EffectiveTo DATETIME,
    CreatedBy VARCHAR(100),
    ModifiedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    IsDeleted BIT DEFAULT 0
);
"""
cursor.execute(sql)
conn.commit()
print("Country table created.")

