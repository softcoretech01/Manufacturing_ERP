/**
 * Master data management.
 *
 * Every master in the product carries the same header, the same lifecycle and
 * the same governance fields (V2 Ch 3 "Universal Master Design Standard").
 * `MasterBase` is that contract; each specific master extends it with only the
 * fields that genuinely differ.
 */

export type ID = string

export type MasterStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REJECTED'
  | 'ARCHIVED'

export interface MasterBase {
  uid: ID
  /** Unique within company + branch. Auto-numbered or manual per master config. */
  code: string
  name: string
  shortName: string
  description: string
  status: MasterStatus
  /** Effective dating — a master is valid for a window, not forever. */
  effectiveFrom: string
  effectiveTo: string | null
  revision: number
  companyUid: ID
  branchUid: ID | null
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  approvedBy: string | null
  approvedAt: string | null
  attachmentCount: number
  commentCount: number
  /** How many open transactions reference this record — blocks deactivation. */
  usageCount: number
}

/* ─────────────────────────── Shared value objects ─────────────────────── */

export interface Address {
  uid: ID
  type: 'REGISTERED' | 'BILLING' | 'SHIPPING' | 'WORKS' | 'BRANCH'
  label: string
  line1: string
  line2: string
  city: string
  state: string
  stateCode: string
  pincode: string
  country: string
  gstin: string | null
  isDefault: boolean
  isActive: boolean
}

export interface ContactPerson {
  uid: ID
  name: string
  designation: string
  department: string
  email: string
  mobile: string
  landline: string
  isPrimary: boolean
  purpose: 'COMMERCIAL' | 'TECHNICAL' | 'QUALITY' | 'ACCOUNTS' | 'LOGISTICS'
  isActive: boolean
}

export interface BankAccount {
  uid: ID
  bankName: string
  branchName: string
  accountNumber: string
  ifsc: string
  accountType: 'CURRENT' | 'SAVINGS' | 'CC' | 'OD'
  swift: string | null
  currency: string
  isPrimary: boolean
  /** Verified by penny-drop before it can be used for payment. */
  isVerified: boolean
}

export interface ComplianceDoc {
  uid: ID
  type: string
  documentNo: string
  issuedBy: string
  validFrom: string
  validTo: string
  status: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING'
  fileName: string | null
}

export interface RevisionEntry {
  revision: number
  at: string
  by: string
  reason: string
  changes: { field: string; old: string | null; new: string | null }[]
  approvedBy: string | null
}

export interface WhereUsedEntry {
  module: string
  documentType: string
  documentNo: string
  status: string
  date: string
  isOpen: boolean
}

/* ─────────────────────────── Supplier (V2 Ch 10) ──────────────────────── */

export interface Supplier extends MasterBase {
  legalName: string
  vendorType: 'MANUFACTURER' | 'TRADER' | 'SERVICE' | 'JOB_WORK' | 'TRANSPORTER'
  category: string
  gstin: string
  gstRegistrationType: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'SEZ' | 'OVERSEAS'
  pan: string
  msmeNumber: string | null
  msmeCategory: 'MICRO' | 'SMALL' | 'MEDIUM' | null
  currency: string
  paymentTermsCode: string
  creditDays: number
  creditLimit: number
  /** Rolling supplier evaluation score, 0–100, recomputed after each cycle. */
  rating: number
  ratingGrade: 'A' | 'B' | 'C' | 'D'
  onTimeDeliveryPct: number
  qualityAcceptancePct: number
  isBlacklisted: boolean
  blacklistReason: string | null
  isApprovedVendor: boolean
  suppliedCategories: string[]
  addresses: Address[]
  contacts: ContactPerson[]
  bankAccounts: BankAccount[]
  complianceDocs: ComplianceDoc[]
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Customer ─────────────────────────────────── */

export interface Customer extends Omit<MasterBase, 'uid'> {
  id: number
  legalName: string
  customerType: 'DOMESTIC' | 'EXPORT' | 'OEM' | 'DISTRIBUTOR' | 'RETAIL' | 'ECOMMERCE'
  group: string
  category: string
  gstin: string
  gstRegistrationType: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'SEZ' | 'OVERSEAS'
  pan: string
  currency: string
  priceListCode: string
  paymentTermsCode: string
  creditDays: number
  creditLimit: number
  creditUsed: number
  creditHold: boolean
  territory: string
  salesPerson: string
  outstandingAmount: number
  overdueAmount: number
  addresses: Address[]
  contacts: ContactPerson[]
  bankAccounts: BankAccount[]
  complianceDocs: ComplianceDoc[]
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Item / product ───────────────────────────── */

export type ItemType = 'RAW_MATERIAL' | 'SEMI_FINISHED' | 'FINISHED' | 'CONSUMABLE' | 'PACKING' | 'SPARE' | 'SERVICE'

export interface ItemUomConversion {
  uom: string
  factor: number
  purpose: 'PURCHASE' | 'SALES' | 'STOCK' | 'PRODUCTION'
}

export interface Item extends MasterBase {
  itemType: ItemType
  category: string
  family: string
  series: string
  baseUom: string
  purchaseUom: string
  salesUom: string
  uomConversions: ItemUomConversion[]
  hsnCode: string
  gstRate: number
  /** Bottle-specific attributes; null on items that are not bottles. */
  capacityMl: number | null
  bottleModel: string | null
  colour: string | null
  finishType: string | null
  lidType: string | null
  steelGrade: string | null
  thicknessMm: number | null
  isVacuumInsulated: boolean | null
  netWeightG: number | null
  /** Inventory control */
  isBatchTracked: boolean
  isSerialTracked: boolean
  shelfLifeDays: number | null
  valuationMethod: 'FIFO' | 'WEIGHTED_AVG' | 'STANDARD'
  standardCost: number
  lastPurchaseRate: number
  sellingPrice: number
  reorderLevel: number
  reorderQty: number
  minStock: number
  maxStock: number
  leadTimeDays: number
  /** Quality */
  requiresIncomingInspection: boolean
  inspectionPlanCode: string | null
  drawingNo: string | null
  specification: string
  isPurchased: boolean
  isManufactured: boolean
  isSold: boolean
  preferredSupplier: string | null
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Employee ─────────────────────────────────── */

export interface Employee extends MasterBase {
  employeeCode: string
  designation: string
  department: string
  grade: string
  employmentType: 'PERMANENT' | 'CONTRACT' | 'TRAINEE' | 'APPRENTICE' | 'CASUAL'
  dateOfJoining: string
  dateOfBirth: string
  gender: 'M' | 'F' | 'O'
  bloodGroup: string
  mobile: string
  email: string
  reportsTo: string
  plantUid: ID | null
  costCentre: string
  shiftCode: string
  skills: { skill: string; level: 'TRAINEE' | 'OPERATOR' | 'SKILLED' | 'EXPERT'; certifiedOn: string | null }[]
  pfNumber: string | null
  esiNumber: string | null
  uanNumber: string | null
  aadhaarMasked: string
  panMasked: string
  bankAccountMasked: string
  isShopFloor: boolean
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Machine ──────────────────────────────────── */

export interface Machine extends MasterBase {
  machineGroup: string
  plantUid: ID
  lineCode: string
  workCentreCode: string
  manufacturer: string
  modelNumber: string
  serialNumber: string
  yearOfManufacture: number
  assetCode: string
  capacityPerHour: number
  capacityUom: string
  powerKw: number
  operatorsRequired: number
  installedOn: string
  warrantyUntil: string | null
  /** Maintenance */
  pmFrequencyDays: number
  lastPmOn: string | null
  nextPmOn: string | null
  criticality: 'A' | 'B' | 'C'
  currentState: 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'BREAKDOWN' | 'DECOMMISSIONED'
  oeePct: number
  /** Operations this machine can perform — drives routing validation. */
  operations: string[]
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Config-driven simple masters ─────────────── */

export type FieldType = 'text' | 'number' | 'select' | 'boolean' | 'date' | 'textarea' | 'colour'

export interface MasterField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  /** Populate this select's options live from another master's records (its code). */
  optionsFrom?: string
  hint?: string
  suffix?: string
  /** Shown in the list grid. Non-listed fields appear only on the form. */
  inList?: boolean
  align?: 'left' | 'right' | 'center'
  width?: string
  /** For a 'select' field, populate options from a live master (e.g. 'UOM')
   *  instead of the static `options` list. Stores the master's code. */
  masterCode?: string
}

/**
 * A master whose behaviour is entirely described by configuration. This is what
 * the framework promises: adding "Surface Coating" as a master should be a
 * config entry, not a new screen.
 */
export interface SimpleMasterDef {
  code: string
  route: string
  title: string
  singular: string
  category: string
  description: string
  /** V2 Ch 6 — the rules a reviewer should be able to read off the screen. */
  rules: string[]
  fields: MasterField[]
  requiresApproval: boolean
  autoCode: boolean
  codePrefix: string
  /** Override the name-column header in the list (defaults to `singular`). */
  nameHeader?: string
  /** Hide the "Used by" (usage count) column in the list. */
  hideUsage?: boolean
  /** Bump to force the browser-local seed to refresh when the seed rows change. */
  seedVersion?: number
  rows: SimpleMasterRow[]
}

export interface SimpleMasterRow {
  uid: ID
  code: string
  name: string
  status: MasterStatus
  effectiveFrom: string
  effectiveTo: string | null
  revision: number
  usageCount: number
  modifiedBy: string
  modifiedAt: string
  values: Record<string, string | number | boolean | null>
}

/* ─────────────────────────── Import / duplicate review ────────────────── */

export interface ImportRun {
  uid: ID
  masterCode: string
  masterName: string
  fileName: string
  rowsTotal: number
  rowsValid: number
  rowsWarning: number
  rowsError: number
  status: 'VALIDATING' | 'DRY_RUN_COMPLETE' | 'COMMITTED' | 'FAILED' | 'CANCELLED'
  startedBy: string
  startedAt: string
  errors: { row: number; column: string; value: string; message: string; severity: 'ERROR' | 'WARNING' }[]
}

export interface DuplicateCandidate {
  uid: ID
  masterCode: string
  masterName: string
  matchScore: number
  matchedOn: string[]
  recordA: { uid: ID; code: string; name: string; detail: string; createdAt: string; usageCount: number }
  recordB: { uid: ID; code: string; name: string; detail: string; createdAt: string; usageCount: number }
  status: 'OPEN' | 'MERGED' | 'DISMISSED'
}

export interface Transporter {
  id: number
  code: string
  name: string
  status: MasterStatus
  effectiveFrom: string
}

export interface Item extends MasterBase {
  itemType: ItemType
  category: string
  family: string
  series: string
  baseUom: string
  purchaseUom: string
  salesUom: string
  uomConversions: ItemUomConversion[]
  hsnCode: string
  gstRate: number
  /** Bottle-specific attributes; null on items that are not bottles. */
  capacityMl: number | null
  bottleModel: string | null
  colour: string | null
  finishType: string | null
  lidType: string | null
  steelGrade: string | null
  thicknessMm: number | null
  isVacuumInsulated: boolean | null
  netWeightG: number | null
  /** Inventory control */
  isBatchTracked: boolean
  isSerialTracked: boolean
  shelfLifeDays: number | null
  valuationMethod: 'FIFO' | 'WEIGHTED_AVG' | 'STANDARD'
  standardCost: number
  lastPurchaseRate: number
  sellingPrice: number
  reorderLevel: number
  reorderQty: number
  minStock: number
  maxStock: number
  leadTimeDays: number
  /** Quality */
  requiresIncomingInspection: boolean
  inspectionPlanCode: string | null
  drawingNo: string | null
  specification: string
  isPurchased: boolean
  isManufactured: boolean
  isSold: boolean
  preferredSupplier: string | null
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Employee ─────────────────────────────────── */

export interface Employee extends MasterBase {
  employeeCode: string
  designation: string
  department: string
  grade: string
  employmentType: 'PERMANENT' | 'CONTRACT' | 'TRAINEE' | 'APPRENTICE' | 'CASUAL'
  dateOfJoining: string
  dateOfBirth: string
  gender: 'M' | 'F' | 'O'
  bloodGroup: string
  mobile: string
  email: string
  reportsTo: string
  plantUid: ID | null
  costCentre: string
  shiftCode: string
  skills: { skill: string; level: 'TRAINEE' | 'OPERATOR' | 'SKILLED' | 'EXPERT'; certifiedOn: string | null }[]
  pfNumber: string | null
  esiNumber: string | null
  uanNumber: string | null
  aadhaarMasked: string
  panMasked: string
  bankAccountMasked: string
  isShopFloor: boolean
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Machine ──────────────────────────────────── */

export interface Machine extends MasterBase {
  machineGroup: string
  plantUid: ID
  lineCode: string
  workCentreCode: string
  manufacturer: string
  modelNumber: string
  serialNumber: string
  yearOfManufacture: number
  assetCode: string
  capacityPerHour: number
  capacityUom: string
  powerKw: number
  operatorsRequired: number
  installedOn: string
  warrantyUntil: string | null
  /** Maintenance */
  pmFrequencyDays: number
  lastPmOn: string | null
  nextPmOn: string | null
  criticality: 'A' | 'B' | 'C'
  currentState: 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'BREAKDOWN' | 'DECOMMISSIONED'
  oeePct: number
  /** Operations this machine can perform — drives routing validation. */
  operations: string[]
  revisions: RevisionEntry[]
  whereUsed: WhereUsedEntry[]
}

/* ─────────────────────────── Config-driven simple masters ─────────────── */

export type FieldType = 'text' | 'number' | 'select' | 'boolean' | 'date' | 'textarea' | 'colour'

export interface MasterField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  /** Populate this select's options live from another master's records (its code). */
  optionsFrom?: string
  hint?: string
  suffix?: string
  /** Shown in the list grid. Non-listed fields appear only on the form. */
  inList?: boolean
  align?: 'left' | 'right' | 'center'
  width?: string
  /** For a 'select' field, populate options from a live master (e.g. 'UOM')
   *  instead of the static `options` list. Stores the master's code. */
  masterCode?: string
}

/**
 * A master whose behaviour is entirely described by configuration. This is what
 * the framework promises: adding "Surface Coating" as a master should be a
 * config entry, not a new screen.
 */
export interface SimpleMasterDef {
  code: string
  route: string
  title: string
  singular: string
  category: string
  description: string
  /** V2 Ch 6 — the rules a reviewer should be able to read off the screen. */
  rules: string[]
  fields: MasterField[]
  requiresApproval: boolean
  autoCode: boolean
  codePrefix: string
  /** Override the name-column header in the list (defaults to `singular`). */
  nameHeader?: string
  /** Hide the "Used by" (usage count) column in the list. */
  hideUsage?: boolean
  /** Bump to force the browser-local seed to refresh when the seed rows change. */
  seedVersion?: number
  rows: SimpleMasterRow[]
}

export interface SimpleMasterRow {
  uid: ID
  code: string
  name: string
  status: MasterStatus
  effectiveFrom: string
  effectiveTo: string | null
  revision: number
  usageCount: number
  modifiedBy: string
  modifiedAt: string
  values: Record<string, string | number | boolean | null>
}

/* ─────────────────────────── Import / duplicate review ────────────────── */

export interface ImportRun {
  uid: ID
  masterCode: string
  masterName: string
  fileName: string
  rowsTotal: number
  rowsValid: number
  rowsWarning: number
  rowsError: number
  status: 'VALIDATING' | 'DRY_RUN_COMPLETE' | 'COMMITTED' | 'FAILED' | 'CANCELLED'
  startedBy: string
  startedAt: string
  errors: { row: number; column: string; value: string; message: string; severity: 'ERROR' | 'WARNING' }[]
}

export interface DuplicateCandidate {
  uid: ID
  masterCode: string
  masterName: string
  matchScore: number
  matchedOn: string[]
  recordA: { uid: ID; code: string; name: string; detail: string; createdAt: string; usageCount: number }
  recordB: { uid: ID; code: string; name: string; detail: string; createdAt: string; usageCount: number }
  status: 'OPEN' | 'MERGED' | 'DISMISSED'
}

export interface Transporter {
  id: number
  code: string
  name: string
  status: MasterStatus
  effectiveFrom: string
  effectiveTo: string | null
  transporterId: string
  mode: string
  isGta: boolean
  fleetSize: number
  serviceZones: string | null
  contactMobile: string | null
}

export interface Bank {
  id: number
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  ifscPrefix: string | null
  bankType: 'PUBLIC' | 'PRIVATE' | 'FOREIGN' | 'COOPERATIVE' | 'PAYMENTS'
  swift: string | null
  supportsNeft: boolean
  createdBy: string | null
  createdDate: string
  modifiedBy: string | null
  modifiedDate: string
}

export interface ContactPerson {
  id: number
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  partner: string
  partnerType: 'CUSTOMER' | 'SUPPLIER' | 'TRANSPORTER'
  designation: string | null
  purpose: 'COMMERCIAL' | 'TECHNICAL' | 'QUALITY' | 'ACCOUNTS' | 'LOGISTICS'
  email: string
  mobile: string
  hasPortalAccess: boolean
  createdBy: string | null
  createdDate: string
  modifiedBy: string | null
  modifiedDate: string
}
