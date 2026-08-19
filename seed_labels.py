import pymysql

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing'
}

seed_data = [
    { 'code': 'LBL-CTN-GS1', 'name': 'Master carton label — GS1-128', 'kind': 'CARTON', 'standard': 'GS1', 'customer': None, 'widthMm': 100, 'heightMm': 150, 'fields': ['Product name', 'SKU', 'Quantity', 'Batch', 'Carton number', 'Gross weight', 'Manufacturing date', 'Country of origin'], 'hasBarcode': True, 'hasQrCode': True, 'hasCustomerLogo': False, 'languages': ['English'], 'printedCount': 12480, 'isActive': True },
    { 'code': 'LBL-PLT-SSCC', 'name': 'Pallet label — SSCC', 'kind': 'PALLET', 'standard': 'GS1', 'customer': None, 'widthMm': 148, 'heightMm': 210, 'fields': ['SSCC', 'Customer', 'Destination', 'Carton count', 'Total weight', 'Pallet number', 'Build date'], 'hasBarcode': True, 'hasQrCode': False, 'hasCustomerLogo': False, 'languages': ['English'], 'printedCount': 842, 'isActive': True },
    { 'code': 'LBL-OEM-HYDRA', 'name': 'OEM export carton — Hydra GmbH', 'kind': 'CARTON', 'standard': 'CUSTOMER', 'customer': 'Hydra GmbH — Hamburg', 'widthMm': 105, 'heightMm': 148, 'fields': ['Hydra article code', 'Product name (DE)', 'Product name (EN)', 'Quantity', 'Batch', 'Country of origin', 'EAN', 'Recycling marks'], 'hasBarcode': True, 'hasQrCode': True, 'hasCustomerLogo': True, 'languages': ['German', 'English'], 'printedCount': 3260, 'isActive': True },
    { 'code': 'LBL-FBA-FNSKU', 'name': 'Amazon FBA unit label — FNSKU', 'kind': 'PRODUCT', 'standard': 'CUSTOMER', 'customer': 'Amazon Retail India', 'widthMm': 62, 'heightMm': 29, 'fields': ['FNSKU', 'Product title', 'Condition'], 'hasBarcode': True, 'hasQrCode': False, 'hasCustomerLogo': False, 'languages': ['English'], 'printedCount': 24600, 'isActive': True },
    { 'code': 'LBL-PRD-RETAIL', 'name': 'Retail bottle sleeve label', 'kind': 'PRODUCT', 'standard': 'INTERNAL', 'customer': None, 'widthMm': 210, 'heightMm': 90, 'fields': ['Product name', 'Capacity', 'Material', 'MRP', 'Manufacturing date', 'Batch', 'Customer care', 'Country of origin'], 'hasBarcode': True, 'hasQrCode': True, 'hasCustomerLogo': False, 'languages': ['English', 'Hindi', 'Tamil'], 'printedCount': 96400, 'isActive': True },
    { 'code': 'LBL-SHP-DOM', 'name': 'Shipment address label', 'kind': 'SHIPMENT', 'standard': 'INTERNAL', 'customer': None, 'widthMm': 100, 'heightMm': 100, 'fields': ['Shipment number', 'Customer', 'Address', 'Cartons', 'Weight', 'Transporter', 'Vehicle'], 'hasBarcode': True, 'hasQrCode': False, 'hasCustomerLogo': False, 'languages': ['English'], 'printedCount': 1204, 'isActive': True },
    { 'code': 'LBL-CTN-OLD', 'name': 'Master carton label — pre-GS1 layout', 'kind': 'CARTON', 'standard': 'INTERNAL', 'customer': None, 'widthMm': 100, 'heightMm': 150, 'fields': ['Product name', 'SKU', 'Quantity', 'Carton number'], 'hasBarcode': True, 'hasQrCode': False, 'hasCustomerLogo': False, 'languages': ['English'], 'printedCount': 48200, 'isActive': False },
]

conn = pymysql.connect(**DB_CONFIG)
cursor = conn.cursor()

# Check if data already exists
cursor.execute("SELECT COUNT(*) FROM LabelFormat")
if cursor.fetchone()[0] == 0:
    for item in seed_data:
        fields_str = ','.join(item['fields'])
        languages_str = ','.join(item['languages'])
        args = (
            'INSERT',
            None,
            item['code'],
            item['name'],
            item['kind'],
            item['standard'],
            item['customer'],
            item['widthMm'],
            item['heightMm'],
            fields_str,
            item['hasBarcode'],
            item['hasQrCode'],
            item['hasCustomerLogo'],
            languages_str,
            item['printedCount'],
            None,
            item['isActive'],
            'system'
        )
        cursor.execute("CALL SpManageLabelFormat(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", args)
    conn.commit()
    print("Seeded LabelFormat table.")
else:
    print("Table already seeded.")

conn.close()
