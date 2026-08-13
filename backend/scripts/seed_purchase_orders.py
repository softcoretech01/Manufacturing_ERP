import os
import json
import requests
from datetime import datetime, timedelta

def d(offset_days):
    return (datetime.now() - timedelta(days=offset_days)).strftime('%Y-%m-%d')

def f(offset_days):
    return (datetime.now() + timedelta(days=offset_days)).strftime('%Y-%m-%d')

def days_ago(d_offset, h_offset):
    return (datetime.now() - timedelta(days=d_offset, hours=h_offset)).strftime('%Y-%m-%dT%H:%M:%SZ')

seed_data = [
  {
    "docNo": "PO/26-27/00219", "docDate": d(1), "status": "PENDING_APPROVAL", "plant": "Chennai — Unit 1",
    "poType": "STANDARD", "supplierUid": "sup-02", "supplierName": "Perfect Polymers Private Limited", "buyer": "P. Suresh",
    "currency": "INR", "exchangeRate": 1, "paymentTerms": "45 days from invoice", "deliveryTerms": "Free delivery, Chennai plant",
    "deliveryWarehouse": "RM Store — Chennai", "promisedDate": f(20), "rfqNo": "RFQ/26-27/00042", "prRefs": ["PR/26-27/00183"],
    "basicValue": 738000, "discountValue": 11160, "taxValue": 132840, "freightValue": 0, "totalValue": 870840,
    "receivedPct": 0, "billedPct": 0, "acknowledged": False,
    "createdBy": "P. Suresh", "createdAt": days_ago(1, 12), "version": 1, "attachments": 2, "comments": 1,
    "approvals": [
      { "level": 1, "role": "Purchase Manager", "approver": "P. Suresh", "status": "APPROVED", "actedAt": days_ago(1, 12) },
      { "level": 2, "role": "Plant Head", "approver": "V. Ramanathan", "status": "PENDING" },
    ],
    "amendments": [],
    "lines": [
      { "itemCode": "RM-LID-SPT-01", "itemName": "Sports lid — PP, food grade, blue", "uom": "NOS", "qty": 45000, "receivedQty": 0, "rejectedQty": 0, "billedQty": 0, "rate": 12.4, "discountPct": 2, "hsn": "39235010", "taxPct": 18, "amount": 546840, "taxAmount": 98431, "lineTotal": 645271, "dueDate": f(20), "qcRequired": True, "schedules": [{ "dueDate": f(20), "qty": 25000, "receivedQty": 0 }, { "dueDate": f(34), "qty": 20000, "receivedQty": 0 }] },
      { "itemCode": "RM-SIL-GSK-01", "itemName": "Silicone gasket 62 mm", "uom": "NOS", "qty": 45000, "receivedQty": 0, "rejectedQty": 0, "billedQty": 0, "rate": 4.1, "discountPct": 0, "hsn": "40169390", "taxPct": 18, "amount": 184500, "taxAmount": 33210, "lineTotal": 217710, "dueDate": f(20), "qcRequired": True, "schedules": [{ "dueDate": f(20), "qty": 45000, "receivedQty": 0 }] },
    ],
  },
  {
    "docNo": "PO/26-27/00218", "docDate": d(5), "status": "APPROVED", "plant": "Chennai — Unit 1",
    "poType": "IMPORT", "supplierUid": "sup-07", "supplierName": "Nordic Vacuum Technologies AB", "buyer": "M. Lakshmi",
    "currency": "EUR", "exchangeRate": 96.4, "paymentTerms": "LC at sight", "deliveryTerms": "CIF Chennai", "incoterm": "CIF",
    "deliveryWarehouse": "Spares Store — Chennai", "promisedDate": f(34), "prRefs": ["PR/26-27/00182"],
    "basicValue": 3469400, "discountValue": 0, "taxValue": 0, "freightValue": 168700, "totalValue": 3638100,
    "receivedPct": 0, "billedPct": 0, "acknowledged": True, "acknowledgedAt": days_ago(4, 9),
    "createdBy": "M. Lakshmi", "createdAt": days_ago(5, 10), "version": 1, "attachments": 6, "comments": 7,
    "approvals": [
      { "level": 1, "role": "Purchase Manager", "approver": "P. Suresh", "status": "APPROVED", "actedAt": days_ago(5, 13) },
      { "level": 2, "role": "Plant Head", "approver": "V. Ramanathan", "status": "APPROVED", "actedAt": days_ago(5, 16) },
      { "level": 3, "role": "Director", "approver": "S. Balasubramanian", "status": "APPROVED", "actedAt": days_ago(4, 11), "remarks": "Emergency spare — approved on single-source justification." },
    ],
    "amendments": [],
    "lines": [
      { "itemCode": "SPR-VAC-ROT-02", "itemName": "Vacuum pump rotor set — Nordic VT-450", "uom": "SET", "qty": 2, "receivedQty": 0, "rejectedQty": 0, "billedQty": 0, "rate": 1684000 / 96.4, "discountPct": 0, "hsn": "84149040", "taxPct": 0, "amount": 3368000, "taxAmount": 0, "lineTotal": 3368000, "dueDate": f(34), "qcRequired": True, "schedules": [{ "dueDate": f(34), "qty": 2, "receivedQty": 0 }] },
      { "itemCode": "SPR-VAC-SEAL-02", "itemName": "Shaft seal kit — Nordic VT-450", "uom": "SET", "qty": 4, "receivedQty": 0, "rejectedQty": 0, "billedQty": 0, "rate": 25350 / 96.4, "discountPct": 0, "hsn": "84841000", "taxPct": 0, "amount": 101400, "taxAmount": 0, "lineTotal": 101400, "dueDate": f(34), "qcRequired": False, "schedules": [{ "dueDate": f(34), "qty": 4, "receivedQty": 0 }] },
    ],
  },
  {
    "docNo": "PO/26-27/00217", "docDate": d(6), "status": "PARTIALLY_EXECUTED", "plant": "Chennai — Unit 1",
    "poType": "RATE_CONTRACT", "supplierUid": "sup-01", "supplierName": "Jindal Stainless Limited", "buyer": "P. Suresh",
    "currency": "INR", "exchangeRate": 1, "paymentTerms": "30 days from invoice", "deliveryTerms": "Free delivery, Chennai plant",
    "deliveryWarehouse": "RM Store — Chennai", "promisedDate": f(15), "rfqNo": "RFQ/26-27/00041", "prRefs": ["PR/26-27/00171"],
    "contractNo": "CTR/26-27/0009",
    "basicValue": 27552000, "discountValue": 413280, "taxValue": 4959360, "freightValue": 0, "totalValue": 32511360,
    "receivedPct": 34, "billedPct": 30, "acknowledged": True, "acknowledgedAt": days_ago(6, 14),
    "createdBy": "P. Suresh", "createdAt": days_ago(6, 11), "version": 2, "attachments": 4, "comments": 9,
    "approvals": [
      { "level": 1, "role": "Purchase Manager", "approver": "P. Suresh", "status": "APPROVED", "actedAt": days_ago(6, 12) },
      { "level": 2, "role": "Plant Head", "approver": "V. Ramanathan", "status": "APPROVED", "actedAt": days_ago(6, 13) },
      { "level": 3, "role": "Director", "approver": "S. Balasubramanian", "status": "APPROVED", "actedAt": days_ago(6, 15) },
    ],
    "amendments": [
      { "revision": 1, "amendedAt": days_ago(3, 11), "amendedBy": "P. Suresh", "reason": "Schedule pull-in requested by planning", "changes": [{ "field": "Line 1 · schedule 2 due date", "from": f(60), "to": f(45) }, { "field": "Line 1 · schedule 2 qty", "from": "40,000 KG", "to": "45,000 KG" }] },
    ],
    "lines": [
      { "itemCode": "RM-SS304-050", "itemName": "SS 304 Coil 0.50 mm × 400 mm", "uom": "KG", "qty": 120000, "receivedQty": 42000, "rejectedQty": 380, "billedQty": 36000, "rate": 218, "discountPct": 1.5, "hsn": "72193390", "taxPct": 18, "amount": 25768800, "taxAmount": 4638384, "lineTotal": 30407184, "dueDate": f(15), "qcRequired": True, "schedules": [{ "dueDate": d(2), "qty": 40000, "receivedQty": 42000 }, { "dueDate": f(45), "qty": 45000, "receivedQty": 0 }, { "dueDate": f(90), "qty": 35000, "receivedQty": 0 }] },
      { "itemCode": "RM-SS304-080", "itemName": "SS 304 Coil 0.80 mm × 300 mm", "uom": "KG", "qty": 24000, "receivedQty": 8000, "rejectedQty": 0, "billedQty": 8000, "rate": 224, "discountPct": 1.5, "hsn": "72193390", "taxPct": 18, "amount": 5296320, "taxAmount": 953338, "lineTotal": 6249658, "dueDate": f(30), "qcRequired": True, "schedules": [{ "dueDate": d(4), "qty": 8000, "receivedQty": 8000 }, { "dueDate": f(60), "qty": 16000, "receivedQty": 0 }] },
    ],
  },
  {
    "docNo": "PO/26-27/00216", "docDate": d(8), "status": "PARTIALLY_EXECUTED", "plant": "Chennai — Unit 1",
    "poType": "STANDARD", "supplierUid": "sup-03", "supplierName": "Coatmaster Powder Coatings LLP", "buyer": "K. Ravi",
    "currency": "INR", "exchangeRate": 1, "paymentTerms": "30 days from invoice", "deliveryTerms": "Free delivery, Chennai plant",
    "deliveryWarehouse": "RM Store — Chennai", "promisedDate": f(4), "prRefs": ["PR/26-27/00176"],
    "basicValue": 1120500, "discountValue": 0, "taxValue": 201690, "freightValue": 8500, "totalValue": 1330690,
    "receivedPct": 60, "billedPct": 60, "acknowledged": True, "acknowledgedAt": days_ago(8, 13),
    "createdBy": "K. Ravi", "createdAt": days_ago(8, 10), "version": 1, "attachments": 1, "comments": 2,
    "approvals": [{ "level": 1, "role": "Purchase Manager", "approver": "P. Suresh", "status": "APPROVED", "actedAt": days_ago(8, 12) }],
    "amendments": [],
    "lines": [
      { "itemCode": "RM-PWD-BLU", "itemName": "Powder coat — matte ocean blue", "uom": "KG", "qty": 1800, "receivedQty": 1200, "rejectedQty": 0, "billedQty": 1200, "rate": 415, "discountPct": 0, "hsn": "32089029", "taxPct": 18, "amount": 747000, "taxAmount": 134460, "lineTotal": 881460, "dueDate": f(4), "qcRequired": True, "schedules": [{ "dueDate": d(2), "qty": 1200, "receivedQty": 1200 }, { "dueDate": f(4), "qty": 600, "receivedQty": 0 }] },
      { "itemCode": "RM-PWD-BLK", "itemName": "Powder coat — matte black", "uom": "KG", "qty": 900, "receivedQty": 600, "rejectedQty": 24, "billedQty": 600, "rate": 415, "discountPct": 0, "hsn": "32089029", "taxPct": 18, "amount": 373500, "taxAmount": 67230, "lineTotal": 440730, "dueDate": f(4), "qcRequired": True, "schedules": [{ "dueDate": d(2), "qty": 600, "receivedQty": 600 }, { "dueDate": f(4), "qty": 300, "receivedQty": 0 }] },
    ],
  }
]

API_URL = "http://localhost:8000/api/v1/procurement/purchase-orders/"

def seed():
    print(f"Seeding {len(seed_data)} purchase orders...")
    for po in seed_data:
        try:
            res = requests.post(API_URL, json=po)
            if res.status_code == 200:
                print(f"Created PO: {po['docNo']}")
            else:
                print(f"Failed to create PO {po['docNo']}: {res.text}")
        except Exception as e:
            print(f"Error creating PO {po['docNo']}: {e}")

if __name__ == "__main__":
    seed()
