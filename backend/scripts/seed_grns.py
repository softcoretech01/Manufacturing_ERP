import sys
import os
import json
import requests
from datetime import datetime, date

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.schemas.procurement import GrnSchema, IncomingInspectionSchema

API_URL = "http://localhost:8000/api/v1/procurement"

def run():
    print("Seeding GRNs and IQC...")
    
    # We will copy the mock data here for GRNs and Inspections.
    grns_data = [
        {
            "uid": 1,
            "docNo": "GRN/26-27/00342",
            "docDate": "2026-08-10",
            "status": "APPROVED",
            "poNo": "PO/26-27/00192",
            "asnNo": "ASN-7890",
            "supplierUid": "sup-01",
            "supplierName": "Jindal Stainless Limited",
            "warehouse": "RM Store - Chennai",
            "gateEntryNo": "GE/26-27/1142",
            "gateEntryAt": "2026-08-10T09:15:00Z",
            "invoiceNo": "INV-JSL-26-899",
            "invoiceDate": "2026-08-08",
            "invoiceValue": 8114220.0,
            "vehicleNo": "TN 18 AB 4432",
            "lrNo": "LR-4599-2",
            "receivedBy": "K. Kumar",
            "qcStatus": "ACCEPTED",
            "totalReceived": 31500.0,
            "totalAccepted": 31500.0,
            "totalRejected": 0.0,
            "grnValue": 6876450.0,
            "delayDays": -2,
            "version": 1,
            "attachments": 2,
            "comments": 1,
            "createdBy": "K. Kumar",
            "createdAt": "2026-08-10T10:00:00Z",
            "lines": [
                {
                    "uid": 1,
                    "itemCode": "RM-SS304-050",
                    "itemName": "SS 304 Coil 0.50 mm - 400 mm",
                    "uom": "KG",
                    "poQty": 40000.0,
                    "challanQty": 31500.0,
                    "receivedQty": 31500.0,
                    "acceptedQty": 31500.0,
                    "rejectedQty": 0.0,
                    "shortQty": 0.0,
                    "excessQty": 0.0,
                    "rate": 218.3,
                    "batchNo": "B-2608-01",
                    "heatNo": "H4882-C",
                    "binCode": "RM-A-01",
                    "qcStatus": "ACCEPTED"
                }
            ],
            "approvals": [
                {
                    "level": 1,
                    "role": "Stores In-charge",
                    "approver": "M. Lakshmi",
                    "status": "APPROVED",
                    "actedAt": "2026-08-10T10:30:00Z"
                }
            ]
        },
        {
            "uid": 2,
            "docNo": "GRN/26-27/00341",
            "docDate": "2026-08-09",
            "status": "APPROVED",
            "poNo": "PO/26-27/00188",
            "supplierUid": "sup-02",
            "supplierName": "Perfect Polymers Private Limited",
            "warehouse": "RM Store - Hosur",
            "gateEntryNo": "GE/26-27/1138",
            "gateEntryAt": "2026-08-09T14:20:00Z",
            "invoiceNo": "PPPL/26/4102",
            "invoiceDate": "2026-08-08",
            "invoiceValue": 312700.0,
            "vehicleNo": "TN 24 CX 1902",
            "lrNo": "-",
            "receivedBy": "S. Mahesh",
            "qcStatus": "REJECTED",
            "totalReceived": 25000.0,
            "totalAccepted": 0.0,
            "totalRejected": 25000.0,
            "grnValue": 310000.0,
            "delayDays": 1,
            "version": 1,
            "attachments": 1,
            "comments": 3,
            "createdBy": "S. Mahesh",
            "createdAt": "2026-08-09T15:00:00Z",
            "lines": [
                {
                    "uid": 2,
                    "itemCode": "RM-LID-SPT-01",
                    "itemName": "Sports lid - PP, food grade, blue",
                    "uom": "NOS",
                    "poQty": 25000.0,
                    "challanQty": 25000.0,
                    "receivedQty": 25000.0,
                    "acceptedQty": 0.0,
                    "rejectedQty": 25000.0,
                    "shortQty": 0.0,
                    "excessQty": 0.0,
                    "rate": 12.4,
                    "batchNo": "PP-2608-44",
                    "binCode": "QUARANTINE",
                    "qcStatus": "REJECTED",
                    "rejectionReason": "Color deviation (Delta E > 2.5)"
                }
            ],
            "approvals": [
                {
                    "level": 1,
                    "role": "Stores In-charge",
                    "approver": "R. Ramesh",
                    "status": "APPROVED",
                    "actedAt": "2026-08-09T16:00:00Z"
                }
            ]
        },
        {
            "uid": 3,
            "docNo": "GRN/26-27/00340",
            "docDate": "2026-08-08",
            "status": "APPROVED",
            "poNo": "PO/26-27/00195",
            "supplierUid": "sup-04",
            "supplierName": "Sri Venkateswara Packaging Industries",
            "warehouse": "Packing Store - Chennai",
            "gateEntryNo": "GE/26-27/1131",
            "gateEntryAt": "2026-08-08T11:45:00Z",
            "invoiceNo": "SVPI-902",
            "invoiceDate": "2026-08-08",
            "invoiceValue": 91200.0,
            "vehicleNo": "TN 09 BX 8812",
            "lrNo": "SELF",
            "receivedBy": "K. Kumar",
            "qcStatus": "NOT_REQUIRED",
            "totalReceived": 24000.0,
            "totalAccepted": 24000.0,
            "totalRejected": 0.0,
            "grnValue": 91200.0,
            "delayDays": 0,
            "version": 1,
            "attachments": 0,
            "comments": 0,
            "createdBy": "K. Kumar",
            "createdAt": "2026-08-08T12:00:00Z",
            "lines": [
                {
                    "uid": 3,
                    "itemCode": "PKG-CTN-12",
                    "itemName": "5-ply carton - 12 bottle",
                    "uom": "NOS",
                    "poQty": 24000.0,
                    "challanQty": 24000.0,
                    "receivedQty": 24000.0,
                    "acceptedQty": 24000.0,
                    "rejectedQty": 0.0,
                    "shortQty": 0.0,
                    "excessQty": 0.0,
                    "rate": 3.8,
                    "binCode": "PKG-C-04",
                    "qcStatus": "NOT_REQUIRED"
                }
            ],
            "approvals": [
                {
                    "level": 1,
                    "role": "Stores In-charge",
                    "approver": "M. Lakshmi",
                    "status": "APPROVED",
                    "actedAt": "2026-08-08T12:30:00Z"
                }
            ]
        },
        {
            "uid": 4,
            "docNo": "GRN/26-27/00339",
            "docDate": "2026-08-07",
            "status": "PENDING_APPROVAL",
            "poNo": "PO/26-27/00170",
            "supplierUid": "sup-03",
            "supplierName": "Coatmaster Powder Coatings LLP",
            "warehouse": "RM Store - Chennai",
            "gateEntryNo": "GE/26-27/1120",
            "gateEntryAt": "2026-08-07T16:10:00Z",
            "invoiceNo": "CM-26-441",
            "invoiceDate": "2026-08-06",
            "invoiceValue": 489700.0,
            "vehicleNo": "TN 22 AY 1109",
            "lrNo": "ST-9912",
            "receivedBy": "K. Kumar",
            "qcStatus": "PENDING",
            "totalReceived": 1180.0,
            "totalAccepted": 0.0,
            "totalRejected": 0.0,
            "grnValue": 489700.0,
            "delayDays": -4,
            "version": 1,
            "attachments": 1,
            "comments": 0,
            "createdBy": "K. Kumar",
            "createdAt": "2026-08-07T16:30:00Z",
            "lines": [
                {
                    "uid": 4,
                    "itemCode": "RM-PWD-BLU",
                    "itemName": "Powder coat - matte ocean blue",
                    "uom": "KG",
                    "poQty": 1200.0,
                    "challanQty": 1200.0,
                    "receivedQty": 1180.0,
                    "acceptedQty": 0.0,
                    "rejectedQty": 0.0,
                    "shortQty": 20.0,
                    "excessQty": 0.0,
                    "rate": 415.0,
                    "batchNo": "CM-BLU-0805",
                    "mfgDate": "2026-08-05",
                    "expiryDate": "2027-02-05",
                    "binCode": "QUARANTINE",
                    "qcStatus": "PENDING"
                }
            ],
            "approvals": [
                {
                    "level": 1,
                    "role": "Stores In-charge",
                    "approver": "M. Lakshmi",
                    "status": "PENDING",
                    "actedAt": None
                }
            ]
        }
    ]

    inspections_data = [
        {
            "uid": 1,
            "docNo": "IQC/26-27/00214",
            "docDate": "2026-08-10",
            "grnNo": "GRN/26-27/00342",
            "poNo": "PO/26-27/00192",
            "supplierUid": "sup-01",
            "supplierName": "Jindal Stainless Limited",
            "itemCode": "RM-SS304-050",
            "itemName": "SS 304 Coil 0.50 mm - 400 mm",
            "batchNo": "B-2608-01",
            "heatNo": "H4882-C",
            "lotQty": 31500.0,
            "sampleSize": 3.0,
            "samplingPlan": "ISO 2859-1, Level II",
            "aql": "1.0",
            "inspectedBy": "A. Velu",
            "status": "ACCEPTED",
            "acceptedQty": 31500.0,
            "rejectedQty": 0.0,
            "defectsFound": 0,
            "mtcReceived": True,
            "mtcVerified": True,
            "createdBy": "A. Velu",
            "createdAt": "2026-08-10T11:00:00Z",
            "parameters": [
                {"uid": 1, "name": "Thickness", "method": "Micrometer", "spec": "0.50 ± 0.02 mm", "observed": "0.51 mm", "result": "PASS", "critical": True},
                {"uid": 2, "name": "Width", "method": "Vernier", "spec": "400 ± 1 mm", "observed": "400.2 mm", "result": "PASS", "critical": True},
                {"uid": 3, "name": "Surface Finish", "method": "Visual / Ra tester", "spec": "2B finish, Ra < 0.3 µm", "observed": "Ra 0.25 µm", "result": "PASS", "critical": False},
                {"uid": 4, "name": "Chemical Comp - Ni", "method": "Spectro", "spec": "8.0 - 10.5%", "observed": "8.2% (per MTC)", "result": "PASS", "critical": True}
            ]
        },
        {
            "uid": 2,
            "docNo": "IQC/26-27/00213",
            "docDate": "2026-08-09",
            "grnNo": "GRN/26-27/00341",
            "poNo": "PO/26-27/00188",
            "supplierUid": "sup-02",
            "supplierName": "Perfect Polymers Private Limited",
            "itemCode": "RM-LID-SPT-01",
            "itemName": "Sports lid - PP, food grade, blue",
            "batchNo": "PP-2608-44",
            "lotQty": 25000.0,
            "sampleSize": 315.0,
            "samplingPlan": "ISO 2859-1, Level II",
            "aql": "0.65",
            "inspectedBy": "B. Anand",
            "status": "REJECTED",
            "acceptedQty": 0.0,
            "rejectedQty": 25000.0,
            "defectsFound": 12,
            "mtcReceived": False,
            "mtcVerified": False,
            "ncrNo": "NCR/26-27/0041",
            "createdBy": "B. Anand",
            "createdAt": "2026-08-09T16:30:00Z",
            "parameters": [
                {"uid": 5, "name": "Color matching", "method": "Spectrophotometer", "spec": "ΔE < 1.0 against master", "observed": "ΔE 2.8", "result": "FAIL", "critical": True},
                {"uid": 6, "name": "Thread fitment", "method": "Go/No-Go Gauge", "spec": "Smooth engagement", "observed": "Pass", "result": "PASS", "critical": True},
                {"uid": 7, "name": "Flash / Burrs", "method": "Visual", "spec": "None visible", "observed": "Minor flash on 3 parts", "result": "PASS", "critical": False}
            ]
        }
    ]

    for grn in grns_data:
        try:
            GrnSchema(**grn)
        except Exception as e:
            print(f"Validation failed for GRN {grn['docNo']}: {e}")
            continue
            
        res = requests.post(f"{API_URL}/grn/", json=grn)
        if res.status_code == 201:
            print(f"Created GRN: {grn['docNo']}")
        else:
            print(f"Failed to create GRN {grn['docNo']}: {res.text}")
            
    for iqc in inspections_data:
        try:
            IncomingInspectionSchema(**iqc)
        except Exception as e:
            print(f"Validation failed for IQC {iqc['docNo']}: {e}")
            continue
            
        res = requests.post(f"{API_URL}/iqc/", json=iqc)
        if res.status_code == 201:
            print(f"Created IQC: {iqc['docNo']}")
        else:
            print(f"Failed to create IQC {iqc['docNo']}: {res.text}")

if __name__ == "__main__":
    run()
