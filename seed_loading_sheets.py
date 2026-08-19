import pymysql

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing'
}

sheets = [
  { "dispatchPlanNo": "DSP/2607/0142", "vehicleNo": "TN22BG4471", "transporter": "Sree Logistics", "driver": "M. Rajan", "customer": "Automotive Axles Ltd", "destination": "Mysuru", "stagingBay": "Bay 1", "cartonsPlanned": 420, "cartonsLoaded": 0, "palletsLoaded": 0, "plannedWeightKg": 6300, "actualWeightKg": 0, "startedAt": None, "completedAt": None, "loader": "Loading gang A", "supervisor": "R. Vasanth", "sealNo": None, "sealVerified": False, "photosAttached": 0, "status": "STAGED", "remarks": None },
  { "dispatchPlanNo": "DSP/2607/0141", "vehicleNo": "KA05MJ8802", "transporter": "VRL Logistics", "driver": "S. Basavaraj", "customer": "Rane TRW", "destination": "Trichy", "stagingBay": "Bay 3", "cartonsPlanned": 180, "cartonsLoaded": 180, "palletsLoaded": 6, "plannedWeightKg": 2700, "actualWeightKg": 2715, "startedAt": "2026-07-26 10:15:00", "completedAt": None, "loader": "Loading gang B", "supervisor": "K. Kumar", "sealNo": "SL-991204", "sealVerified": True, "photosAttached": 2, "status": "SEALED", "remarks": "Waiting for gate pass" },
  { "dispatchPlanNo": "DSP/2607/0139", "vehicleNo": "TN01AK9034", "transporter": "Own fleet", "driver": "K. Murugan", "customer": "Lucas TVS", "destination": "Padi", "stagingBay": "Bay 2", "cartonsPlanned": 310, "cartonsLoaded": 140, "palletsLoaded": 5, "plannedWeightKg": 4650, "actualWeightKg": 0, "startedAt": "2026-07-26 14:30:00", "completedAt": None, "loader": "Loading gang C", "supervisor": "M. Dinesh", "sealNo": None, "sealVerified": False, "photosAttached": 0, "status": "LOADING", "remarks": "Loading in progress" }
]

conn = pymysql.connect(**DB_CONFIG)
cursor = conn.cursor()

print("Seeding loading sheets...")
for l in sheets:
    cursor.execute("CALL SpManageLoadingSheet('INSERT', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'system')", (
        l['dispatchPlanNo'], l['vehicleNo'], l['transporter'], l['driver'], l['customer'],
        l['destination'], l['stagingBay'], l['cartonsPlanned'], l['cartonsLoaded'], l['palletsLoaded'],
        l['plannedWeightKg'], l['actualWeightKg'], l['startedAt'], l['completedAt'], l['loader'],
        l['supervisor'], l['sealNo'], l['sealVerified'], l['photosAttached'], l['status'], l['remarks']
    ))
conn.commit()

conn.close()
print("Done seeding")
