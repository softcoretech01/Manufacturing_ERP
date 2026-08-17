
import pymysql
conn = pymysql.connect(host="187.127.131.38", port=3308, user="root", password="Ener9y_Demo@2026", db="ERP_Master")
cursor = conn.cursor()
cursor.execute("CALL SpCountry('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
print(cursor.fetchall())

