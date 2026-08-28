/**
 * Procurement & supplier management.
 *
 * The procure-to-pay chain modelled end to end: requisition → MRP → RFQ →
 * quotation comparison → negotiation → purchase order → ASN → goods receipt →
 * incoming inspection → return / debit note, with supplier evaluation,
 * contracts and import handling alongside.
 */

/* ─────────────────────────── Shared ─────────────────────────── */

export type ProcStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_EXECUTED'
  | 'COMPLETED'
  | 'SHORT_CLOSED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'ON_HOLD'
  | 'AMENDED'

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface ApprovalStep {
  level: number
  role: string
  approver: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED'
  actedAt?: string
  remarks?: string
}

/** Every procurement document carries the same governance envelope. */
export interface ProcDoc {
  uid: string
  deletedAt?: string | null
  docNo: string
  docDate: string
  status: ProcStatus
  plant: string
  createdBy: string
  createdAt: string
  modifiedAt?: string
  version: number
  remarks?: string
  attachments: number
  comments: number
  approvals: ApprovalStep[]
}

/* ─────────────────────── Purchase requisition (Ch 5) ─────────────────── */

export type PrSource = 'MANUAL' | 'MRP' | 'REORDER' | 'PRODUCTION' | 'PROJECT' | 'MAINTENANCE'

export interface PrLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  qty: number
  qtyOrdered: number
  requiredBy: string
  estimatedRate: number
  costCentre: string
  suggestedSupplier?: string
  specification?: string
}

export interface PurchaseRequisition extends ProcDoc {
  source: PrSource
  department: string
  requestedBy: string
  priority: Priority
  requiredBy: string
  justification: string
  estimatedValue: number
  budgetCode: string
  budgetAvailable: number
  lines: PrLine[]
  /** RFQ or PO the requisition was converted into. */
  convertedTo?: string
}

/* ────────────────────────────── MRP (Ch 6) ───────────────────────────── */

export type MrpAction = 'NEW_PO' | 'RESCHEDULE_IN' | 'RESCHEDULE_OUT' | 'CANCEL' | 'INCREASE_QTY'

export interface MrpSuggestion {
  uid: string
  deletedAt?: string | null
  runNo: string
  itemCode: string
  itemName: string
  uom: string
  onHand: number
  onOrder: number
  reserved: number
  safetyStock: number
  reorderLevel: number
  grossRequirement: number
  netRequirement: number
  suggestedQty: number
  moq: number
  leadTimeDays: number
  suggestBy: string
  action: MrpAction
  preferredSupplier: string
  lastRate: number
  exceptional: boolean
  exceptionNote?: string
  accepted: boolean
}

export interface MrpRun {
  uid: string
  runNo: string
  runAt: string
  runBy: string
  horizonDays: number
  itemsPlanned: number
  suggestions: number
  exceptions: number
  status: 'COMPLETED' | 'RUNNING' | 'FAILED'
  durationSec: number
}

/* ─────────────────────────── RFQ (Ch 7–9) ────────────────────────────── */

export interface RfqLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  qty: number
  requiredBy: string
  specification?: string
}

export interface RfqSupplier {
  supplierUid: string
  supplierName: string
  invitedAt: string
  respondedAt?: string
  responseStatus: 'INVITED' | 'VIEWED' | 'QUOTED' | 'REGRETTED' | 'NO_RESPONSE'
  quotationUid?: string
}

export interface Rfq extends ProcDoc {
  title: string
  prRefs: string[]
  category: string
  quoteDueBy: string
  buyer: string
  sealed: boolean
  currency: string
  estimatedValue: number
  lines: RfqLine[]
  suppliers: RfqSupplier[]
  awardedTo?: string
}

/* ────────────────── Supplier quotation & comparison (Ch 8) ───────────── */

export interface QuotationLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  qty: number
  rate: number
  discountPct: number
  taxPct: number
  freight: number
  /** Landed = (rate − discount) × qty + freight + duty + tax. */
  landedRate: number
  leadTimeDays: number
  moq: number
  remarks?: string
}

export interface SupplierQuotation {
  uid: string
  deletedAt?: string | null
  docNo: string
  docDate: string
  rfqNo: string
  supplierUid: string
  supplierName: string
  status: 'RECEIVED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'NEGOTIATING' | 'AWARDED' | 'REGRETTED' | 'EXPIRED'
  currency: string
  exchangeRate: number
  validTill: string
  paymentTerms: string
  deliveryTerms: string
  warrantyMonths: number
  basicValue: number
  taxValue: number
  freightValue: number
  landedValue: number
  leadTimeDays: number
  /** 0–100, weighted per the evaluation criteria on the RFQ. */
  technicalScore: number
  commercialScore: number
  totalScore: number
  rank: number
  lines: QuotationLine[]
  attachments: number
  negotiationRounds: number
}

export interface NegotiationRound {
  uid: string
  quotationUid: string
  round: number
  requestedAt: string
  requestedBy: string
  targetReduction: number
  offeredValue: number
  previousValue: number
  savings: number
  respondedAt?: string
  outcome: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED'
  note: string
}

/* ────────────────────── Purchase order (Ch 10) ───────────────────────── */

export type PoType = 'STANDARD' | 'BLANKET' | 'RATE_CONTRACT' | 'IMPORT' | 'SERVICE' | 'ASSET' | 'JOB_WORK'

export interface PoSchedule {
  uid: string
  dueDate: string
  qty: number
  receivedQty: number
}

export interface PoLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  qty: number
  receivedQty: number
  rejectedQty: number
  billedQty: number
  rate: number
  discountPct: number
  hsn: string
  taxPct: number
  amount: number
  taxAmount: number
  lineTotal: number
  dueDate: string
  schedules: PoSchedule[]
  qcRequired: boolean
}

export interface PoAmendment {
  revision: number
  amendedAt: string
  amendedBy: string
  reason: string
  changes: { field: string; from: string; to: string }[]
}

export interface PurchaseOrder extends ProcDoc {
  poType: PoType
  supplierUid: string
  supplierName: string
  buyer: string
  currency: string
  exchangeRate: number
  paymentTerms: string
  deliveryTerms: string
  incoterm?: string
  deliveryWarehouse: string
  promisedDate: string
  rfqNo?: string
  prRefs: string[]
  contractNo?: string
  basicValue: number
  discountValue: number
  taxValue: number
  freightValue: number
  totalValue: number
  receivedPct: number
  billedPct: number
  acknowledged: boolean
  acknowledgedAt?: string
  lines: PoLine[]
  amendments: PoAmendment[]
  /** Set when the buyer closes a partly-received order. */
  shortCloseReason?: string
}

/* ──────────────────── Advance shipment notice (Ch 12) ────────────────── */

export interface AsnLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  poQty: number
  shippedQty: number
  batchNo?: string
  heatNo?: string
}

export interface Asn {
  uid: string
  deletedAt?: string | null
  docNo: string
  docDate: string
  poNo: string
  supplierUid: string
  supplierName: string
  status: 'NOTIFIED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED' | 'CANCELLED'
  dispatchedAt: string
  expectedAt: string
  transporter: string
  lrNo: string
  vehicleNo: string
  invoiceNo: string
  invoiceValue: number
  ewayBillNo?: string
  packages: number
  grossWeightKg: number
  gateEntryNo?: string
  grnNo?: string
  lines: AsnLine[]
}

/* ───────────────── Goods receipt & incoming quality (Ch 13–14) ───────── */

export type GrnQcStatus = 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'ACCEPTED' | 'REJECTED' | 'DEVIATION_ACCEPTED'

export interface GrnLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  poQty: number
  challanQty: number
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  shortQty: number
  excessQty: number
  rate: number
  batchNo?: string
  heatNo?: string
  mfgDate?: string
  expiryDate?: string
  binCode: string
  qcStatus: GrnQcStatus
  rejectionReason?: string
}

export interface Grn extends ProcDoc {
  poNo: string
  asnNo?: string
  supplierUid: string
  supplierName: string
  warehouse: string
  gateEntryNo: string
  gateEntryAt: string
  invoiceNo: string
  invoiceDate: string
  invoiceValue: number
  vehicleNo: string
  lrNo: string
  receivedBy: string
  qcStatus: GrnQcStatus
  totalReceived: number
  totalAccepted: number
  totalRejected: number
  grnValue: number
  lines: GrnLine[]
  /** Days between promised date and actual receipt; negative is early. */
  delayDays: number
}

export interface InspectionParameter {
  uid: string
  name: string
  method: string
  spec: string
  observed: string
  result: 'PASS' | 'FAIL' | 'DEVIATION'
  critical: boolean
}

export interface IncomingInspection {
  uid: string
  deletedAt?: string | null
  docNo: string
  docDate: string
  grnNo: string
  poNo: string
  supplierUid: string
  supplierName: string
  itemCode: string
  itemName: string
  batchNo?: string
  heatNo?: string
  lotQty: number
  sampleSize: number
  samplingPlan: string
  aql: string
  inspectedBy: string
  status: 'PENDING' | 'IN_PROGRESS' | 'ACCEPTED' | 'REJECTED' | 'DEVIATION_ACCEPTED'
  acceptedQty: number
  rejectedQty: number
  defectsFound: number
  mtcReceived: boolean
  mtcVerified: boolean
  ncrNo?: string
  deviationApprovedBy?: string
  parameters: InspectionParameter[]
}

/* ───────────────── Purchase return & debit note (Ch 15) ──────────────── */

export interface ReturnLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  qty: number
  rate: number
  amount: number
  batchNo?: string
  reason: string
}

export interface PurchaseReturn extends ProcDoc {
  grnNo: string
  poNo: string
  supplierUid: string
  supplierName: string
  returnType: 'REJECTION' | 'EXCESS' | 'DAMAGE' | 'WRONG_ITEM' | 'QUALITY_FAILURE' | 'EXPIRY'
  reasonCode: string
  debitNoteNo?: string
  debitNoteValue: number
  taxReversal: number
  replacementExpected: boolean
  replacementPoNo?: string
  vehicleNo?: string
  ewayBillNo?: string
  returnValue: number
  lines: ReturnLine[]
}

/* ─────────────────── Supplier evaluation (Ch 16) ─────────────────────── */

export interface EvaluationCriterion {
  code: string
  name: string
  weightPct: number
  score: number
  note?: string
}

export interface SupplierEvaluation {
  uid: string
  deletedAt?: string | null
  docNo: string
  period: string
  supplierUid: string
  supplierName: string
  category: string
  evaluatedBy: string
  evaluatedAt: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED'
  qualityScore: number
  deliveryScore: number
  priceScore: number
  serviceScore: number
  complianceScore: number
  overallScore: number
  grade: 'A' | 'B' | 'C' | 'D'
  previousScore: number
  /** Derived operational facts the score is built from. */
  poCount: number
  poValue: number
  onTimePct: number
  rejectionPct: number
  avgDelayDays: number
  openNcrs: number
  criteria: EvaluationCriterion[]
  action: 'CONTINUE' | 'DEVELOP' | 'WARN' | 'PHASE_OUT' | 'BLACKLIST'
  actionNote: string
}

/* ────────────────────── Contract management (Ch 17) ──────────────────── */

export interface ContractItem {
  itemCode: string
  itemName: string
  uom: string
  contractedQty: number
  consumedQty: number
  rate: number
  priceBasis: 'FIXED' | 'INDEXED' | 'SLAB'
}

export interface Contract {
  uid: string
  deletedAt?: string | null
  docNo: string
  title: string
  contractType: 'RATE_CONTRACT' | 'BLANKET' | 'SERVICE' | 'AMC' | 'JOB_WORK' | 'NDA'
  supplierUid: string
  supplierName: string
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'TERMINATED' | 'RENEWED'
  validFrom: string
  validTo: string
  contractValue: number
  consumedValue: number
  currency: string
  paymentTerms: string
  priceRevisionClause: string
  penaltyClause: string
  autoRenew: boolean
  noticeDays: number
  owner: string
  items: ContractItem[]
  attachments: number
}

/* ──────────────────── Import procurement (Ch 18) ─────────────────────── */

export interface ImportShipment {
  uid: string
  deletedAt?: string | null
  docNo: string
  poNo: string
  supplierUid: string
  supplierName: string
  country: string
  incoterm: string
  currency: string
  fobValue: number
  exchangeRate: number
  status: 'PO_PLACED' | 'SHIPPED' | 'IN_TRANSIT' | 'PORT_ARRIVED' | 'CUSTOMS' | 'CLEARED' | 'RECEIVED'
  blNo: string
  blDate: string
  vesselOrFlight: string
  portOfLoading: string
  portOfDischarge: string
  etd: string
  eta: string
  containers: string
  beNo?: string
  beDate?: string
  assessableValue: number
  bcdAmount: number
  igstAmount: number
  socialWelfareSurcharge: number
  clearingCharges: number
  freightCharges: number
  insuranceCharges: number
  landedValue: number
  chaAgent: string
  demurrageDays: number
  demurrageCost: number
  documents: { name: string; received: boolean }[]
}

/* ──────────────────────── Analytics (Ch 3, 19) ───────────────────────── */

export interface SpendByCategory {
  category: string
  value: number
  poCount: number
  suppliers: number
  savingsPct: number
}

export interface SpendTrendPoint {
  month: string
  spend: number
  budget: number
  poCount: number
}

export interface SupplierSpend {
  supplierName: string
  value: number
  sharePct: number
  onTimePct: number
  rejectionPct: number
  grade: string
}

export interface PriceTrendPoint {
  month: string
  ss304: number
  ss316: number
  lid: number
}

export interface CycleTimeStage {
  stage: string
  avgDays: number
  targetDays: number
}

/* ═══════════════ Supplier invoice & three-way match (V3 Ch 7C) ═══════════════ */

export type InvoiceMatchStatus = 'PENDING' | 'MATCHED' | 'BLOCKED' | 'PARTIAL'

export type InvoiceStatus =
  | 'DRAFT'
  | 'UNDER_MATCH'
  | 'MATCHED'
  | 'BLOCKED'
  | 'APPROVED'
  | 'POSTED'
  | 'PAID'
  | 'REJECTED'
  | 'CANCELLED'

/**
 * Typed match failures. Each carries its own resolution path and approval level
 * so a blocked invoice is never resolved by a free-text note nobody can report on.
 */
export type MatchExceptionType =
  | 'PRICE_VARIANCE'
  | 'QUANTITY_VARIANCE'
  | 'GRN_MISSING'
  | 'PO_MISSING'
  | 'TAX_MISMATCH'
  | 'HSN_MISMATCH'
  | 'DUPLICATE_INVOICE'
  | 'CHARGES_NOT_ON_PO'
  | 'EXPIRED_PO'
  | 'BLOCKED_SUPPLIER'
  | 'MSME_TERM_BREACH'

export type MatchResolution =
  | 'ACCEPT_VARIANCE'
  | 'DEBIT_NOTE'
  | 'REQUEST_CREDIT_NOTE'
  | 'AMEND_PO'
  | 'REVERSE_GRN'
  | 'HOLD_QTY'
  | 'REJECT_INVOICE'

export interface InvoiceMatchException {
  uid: string
  type: MatchExceptionType
  lineUid?: string
  expected: string
  actual: string
  varianceAmount: number
  variancePct?: number
  /** The tolerance that was in force when the match ran. */
  tolerance: string
  note?: string
  resolution?: MatchResolution
  resolutionNote?: string
  resolvedBy?: string
  resolvedAt?: string
  status: 'OPEN' | 'RESOLVED'
}

export interface InvoiceLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  hsn: string
  /** What we ordered. */
  poQty: number
  poRate: number
  /** What QC accepted — not what arrived. Material under inspection is not payable. */
  acceptedQty: number
  /** What the supplier is charging for. */
  invoicedQty: number
  invoicedRate: number
  matchedQty: number
  heldQty: number
  taxableAmount: number
  taxAmount: number
  lineTotal: number
}

export interface SupplierInvoice {
  uid: string
  deletedAt?: string | null
  /** Our internal booking reference; the supplier's own number is separate. */
  docNo: string
  supplierInvoiceNo: string
  supplierInvoiceDate: string
  receivedAt: string
  captureSource: 'MANUAL' | 'PORTAL' | 'EMAIL_OCR' | 'EINVOICE'
  irn?: string
  supplierUid: string
  supplierName: string
  isMsme: boolean
  poNo: string
  grnNo?: string
  currency: string
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  matchedAmount: number
  heldAmount: number
  tdsSection?: string
  tdsAmount: number
  tcsAmount: number
  /** Inspection clearance, not GRN date — the statutory MSME clock starts here. */
  acceptanceDate?: string
  creditDays: number
  paymentDueDate: string
  matchStatus: InvoiceMatchStatus
  status: InvoiceStatus
  plant: string
  createdBy: string
  createdAt: string
  modifiedAt?: string
  version: number
  remarks?: string
  attachments: number
  comments: number
  lines: InvoiceLine[]
  exceptions: InvoiceMatchException[]
  approvals: ApprovalStep[]
}

/** Goods-received-not-invoiced and its mirror, for the month-end close. */
export interface GrirRow {
  uid: string
  deletedAt?: string | null
  kind: 'RECEIVED_NOT_INVOICED' | 'INVOICED_NOT_RECEIVED'
  supplierName: string
  poNo: string
  grnNo?: string
  invoiceNo?: string
  itemName: string
  value: number
  ageDays: number
  disposition?: string
}

/* ═══════════════ Supplier onboarding, AVL & compliance (V3 Ch 1) ═══════════════ */

export type SupplierQualStatus =
  | 'PROSPECT'
  | 'REGISTERED'
  | 'UNDER_QUALIFICATION'
  | 'APPROVED_PROVISIONAL'
  | 'APPROVED'
  | 'ON_HOLD'
  | 'BLACKLISTED'
  | 'REJECTED'
  | 'INACTIVE'

export interface SupplierOnboarding {
  uid: string
  deletedAt?: string | null
  docNo: string
  supplierUid: string
  supplierName: string
  legalName: string
  categories: string[]
  criticality: 'CRITICAL' | 'IMPORTANT' | 'ROUTINE'
  spendSegment: 'STRATEGIC' | 'BOTTLENECK' | 'LEVERAGE' | 'ROUTINE'
  gstin: string
  pan: string
  isMsme: boolean
  udyam?: string
  registeredState: string
  qualificationStatus: SupplierQualStatus
  /** Scored checklist; a critical or food-contact category also needs a QC audit. */
  checklistScore?: number
  passMark: number
  auditType: 'DESK' | 'ONSITE' | 'VIRTUAL' | 'NONE'
  auditedBy?: string
  auditDate?: string
  provisionalLimit?: number
  provisionalValidTo?: string
  buyer: string
  submittedAt: string
  createdBy: string
  createdAt: string
  modifiedAt?: string
  version: number
  /** GSTIN / PAN / bank / fuzzy-name hits raised at entry. */
  duplicateFlags: string[]
  remarks?: string
  approvals: ApprovalStep[]
}

export interface AvlEntry {
  uid: string
  deletedAt?: string | null
  itemCode: string
  itemName: string
  supplierUid: string
  supplierName: string
  rank: number
  leadTimeDays: number
  moq: number
  orderMultiple: number
  uom: string
  lastRate: number
  lastRateDate?: string
  validTo: string
  inspectionRequirement: '100_PCT' | 'SAMPLING' | 'SKIP_LOT' | 'MTC_ONLY' | 'NONE'
  isProvisional: boolean
  isSingleSource: boolean
  /** Food-contact and coating sources carry a qualifying test report with its own expiry. */
  qualificationValidTo?: string
  customerApprovalRef?: string
  monthlyCapacity?: number
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED'
}

export interface SupplierDocument {
  uid: string
  deletedAt?: string | null
  supplierUid: string
  supplierName: string
  documentType: string
  documentNumber: string
  issuingAuthority?: string
  issueDate: string
  expiryDate: string
  isMandatory: boolean
  status: 'VERIFIED' | 'PENDING' | 'EXPIRED' | 'REJECTED'
  verifiedBy?: string
  /** A mandatory document past expiry stops the next PO release, not the next audit. */
  blocksPo: boolean
}

/* ═══════════════════════ Procurement settings (V3 Ch 8 §8.11) ═══════════════════════ */

export interface ProcParameter {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  description: string
  value: string
  unit?: string
  group: 'GENERAL' | 'TOLERANCE' | 'APPROVAL' | 'STATUTORY'
  scope: string
  /** Statutory values are shown but not editable — they change by notification, not by opinion. */
  editable: boolean
}

export interface EvalWeight {
  uid: string
  deletedAt?: string | null
  setCode: string
  setName: string
  category: string
  criterion: string
  weightPct: number
  direction: 'HIGHER' | 'LOWER'
  active: boolean
}

export interface ProcReasonCode {
  uid: string
  deletedAt?: string | null
  code: string
  label: string
  documentType: string
  requiresComment: boolean
  active: boolean
}
