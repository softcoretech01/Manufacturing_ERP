import os

def fix_prefix(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace('prefix="/quality/', 'prefix="/api/v1/quality/')
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

fix_prefix(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\routers\quality_plans.py')
fix_prefix(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\routers\inspections.py')
print('Fixed prefixes')
