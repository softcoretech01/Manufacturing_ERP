import pymysql
import sys

host = "187.127.131.38"
port = 3308
user = "root"
password = "Ener9y_Demo@2026"
database = "ERP_Master"

try:
    print("Connecting to database...")
    connection = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
    )
    
    print("Connected. Reading SQL file...")
    with open("scripts/CustomerSchema.sql", "r", encoding="utf-8") as f:
        sql = f.read()
        
    print("Executing SQL script...")
    with connection.cursor() as cursor:
        cursor.execute(sql)
    
    connection.commit()
    print("Successfully executed CustomerSchema.sql")
    
except Exception as e:
    print("Error:", e)
finally:
    if 'connection' in locals() and connection.open:
        connection.close()
