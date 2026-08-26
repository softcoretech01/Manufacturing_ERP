import pymysql

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing'
}

vehicles = [
  { "vehicleNo": "TN22BG4471", "transporter": "Sree Logistics", "driver": "M. Rajan", "driverPhone": "9841022114", "capacityKg": 9000, "state": "LOADING", "currentShipmentNo": "SHP-001", "isActive": True },
  { "vehicleNo": "KA05MJ8802", "transporter": "VRL Logistics", "driver": "S. Basavaraj", "driverPhone": "9986041207", "capacityKg": 12000, "state": "AVAILABLE", "currentShipmentNo": None, "isActive": True },
  { "vehicleNo": "TN01AK9034", "transporter": "Own fleet", "driver": "K. Murugan", "driverPhone": "9444083311", "capacityKg": 4000, "state": "AVAILABLE", "currentShipmentNo": None, "isActive": True }
]

plans = [
  { "planDate": "2026-07-26", "status": "DRAFT", "basis": "DAILY", "customer": "Automotive Axles Ltd", "customerCode": "CUS-NEW", "salesOrderNo": "SO/26/0891", "route": "Chennai - Mysuru", "region": "South", "deliveryDate": "2026-07-28", "priority": "NORMAL", "cartons": 420, "pallets": 14, "weightKg": 6300, "volumeCbm": 22.4, "vehicleNo": None, "transporter": None, "vehicleCapacityKg": None, "isExport": False, "remarks": "" },
  { "planDate": "2026-07-26", "status": "PLANNED", "basis": "ROUTE", "customer": "Rane TRW", "customerCode": "CUS-NEW", "salesOrderNo": "SO/26/0902", "route": "Chennai - Trichy", "region": "South", "deliveryDate": "2026-07-27", "priority": "HIGH", "cartons": 180, "pallets": 6, "weightKg": 2700, "volumeCbm": 9.6, "vehicleNo": "TN22BG4471", "transporter": "Sree Logistics", "vehicleCapacityKg": 9000, "isExport": False, "remarks": "Clubbed with Lucas TVS" }
]

conn = pymysql.connect(**DB_CONFIG)
cursor = conn.cursor()

print("Seeding vehicles...")
for v in vehicles:
    cursor.execute("CALL SpManageVehicle('INSERT', NULL, %s, %s, %s, %s, %s, %s, %s, %s, 'system')", (
        v['vehicleNo'], v['transporter'], v['driver'], v['driverPhone'],
        v['capacityKg'], v['state'], v['currentShipmentNo'], v['isActive']
    ))
conn.commit()

print("Seeding dispatch plans...")
for p in plans:
    cursor.execute("CALL SpManageDispatchPlan('INSERT', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'system')", (
        p['planDate'], p['status'], p['basis'], p['customer'], p['customerCode'],
        p['salesOrderNo'], p['route'], p['region'], p['deliveryDate'], p['priority'],
        p['cartons'], p['pallets'], p['weightKg'], p['volumeCbm'], p['vehicleNo'],
        p['transporter'], p['vehicleCapacityKg'], p['isExport'], p['remarks']
    ))
conn.commit()

conn.close()
print("Done seeding")
