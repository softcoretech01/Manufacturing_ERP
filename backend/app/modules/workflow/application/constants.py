"""Static reference data for the workflow module.

Document-type labels and the reject/return reason codes. In the full system these
come from configurable masters (V1-WFL-BR-005 says reason codes are per document
type); until those masters exist they live here so the engine can validate that a
reason was given and the UI can offer a sensible list.
"""

from __future__ import annotations

# Document types that flow through approval, with a human label. Additive.
DOCUMENT_TYPES: dict[str, str] = {
    "PURCHASE_REQUISITION": "Purchase Requisition",
    "PURCHASE_ORDER": "Purchase Order",
    "GOODS_RECEIPT": "Goods Receipt Note",
    "STOCK_ADJUSTMENT": "Stock Adjustment",
    "MATERIAL_ISSUE": "Material Issue",
    "SALES_ORDER": "Sales Order",
    "PAYMENT_VOUCHER": "Payment Voucher",
    "JOURNAL_VOUCHER": "Journal Voucher",
}

# Document types for which AUTO_APPROVE escalation is never permitted (V1-WFL-BR-010).
AUTO_APPROVE_FORBIDDEN: frozenset[str] = frozenset(
    {
        "PAYMENT_VOUCHER",
        "JOURNAL_VOUCHER",
        "STOCK_ADJUSTMENT",
        "CREDIT_NOTE",
    }
)

# Fields a condition expression may reference (V1-WFL-FR-002), whitelisted.
EXPRESSION_FIELDS: frozenset[str] = frozenset(
    {
        "total_amount",
        "amount",
        "priority",
        "urgent",
        "item_category",
        "supplier_category",
        "customer_category",
        "po_type",
        "department",
        "plant",
    }
)

# Reason codes offered when rejecting or returning (mandatory — V1-WFL-BR-005).
REJECT_REASON_CODES: list[dict[str, str]] = [
    {"code": "RATE_NOT_JUSTIFIED", "label": "Rate not justified"},
    {"code": "BUDGET_EXCEEDED", "label": "Budget exceeded"},
    {"code": "INSUFFICIENT_DOCS", "label": "Insufficient documentation"},
    {"code": "BETTER_ALTERNATIVE", "label": "Better alternative available"},
    {"code": "NOT_REQUIRED", "label": "Requirement no longer valid"},
    {"code": "SPEC_ERROR", "label": "Specification error"},
    {"code": "OTHER", "label": "Other"},
]
_REASON_SET = frozenset(r["code"] for r in REJECT_REASON_CODES)


def is_valid_reason(code: str | None) -> bool:
    return bool(code) and code in _REASON_SET
