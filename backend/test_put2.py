import requests

payload = {
    "uid": "1",
    "docNo": "ECN-0001",
    "changeType": "ECN",
    "title": "Test Title",
    "reason": "This is a test reason that is at least 15 characters long.",
    "category": "DESIGN",
    "priority": "NORMAL",
    "requestedBy": "Rahul Iyer",
    "requestedOn": "2026-08-13",
    "productCode": "PRD-0001",
    "productName": "Vaccum Flask",
    "changeLines": [],
    "impactNote": "",
    "effectiveFrom": "2026-08-13",
    "status": "PENDING_APPROVAL",
    "sourceEcr": None,
    "resultingBom": None,
    "approvals": [
        {"level": 1, "role": "Engineering Head", "approver": "Rahul Iyer", "status": "PENDING"},
        {"level": 2, "role": "Quality Head", "approver": "S. Meena", "status": "PENDING"},
        {"level": 3, "role": "Works Head", "approver": "S. Balaji", "status": "PENDING"}
    ],
    "createdAt": "2026-08-13T12:00:00Z",
    "version": 1
}

res = requests.put("http://localhost:8000/api/v1/engineering/changes/1", json=payload)
print(res.status_code)
print(res.text)
