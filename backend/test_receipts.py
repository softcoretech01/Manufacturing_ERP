import urllib.request
import json
import urllib.error

body = {
    "item_uid": "1",  # Let's see what validation fails
    "warehouse_uid": "2",
    "quantity": 10,
    "rate": 100,
    "batch_no": "",
    "supplier_label": "Supplier"
}

req = urllib.request.Request(
    'http://localhost:8000/api/v1/inventory/receipts',
    data=json.dumps(body).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'X-Tenant-ID': 'ssb01', 'X-User-Roles': 'INVENTORY.RECEIPT.POST'},
    method='POST'
)

try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(f"Body: {e.read().decode('utf-8')}")
