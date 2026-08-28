import requests
resp = requests.get('http://127.0.0.1:8000/api/v1/employees')
if resp.status_code == 200:
    for emp in resp.json():
        print(emp.get('createdBy'), emp.get('createdAt'))
else:
    print(resp.status_code)
