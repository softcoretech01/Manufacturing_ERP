import os

def fix_imports(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove the invalid import
    content = content.replace("from app.core.database import get_db_connection", "import pymysql")
    
    # Add the definition
    db_conn = """def get_db_connection():
    return pymysql.connect(
        host='187.127.131.38',
        port=3308,
        user='root',
        password='Ener9y_Demo@2026',
        database='ERP_Quality',
        autocommit=True
    )
"""
    
    # Insert after imports
    if "def get_db_connection" not in content:
        # Find router = APIRouter(...)
        parts = content.split('router = APIRouter')
        content = parts[0] + db_conn + '\nrouter = APIRouter' + parts[1]
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

fix_imports(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\routers\defects.py')
fix_imports(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\routers\quality_lookups.py')

print("Fixed imports")
