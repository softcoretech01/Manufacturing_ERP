import urllib.request, json

req = urllib.request.Request(
    'http://localhost:8000/api/v1/procurement/purchase-orders/10',
    data=json.dumps({
        'uid': 10,
        'docNo': 'PO/26-27/00001',
        'docDate': '2026-08-28',
        'status': 'PENDING_APPROVAL',
        'plant': 'DEFAULT',
        'poType': 'STANDARD',
        'supplierUid': '1',
        'supplierName': 'Test',
        'buyer': 'Procurement',
        'currency': 'INR',
        'exchangeRate': 1,
        'paymentTerms': 'NET30',
        'deliveryWarehouse': 'W1',
        'promisedDate': '2026-09-05',
        'basicValue': 100,
        'taxValue': 18,
        'totalValue': 118,
        'lines': []
    }).encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'X-Tenant-ID': 'ssb01',
        'X-User-Roles': 'PROCUREMENT.PO.EDIT',
        'X-User-ID': '1'
    },
    method='PUT'
)

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Body:", response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Body:", e.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
