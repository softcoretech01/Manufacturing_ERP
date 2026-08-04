import type { Permission } from '@/types'

/**
 * Permission catalogue: `<MODULE>.<ENTITY>.<ACTION>` (V0-NFR-012).
 * In the real system this is auto-discovered from endpoint declarations so the
 * UI can never grant a permission no endpoint checks.
 */

const ACTIONS_CRUD = ['VIEW', 'CREATE', 'EDIT', 'DELETE']
const ACTIONS_DOC = [
  'VIEW', 'CREATE', 'EDIT', 'DELETE', 'SUBMIT', 'APPROVE', 'REJECT',
  'CANCEL', 'AMEND', 'CLOSE', 'PRINT', 'EXPORT', 'IMPORT',
]

const ACTION_NAMES: Record<string, string> = {
  VIEW: 'View', CREATE: 'Create', EDIT: 'Edit', DELETE: 'Delete',
  SUBMIT: 'Submit', APPROVE: 'Approve', REJECT: 'Reject', CANCEL: 'Cancel',
  AMEND: 'Amend', CLOSE: 'Close', REOPEN: 'Reopen', PRINT: 'Print',
  EXPORT: 'Export', IMPORT: 'Import', POST: 'Post', REVERSE: 'Reverse',
  DEACTIVATE: 'Deactivate', ASSIGN: 'Assign', GRANT: 'Grant',
  RESET_PASSWORD: 'Reset password', IMPERSONATE: 'Impersonate',
  OVERRIDE: 'Override', DESIGN: 'Design', ACTIVATE: 'Activate',
  CONFIGURE: 'Configure', RUN: 'Run', RESTORE: 'Restore', UPDATE: 'Update',
  RELEASE: 'Release', VIEW_ALL: 'View all', TEMPLATE_EDIT: 'Edit templates',
  RESEND: 'Resend', API_KEY_MANAGE: 'Manage API keys', DOWNLOAD: 'Download',
  CREATE_FOR_OTHERS: 'Create for others',
  // Inventory (Vol 4)
  VIEW_VALUE: 'View value of', VIEW_ALL_WAREHOUSES: 'View all warehouses for',
  VIEW_ALL_PLANTS: 'View all plants for', CONFIRM: 'Confirm', OVERRIDE_BIN: 'Override bin on',
  OVERRIDE_BOM: 'Override BOM standard on', OVERRIDE_FEFO: 'Override FEFO on',
  DISPATCH: 'Dispatch', RECEIVE: 'Receive', ISSUE: 'Issue', RECONCILE: 'Reconcile',
  DISPOSE: 'Dispose', PLAN: 'Plan', COUNT: 'Count', RECOUNT: 'Recount',
  APPROVE_VARIANCE: 'Approve variance on', FREEZE: 'Freeze', EXTEND_EXPIRY: 'Extend expiry on',
  TRACE: 'Trace', GENERATE: 'Generate', REVALUE: 'Revalue',
  APPROVE_REVALUATION: 'Approve revaluation of', RECONCILE_GL: 'Reconcile to GL',
  RECALCULATE: 'Recalculate', SCHEDULE: 'Schedule',
}

const SENSITIVE = new Set([
  'SYSTEM.USER.IMPERSONATE',
  'SYSTEM.BACKUP.RESTORE',
  'SYSTEM.NUMBERING.OVERRIDE',
  'SYSTEM.CROSS_COMPANY_READ.VIEW',
  'SYSTEM.UNMASK_PII.VIEW',
  'FINANCE.PAYMENT.RELEASE',
  'FINANCE.PERIOD.REOPEN',
  'SYSTEM.PERMISSION.GRANT',
  // Inventory sensitive actions (Vol 4 Ch 11 §11.7)
  'INVENTORY.STOCK_ADJUSTMENT.APPROVE',
  'INVENTORY.WRITE_OFF.APPROVE',
  'INVENTORY.CYCLE_COUNT.APPROVE_VARIANCE',
  'INVENTORY.CYCLE_COUNT.FREEZE',
  'INVENTORY.BATCH.EXTEND_EXPIRY',
  'INVENTORY.VALUATION.REVALUE',
  'INVENTORY.VALUATION.APPROVE_REVALUATION',
  'INVENTORY.RESERVATION.OVERRIDE',
  'INVENTORY.MATERIAL_ISSUE.OVERRIDE_FEFO',
  'INVENTORY.MATERIAL_ISSUE.OVERRIDE_BOM',
  'INVENTORY.QC_HOLD.RELEASE',
])

interface EntityDef {
  module: string
  entity: string
  label: string
  actions: string[]
}

const ENTITIES: EntityDef[] = [
  // ── SYSTEM ──────────────────────────────────────────────────────────────
  { module: 'SYSTEM', entity: 'USER', label: 'User', actions: ['VIEW', 'CREATE', 'EDIT', 'DEACTIVATE', 'RESET_PASSWORD', 'IMPERSONATE', 'IMPORT', 'EXPORT'] },
  { module: 'SYSTEM', entity: 'ROLE', label: 'Role', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ASSIGN'] },
  { module: 'SYSTEM', entity: 'PERMISSION', label: 'Permission', actions: ['VIEW', 'GRANT'] },
  { module: 'SYSTEM', entity: 'COMPANY', label: 'Company', actions: ['VIEW', 'CREATE', 'EDIT'] },
  { module: 'SYSTEM', entity: 'BRANCH', label: 'Branch', actions: ACTIONS_CRUD },
  { module: 'SYSTEM', entity: 'PLANT', label: 'Plant', actions: ACTIONS_CRUD },
  { module: 'SYSTEM', entity: 'WAREHOUSE', label: 'Warehouse', actions: ACTIONS_CRUD },
  { module: 'SYSTEM', entity: 'DEPARTMENT', label: 'Department', actions: ACTIONS_CRUD },
  { module: 'SYSTEM', entity: 'COST_CENTRE', label: 'Cost centre', actions: ACTIONS_CRUD },
  { module: 'SYSTEM', entity: 'FINANCIAL_YEAR', label: 'Financial year', actions: ['VIEW', 'CREATE', 'CLOSE', 'REOPEN'] },
  { module: 'SYSTEM', entity: 'NUMBERING', label: 'Document numbering', actions: ['VIEW', 'EDIT', 'OVERRIDE'] },
  { module: 'SYSTEM', entity: 'WORKFLOW', label: 'Workflow', actions: ['VIEW', 'DESIGN', 'ACTIVATE'] },
  { module: 'SYSTEM', entity: 'APPROVAL_MATRIX', label: 'Approval matrix', actions: ['VIEW', 'EDIT'] },
  { module: 'SYSTEM', entity: 'DELEGATION', label: 'Delegation', actions: ['CREATE', 'CREATE_FOR_OTHERS'] },
  { module: 'SYSTEM', entity: 'AUDIT', label: 'Audit log', actions: ['VIEW', 'VIEW_ALL', 'EXPORT'] },
  { module: 'SYSTEM', entity: 'NOTIFICATION', label: 'Notification', actions: ['VIEW', 'CONFIGURE', 'TEMPLATE_EDIT', 'RESEND'] },
  { module: 'SYSTEM', entity: 'PARAMETER', label: 'System parameter', actions: ['VIEW', 'EDIT'] },
  { module: 'SYSTEM', entity: 'BACKUP', label: 'Backup', actions: ['RUN', 'RESTORE', 'DOWNLOAD'] },
  { module: 'SYSTEM', entity: 'LICENSE', label: 'Licence', actions: ['VIEW', 'UPDATE'] },
  { module: 'SYSTEM', entity: 'DASHBOARD', label: 'Dashboard', actions: ['VIEW', 'DESIGN'] },
  { module: 'SYSTEM', entity: 'REPORT', label: 'Report', actions: ['VIEW', 'DESIGN', 'EXPORT'] },
  { module: 'SYSTEM', entity: 'INTEGRATION', label: 'Integration', actions: ['VIEW', 'CONFIGURE', 'API_KEY_MANAGE'] },
  { module: 'SYSTEM', entity: 'JOB', label: 'Background job', actions: ['VIEW', 'RUN', 'CANCEL'] },
  { module: 'SYSTEM', entity: 'LABEL', label: 'Label template', actions: ['VIEW', 'DESIGN', 'PRINT'] },
  { module: 'SYSTEM', entity: 'CROSS_COMPANY_READ', label: 'Cross-company read', actions: ['VIEW'] },
  { module: 'SYSTEM', entity: 'UNMASK_PII', label: 'Unmask PII', actions: ['VIEW'] },

  // ── MASTER ──────────────────────────────────────────────────────────────
  { module: 'MASTER', entity: 'CUSTOMER', label: 'Customer', actions: ['VIEW', 'CREATE', 'EDIT', 'DEACTIVATE', 'APPROVE', 'IMPORT', 'EXPORT'] },
  { module: 'MASTER', entity: 'SUPPLIER', label: 'Supplier', actions: ['VIEW', 'CREATE', 'EDIT', 'DEACTIVATE', 'APPROVE', 'IMPORT', 'EXPORT'] },
  { module: 'MASTER', entity: 'ITEM', label: 'Item / product', actions: ['VIEW', 'CREATE', 'EDIT', 'DEACTIVATE', 'APPROVE', 'IMPORT', 'EXPORT'] },
  { module: 'MASTER', entity: 'BOTTLE_MODEL', label: 'Bottle model', actions: ACTIONS_CRUD },
  { module: 'MASTER', entity: 'MACHINE', label: 'Machine', actions: ACTIONS_CRUD },
  { module: 'MASTER', entity: 'UOM', label: 'Unit of measure', actions: ACTIONS_CRUD },
  { module: 'MASTER', entity: 'TAX', label: 'Tax / GST / HSN', actions: ACTIONS_CRUD },
  { module: 'MASTER', entity: 'REASON_CODE', label: 'Reason code', actions: ACTIONS_CRUD },
  { module: 'MASTER', entity: 'DEFECT', label: 'Defect master', actions: ACTIONS_CRUD },

  // ── Business modules (defined here so the matrix is complete) ───────────
  { module: 'PROCUREMENT', entity: 'PR', label: 'Purchase requisition', actions: ACTIONS_DOC },
  { module: 'PROCUREMENT', entity: 'RFQ', label: 'RFQ', actions: ACTIONS_DOC },
  { module: 'PROCUREMENT', entity: 'QUOTATION', label: 'Supplier quotation', actions: ACTIONS_DOC },
  { module: 'PROCUREMENT', entity: 'PO', label: 'Purchase order', actions: ACTIONS_DOC },
  { module: 'PROCUREMENT', entity: 'GRN', label: 'Goods receipt note', actions: ACTIONS_DOC },
  { module: 'PROCUREMENT', entity: 'RETURN', label: 'Purchase return', actions: ACTIONS_DOC },
  // ── INVENTORY (Vol 4) ────────────────────────────────────────────────────
  { module: 'INVENTORY', entity: 'DASHBOARD', label: 'Inventory dashboard', actions: ['VIEW', 'VIEW_ALL_PLANTS'] },
  // VIEW and VIEW_VALUE are deliberately separate — quantity visibility must not
  // imply value visibility (V4-INV-BR-004).
  { module: 'INVENTORY', entity: 'STOCK', label: 'Stock', actions: ['VIEW', 'VIEW_VALUE', 'VIEW_ALL_WAREHOUSES', 'EXPORT'] },
  { module: 'INVENTORY', entity: 'LEDGER', label: 'Stock ledger', actions: ['VIEW', 'EXPORT'] },
  { module: 'INVENTORY', entity: 'PUTAWAY', label: 'Put-away', actions: ['VIEW', 'CREATE', 'CONFIRM', 'OVERRIDE_BIN'] },
  { module: 'INVENTORY', entity: 'RECEIPT', label: 'Stock receipt', actions: ['VIEW', 'CREATE', 'POST', 'CANCEL'] },
  { module: 'INVENTORY', entity: 'QC_HOLD', label: 'Quarantine / QC hold', actions: ['VIEW', 'RELEASE', 'BLOCK'] },
  { module: 'INVENTORY', entity: 'REQUISITION', label: 'Material requisition', actions: ['VIEW', 'CREATE', 'EDIT', 'SUBMIT', 'APPROVE', 'CANCEL'] },
  { module: 'INVENTORY', entity: 'MATERIAL_ISSUE', label: 'Material issue', actions: [...ACTIONS_DOC, 'POST', 'OVERRIDE_BOM', 'OVERRIDE_FEFO'] },
  { module: 'INVENTORY', entity: 'MATERIAL_RETURN', label: 'Material return', actions: ['VIEW', 'CREATE', 'POST', 'CANCEL'] },
  { module: 'INVENTORY', entity: 'TRANSFER', label: 'Stock transfer', actions: [...ACTIONS_DOC, 'DISPATCH', 'RECEIVE'] },
  { module: 'INVENTORY', entity: 'SUBCONTRACT', label: 'Job-work stock', actions: ['VIEW', 'ISSUE', 'RECEIVE', 'RECONCILE'] },
  { module: 'INVENTORY', entity: 'STOCK_ADJUSTMENT', label: 'Stock adjustment', actions: [...ACTIONS_DOC, 'POST'] },
  { module: 'INVENTORY', entity: 'SCRAP', label: 'Scrap & damage', actions: ['VIEW', 'CREATE', 'APPROVE', 'DISPOSE'] },
  { module: 'INVENTORY', entity: 'WRITE_OFF', label: 'Write-off', actions: ['VIEW', 'CREATE', 'APPROVE'] },
  { module: 'INVENTORY', entity: 'CYCLE_COUNT', label: 'Cycle count', actions: ['VIEW', 'PLAN', 'COUNT', 'RECOUNT', 'APPROVE_VARIANCE', 'POST', 'FREEZE'] },
  { module: 'INVENTORY', entity: 'BATCH', label: 'Batch', actions: ['VIEW', 'EDIT', 'BLOCK', 'EXTEND_EXPIRY', 'TRACE'] },
  { module: 'INVENTORY', entity: 'SERIAL', label: 'Serial number', actions: ['VIEW', 'GENERATE', 'EDIT'] },
  { module: 'INVENTORY', entity: 'VALUATION', label: 'Stock valuation', actions: ['VIEW', 'REVALUE', 'APPROVE_REVALUATION', 'RECONCILE_GL', 'EXPORT'] },
  { module: 'INVENTORY', entity: 'REORDER', label: 'Reorder & min/max', actions: ['VIEW', 'EDIT', 'RECALCULATE'] },
  { module: 'INVENTORY', entity: 'RESERVATION', label: 'Reservation', actions: ['VIEW', 'CREATE', 'RELEASE', 'OVERRIDE'] },
  { module: 'INVENTORY', entity: 'REPORT', label: 'Inventory report', actions: ['VIEW', 'VIEW_VALUE', 'EXPORT', 'SCHEDULE'] },
  { module: 'INVENTORY', entity: 'SETTINGS', label: 'Inventory settings', actions: ['VIEW', 'EDIT'] },
  // ── PRODUCTION — shop floor execution (Vol 8) ────────────────────────────
  { module: 'PRODUCTION', entity: 'DASHBOARD', label: 'Shop floor dashboard', actions: ['VIEW', 'VIEW_ALL_PLANTS'] },
  { module: 'PRODUCTION', entity: 'PRODUCTION_ORDER', label: 'Production order', actions: [...ACTIONS_DOC, 'RELEASE'] },
  { module: 'PRODUCTION', entity: 'WORK_ORDER', label: 'Work order', actions: [...ACTIONS_DOC, 'ASSIGN', 'RELEASE'] },
  { module: 'PRODUCTION', entity: 'ENTRY', label: 'Production entry', actions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REVERSE'] },
  { module: 'PRODUCTION', entity: 'WIP', label: 'Work in progress', actions: ['VIEW', 'VIEW_VALUE', 'EDIT', 'EXPORT'] },
  { module: 'PRODUCTION', entity: 'MACHINE', label: 'Machine status', actions: ['VIEW', 'EDIT', 'ASSIGN'] },
  { module: 'PRODUCTION', entity: 'DOWNTIME', label: 'Machine downtime', actions: ['VIEW', 'CREATE', 'EDIT', 'CLOSE', 'APPROVE'] },
  { module: 'PRODUCTION', entity: 'OEE', label: 'OEE', actions: ['VIEW', 'EXPORT'] },
  { module: 'PRODUCTION', entity: 'SCRAP', label: 'Production scrap', actions: ['VIEW', 'VIEW_VALUE', 'CREATE', 'APPROVE', 'DISPOSE'] },
  { module: 'PRODUCTION', entity: 'REWORK', label: 'Rework order', actions: ['VIEW', 'CREATE', 'ASSIGN', 'APPROVE', 'REJECT', 'CLOSE'] },
  { module: 'PRODUCTION', entity: 'SHIFT', label: 'Shift log', actions: ['VIEW', 'CREATE', 'EDIT', 'CLOSE'] },
  { module: 'PRODUCTION', entity: 'LABOUR', label: 'Labour tracking', actions: ['VIEW', 'EDIT', 'ASSIGN', 'EXPORT'] },
  { module: 'PRODUCTION', entity: 'INSTRUCTION', label: 'Work instruction', actions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'PRINT'] },
  { module: 'PRODUCTION', entity: 'TRACEABILITY', label: 'Traveller & genealogy', actions: ['VIEW', 'TRACE', 'PRINT', 'EXPORT'] },
  { module: 'PRODUCTION', entity: 'REPORT', label: 'Production report', actions: ['VIEW', 'VIEW_VALUE', 'EXPORT', 'SCHEDULE'] },
  { module: 'QUALITY', entity: 'INSPECTION', label: 'Inspection', actions: ACTIONS_DOC },
  { module: 'QUALITY', entity: 'NCR', label: 'NCR', actions: ACTIONS_DOC },
  { module: 'QUALITY', entity: 'CAPA', label: 'CAPA', actions: ACTIONS_DOC },
  { module: 'SALES', entity: 'LEAD', label: 'Lead', actions: ACTIONS_DOC },
  { module: 'SALES', entity: 'QUOTATION', label: 'Quotation', actions: ACTIONS_DOC },
  { module: 'SALES', entity: 'SO', label: 'Sales order', actions: ACTIONS_DOC },
  { module: 'SALES', entity: 'INVOICE', label: 'Sales invoice', actions: ACTIONS_DOC },
  // ── DISPATCH — packing, dispatch & logistics (Vol 10) ────────────────────
  { module: 'DISPATCH', entity: 'DASHBOARD', label: 'Dispatch dashboard', actions: ['VIEW', 'VIEW_ALL_PLANTS'] },
  { module: 'DISPATCH', entity: 'PACKING_ORDER', label: 'Packing order', actions: [...ACTIONS_DOC, 'RELEASE'] },
  { module: 'DISPATCH', entity: 'PACK_MATERIAL', label: 'Packaging material', actions: ['VIEW', 'VIEW_VALUE', 'CREATE', 'EDIT', 'DELETE', 'ISSUE', 'CONFIRM'] },
  { module: 'DISPATCH', entity: 'CARTON', label: 'Carton', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CONFIRM', 'PRINT'] },
  { module: 'DISPATCH', entity: 'PALLET', label: 'Pallet', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CLOSE', 'PRINT'] },
  { module: 'DISPATCH', entity: 'LABEL', label: 'Label format', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'PRINT'] },
  { module: 'DISPATCH', entity: 'PLAN', label: 'Dispatch plan', actions: [...ACTIONS_DOC, 'ASSIGN', 'RELEASE'] },
  { module: 'DISPATCH', entity: 'PICK_LIST', label: 'Pick list', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ASSIGN', 'CONFIRM', 'CANCEL'] },
  { module: 'DISPATCH', entity: 'LOADING', label: 'Loading sheet', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CONFIRM', 'DISPATCH', 'CANCEL'] },
  { module: 'DISPATCH', entity: 'VEHICLE', label: 'Vehicle', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ASSIGN', 'DEACTIVATE'] },
  { module: 'DISPATCH', entity: 'CHALLAN', label: 'Delivery challan', actions: ACTIONS_DOC },
  { module: 'DISPATCH', entity: 'SHIPMENT', label: 'Shipment', actions: [...ACTIONS_DOC, 'VIEW_VALUE', 'DISPATCH', 'RECEIVE'] },
  { module: 'DISPATCH', entity: 'TRACKING', label: 'Shipment tracking', actions: ['VIEW', 'EDIT', 'EXPORT'] },
  { module: 'DISPATCH', entity: 'POD', label: 'Proof of delivery', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CONFIRM', 'PRINT'] },
  { module: 'DISPATCH', entity: 'RETURN', label: 'Sales return', actions: [...ACTIONS_DOC, 'RECEIVE', 'DISPOSE'] },
  // Freight rates are commercial terms — separate from quantity visibility.
  { module: 'DISPATCH', entity: 'FREIGHT', label: 'Freight & logistics cost', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'POST'] },
  { module: 'DISPATCH', entity: 'EXPORT', label: 'Export shipment', actions: [...ACTIONS_DOC, 'VIEW_VALUE', 'CONFIRM', 'DISPATCH'] },
  { module: 'DISPATCH', entity: 'EXPORT_DOC', label: 'Export document', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'SUBMIT', 'APPROVE', 'PRINT'] },
  { module: 'DISPATCH', entity: 'REPORT', label: 'Dispatch report', actions: ['VIEW', 'VIEW_VALUE', 'EXPORT', 'SCHEDULE'] },
  { module: 'FINANCE', entity: 'VOUCHER', label: 'Voucher', actions: ACTIONS_DOC },
  { module: 'FINANCE', entity: 'PAYMENT', label: 'Payment', actions: [...ACTIONS_DOC, 'RELEASE'] },
  { module: 'FINANCE', entity: 'PERIOD', label: 'Accounting period', actions: ['VIEW', 'CLOSE', 'REOPEN'] },
  // ── HRMS — HR, payroll & workforce (Vol 12) ──────────────────────────────
  { module: 'HRMS', entity: 'DASHBOARD', label: 'HR dashboard', actions: ['VIEW', 'VIEW_ALL_PLANTS'] },
  { module: 'HRMS', entity: 'EMPLOYEE', label: 'Employee', actions: [...ACTIONS_DOC, 'CONFIRM'] },
  { module: 'HRMS', entity: 'ORG_UNIT', label: 'Organisation unit', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CLOSE'] },
  { module: 'HRMS', entity: 'REQUISITION', label: 'Manpower requisition', actions: [...ACTIONS_DOC, 'RELEASE'] },
  { module: 'HRMS', entity: 'CANDIDATE', label: 'Candidate', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT'] },
  { module: 'HRMS', entity: 'ATTENDANCE', label: 'Attendance', actions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'OVERRIDE', 'EXPORT'] },
  { module: 'HRMS', entity: 'OVERTIME', label: 'Overtime', actions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT'] },
  { module: 'HRMS', entity: 'SHIFT', label: 'Shift & roster', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ASSIGN', 'APPROVE'] },
  { module: 'HRMS', entity: 'LEAVE', label: 'Leave', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'CANCEL'] },
  { module: 'HRMS', entity: 'LEAVE_POLICY', label: 'Leave policy', actions: ['VIEW', 'CREATE', 'EDIT', 'DEACTIVATE'] },
  // The tightest permission in the product — salary is the one thing that
  // cannot be un-seen once a colleague has read it.
  { module: 'HRMS', entity: 'PAYROLL', label: 'Payroll', actions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'POST', 'REVERSE'] },
  { module: 'HRMS', entity: 'SALARY', label: 'Salary structure', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE'] },
  { module: 'HRMS', entity: 'PAYSLIP', label: 'Payslip', actions: ['VIEW', 'VIEW_ALL', 'RELEASE', 'PRINT', 'EXPORT'] },
  { module: 'HRMS', entity: 'STATUTORY', label: 'Statutory return', actions: ['VIEW', 'CREATE', 'EDIT', 'POST', 'SUBMIT', 'PRINT'] },
  { module: 'HRMS', entity: 'INCENTIVE', label: 'Production incentive', actions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'POST'] },
  { module: 'HRMS', entity: 'LABOUR_COST', label: 'Labour cost allocation', actions: ['VIEW', 'EDIT', 'POST', 'EXPORT'] },
  { module: 'HRMS', entity: 'SKILL', label: 'Skill matrix', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CONFIRM'] },
  { module: 'HRMS', entity: 'CONTRACTOR', label: 'Contractor labour', actions: [...ACTIONS_DOC, 'CONFIRM'] },
  // Separate from payroll: a supervisor needs skills and attendance to run a
  // shift, and has no business reading last year's ratings.
  { module: 'HRMS', entity: 'APPRAISAL', label: 'Appraisal', actions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'CLOSE'] },
  { module: 'HRMS', entity: 'KPI', label: 'KPI', actions: ['VIEW', 'CREATE', 'EDIT', 'DEACTIVATE'] },
  { module: 'HRMS', entity: 'TRAINING', label: 'Training', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CONFIRM', 'CANCEL'] },
  { module: 'HRMS', entity: 'SELF_SERVICE', label: 'Employee self service', actions: ['VIEW', 'CREATE'] },
  { module: 'HRMS', entity: 'TEAM', label: 'Manager self service', actions: ['VIEW', 'APPROVE'] },
  { module: 'HRMS', entity: 'REPORT', label: 'HR report', actions: ['VIEW', 'VIEW_VALUE', 'EXPORT', 'SCHEDULE'] },
  // ── BI — analytics, dashboards & AI insights (Vol 14) ────────────────────
  // Analytics owns no transactions, so its permissions are almost entirely
  // about what a person may *see*. The two that matter are FINANCIAL and
  // PEOPLE: a plant head needs OEE and scrap without seeing margin, and a
  // supervisor needs attendance without seeing anybody's pay.
  { module: 'BI', entity: 'DASHBOARD', label: 'Analytics dashboard', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT', 'SCHEDULE'] },
  { module: 'BI', entity: 'FINANCIAL', label: 'Financial analytics', actions: ['VIEW'] },
  { module: 'BI', entity: 'PEOPLE', label: 'Workforce analytics', actions: ['VIEW'] },
  { module: 'BI', entity: 'KPI', label: 'KPI definition', actions: ['VIEW', 'CREATE', 'EDIT', 'DEACTIVATE'] },
  { module: 'BI', entity: 'INSIGHT', label: 'AI insight', actions: ['VIEW', 'ASSIGN', 'CLOSE'] },
  { module: 'BI', entity: 'FORECAST', label: 'Forecast model', actions: ['VIEW', 'EDIT', 'RUN'] },
  { module: 'BI', entity: 'ALERT', label: 'Alert rule', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE'] },
  { module: 'BI', entity: 'REPORT', label: 'Analytics report', actions: ['VIEW', 'VIEW_VALUE', 'EXPORT', 'SCHEDULE'] },
  { module: 'BI', entity: 'DATA_SOURCE', label: 'Analytics data source', actions: ['VIEW', 'CONFIGURE', 'RUN'] },
  { module: 'BI', entity: 'GOVERNANCE', label: 'Analytics access', actions: ['VIEW', 'GRANT', 'EXPORT'] },
]

export const MODULE_LABELS: Record<string, string> = {
  SYSTEM: 'System administration',
  MASTER: 'Master data',
  PROCUREMENT: 'Procurement',
  INVENTORY: 'Inventory & warehouse',
  PRODUCTION: 'Shop floor execution',
  QUALITY: 'Quality',
  SALES: 'CRM & sales',
  DISPATCH: 'Packing & dispatch',
  FINANCE: 'Finance',
  HRMS: 'HR, payroll & workforce',
  BI: 'Analytics & business intelligence',
}

export const ENTITY_LABELS: Record<string, string> = Object.fromEntries(
  ENTITIES.map((e) => [`${e.module}.${e.entity}`, e.label]),
)

export const ALL_ACTIONS = [
  'VIEW', 'CREATE', 'EDIT', 'DELETE', 'SUBMIT', 'APPROVE', 'REJECT',
  'CANCEL', 'AMEND', 'CLOSE', 'PRINT', 'EXPORT', 'IMPORT',
]

export const PERMISSIONS: Permission[] = ENTITIES.flatMap((e) =>
  e.actions.map((action) => {
    const code = `${e.module}.${e.entity}.${action}`
    return {
      code,
      module: e.module,
      entity: e.entity,
      action,
      name: `${ACTION_NAMES[action] ?? action} ${e.label.toLowerCase()}`,
      isSensitive: SENSITIVE.has(code),
    }
  }),
)

export const PERMISSION_ENTITIES = ENTITIES

export function permissionsFor(module: string, entity: string): Permission[] {
  return PERMISSIONS.filter((p) => p.module === module && p.entity === entity)
}
