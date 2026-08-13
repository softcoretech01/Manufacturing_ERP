import httpx
import asyncio
import json
import os

mock_data = [
  {
    "uid": "pr-001",
    "docNo": "PR/26-27/00001",
    "docDate": "2026-08-10",
    "status": "APPROVED",
    "plant": "Chennai \u2014 Unit 1",
    "createdBy": "Arun Kumar",
    "createdAt": "2026-08-10T09:15:00Z",
    "version": 1,
    "attachments": 2,
    "comments": 1,
    "source": "MRP",
    "department": "Production Planning",
    "requestedBy": "Arun Kumar",
    "priority": "HIGH",
    "requiredBy": "2026-08-25",
    "justification": "Required for upcoming export order SS-Export-Q3",
    "estimatedValue": 450000.0,
    "budgetCode": "CAPEX-2026",
    "budgetAvailable": 1200000.0,
    "lines": [
      {
        "uid": "prl-001",
        "itemCode": "RM-SS304-01",
        "itemName": "SS 304 Coil 0.4mm",
        "uom": "KG",
        "qty": 1500,
        "qtyOrdered": 0,
        "requiredBy": "2026-08-20",
        "estimatedRate": 250,
        "costCentre": "CC-Prod",
        "specification": "Prime quality, suitable for deep drawing"
      },
      {
        "uid": "prl-002",
        "itemCode": "RM-SS304-02",
        "itemName": "SS 304 Coil 0.5mm",
        "uom": "KG",
        "qty": 300,
        "qtyOrdered": 0,
        "requiredBy": "2026-08-20",
        "estimatedRate": 250,
        "costCentre": "CC-Prod"
      }
    ],
    "approvals": [
      {
        "level": 1,
        "role": "Production Head",
        "approver": "Ramesh",
        "status": "APPROVED",
        "actedAt": "2026-08-10T10:30:00Z"
      },
      {
        "level": 2,
        "role": "Plant Head",
        "approver": "S. Prakash",
        "status": "APPROVED",
        "actedAt": "2026-08-11T14:15:00Z"
      }
    ]
  },
  {
    "uid": "pr-002",
    "docNo": "PR/26-27/00002",
    "docDate": "2026-08-11",
    "status": "PENDING_APPROVAL",
    "plant": "Hosur \u2014 Unit 2",
    "createdBy": "Karthik",
    "createdAt": "2026-08-11T11:00:00Z",
    "version": 1,
    "attachments": 1,
    "comments": 0,
    "source": "MANUAL",
    "department": "Maintenance",
    "requestedBy": "Karthik",
    "priority": "NORMAL",
    "requiredBy": "2026-08-30",
    "justification": "Spares for hydraulic press machine preventive maintenance",
    "estimatedValue": 45000.0,
    "budgetCode": "OPEX-MAINT",
    "budgetAvailable": 150000.0,
    "lines": [
      {
        "uid": "prl-003",
        "itemCode": "SP-HYD-01",
        "itemName": "Hydraulic Oil AW68",
        "uom": "LTR",
        "qty": 210,
        "qtyOrdered": 0,
        "requiredBy": "2026-08-25",
        "estimatedRate": 180,
        "costCentre": "CC-Maint"
      }
    ],
    "approvals": [
      {
        "level": 1,
        "role": "Maintenance Manager",
        "approver": "Venkat",
        "status": "PENDING"
      }
    ]
  }
]

async def seed():
    async with httpx.AsyncClient() as client:
        for pr in mock_data:
            response = await client.post('http://localhost:8000/api/v1/procurement/requisitions/', json=pr)
            if response.status_code == 201:
                print(f"Successfully seeded {pr['docNo']}")
            else:
                print(f"Failed to seed {pr['docNo']}: {response.text}")

if __name__ == '__main__':
    asyncio.run(seed())
