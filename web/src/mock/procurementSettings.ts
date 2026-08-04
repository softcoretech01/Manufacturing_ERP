/**
 * Procurement configuration — the tolerances, thresholds, scoring weights and
 * reason codes the module argues with. Held as data rather than in code,
 * because a receipt tolerance that needs a deployment to change will instead be
 * worked around at the gate.
 */

import type { EvalWeight, ProcParameter, ProcReasonCode } from '@/types/procurement'

export const procParameters: ProcParameter[] = [
  { uid: 'pp-01', code: 'PR_MANDATORY_FOR_PO', name: 'Requisition mandatory before PO', description: 'Blocks a purchase order that carries no approved requisition reference.', value: 'Yes', group: 'GENERAL', scope: 'Company', editable: true },
  { uid: 'pp-02', code: 'PR_AUTO_APPROVE_BELOW', name: 'Requisition auto-approval threshold', description: 'Requisitions below this value are approved automatically and listed on the auto-approval log.', value: '5000', unit: '₹', group: 'APPROVAL', scope: 'Company', editable: true },
  { uid: 'pp-03', code: 'RFQ_MIN_VENDORS', name: 'Minimum vendors on an RFQ', description: 'Falling short requires a recorded reason code that appears on the monthly exception report.', value: '3 above ₹1,00,000', group: 'GENERAL', scope: 'Company', editable: true },
  { uid: 'pp-04', code: 'RFQ_MIN_NOTICE_HOURS', name: 'Minimum RFQ response window', description: 'Same-day due dates on a high-value enquiry are a competition failure, not a shortcut.', value: '48', unit: 'hours', group: 'GENERAL', scope: 'Company', editable: true },
  { uid: 'pp-05', code: 'COMPARISON_MANDATORY_ABOVE', name: 'Comparison mandatory above', description: 'Above this value an order needs an awarded comparison, unless it is a contract call-off or a recorded emergency.', value: '100000', unit: '₹', group: 'APPROVAL', scope: 'Company', editable: true },
  { uid: 'pp-06', code: 'COMPARISON_MIN_QUOTES', name: 'Minimum comparable quotations', description: 'A comparison needs at least this many quotations before it means anything.', value: '2', group: 'APPROVAL', scope: 'Company', editable: true },
  { uid: 'pp-07', code: 'REPEAT_ORDER_WINDOW_DAYS', name: 'Repeat-order exemption window', description: 'A repeat order at or below the last rate inside this window is exempt from comparison.', value: '90', unit: 'days', group: 'GENERAL', scope: 'Company', editable: true },
  { uid: 'pp-08', code: 'PO_PRICE_VARIANCE_WARN_PCT', name: 'Price variance — justification required', description: 'Rate above the awarded or last purchase price by more than this needs a written justification.', value: '3', unit: '%', group: 'TOLERANCE', scope: 'Company', editable: true },
  { uid: 'pp-09', code: 'PO_PRICE_VARIANCE_BLOCK_PCT', name: 'Price variance — override required', description: 'Beyond this, submission is blocked without the price-override permission. Every use is logged.', value: '10', unit: '%', group: 'TOLERANCE', scope: 'Company', editable: true },
  { uid: 'pp-10', code: 'PO_SPLIT_DETECTION_WINDOW_DAYS', name: 'Split-PO detection window', description: 'Orders to the same supplier for the same item inside this window are aggregated for approval routing.', value: '7', unit: 'days', group: 'APPROVAL', scope: 'Company', editable: true },
  { uid: 'pp-11', code: 'BUDGET_CONTROL_PR', name: 'Budget control at requisition', description: 'Advisory at the requisition so an unaffordable request is challenged before four approvers spend time on it.', value: 'Warn', group: 'APPROVAL', scope: 'Company', editable: true },
  { uid: 'pp-12', code: 'BUDGET_CONTROL_PO', name: 'Budget control at purchase order', description: 'Blocking at the order, because that is where the money is committed.', value: 'Block', group: 'APPROVAL', scope: 'Company', editable: true },
  { uid: 'pp-13', code: 'GRN_OVER_RECEIPT_TOLERANCE_PCT', name: 'Over-receipt tolerance', description: 'Receipt beyond this needs the excess-acceptance permission, a reason, and an order amendment.', value: '2', unit: '%', group: 'TOLERANCE', scope: 'Company · overridable per item and supplier', editable: true },
  { uid: 'pp-14', code: 'GRN_UNDER_RECEIPT_TOLERANCE_PCT', name: 'Under-receipt tolerance', description: 'Short supply beyond this forces an explicit disposition: keep open, short-close, or claim.', value: '5', unit: '%', group: 'TOLERANCE', scope: 'Company', editable: true },
  { uid: 'pp-15', code: 'GRN_MIN_SHELF_LIFE_PCT', name: 'Minimum shelf life on receipt', description: 'Coating powders and inks arriving with less remaining life than this need an approval to be received.', value: '75', unit: '%', group: 'TOLERANCE', scope: 'Company', editable: true },
  { uid: 'pp-16', code: 'REJECTION_AGEING_BLOCK_DAYS', name: 'Rejected material ageing block', description: 'Rejected stock older than this blocks the next receipt from that supplier until it is dispositioned.', value: '30', unit: 'days', group: 'TOLERANCE', scope: 'Company', editable: true },
  { uid: 'pp-17', code: 'INVOICE_QTY_TOLERANCE_PCT', name: 'Invoice quantity tolerance', description: 'Invoiced quantity is matched against accepted quantity, not received quantity.', value: '0', unit: '%', group: 'TOLERANCE', scope: 'Company', editable: true },
  { uid: 'pp-18', code: 'INVOICE_RATE_TOLERANCE_PCT', name: 'Invoice rate tolerance', description: 'Beyond this the invoice is blocked with a typed price-variance exception.', value: '0.5', unit: '%', group: 'TOLERANCE', scope: 'Company', editable: true },
  { uid: 'pp-19', code: 'SUPPLIER_DOC_EXPIRY_ALERT_DAYS', name: 'Compliance expiry alerts', description: 'Alert offsets before a mandatory supplier document expires and stops order release.', value: '60, 30, 7', unit: 'days', group: 'GENERAL', scope: 'Company', editable: true },
  { uid: 'pp-20', code: 'ALLOW_SELF_APPROVAL', name: 'Allow self-approval', description: 'Off for every procurement document type. Turning it on flags every instance on the exception report.', value: 'No', group: 'APPROVAL', scope: 'Company', editable: true },
  { uid: 'pp-21', code: 'MSME_MAX_CREDIT_DAYS', name: 'MSME payment cap', description: 'Section 43B(h). Applied from the date of acceptance, not the receipt date, and not overridable on a transaction.', value: '45', unit: 'days', group: 'STATUTORY', scope: 'Statutory — all companies', editable: false },
  { uid: 'pp-22', code: 'JOBWORK_RETURN_WINDOW_DAYS', name: 'Job-work return window', description: 'Section 143. Inputs must return within this window; capital goods have their own longer window.', value: '180', unit: 'days', group: 'STATUTORY', scope: 'Statutory — all companies', editable: false },
  { uid: 'pp-23', code: 'TDS_194Q_THRESHOLD', name: 'TDS 194Q threshold', description: 'Evaluated per supplier per financial year. Mutually exclusive with TCS 206C(1H).', value: '5000000', unit: '₹', group: 'STATUTORY', scope: 'Statutory — all companies', editable: false },
]

export const evalWeights: EvalWeight[] = [
  { uid: 'ew-01', setCode: 'STRATEGIC_RM', setName: 'Strategic raw material', category: 'Raw material', criterion: 'Landed cost', weightPct: 40, direction: 'LOWER', active: true },
  { uid: 'ew-02', setCode: 'STRATEGIC_RM', setName: 'Strategic raw material', category: 'Raw material', criterion: 'Quality rating', weightPct: 25, direction: 'HIGHER', active: true },
  { uid: 'ew-03', setCode: 'STRATEGIC_RM', setName: 'Strategic raw material', category: 'Raw material', criterion: 'Delivery / lead time', weightPct: 20, direction: 'LOWER', active: true },
  { uid: 'ew-04', setCode: 'STRATEGIC_RM', setName: 'Strategic raw material', category: 'Raw material', criterion: 'Capacity & capability', weightPct: 15, direction: 'HIGHER', active: true },

  { uid: 'ew-05', setCode: 'BOTTLENECK', setName: 'Bottleneck / quality-critical', category: 'Consumable', criterion: 'Quality rating', weightPct: 40, direction: 'HIGHER', active: true },
  { uid: 'ew-06', setCode: 'BOTTLENECK', setName: 'Bottleneck / quality-critical', category: 'Consumable', criterion: 'Delivery / lead time', weightPct: 30, direction: 'LOWER', active: true },
  { uid: 'ew-07', setCode: 'BOTTLENECK', setName: 'Bottleneck / quality-critical', category: 'Consumable', criterion: 'Landed cost', weightPct: 20, direction: 'LOWER', active: true },
  { uid: 'ew-08', setCode: 'BOTTLENECK', setName: 'Bottleneck / quality-critical', category: 'Consumable', criterion: 'Compliance & certification', weightPct: 10, direction: 'HIGHER', active: true },

  { uid: 'ew-09', setCode: 'LEVERAGE', setName: 'Leverage / competitive', category: 'Packaging', criterion: 'Landed cost', weightPct: 55, direction: 'LOWER', active: true },
  { uid: 'ew-10', setCode: 'LEVERAGE', setName: 'Leverage / competitive', category: 'Packaging', criterion: 'Delivery / lead time', weightPct: 25, direction: 'LOWER', active: true },
  { uid: 'ew-11', setCode: 'LEVERAGE', setName: 'Leverage / competitive', category: 'Packaging', criterion: 'Quality rating', weightPct: 20, direction: 'HIGHER', active: true },

  { uid: 'ew-12', setCode: 'ROUTINE', setName: 'Routine / MRO', category: 'MRO', criterion: 'Landed cost', weightPct: 40, direction: 'LOWER', active: true },
  { uid: 'ew-13', setCode: 'ROUTINE', setName: 'Routine / MRO', category: 'MRO', criterion: 'Delivery / lead time', weightPct: 40, direction: 'LOWER', active: true },
  { uid: 'ew-14', setCode: 'ROUTINE', setName: 'Routine / MRO', category: 'MRO', criterion: 'Quality rating', weightPct: 20, direction: 'HIGHER', active: true },
]

export const procReasonCodes: ProcReasonCode[] = [
  { uid: 'prc-01', code: 'EMG-BREAKDOWN', label: 'Machine breakdown — line stopped', documentType: 'Requisition (emergency)', requiresComment: true, active: true },
  { uid: 'prc-02', code: 'EMG-CUSTOMER', label: 'Customer commitment at risk', documentType: 'Requisition (emergency)', requiresComment: true, active: true },
  { uid: 'prc-03', code: 'SS-PROPRIETARY', label: 'Proprietary item — one manufacturer', documentType: 'RFQ (short vendor)', requiresComment: true, active: true },
  { uid: 'prc-04', code: 'SS-CUSTOMER-NOM', label: 'Customer-nominated source', documentType: 'RFQ (short vendor)', requiresComment: true, active: true },
  { uid: 'prc-05', code: 'DEV-QUALITY', label: 'Higher quality justifies the price', documentType: 'Comparison (deviation)', requiresComment: true, active: true },
  { uid: 'prc-06', code: 'DEV-DELIVERY', label: 'Only source that meets the need date', documentType: 'Comparison (deviation)', requiresComment: true, active: true },
  { uid: 'prc-07', code: 'DEV-RISK', label: 'Risk diversification — dual sourcing', documentType: 'Comparison (deviation)', requiresComment: true, active: true },
  { uid: 'prc-08', code: 'PO-CANCEL-DEMAND', label: 'Requirement withdrawn', documentType: 'PO cancellation', requiresComment: true, active: true },
  { uid: 'prc-09', code: 'PO-CANCEL-SUPPLIER', label: 'Supplier unable to deliver', documentType: 'PO cancellation', requiresComment: true, active: true },
  { uid: 'prc-10', code: 'SC-BALANCE-SMALL', label: 'Residual quantity not worth chasing', documentType: 'PO short-close', requiresComment: false, active: true },
  { uid: 'prc-11', code: 'QC-GLOSS-FAIL', label: 'Coating gloss out of specification', documentType: 'Purchase return', requiresComment: true, active: true },
  { uid: 'prc-12', code: 'QC-MTC-MISSING', label: 'Mill test certificate not supplied', documentType: 'Purchase return', requiresComment: true, active: true },
  { uid: 'prc-13', code: 'QC-DIM-OUT', label: 'Dimensional deviation beyond tolerance', documentType: 'Purchase return', requiresComment: true, active: true },
  { uid: 'prc-14', code: 'SUP-AUDIT-FAIL', label: 'Failed qualification audit', documentType: 'Supplier rejection', requiresComment: true, active: true },
  { uid: 'prc-15', code: 'SUP-PERF-QUALITY', label: 'Sustained quality failure', documentType: 'Supplier hold', requiresComment: true, active: true },
]
