with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\main.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Clean up all my messy `, pallet` imports
text = text.replace(', pallet', '')

# Insert proper import
if 'from app.routers.pallet import router as pallet_router' not in text:
    text = text.replace(
        'from app.routers.carton import router as carton_router',
        'from app.routers.carton import router as carton_router\nfrom app.routers.pallet import router as pallet_router'
    )

if 'app.include_router(pallet_router' not in text:
    text = text.replace(
        'app.include_router(carton_router, prefix="/api/v1")',
        'app.include_router(carton_router, prefix="/api/v1")\n    app.include_router(pallet_router, prefix="/api/v1")'
    )

with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\backend\app\main.py', 'w', encoding='utf-8') as f:
    f.write(text)
print('Fixed main.py')
