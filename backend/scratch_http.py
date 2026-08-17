import urllib.request
import json
import time

url = "http://localhost:8000/api/v1/items"
req = urllib.request.Request(url, headers={"Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print(response.read().decode())
except urllib.error.HTTPError as e:
    print("Status:", e.code)
    print(e.read().decode())
