import requests
import json

# 1. Fetch changes
res = requests.get("http://localhost:8000/api/v1/engineering/changes")
changes = res.json()
print("Changes:", len(changes))

if len(changes) > 0:
    c = changes[0]
    print("Fetched change:", json.dumps(c, indent=2))
    
    # 2. Update it with same data
    uid = c["uid"]
    c["status"] = "UNDER_REVIEW"
    
    res2 = requests.put(f"http://localhost:8000/api/v1/engineering/changes/{uid}", json=c)
    print("PUT status:", res2.status_code)
    print("PUT response:", res2.text)
else:
    print("No changes found, creating one to test.")
    # Create one
    payload = {
        "docNo": "ECR-0001",
        "changeType": "ECR",
        "title": "Test Title",
        "reason": "This is a test reason that is at least 15 characters long.",
        "category": "DESIGN",
        "priority": "NORMAL",
        "productCode": "PRD-0001",
        "productName": "Vaccum Flask",
        "changeLines": [],
        "impactNote": "",
        "effectiveFrom": "2026-08-13",
        "status": "DRAFT",
        "sourceEcr": None,
        "resultingBom": None,
        "approvals": [],
        "requestedBy": "Rahul Iyer",
        "requestedOn": "2026-08-13",
        "createdAt": "2026-08-13T12:00:00Z",
        "version": 1
    }
    requests.post("http://localhost:8000/api/v1/engineering/changes", json=payload)
    
    # Try again
    res = requests.get("http://localhost:8000/api/v1/engineering/changes")
    c = res.json()[0]
    res2 = requests.put(f"http://localhost:8000/api/v1/engineering/changes/{c['uid']}", json=c)
    print("PUT status:", res2.status_code)
    print("PUT response:", res2.text)
