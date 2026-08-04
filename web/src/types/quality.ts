/**
 * Quality Management System (Volume 9).
 *
 * Every inspection in the plant — incoming, in-process, final, outgoing — is
 * the same record with a different stage and a different source document. That
 * is deliberate: one shape means one set of rules for sampling, evaluation,
 * disposition and traceability, rather than four that drift apart.
 */

export type InspectionStage = 'IQC' | 'FIRST_PIECE' | 'IPQC' | 'FQC' | 'OQA'

export type InspectionStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PENDING_APPROVAL'
  | 'COMPLETED'
  | 'CANCELLED'

/** Ch 6. What the inspector decided about the lot. */
export type Disposition =
  | 'PENDING'
  | 'ACCEPTED'
  | 'ACCEPTED_WITH_DEVIATION'
  | 'REJECTED'
  | 'HOLD'

export type DefectSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR'

/* ─────────────────────── Inspection plan ─────────────────────── */

export type SamplingMethod = 'FULL' | 'AQL' | 'FIXED' | 'RANDOM_PERCENT'

export type CharacteristicType = 'MEASURED' | 'ATTRIBUTE' | 'DOCUMENT'

/**
 * One thing being checked. A measured characteristic has limits and a reading;
 * an attribute is pass/fail; a document check is a certificate that either
 * exists and is valid or does not.
 */
export interface PlanCharacteristic {
  uid: string
  seq: number
  name: string
  type: CharacteristicType
  /** Engineering unit — mm, g, ml, mbar·L/s. Blank for attributes. */
  uom: string
  target: number | null
  lowerLimit: number | null
  upperLimit: number | null
  /** Instrument code from the calibration register. Blank if none is needed. */
  instrumentCode: string
  severity: DefectSeverity
  /** A mandatory characteristic failing fails the whole inspection. */
  isMandatory: boolean
  /** Ch 25 — the inspector must attach a photograph for this check. */
  requiresPhoto: boolean
  method: string
}

export interface InspectionPlan {
  uid: string
  docNo: string
  name: string
  stage: InspectionStage
  /** Item or product this plan governs. */
  itemCode: string
  itemName: string
  /** For IPQC: the routing operation the plan hangs off. Null otherwise. */
  operationCode: string | null
  samplingMethod: SamplingMethod
  /** AQL level for AQL sampling, e.g. 1.0. */
  aql: number
  /** Fixed sample size, or the percentage for random sampling. */
  fixedSampleSize: number
  randomPercent: number
  revision: number
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'OBSOLETE'
  effectiveFrom: string
  characteristics: PlanCharacteristic[]
  inspectorRole: string
  frequency: string
  remarks: string
  createdBy: string
  createdAt: string
  approvedBy: string | null
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Inspection ─────────────────────── */

export interface InspectionReading {
  uid: string
  characteristicUid: string
  name: string
  type: CharacteristicType
  uom: string
  target: number | null
  lowerLimit: number | null
  upperLimit: number | null
  instrumentCode: string
  severity: DefectSeverity
  isMandatory: boolean
  requiresPhoto: boolean
  /** Measured value. Null until the inspector records it. */
  actual: number | null
  /** Attribute and document checks record a verdict rather than a number. */
  verdict: 'PENDING' | 'PASS' | 'FAIL'
  photoAttached: boolean
  remarks: string
}

export interface DefectEntry {
  uid: string
  defectCode: string
  defectName: string
  severity: DefectSeverity
  qty: number
  /** Where it was found — operation, machine, or the supplier batch. */
  source: string
  remarks: string
}

export interface Inspection {
  uid: string
  docNo: string
  stage: InspectionStage
  /** GRN, production order, work order or shipment that triggered it. */
  sourceType: 'GRN' | 'PRODUCTION_ORDER' | 'WORK_ORDER' | 'SHIPMENT'
  sourceDocNo: string
  itemCode: string
  itemName: string
  uom: string
  batchNo: string
  supplierCode: string
  supplierName: string
  operationCode: string | null
  workCentreCode: string | null
  machineCode: string | null
  shift: string
  planDocNo: string
  planRevision: number
  /** Size of the lot presented for inspection. */
  lotSize: number
  /** How many were actually checked, from the sampling rule. */
  sampleSize: number
  /** ISO 2859-1 accept and reject numbers for this lot and AQL. */
  acceptNumber: number
  rejectNumber: number
  samplingMethod: SamplingMethod
  aql: number
  acceptedQty: number
  rejectedQty: number
  reworkQty: number
  readings: InspectionReading[]
  defects: DefectEntry[]
  status: InspectionStatus
  disposition: Disposition
  /** Mandatory when the disposition is a deviation or a rejection. */
  dispositionReason: string
  inspector: string
  inspectedAt: string | null
  approvedBy: string | null
  approvedAt: string | null
  /** NCR raised from this inspection, if any. */
  ncrDocNo: string | null
  remarks: string
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Defect catalogue ─────────────────────── */

export interface DefectType {
  uid: string
  code: string
  name: string
  severity: DefectSeverity
  category: string
  /** Ch 15 — which of the six Ms this defect usually traces back to. */
  defaultCause: CauseCategory
  /** Rupees per unit when this defect scraps the piece. Drives COPQ. */
  scrapCostPerUnit: number
  reworkCostPerUnit: number
  isActive: boolean
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── NCR ─────────────────────── */

export type CauseCategory = 'MAN' | 'MACHINE' | 'MATERIAL' | 'METHOD' | 'MEASUREMENT' | 'ENVIRONMENT'

export type NcrSource = 'SUPPLIER' | 'PRODUCTION' | 'CUSTOMER_RETURN' | 'PROCESS_DEVIATION' | 'AUDIT_FINDING'

export type NcrStatus =
  | 'OPEN'
  | 'CONTAINED'
  | 'UNDER_INVESTIGATION'
  | 'ROOT_CAUSE_IDENTIFIED'
  | 'CORRECTIVE_ACTION'
  | 'VERIFICATION'
  | 'CLOSED'
  | 'CANCELLED'

/** Ch 15 — one rung of a five-why. */
export interface WhyStep {
  level: number
  question: string
  answer: string
}

export interface Ncr {
  uid: string
  docNo: string
  source: NcrSource
  severity: DefectSeverity
  title: string
  description: string
  itemCode: string
  itemName: string
  batchNo: string
  /** Inspection, complaint or audit finding this came from. */
  originDocNo: string
  supplierCode: string
  quantityAffected: number
  quantityScrapped: number
  quantityReworked: number
  uom: string
  /** Immediate action taken to stop the bad material moving. */
  containment: string
  containedAt: string | null
  rootCause: string
  causeCategory: CauseCategory | null
  fiveWhys: WhyStep[]
  status: NcrStatus
  raisedBy: string
  raisedOn: string
  owner: string
  dueOn: string
  closedOn: string | null
  capaDocNo: string | null
  /** Scrap plus rework value carried by this non-conformance. */
  costImpact: number
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── CAPA ─────────────────────── */

export type CapaStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'VERIFICATION' | 'CLOSED' | 'CANCELLED'

export interface Capa {
  uid: string
  docNo: string
  title: string
  ncrDocNo: string
  itemCode: string
  rootCause: string
  causeCategory: CauseCategory
  correctiveAction: string
  preventiveAction: string
  owner: string
  raisedOn: string
  dueOn: string
  status: CapaStatus
  /** How the fix was proved to work. Required before closure. */
  verificationMethod: string
  verificationResult: string
  verifiedBy: string | null
  verifiedOn: string | null
  closedOn: string | null
  /** Recurrence check — has the same defect been seen since closure. */
  recurrenceChecked: boolean
  effectivenessPct: number | null
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Calibration ─────────────────────── */

export type InstrumentStatus = 'VALID' | 'DUE' | 'OVERDUE' | 'UNDER_CALIBRATION' | 'CONDEMNED'

export interface Instrument {
  uid: string
  code: string
  name: string
  instrumentType: string
  make: string
  serialNo: string
  range: string
  leastCount: string
  location: string
  custodian: string
  calibrationFrequencyDays: number
  lastCalibratedOn: string
  nextDueOn: string
  agency: string
  certificateNo: string
  /** Measured error at the last calibration, against the permitted tolerance. */
  observedErrorPct: number
  permittedErrorPct: number
  status: InstrumentStatus
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Supplier quality ─────────────────────── */

export type SupplierGrade = 'PREFERRED' | 'APPROVED' | 'CONDITIONAL' | 'BLOCKED'

export interface SupplierQualityRecord {
  uid: string
  supplierCode: string
  supplierName: string
  period: string
  lotsReceived: number
  lotsAccepted: number
  lotsRejected: number
  qtyReceived: number
  qtyRejected: number
  /** Lots delivered with a valid mill test certificate on arrival. */
  lotsWithValidDocs: number
  ncrsRaised: number
  ncrsClosedOnTime: number
  /** Average days to respond to a supplier CAPA request. */
  capaResponseDays: number
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Customer complaints ─────────────────────── */

export type ComplaintStatus = 'LOGGED' | 'UNDER_INVESTIGATION' | 'ROOT_CAUSE_IDENTIFIED' | 'RESOLVED' | 'CLOSED' | 'REJECTED'

export type ComplaintResolution = 'PENDING' | 'REPLACEMENT' | 'CREDIT_NOTE' | 'REPAIR' | 'NO_FAULT_FOUND'

export interface Complaint {
  uid: string
  docNo: string
  customerName: string
  complaintType: string
  severity: DefectSeverity
  itemCode: string
  itemName: string
  batchNo: string
  /** Traces back to the order that made this batch. */
  productionOrderNo: string
  invoiceNo: string
  qtySupplied: number
  qtyComplained: number
  description: string
  loggedOn: string
  loggedBy: string
  owner: string
  dueOn: string
  status: ComplaintStatus
  resolution: ComplaintResolution
  resolutionValue: number
  rootCause: string
  causeCategory: CauseCategory | null
  ncrDocNo: string | null
  capaDocNo: string | null
  closedOn: string | null
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Audits ─────────────────────── */

export type AuditType = 'INTERNAL' | 'SUPPLIER' | 'CUSTOMER' | 'ISO' | 'PROCESS' | 'PRODUCT'
export type AuditStatus = 'PLANNED' | 'IN_PROGRESS' | 'REPORTED' | 'ACTIONS_OPEN' | 'CLOSED' | 'CANCELLED'
export type FindingGrade = 'MAJOR_NC' | 'MINOR_NC' | 'OBSERVATION' | 'CONFORMS'

export interface AuditFinding {
  uid: string
  clause: string
  area: string
  grade: FindingGrade
  description: string
  action: string
  owner: string
  dueOn: string
  closedOn: string | null
}

export interface QualityAudit {
  uid: string
  docNo: string
  auditType: AuditType
  title: string
  scope: string
  auditee: string
  auditor: string
  plannedOn: string
  conductedOn: string | null
  status: AuditStatus
  findings: AuditFinding[]
  /** Percentage of checklist clauses that conformed. */
  scorePct: number | null
  reportRef: string
  remarks: string
  version: number
  deletedAt?: string | null
}
