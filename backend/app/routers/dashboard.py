from fastapi import APIRouter, HTTPException, Depends
from app.core.deps import require
from app.core.legacy_db import get_connection
import json
from decimal import Decimal

router = APIRouter()

def get_db_connection():
    """Connection for this router's stored procedures (credentials from settings)."""
    return get_connection("ERP_Procurement")

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

@router.get("/", dependencies=[Depends(require("PROCUREMENT.DASHBOARD.VIEW"))])
def get_dashboard_data():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("CALL SpManageProcurementDashboard('GET_DASHBOARD', '{}')")
            
            # 1. KPIs
            kpis_raw = cursor.fetchone()
            
            # Helper to safely float decimals
            def to_float(val):
                return float(val) if val is not None else 0.0

            kpis = {
                "openPoCount": kpis_raw.get("openPoCount", 0),
                "openValue": to_float(kpis_raw.get("openValue")),
                "ytdSpend": to_float(kpis_raw.get("ytdSpend")),
                "budgetVariance": ((to_float(kpis_raw.get("ytdSpend")) - to_float(kpis_raw.get("budget"))) / to_float(kpis_raw.get("budget")) * 100) if to_float(kpis_raw.get("budget")) > 0 else 0.0,
                "prPending": kpis_raw.get("prPending", 0),
                "poPending": kpis_raw.get("poPending", 0),
                "rfqOpen": kpis_raw.get("rfqOpen", 0),
                "quotesAwaiting": kpis_raw.get("quotesAwaiting", 0),
                "inTransit": kpis_raw.get("inTransit", 0),
                "qcPending": kpis_raw.get("qcPending", 0),
                "onTimePct": (kpis_raw.get("onTimeCount", 0) / kpis_raw.get("totalGrnCount", 1)) * 100 if kpis_raw.get("totalGrnCount", 0) > 0 else 100.0,
                "rejectionPct": (to_float(kpis_raw.get("totalRejected")) / to_float(kpis_raw.get("totalReceived"))) * 100 if to_float(kpis_raw.get("totalReceived")) > 0 else 0.0,
                "savings": to_float(kpis_raw.get("savings"))
            }

            cursor.nextset()
            
            # 2. Expiring Contracts
            expiring_contracts = cursor.fetchall()
            for c in expiring_contracts:
                if c.get("validTo"): c["validTo"] = str(c["validTo"])

            cursor.nextset()

            # 3. Risk Suppliers
            risk_suppliers = cursor.fetchall()

            cursor.nextset()

            # 4. Overdue POs
            overdue_pos = cursor.fetchall()
            for p in overdue_pos:
                if p.get("promisedDate"): p["promisedDate"] = str(p["promisedDate"])
                if p.get("totalValue"): p["totalValue"] = to_float(p["totalValue"])

            cursor.nextset()

            # 5. Category Pie
            spend_by_category = cursor.fetchall()
            for c in spend_by_category:
                if c.get("value"): c["value"] = to_float(c["value"])

            cursor.nextset()

            # 6. Spend Trend
            spend_trend = cursor.fetchall()
            for s in spend_trend:
                if s.get("spend"): s["spend"] = to_float(s["spend"])
                if s.get("budget"): s["budget"] = to_float(s["budget"])

            cursor.nextset()

            # 7. Supplier Spend
            supplier_spend = cursor.fetchall()
            for s in supplier_spend:
                if s.get("value"): s["value"] = to_float(s["value"])
                if s.get("sharePct"): s["sharePct"] = to_float(s["sharePct"])
                if s.get("onTimePct"): s["onTimePct"] = to_float(s["onTimePct"])
                if s.get("rejectionPct"): s["rejectionPct"] = to_float(s["rejectionPct"])

            cursor.nextset()
            
            # 8. Recent POs
            recent_po = cursor.fetchall()
            for p in recent_po:
                if p.get("totalValue"): p["totalValue"] = to_float(p["totalValue"])

            cursor.nextset()

            # 9. Recent GRNs
            recent_grn = cursor.fetchall()
            for g in recent_grn:
                if g.get("grnValue"): g["grnValue"] = to_float(g["grnValue"])

            return {
                "kpis": kpis,
                "expiringContracts": expiring_contracts,
                "riskSuppliers": risk_suppliers,
                "overduePo": overdue_pos,
                "categoryPie": spend_by_category,
                "spendTrend": spend_trend,
                "supplierSpend": supplier_spend,
                "recentPo": recent_po,
                "recentGrn": recent_grn
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
