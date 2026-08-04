/** Domain types for the core platform — organisation, access control, workflow. */

export type ID = string

/* ─────────────────────────── Org structure (Ch 6) ─────────────────────── */

export interface Company {
  uid: ID
  code: string
  legalName: string
  tradeName: string
  entityType: 'PVT_LTD' | 'LTD' | 'LLP' | 'PARTNERSHIP' | 'PROPRIETORSHIP'
  cin: string
  pan: string
  tan: string
  baseCurrency: string
  fyStartMonth: number
  timezone: string
  addressLine1: string
  city: string
  state: string
  stateCode: string
  pincode: string
  phone: string
  email: string
  website: string
  isActive: boolean
  logoInitials: string
}

export interface Registration {
  uid: ID
  companyUid: ID
  branchUid?: ID
  type: string
  number: string
  authority: string
  validFrom: string
  validTo: string | null
  attachment?: string
}

export interface Branch {
  uid: ID
  companyUid: ID
  code: string
  name: string
  branchType: 'HEAD_OFFICE' | 'FACTORY' | 'DEPOT' | 'SALES_OFFICE' | 'WAREHOUSE_ONLY'
  gstin: string | null
  hasSeparateGstin: boolean
  city: string
  state: string
  stateCode: string
  pincode: string
  contactPerson: string
  phone: string
  isActive: boolean
}

export interface Plant {
  uid: ID
  companyUid: ID
  branchUid: ID
  code: string
  name: string
  plantHead: string
  factoryLicence: string
  factoryLicenceValidTo: string
  city: string
  state: string
  installedCapacityPerDay: number
  capacityUom: string
  shiftPattern: string
  linesCount: number
  workCentresCount: number
  isActive: boolean
}

export interface ProductionLine {
  uid: ID
  plantUid: ID
  code: string
  name: string
  lineType: string
  minCapacityMl: number
  maxCapacityMl: number
  cycleTimeSec: number
  ratedOutputPerHour: number
  status: 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'DECOMMISSIONED'
}

export interface WorkCentre {
  uid: ID
  plantUid: ID
  lineUid: ID | null
  code: string
  name: string
  type: 'MACHINE' | 'LABOUR' | 'ASSEMBLY' | 'SUBCONTRACT' | 'INSPECTION'
  capacityPerHour: number
  efficiencyPct: number
  machineHourRate: number
  isBottleneck: boolean
}

export interface Warehouse {
  uid: ID
  companyUid: ID
  branchUid: ID
  plantUid: ID | null
  code: string
  name: string
  warehouseType: string
  isBinManaged: boolean
  isBatchMandatory: boolean
  allowNegativeStock: boolean
  isSystemManaged: boolean
  storekeeper: string
  valuationMethod: 'WEIGHTED_AVG' | 'FIFO' | 'STANDARD'
  binCount: number
  stockValue: number
  isActive: boolean
}

export interface Bin {
  uid: ID
  warehouseUid: ID
  zone: string
  code: string
  binType: string
  maxWeightKg: number
  pickSequence: number
  status: 'AVAILABLE' | 'BLOCKED' | 'FULL'
  currentStock: string
  utilisationPct: number
}

export interface Department {
  uid: ID
  companyUid: ID
  parentUid: ID | null
  code: string
  name: string
  departmentType: string
  head: string
  costCentre: string
  isActive: boolean
}

export interface CostCentre {
  uid: ID
  companyUid: ID
  parentUid: ID | null
  code: string
  name: string
  type: string
  owner: string
  budget: number
  actual: number
  isPostable: boolean
  isActive: boolean
}

export interface FinancialYear {
  uid: ID
  companyUid: ID
  code: string
  startDate: string
  endDate: string
  status: 'FUTURE' | 'OPEN' | 'CLOSING' | 'CLOSED'
  isCurrent: boolean
}

export interface AccountingPeriod {
  uid: ID
  fyUid: ID
  periodNo: number
  name: string
  startDate: string
  endDate: string
  moduleStatus: Record<string, 'OPEN' | 'CLOSING' | 'CLOSED'>
}

export interface Currency {
  code: string
  name: string
  symbol: string
  decimals: number
  isBase: boolean
}

export interface ExchangeRate {
  uid: ID
  from: string
  to: string
  rateType: 'BUYING' | 'SELLING' | 'AVERAGE' | 'CUSTOMS'
  rate: number
  effectiveDate: string
  source: string
}

/* ─────────────────────────── IAM (Ch 7, 8) ─────────────────────────────── */

export interface Permission {
  code: string
  module: string
  entity: string
  action: string
  name: string
  isSensitive: boolean
}

export interface Role {
  uid: ID
  code: string
  name: string
  description: string
  roleType: 'INTERNAL' | 'PORTAL' | 'SYSTEM' | 'AUDIT'
  isSystem: boolean
  isActive: boolean
  permissions: string[]
  deniedPermissions: string[]
  userCount: number
  fieldPolicies: FieldPolicy[]
}

export interface FieldPolicy {
  entity: string
  field: string
  access: 'HIDDEN' | 'READ_ONLY' | 'EDITABLE'
  condition?: string
}

export interface User {
  uid: ID
  loginId: string
  fullName: string
  email: string
  mobile: string
  userType: 'INTERNAL' | 'PORTAL_SUPPLIER' | 'PORTAL_CUSTOMER' | 'SYSTEM' | 'SHOPFLOOR'
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
  employeeCode: string | null
  department: string
  designation: string
  reportsTo: string
  roles: string[]
  defaultCompanyUid: ID
  defaultBranchUid: ID | null
  defaultPlantUid: ID | null
  scope: {
    companies: ID[]
    branches: ID[]
    plants: ID[]
    warehouses: ID[]
    costCentres: ID[]
  }
  rowRule: 'ALL' | 'OWN' | 'TEAM' | 'DEPARTMENT' | 'ASSIGNED_TERRITORY'
  mfaEnabled: boolean
  lastLoginAt: string | null
  language: string
  timezone: string
  dateFormat: string
  numberFormat: 'IN' | 'INTL'
  avatarColour?: string
}

export interface ApprovalAuthority {
  uid: ID
  userUid: ID | null
  roleCode: string | null
  documentType: string
  minAmount: number
  maxAmount: number | null
  currency: string
  dimension?: string
}

export interface Delegation {
  uid: ID
  fromUserUid: ID
  fromUserName: string
  toUserUid: ID
  toUserName: string
  documentTypes: string[]
  validFrom: string
  validTo: string
  reason: string
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
}

export interface Session {
  uid: ID
  userUid: ID
  userName: string
  device: string
  channel: 'WEB' | 'MOBILE' | 'PORTAL' | 'API' | 'KIOSK'
  ipAddress: string
  location: string
  startedAt: string
  lastActivityAt: string
  isCurrent: boolean
}

export interface ApiKey {
  uid: ID
  name: string
  keyPrefix: string
  roleCode: string
  ipAllowlist: string[]
  rateLimitPerMin: number
  expiresAt: string | null
  lastUsedAt: string | null
  callCount: number
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
}

export interface SodRule {
  uid: ID
  name: string
  permissionA: string
  permissionB: string
  severity: 'BLOCK' | 'WARN'
  violations: number
  isActive: boolean
}

export interface LoginActivity {
  uid: ID
  loginId: string
  userName: string
  result: 'SUCCESS' | 'FAILED' | 'LOCKED_OUT'
  reason?: string
  ipAddress: string
  channel: string
  userAgent: string
  at: string
}

/* ─────────────────────────── Numbering (Ch 11) ─────────────────────────── */

export interface NumberSeries {
  uid: ID
  documentType: string
  documentLabel: string
  subType: string | null
  branchCode: string
  plantCode: string
  fyCode: string | null
  formatString: string
  prefix: string
  separator: string
  paddingWidth: number
  startNumber: number
  currentNumber: number
  incrementBy: number
  resetFrequency: 'NEVER' | 'YEARLY' | 'FINANCIAL_YEARLY' | 'MONTHLY' | 'DAILY'
  allocateOn: 'DRAFT' | 'APPROVAL'
  isGapless: boolean
  isStatutory: boolean
  isDefault: boolean
  isActive: boolean
  nextNumber: string
  issuedCount: number
}

export interface NumberAllocation {
  uid: ID
  seriesUid: ID
  sequence: number
  formattedNumber: string
  entityLabel: string
  status: 'ALLOCATED' | 'CONSUMED' | 'VOIDED'
  reason?: string
  allocatedAt: string
  allocatedBy: string
}

/* ─────────────────────────── Workflow (Ch 9) ───────────────────────────── */

export interface ApprovalRule {
  uid: ID
  documentType: string
  documentLabel: string
  subType: string | null
  name: string
  branchCode: string
  plantCode: string
  conditionType: 'AMOUNT_BAND' | 'EXPRESSION' | 'ALWAYS'
  minAmount: number | null
  maxAmount: number | null
  conditionExpr: string | null
  priority: number
  autoApproveBelow: number | null
  restartOnChange: boolean
  materialChangeFields: string[]
  isActive: boolean
  levels: ApprovalLevel[]
}

export interface ApprovalLevel {
  levelNo: number
  levelName: string
  approverType: string
  approverValue: string
  approvalMode: 'ANY_ONE' | 'ALL' | 'QUORUM_N'
  quorumCount?: number
  isParallelWithPrevious: boolean
  slaHours: number
  escalationAction: string
  escalationTarget: string
}

export interface ApprovalTask {
  uid: ID
  documentNo: string
  documentType: string
  documentLabel: string
  subject: string
  requester: string
  requesterUid: ID
  /** Requesting department. Present on the documents that have one. */
  department?: string
  amount: number | null
  currency: string
  levelNo: number
  totalLevels: number
  levelName: string
  assignedAt: string
  dueAt: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'INFO_REQUESTED'
  isOverdue: boolean
  onBehalfOf?: string
  warnings: string[]
  context: { label: string; value: string; tone?: 'warning' | 'danger' | 'normal' }[]
  history: WorkflowHistoryEntry[]
}

export interface WorkflowHistoryEntry {
  levelNo: number
  levelName: string
  status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'UPCOMING' | 'RETURNED' | 'SKIPPED'
  actor: string
  at: string | null
  comments: string | null
}

export interface WorkflowDefinition {
  uid: ID
  code: string
  name: string
  description: string
  documentType: string
  version: number
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED'
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  runningInstances: number
}

export interface WorkflowNode {
  id: string
  type: 'START' | 'APPROVAL' | 'CONDITION' | 'PARALLEL_SPLIT' | 'PARALLEL_JOIN' | 'ACTION' | 'NOTIFICATION' | 'WAIT' | 'END'
  label: string
  subtitle?: string
  x: number
  y: number
}

export interface WorkflowEdge {
  from: string
  to: string
  label?: string
}

/* ─────────────────────────── Notification (Ch 10) ──────────────────────── */

export interface NotificationRule {
  uid: ID
  eventName: string
  eventLabel: string
  category: string
  recipientRule: string
  recipientValue: string
  channels: string[]
  templateCode: string
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  condition: string | null
  isMandatory: boolean
  isActive: boolean
}

export interface NotificationTemplate {
  uid: ID
  code: string
  name: string
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH'
  language: string
  subject: string
  body: string
  variables: string[]
  version: number
  whatsappApprovalStatus?: 'APPROVED' | 'PENDING' | 'REJECTED'
  isActive: boolean
}

export interface NotificationLog {
  uid: ID
  eventName: string
  recipient: string
  channel: string
  subject: string
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'BOUNCED'
  attempts: number
  error: string | null
  sentAt: string
}

export interface InAppNotification {
  uid: ID
  title: string
  body: string
  category: string
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  link: string | null
  isRead: boolean
  at: string
}

/* ─────────────────────────── Audit (Ch 15) ─────────────────────────────── */

export interface AuditEntry {
  uid: ID
  entityType: string
  entityLabel: string
  documentNo: string | null
  action: string
  changes: { field: string; old: string | null; new: string | null }[]
  reasonCode: string | null
  comments: string | null
  userName: string
  roleCode: string
  ipAddress: string
  userAgent: string
  channel: string
  correlationId: string
  at: string
}

/* ─────────────────────────── Attachments / comments (Ch 13, 14) ────────── */

export interface Attachment {
  uid: ID
  entityType: string
  entityUid: ID
  fileName: string
  fileType: string
  category: string
  sizeBytes: number
  version: number
  uploadedBy: string
  uploadedAt: string
  status: 'PENDING_UPLOAD' | 'SCANNING' | 'AVAILABLE' | 'INFECTED'
}

export interface Comment {
  uid: ID
  entityType: string
  entityUid: ID
  body: string
  visibility: 'INTERNAL' | 'EXTERNAL'
  author: string
  mentions: string[]
  at: string
  replies?: Comment[]
}

/* ─────────────────────────── System (Ch 6, 22, 28) ─────────────────────── */

export interface SystemParameter {
  uid: ID
  key: string
  name: string
  group: string
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENUM'
  value: string
  defaultValue: string
  options?: string[]
  description: string
  scope: 'INSTALLATION' | 'COMPANY'
  isSensitive: boolean
}

export interface BackupRecord {
  uid: ID
  type: 'FULL' | 'INCREMENTAL' | 'MANUAL'
  status: 'SUCCESS' | 'FAILED' | 'RUNNING'
  sizeMb: number
  startedAt: string
  durationSec: number
  location: string
  retentionUntil: string
  restoreTested: boolean
}

export interface LicenseInfo {
  licenseKey: string
  licensedTo: string
  edition: string
  validFrom: string
  validTo: string
  namedUsers: number
  usedUsers: number
  companies: number
  usedCompanies: number
  plants: number
  usedPlants: number
  modules: { code: string; name: string; enabled: boolean }[]
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED'
}

export interface IntegrationConfig {
  uid: ID
  code: string
  name: string
  category: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'STATUTORY' | 'STORAGE' | 'BANK' | 'PRINTER'
  provider: string
  status: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR'
  lastTestedAt: string | null
  settings: { key: string; label: string; value: string; secret?: boolean }[]
}

export interface BackgroundJob {
  uid: ID
  type: string
  label: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
  progressPct: number
  message: string
  startedAt: string
  durationSec: number | null
  triggeredBy: string
}

/* ─────────────────────────── Barcode (Ch 19) ───────────────────────────── */

export interface LabelTemplate {
  uid: ID
  code: string
  name: string
  objectType: string
  symbology: string
  widthMm: number
  heightMm: number
  dpi: number
  payloadFormat: string
  sample: string
  isDefault: boolean
}

/* ─────────────────────────── Reports (Ch 18) ───────────────────────────── */

export interface ReportDefinition {
  uid: ID
  code: string
  name: string
  module: string
  variant: 'SUMMARY' | 'DETAIL' | 'PENDING' | 'AGEING' | 'EXCEPTION' | 'MIS' | 'PIVOT'
  description: string
  isScheduled: boolean
  lastRunAt: string | null
}

/* ─────────────────────────── Masters framework (Ch 12) ─────────────────── */

export interface MasterDefinition {
  code: string
  name: string
  module: string
  recordCount: number
  hasApproval: boolean
  hasRevision: boolean
  hasAttachment: boolean
  isConfigured: boolean
  route: string
}
