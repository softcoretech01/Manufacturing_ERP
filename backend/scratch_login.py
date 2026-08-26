import urllib.request
import json
import urllib.error

def test_login(payload):
    print(f"Testing {payload}")
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1/auth/login",
        data=data,
        headers={"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMUtaVDZTNlFUQlExN1Q3VjFSVDlBUEZRRyIsImNvbXBhbnkiOiIwMUtaVDZTNlA4REhCSENESDNWNlRIMEZHNSIsInNpZCI6IjAxTTA5WDJZVE1YSjdNVzlQSDlBQ1BTUEVNIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc4NzAzODg5MCwiZXhwIjoxNzg3MDM5NzkwfQ.uP8ZsDGMg_LGNpd9t76yDLGqLvgsRE7NYTQxhKbgVHtaoP6NkRA3A"}
    )

    try:
        res = urllib.request.urlopen(req)
        print("SUCCESS")
        print(res.read().decode()[:100])
    except urllib.error.HTTPError as e:
        print(f"ERROR {e.code}")
        print(e.read().decode())
    except Exception as e:
        print(f"ERROR: {e}")
        
test_login({"login_id": "admin", "password": "password"})
test_login({"login_id": "admin", "password": "admin", "company_uid": ""})
