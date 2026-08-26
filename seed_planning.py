import sys
import pymysql

sys.path.append(r"d:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\mock")

import json

mock_file = r"d:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\mock\dispatch.ts"

with open(mock_file, 'r', encoding='utf-8') as f:
    text = f.read()

# Hacky way to extract the json data from TS file
# For vehicles:
v_start = text.find('export const vehicles: Vehicle[] = [')
v_end = text.find(']', v_start) + 1
v_text = text[v_start + len('export const vehicles: Vehicle[] = '):v_end]

# For plans:
p_start = text.find('export const dispatchPlans: DispatchPlan[] = [')
p_end = text.find(']', p_start) + 1
p_text = text[p_start + len('export const dispatchPlans: DispatchPlan[] = '):p_end]

import pyjson5

try:
    vehicles = pyjson5.decode(v_text)
    plans = pyjson5.decode(p_text)
except Exception as e:
    import demjson3
    vehicles = demjson3.decode(v_text)
    plans = demjson3.decode(p_text)

DB_CONFIG = {
    'host': '187.127.131.38',
    'port': 3308,
    'user': 'root',
    'password': 'Ener9y_Demo@2026',
    'database': 'ERP_Packing'
}

conn = pymysql.connect(**DB_CONFIG)
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM Vehicle")
if cursor.fetchone()[0] == 0:
    print("Seeding vehicles...")
    for v in vehicles:
        cursor.execute("CALL SpManageVehicle('INSERT', NULL, %s, %s, %s, %s, %s, %s, %s, %s, 'system')", (
            v.get('vehicleNo'), v.get('transporter'), v.get('driver'), v.get('driverPhone'),
            v.get('capacityKg'), v.get('state'), v.get('currentShipmentNo'), v.get('isActive')
        ))
    conn.commit()
    print(f"Seeded {len(vehicles)} vehicles.")

cursor.execute("SELECT COUNT(*) FROM DispatchPlan")
if cursor.fetchone()[0] == 0:
    print("Seeding dispatch plans...")
    for p in plans:
        # docNo is auto-generated in our SP, but we can pass it if we want. Wait, the SP ignores p_DocNo!
        # Actually SP generates DocNo like 'DSP/YYYY/XXXX'. So the original DocNo from mock will be overwritten.
        # This is fine. The user asked to auto-generate it.
        cursor.execute("CALL SpManageDispatchPlan('INSERT', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'system')", (
            p.get('planDate'), p.get('status'), p.get('basis'), p.get('customer'), p.get('customerCode', 'CUS-NEW'),
            p.get('salesOrderNo'), p.get('route'), p.get('region'), p.get('deliveryDate'), p.get('priority'),
            p.get('cartons'), p.get('pallets'), p.get('weightKg'), p.get('volumeCbm'), p.get('vehicleNo'),
            p.get('transporter'), p.get('vehicleCapacityKg'), p.get('isExport', False), p.get('remarks')
        ))
    conn.commit()
    print(f"Seeded {len(plans)} dispatch plans.")

conn.close()
