import urllib.request
import urllib.error

req = urllib.request.Request(
    'http://localhost:8000/api/v1/inventory/stock-balances?hide_zero=true',
    headers={'X-Tenant-ID': 'ssb01', 'X-User-Roles': 'INVENTORY.STOCK.READ'},
    method='GET'
)

try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(f"Body: {e.read().decode('utf-8')}")
