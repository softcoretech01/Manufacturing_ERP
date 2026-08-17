import os

file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\routers\defects.py'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace return cursor.fetchone() with return to_camel(cursor.fetchone())
content = content.replace("            return cursor.fetchone()", "            return to_camel(cursor.fetchone())")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed PascalCase for CREATE and UPDATE")
