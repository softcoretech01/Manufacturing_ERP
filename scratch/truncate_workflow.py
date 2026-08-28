import pymysql
import os

db_host = os.getenv('DB_HOST', '187.127.131.38')
db_port = int(os.getenv('DB_PORT', 3308))
db_user = os.getenv('DB_USER', 'root')
db_password = os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026')

try:
    conn = pymysql.connect(host=db_host, port=db_port, user=db_user, password=db_password, database='admin_erp')
    cur = conn.cursor()
    cur.execute("SET FOREIGN_KEY_CHECKS = 0;")
    tables = [
        "core_workflow_task",
        "core_workflow_history",
        "core_workflow_instance"
    ]
    for table in tables:
        cur.execute(f"TRUNCATE TABLE `{table}`;")
    cur.execute("SET FOREIGN_KEY_CHECKS = 1;")
    conn.commit()
    print("Workflow tables truncated.")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
