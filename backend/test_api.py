import urllib.request, urllib.error
import json

data = json.dumps({
    "name": "Test",
    "transporterId": "12345",
    "mode": "ROAD",
    "isGta": False,
    "fleetSize": 0,
    "status": "ACTIVE",
    "effectiveFrom": "2023-01-01"
}).encode()

req = urllib.request.Request(
    'http://localhost:8000/api/v1/transporters',
    data=data,
    headers={'Content-Type': 'application/json'}
)

try:
    res = urllib.request.urlopen(req)
    print("200 OK")
    print(res.read().decode())
except urllib.error.HTTPError as e:
    print(e.code)
    print(e.read().decode())
