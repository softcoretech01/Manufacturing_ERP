import pymysql

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing'
}

picks = [
  { "dispatchPlanNo": "DSP/2607/0142", "method": "FEFO", "customer": "Automotive Axles Ltd", "itemName": "Grease tub 5kg", "itemCode": "FG-GT5", "batchNo": "B2605-A1", "warehouse": "FG Store", "zone": "Aisle 4", "bin": "04-B-12", "requiredQty": 200, "pickedQty": 0, "uom": "NOS", "picker": None, "status": "OPEN", "shortReason": None },
  { "dispatchPlanNo": "DSP/2607/0142", "method": "FEFO", "customer": "Automotive Axles Ltd", "itemName": "Brake fluid 500ml", "itemCode": "FG-BF500", "batchNo": "B2606-C3", "warehouse": "FG Store", "zone": "Aisle 2", "bin": "02-A-05", "requiredQty": 1200, "pickedQty": 1200, "uom": "NOS", "picker": "M. Jaya", "status": "PICKED", "shortReason": None },
  { "dispatchPlanNo": "DSP/2607/0141", "method": "FIFO", "customer": "Rane TRW", "itemName": "Steering fluid 1L", "itemCode": "FG-SF1L", "batchNo": None, "warehouse": "FG Store", "zone": "Aisle 1", "bin": "01-C-08", "requiredQty": 500, "pickedQty": 450, "uom": "NOS", "picker": "D. Anand", "status": "SHORT", "shortReason": "Bin empty after 450." },
  { "dispatchPlanNo": "DSP/2607/0141", "method": "BATCH", "customer": "Rane TRW", "itemName": "Coolant 5L", "itemCode": "FG-CL5L", "batchNo": "B2604-Z9", "warehouse": "FG Store", "zone": "Aisle 5", "bin": "05-D-02", "requiredQty": 100, "pickedQty": 50, "uom": "NOS", "picker": "T. Prakash", "status": "PICKING", "shortReason": None }
]

conn = pymysql.connect(**DB_CONFIG)
cursor = conn.cursor()

print("Seeding pick lists...")
for p in picks:
    cursor.execute("CALL SpManagePickList('INSERT', NULL, %s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'system')", (
        p['dispatchPlanNo'], p['method'], p['warehouse'], p['zone'], p['customer'],
        p['itemCode'], p['itemName'], p['batchNo'], p['bin'], p['requiredQty'],
        p['pickedQty'], p['uom'], p['picker'], p['status'], p['shortReason']
    ))
conn.commit()

conn.close()
print("Done seeding")
