import pymysql
conn = pymysql.connect(host='187.127.131.38', port=3308, user='root', password='Ener9y_Demo@2026', db='admin_erp')
try:
    with conn.cursor() as cursor:
        cursor.execute('SELECT id, code, name FROM mst_item')
        for r in cursor.fetchall():
            print(f"Item ID: {r[0]}, Code: {r[1]}, Name: {r[2]}")
finally:
    conn.close()
