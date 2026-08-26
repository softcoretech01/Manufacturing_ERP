import os

file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\routers\defects.py'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add to_camel helper
helper = """def to_camel(d):
    return {k[0].lower() + k[1:]: v for k, v in d.items()}

"""

# Replace returns
old_get = """            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE DeletedAt IS NULL")
            rows = cursor.fetchall()
            return rows"""
new_get = """            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE DeletedAt IS NULL")
            rows = cursor.fetchall()
            return [to_camel(r) for r in rows]"""

old_create = """            result = cursor.fetchone()
            
            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE Id = %s", (result['Id'],))
            return cursor.fetchone()"""
new_create = """            result = cursor.fetchone()
            
            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE Id = %s", (result['Id'] if 'Id' in result else result['id'],))
            return to_camel(cursor.fetchone())"""

old_update = """            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE Id = %s", (defect_id,))
            return cursor.fetchone()"""
new_update = """            cursor.execute("SELECT * FROM ERP_Quality.DefectType WHERE Id = %s", (defect_id,))
            return to_camel(cursor.fetchone())"""

if "def to_camel" not in content:
    content = content.replace("router = APIRouter", helper + "router = APIRouter")

content = content.replace(old_get, new_get)
content = content.replace(old_create, new_create)
content = content.replace(old_update, new_update)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed PascalCase bug")
