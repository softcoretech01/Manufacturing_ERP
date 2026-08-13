import requests
import json
from pprint import pprint

BASE_URL = "http://localhost:8000/api/v1"

# Same mock data structure translated to python dictionaries
mock_data = {
    "spendByCategory": [
        {"category": "Raw material — steel", "value": 41800000, "poCount": 14, "suppliers": 3, "savingsPct": 3.1},
        {"category": "Packaging", "value": 9640000, "poCount": 18, "suppliers": 4, "savingsPct": 4.8},
        {"category": "Imported spares", "value": 8920000, "poCount": 3, "suppliers": 2, "savingsPct": 0.4},
        {"category": "Plastic components", "value": 6240000, "poCount": 9, "suppliers": 5, "savingsPct": 5.6},
        {"category": "Surface treatment", "value": 4180000, "poCount": 11, "suppliers": 2, "savingsPct": 2.2},
        {"category": "Logistics", "value": 3820000, "poCount": 6, "suppliers": 3, "savingsPct": 1.9},
        {"category": "Components & tooling", "value": 2960000, "poCount": 7, "suppliers": 4, "savingsPct": 3.7},
        {"category": "Job work", "value": 1140000, "poCount": 4, "suppliers": 2, "savingsPct": 0.9}
    ],
    "spendTrend": [
        {"month": "Apr", "spend": 9820000, "budget": 10500000, "poCount": 22},
        {"month": "May", "spend": 11240000, "budget": 10500000, "poCount": 26},
        {"month": "Jun", "spend": 10680000, "budget": 11000000, "poCount": 24},
        {"month": "Jul", "spend": 12960000, "budget": 11000000, "poCount": 31},
        {"month": "Aug", "spend": 11480000, "budget": 12000000, "poCount": 28},
        {"month": "Sep", "spend": 13620000, "budget": 12000000, "poCount": 33},
        {"month": "Oct", "spend": 8900000, "budget": 12500000, "poCount": 19}
    ],
    "supplierSpend": [
        {"supplierName": "Jindal Stainless Limited", "value": 41800000, "sharePct": 53.4, "onTimePct": 92.9, "rejectionPct": 0.9, "grade": "A"},
        {"supplierName": "Sri Venkateswara Packaging", "value": 9640000, "sharePct": 12.3, "onTimePct": 94.4, "rejectionPct": 0.7, "grade": "A"},
        {"supplierName": "Nordic Vacuum Technologies", "value": 8920000, "sharePct": 11.4, "onTimePct": 66.7, "rejectionPct": 0, "grade": "B"},
        {"supplierName": "Perfect Polymers", "value": 6240000, "sharePct": 8.0, "onTimePct": 88.9, "rejectionPct": 1.4, "grade": "B"},
        {"supplierName": "Coatmaster Powder Coatings", "value": 4180000, "sharePct": 5.3, "onTimePct": 90.9, "rejectionPct": 3.8, "grade": "C"},
        {"supplierName": "Metro Logistics Services", "value": 3820000, "sharePct": 4.9, "onTimePct": 87.5, "rejectionPct": 0, "grade": "B"},
        {"supplierName": "Apex Tooling Works", "value": 2960000, "sharePct": 3.8, "onTimePct": 71.4, "rejectionPct": 4.6, "grade": "C"},
        {"supplierName": "Sree Electroplating Works", "value": 1140000, "sharePct": 1.5, "onTimePct": 50.0, "rejectionPct": 11.6, "grade": "D"}
    ],
    "priceTrend": [
        {"month": "Apr", "ss304": 212, "ss316": 298, "lid": 12.9},
        {"month": "May", "ss304": 215, "ss316": 302, "lid": 12.9},
        {"month": "Jun", "ss304": 224, "ss316": 314, "lid": 12.7},
        {"month": "Jul", "ss304": 229, "ss316": 321, "lid": 12.7},
        {"month": "Aug", "ss304": 226, "ss316": 318, "lid": 12.5},
        {"month": "Sep", "ss304": 221, "ss316": 315, "lid": 12.5},
        {"month": "Oct", "ss304": 218, "ss316": 312, "lid": 12.4}
    ],
    "cycleTimes": [
        {"stage": "PR raised → approved", "avgDays": 1.4, "targetDays": 1.0},
        {"stage": "PR approved → RFQ issued", "avgDays": 2.1, "targetDays": 2.0},
        {"stage": "RFQ issued → quotes in", "avgDays": 4.6, "targetDays": 5.0},
        {"stage": "Quotes in → PO placed", "avgDays": 3.8, "targetDays": 3.0},
        {"stage": "PO placed → acknowledged", "avgDays": 1.1, "targetDays": 1.0},
        {"stage": "PO → first receipt", "avgDays": 18.4, "targetDays": 21.0},
        {"stage": "GRN → QC cleared", "avgDays": 1.7, "targetDays": 1.0}
    ]
}

def seed_analytics():
    print("Pushing analytics data to API...")
    url = f"{BASE_URL}/procurement/analytics"
    # Using PUT or POST depending on our router design. I used POST "/"
    res = requests.post(url + "/", json=mock_data)
    
    if res.status_code == 200:
        print("Success!")
    else:
        print(f"Failed! Status: {res.status_code}")
        print(res.text)

if __name__ == "__main__":
    seed_analytics()
