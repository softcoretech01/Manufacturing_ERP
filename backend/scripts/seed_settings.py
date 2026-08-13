import requests
import json
import os
import sys

# We can import the mock data from python manually, or since it's in a TS file,
# it's easier to just hardcode the seed data here based on what's in procurementSettings.ts

BASE_URL = "http://localhost:8000/api/v1/procurement/settings"

params = [
    {"uid": "p-1", "code": "PR_AUTO_APPROVE_LIMIT", "name": "Requisition auto-approval limit", "description": "Requisitions below this value do not require routing to a manager.", "value": "10000", "unit": "INR", "group": "APPROVAL", "scope": "Plant-wide", "editable": True},
    {"uid": "p-2", "code": "PO_DEVIATION_TOLERANCE", "name": "PO deviation tolerance", "description": "Allowable percentage deviation from the quoted price before re-approval is required.", "value": "5", "unit": "%", "group": "APPROVAL", "scope": "Company-wide", "editable": True},
    {"uid": "p-3", "code": "GRN_QTY_TOLERANCE", "name": "Receipt quantity tolerance", "description": "Percentage by which received quantity can exceed ordered quantity without being rejected.", "value": "2", "unit": "%", "group": "TOLERANCE", "scope": "Plant-wide", "editable": True},
    {"uid": "p-4", "code": "GRN_EARLY_TOLERANCE", "name": "Early receipt tolerance", "description": "Number of days before promised date that a delivery will be accepted at the gate.", "value": "7", "unit": "days", "group": "TOLERANCE", "scope": "Plant-wide", "editable": True},
    {"uid": "p-5", "code": "QUOTE_VALIDITY_MIN", "name": "Minimum quote validity", "description": "Quotations expiring sooner than this will be rejected by the system.", "value": "15", "unit": "days", "group": "GENERAL", "scope": "Company-wide", "editable": True},
    {"uid": "p-6", "code": "STAT_MSME_DAYS", "name": "MSME payment mandate", "description": "Maximum allowable days to pay an MSME registered supplier.", "value": "45", "unit": "days", "group": "STATUTORY", "scope": "National (India)", "editable": False},
]

weights = [
    {"uid": "w-1", "setCode": "W-STEEL", "setName": "Steel Coil", "category": "Raw material — steel", "criterion": "Price", "weightPct": 80, "direction": "LOWER", "active": True},
    {"uid": "w-2", "setCode": "W-STEEL", "setName": "Steel Coil", "category": "Raw material — steel", "criterion": "Lead time", "weightPct": 20, "direction": "LOWER", "active": True},
    
    {"uid": "w-3", "setCode": "W-PKG", "setName": "Corrugated Cartons", "category": "Packaging", "criterion": "Price", "weightPct": 50, "direction": "LOWER", "active": True},
    {"uid": "w-4", "setCode": "W-PKG", "setName": "Corrugated Cartons", "category": "Packaging", "criterion": "Quality rating", "weightPct": 30, "direction": "HIGHER", "active": True},
    {"uid": "w-5", "setCode": "W-PKG", "setName": "Corrugated Cartons", "category": "Packaging", "criterion": "Lead time", "weightPct": 20, "direction": "LOWER", "active": True},
]

reasons = [
    {"uid": "r-1", "code": "PRC-URGENT", "label": "Breakdown / Emergency", "documentType": "Requisition (emergency)", "requiresComment": True, "active": True},
    {"uid": "r-2", "code": "PRC-SOLE-SRC", "label": "Proprietary or sole source", "documentType": "RFQ (short vendor)", "requiresComment": True, "active": True},
    {"uid": "r-3", "code": "PRC-LEAD-TIME", "label": "Selected for faster delivery over price", "documentType": "Comparison (deviation)", "requiresComment": True, "active": True},
    {"uid": "r-4", "code": "PRC-CANCEL-CHG", "label": "Requirement changed or dropped", "documentType": "PO cancellation", "requiresComment": False, "active": True},
    {"uid": "r-5", "code": "PRC-SHORT-DLV", "label": "Supplier cannot complete balance", "documentType": "PO short-close", "requiresComment": True, "active": True},
    {"uid": "r-6", "code": "PRC-QC-FAIL", "label": "Failed incoming inspection", "documentType": "Purchase return", "requiresComment": False, "active": True},
]

def seed():
    print("Pushing parameters...")
    for p in params:
        res = requests.post(f"{BASE_URL}/parameters", json=p)
        if res.status_code != 200:
            print(f"Failed param {p['code']}: {res.text}")

    print("Pushing weights...")
    res = requests.post(f"{BASE_URL}/weights", json=weights)
    if res.status_code != 200:
        print(f"Failed weights: {res.text}")
        
    print("Pushing reason codes...")
    for r in reasons:
        res = requests.post(f"{BASE_URL}/reasons", json=r)
        if res.status_code != 200:
            print(f"Failed reason {r['code']}: {res.text}")
            
    print("Success!")

if __name__ == "__main__":
    seed()
