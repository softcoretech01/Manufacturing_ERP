import requests
import json
from datetime import datetime

API_URL = "http://localhost:8000/api/v1/procurement/rfq/"

rfqs = [
    {
        "docNo": "RFQ/26-27/00042",
        "docDate": "2026-08-08",
        "status": "IN_PROGRESS",
        "plant": "Chennai - Unit 1",
        "title": "Sports lids and gaskets - Q3 requirement",
        "category": "Plastic components",
        "quoteDueBy": "2026-08-16",
        "buyer": "P. Suresh",
        "sealed": True,
        "currency": "INR",
        "estimatedValue": 742500,
        "prRefs": ["PR/26-27/00183"],
        "version": 1,
        "remarks": "",
        "attachments": 2,
        "comments": 4,
        "createdBy": "P. Suresh",
        "lines": [
            {
                "itemCode": "RM-LID-SPT-01",
                "itemName": "Sports lid - PP, food grade, blue",
                "uom": "NOS",
                "qty": 45000,
                "requiredBy": "2026-08-30",
                "specification": ""
            },
            {
                "itemCode": "RM-SIL-GSK-01",
                "itemName": "Silicone gasket 62 mm",
                "uom": "NOS",
                "qty": 45000,
                "requiredBy": "2026-08-30",
                "specification": ""
            }
        ],
        "suppliers": [
            {
                "supplierUid": "sup-02",
                "supplierName": "Perfect Polymers Private Limited",
                "invitedAt": "2026-08-08T10:00:00Z",
                "respondedAt": "2026-08-10T12:00:00Z",
                "responseStatus": "QUOTED",
                "quotationUid": "sq-01"
            },
            {
                "supplierUid": "sup-09",
                "supplierName": "Vertex Moulders Private Limited",
                "invitedAt": "2026-08-08T10:00:00Z",
                "respondedAt": "2026-08-10T15:00:00Z",
                "responseStatus": "QUOTED",
                "quotationUid": "sq-02"
            }
        ],
        "approvals": [
            {
                "level": 1,
                "role": "Purchase Head",
                "approver": "R. Meenakshi",
                "status": "APPROVED",
                "actedAt": "2026-08-09T09:00:00Z",
                "remarks": "Approved"
            }
        ]
    },
    {
        "docNo": "RFQ/26-27/00041",
        "docDate": "2026-08-05",
        "status": "COMPLETED",
        "plant": "Hosur - Unit 2",
        "title": "SS 304 and 316 Coil for Q3 production",
        "category": "Raw material - steel",
        "quoteDueBy": "2026-08-10",
        "buyer": "M. Lakshmi",
        "sealed": True,
        "currency": "INR",
        "estimatedValue": 31000000,
        "awardedTo": "sup-01",
        "prRefs": ["PR/26-27/00181"],
        "version": 1,
        "attachments": 1,
        "comments": 2,
        "createdBy": "M. Lakshmi",
        "lines": [
            {
                "itemCode": "RM-SS304-050",
                "itemName": "SS 304 Coil 0.50 mm x 400 mm",
                "uom": "KG",
                "qty": 120000,
                "requiredBy": "2027-02-08",
                "specification": "ASTM A240 Gr 304, 2B, MTC per heat mandatory"
            }
        ],
        "suppliers": [
            {
                "supplierUid": "sup-01",
                "supplierName": "Jindal Stainless Limited",
                "invitedAt": "2026-08-05T10:00:00Z",
                "respondedAt": "2026-08-07T12:00:00Z",
                "responseStatus": "QUOTED",
                "quotationUid": "sq-04"
            }
        ],
        "approvals": []
    }
]

def seed_rfqs():
    for rfq in rfqs:
        try:
            response = requests.post(API_URL, json=rfq)
            if response.status_code == 201:
                print(f"Successfully seeded {rfq['docNo']}")
            else:
                print(f"Failed to seed {rfq['docNo']}: {response.text}")
        except Exception as e:
            print(f"Error seeding {rfq['docNo']}: {e}")

if __name__ == "__main__":
    seed_rfqs()
