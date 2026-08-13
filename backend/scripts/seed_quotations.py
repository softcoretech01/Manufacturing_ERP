import pymysql
import os
import json
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

db_host = os.getenv('DB_HOST', '187.127.131.38')
db_port = int(os.getenv('DB_PORT', 3308))
db_user = os.getenv('DB_USER', 'root')
db_password = os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026')
db_name = 'ERP_Procurement'

from datetime import datetime, timedelta

def days_ago(d):
    return (datetime.now() - timedelta(days=d)).strftime('%Y-%m-%d')

def days_ahead(d):
    return (datetime.now() + timedelta(days=d)).strftime('%Y-%m-%d')

seed_quotations = [
  {
    "docNo": "SQ/26-27/00118", "docDate": days_ago(2), "rfqNo": "RFQ/26-27/00042",
    "supplierUid": "sup-02", "supplierName": "Perfect Polymers Private Limited", "status": "NEGOTIATING",
    "currency": "INR", "exchangeRate": 1, "validTill": days_ahead(28), "paymentTerms": "45 days from invoice", "deliveryTerms": "Free delivery, Chennai plant",
    "warrantyMonths": 12, "basicValue": 738000, "taxValue": 132840, "freightValue": 0, "landedValue": 870840,
    "leadTimeDays": 14, "technicalScore": 92, "commercialScore": 84, "totalScore": 88.8, "rank": 1, "attachments": 3, "negotiationRounds": 2,
    "createdBy": "System",
    "lines": [
      { "itemCode": "RM-LID-SPT-01", "itemName": "Sports lid — PP, food grade, blue", "uom": "NOS", "qty": 45000, "rate": 12.4, "discountPct": 2, "taxPct": 18, "freight": 0, "landedRate": 14.34, "leadTimeDays": 14, "moq": 10000 },
      { "itemCode": "RM-SIL-GSK-01", "itemName": "Silicone gasket 62 mm", "uom": "NOS", "qty": 45000, "rate": 4.1, "discountPct": 0, "taxPct": 18, "freight": 0, "landedRate": 4.84, "leadTimeDays": 14, "moq": 10000 }
    ]
  },
  {
    "docNo": "SQ/26-27/00119", "docDate": days_ago(2), "rfqNo": "RFQ/26-27/00042",
    "supplierUid": "sup-09", "supplierName": "Vertex Moulders Private Limited", "status": "SHORTLISTED",
    "currency": "INR", "exchangeRate": 1, "validTill": days_ahead(21), "paymentTerms": "30 days from invoice", "deliveryTerms": "Ex-works Coimbatore",
    "warrantyMonths": 6, "basicValue": 706500, "taxValue": 127170, "freightValue": 28000, "landedValue": 861670,
    "leadTimeDays": 21, "technicalScore": 78, "commercialScore": 89, "totalScore": 82.4, "rank": 2, "attachments": 2, "negotiationRounds": 1,
    "createdBy": "System",
    "lines": [
      { "itemCode": "RM-LID-SPT-01", "itemName": "Sports lid — PP, food grade, blue", "uom": "NOS", "qty": 45000, "rate": 11.8, "discountPct": 0, "taxPct": 18, "freight": 18000, "landedRate": 14.32, "leadTimeDays": 21, "moq": 15000 },
      { "itemCode": "RM-SIL-GSK-01", "itemName": "Silicone gasket 62 mm", "uom": "NOS", "qty": 45000, "rate": 3.9, "discountPct": 0, "taxPct": 18, "freight": 10000, "landedRate": 4.82, "leadTimeDays": 21, "moq": 15000 }
    ]
  },
  {
    "docNo": "SQ/26-27/00120", "docDate": days_ago(1), "rfqNo": "RFQ/26-27/00042",
    "supplierUid": "sup-10", "supplierName": "Suraj Polymers LLP", "status": "UNDER_REVIEW",
    "currency": "INR", "exchangeRate": 1, "validTill": days_ahead(14), "paymentTerms": "Advance 50%, balance on delivery", "deliveryTerms": "Free delivery, Chennai plant",
    "warrantyMonths": 6, "basicValue": 684000, "taxValue": 123120, "freightValue": 0, "landedValue": 807120,
    "leadTimeDays": 30, "technicalScore": 61, "commercialScore": 94, "totalScore": 74.2, "rank": 3, "attachments": 1, "negotiationRounds": 0,
    "createdBy": "System",
    "lines": [
      { "itemCode": "RM-LID-SPT-01", "itemName": "Sports lid — PP, food grade, blue", "uom": "NOS", "qty": 45000, "rate": 11.4, "discountPct": 0, "taxPct": 18, "freight": 0, "landedRate": 13.45, "leadTimeDays": 30, "moq": 20000, "remarks": "Food-grade certificate pending renewal" },
      { "itemCode": "RM-SIL-GSK-01", "itemName": "Silicone gasket 62 mm", "uom": "NOS", "qty": 45000, "rate": 3.8, "discountPct": 0, "taxPct": 18, "freight": 0, "landedRate": 4.48, "leadTimeDays": 30, "moq": 20000 }
    ]
  },
  {
    "docNo": "SQ/26-27/00112", "docDate": days_ago(5), "rfqNo": "RFQ/26-27/00041",
    "supplierUid": "sup-01", "supplierName": "Jindal Stainless Limited", "status": "AWARDED",
    "currency": "INR", "exchangeRate": 1, "validTill": days_ahead(160), "paymentTerms": "30 days from invoice", "deliveryTerms": "Free delivery, Chennai plant",
    "warrantyMonths": 0, "basicValue": 27552000, "taxValue": 4959360, "freightValue": 0, "landedValue": 32511360,
    "leadTimeDays": 21, "technicalScore": 96, "commercialScore": 88, "totalScore": 92.8, "rank": 1, "attachments": 6, "negotiationRounds": 3,
    "createdBy": "System",
    "lines": [
      { "itemCode": "RM-SS304-050", "itemName": "SS 304 Coil 0.50 mm × 400 mm", "uom": "KG", "qty": 120000, "rate": 218, "discountPct": 1.5, "taxPct": 18, "freight": 0, "landedRate": 253.31, "leadTimeDays": 21, "moq": 5000 },
      { "itemCode": "RM-SS304-080", "itemName": "SS 304 Coil 0.80 mm × 300 mm", "uom": "KG", "qty": 24000, "rate": 224, "discountPct": 1.5, "taxPct": 18, "freight": 0, "landedRate": 260.29, "leadTimeDays": 21, "moq": 5000 }
    ]
  },
  {
    "docNo": "SQ/26-27/00113", "docDate": days_ago(5), "rfqNo": "RFQ/26-27/00041",
    "supplierUid": "sup-08", "supplierName": "Chennai Steel Traders", "status": "REGRETTED",
    "currency": "INR", "exchangeRate": 1, "validTill": days_ahead(60), "paymentTerms": "15 days from invoice", "deliveryTerms": "Free delivery, Chennai plant",
    "warrantyMonths": 0, "basicValue": 28320000, "taxValue": 5097600, "freightValue": 0, "landedValue": 33417600,
    "leadTimeDays": 12, "technicalScore": 72, "commercialScore": 79, "totalScore": 74.8, "rank": 2, "attachments": 2, "negotiationRounds": 1,
    "createdBy": "System",
    "lines": [
      { "itemCode": "RM-SS304-050", "itemName": "SS 304 Coil 0.50 mm × 400 mm", "uom": "KG", "qty": 120000, "rate": 224, "discountPct": 0, "taxPct": 18, "freight": 0, "landedRate": 264.32, "leadTimeDays": 12, "moq": 2000 },
      { "itemCode": "RM-SS304-080", "itemName": "SS 304 Coil 0.80 mm × 300 mm", "uom": "KG", "qty": 24000, "rate": 232, "discountPct": 0, "taxPct": 18, "freight": 0, "landedRate": 273.76, "leadTimeDays": 12, "moq": 2000 }
    ]
  },
  {
    "docNo": "SQ/26-27/00114", "docDate": days_ago(4), "rfqNo": "RFQ/26-27/00041",
    "supplierUid": "sup-13", "supplierName": "Salem Steel Distributors", "status": "REGRETTED",
    "currency": "INR", "exchangeRate": 1, "validTill": days_ahead(30), "paymentTerms": "45 days from invoice", "deliveryTerms": "Ex-works Salem",
    "warrantyMonths": 0, "basicValue": 27936000, "taxValue": 5028480, "freightValue": 186000, "landedValue": 33150480,
    "leadTimeDays": 18, "technicalScore": 58, "commercialScore": 82, "totalScore": 65.2, "rank": 3, "attachments": 1, "negotiationRounds": 0,
    "createdBy": "System",
    "lines": [
      { "itemCode": "RM-SS304-050", "itemName": "SS 304 Coil 0.50 mm × 400 mm", "uom": "KG", "qty": 120000, "rate": 221, "discountPct": 0, "taxPct": 18, "freight": 155000, "landedRate": 262.31, "leadTimeDays": 18, "moq": 10000 },
      { "itemCode": "RM-SS304-080", "itemName": "SS 304 Coil 0.80 mm × 300 mm", "uom": "KG", "qty": 24000, "rate": 228, "discountPct": 0, "taxPct": 18, "freight": 31000, "landedRate": 270.33, "leadTimeDays": 18, "moq": 10000 }
    ]
  }
]

def run_seed():
    connection = pymysql.connect(
        host=db_host, port=db_port, user=db_user, password=db_password, database=db_name
    )
    try:
        cursor = connection.cursor()
        for q in seed_quotations:
            payload = json.dumps(q)
            cursor.execute("CALL SpManageSupplierQuotation('CREATE', NULL, %s)", (payload,))
            print(f"Successfully seeded {q['docNo']}")
        connection.commit()
    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        connection.close()

if __name__ == "__main__":
    run_seed()
