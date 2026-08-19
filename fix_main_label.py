with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\main.py', 'r', encoding='utf-8') as f:
    text = f.read()

import re

# Add import
if 'from app.routers.label import router as label_router' not in text:
    text = re.sub(
        r'(from app\.routers\.pallet import router as pallet_router)',
        r'\1\nfrom app.routers.label import router as label_router',
        text
    )

# Add route
if 'label_router' in text and 'app.include_router(label_router' not in text:
    text = re.sub(
        r'(app\.include_router\(pallet_router, prefix="/api/v1"\))',
        r'\1\napp.include_router(label_router, prefix="/api/v1")',
        text
    )

with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\main.py', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated main.py')
