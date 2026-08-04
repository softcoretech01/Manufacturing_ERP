/**
 * Volume 13 — Plant Maintenance, EAM & CMMS.
 *
 * Names are prefixed where they would collide with an existing contract:
 * `MaintWorkOrder` against the MES `WorkOrder`, `MaintAsset` against the
 * finance `FixedAsset`. They describe different things — the finance asset
 * carries book value and depreciation, this one carries running hours and
 * failure history — and conflating them is how a register stops reconciling.
 */

/* ─────────────────────── Assets ─────────────────────── */

export type AssetCategory =
  | 'PRODUCTION_MACHINE'
  | 'UTILITY'
  | 'MATERIAL_HANDLING'
  | 'QUALITY_INSTRUMENT'
  | 'MOULD_DIE'
  | 'JIG_FIXTURE'
  | 'TOOL'
  | 'IT'
  | 'VEHICLE'

export type AssetStatus = 'INSTALLED' | 'COMMISSIONED' | 'RUNNING' | 'IDLE' | 'UNDER_MAINTENANCE' | 'BREAKDOWN' | 'SHUTDOWN' | 'DECOMMISSIONED'

/** A, B, C — how badly production stops when this asset does. */
export type Criticality = 'A' | 'B' | 'C'

export interface MaintAsset {
  uid: string
  code: string
  name: string
  category: AssetCategory
  /** Parent asset in the hierarchy — plant → line → machine → sub-assembly. */
  parentCode: string | null
  manufacturer: string
  model: string
  serialNumber: string
  plant: string
  department: string
  productionLine: string
  workCentre: string
  location: string
  installedOn: string
  commissionedOn: string | null
  warrantyUntil: string | null
  amcVendor: string
  amcUntil: string | null
  /** Links the maintenance register to the finance fixed-asset register. */
  financeAssetCode: string | null
  purchaseCost: number
  expectedLifeYears: number
  criticality: Criticality
  status: AssetStatus
  /** Running-hour meter, the basis for hour-triggered maintenance. */
  runningHours: number
  /** Cycle counter, for press and forming equipment. */
  cycleCount: number
  /** Nameplate rating, used for utility efficiency. */
  ratedPowerKw: number
  requiresCalibration: boolean
  photoRef: string
  documents: { kind: 'MANUAL' | 'DRAWING' | 'SOP' | 'CERTIFICATE' | 'WARRANTY'; title: string; ref: string }[]
  criticalComponents: string[]
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Preventive maintenance ─────────────────────── */

export type PmTrigger = 'CALENDAR' | 'RUNNING_HOURS' | 'CYCLES' | 'PRODUCTION_QTY' | 'METER' | 'CONDITION'
export type PmFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'

export interface PmTask {
  uid: string
  seq: number
  description: string
  /** Standard minutes, used to plan technician load. */
  standardMinutes: number
  /** A task that must be signed before the work order can close. */
  mandatory: boolean
  /** Reading to be captured, where the task records a value. */
  capture: 'NONE' | 'READING' | 'PASS_FAIL' | 'PHOTO'
  uom: string
}

export interface PmPlan {
  uid: string
  code: string
  name: string
  assetCode: string
  assetName: string
  trigger: PmTrigger
  frequency: PmFrequency
  /** Calendar interval in days. Used when the trigger is CALENDAR. */
  intervalDays: number
  /** Meter interval — hours, cycles or units, by trigger. */
  intervalUnits: number
  /** Raise the work order this many days (or units) before it falls due. */
  leadDays: number
  tasks: PmTask[]
  /** Trade the work needs — matched against technician skills. */
  requiredSkill: string
  estimatedHours: number
  /** Whether the asset must be stopped, which forces a production window. */
  requiresShutdown: boolean
  requiresPermit: boolean
  permitTypes: PermitType[]
  spares: { itemCode: string; itemName: string; qty: number; uom: string }[]
  lastDoneOn: string | null
  lastDoneMeter: number
  isActive: boolean
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Work orders ─────────────────────── */

export type WoType = 'PREVENTIVE' | 'PREDICTIVE' | 'BREAKDOWN' | 'CORRECTIVE' | 'CALIBRATION' | 'UTILITY' | 'FACILITY'
export type WoStatus = 'DRAFT' | 'PLANNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'VERIFIED' | 'CLOSED' | 'CANCELLED'
export type WoPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface WoLabour {
  uid: string
  technicianCode: string
  technicianName: string
  hours: number
  /** Hourly cost, from the technician master. */
  rate: number
  isOvertime: boolean
}

export interface WoSpare {
  uid: string
  itemCode: string
  itemName: string
  qtyIssued: number
  qtyReturned: number
  uom: string
  rate: number
}

export interface WoChecklistLine {
  uid: string
  seq: number
  description: string
  mandatory: boolean
  capture: PmTask['capture']
  uom: string
  done: boolean
  /** Recorded value where the task captures one. */
  reading: number | null
  result: 'PASS' | 'FAIL' | null
  remarks: string
}

export interface MaintWorkOrder {
  uid: string
  docNo: string
  woType: WoType
  priority: WoPriority
  assetCode: string
  assetName: string
  /** PM plan or breakdown ticket that generated this. */
  sourceDocNo: string
  title: string
  description: string
  raisedBy: string
  raisedOn: string
  supervisor: string
  plannedStart: string
  plannedFinish: string
  actualStart: string | null
  actualFinish: string | null
  status: WoStatus
  labour: WoLabour[]
  spares: WoSpare[]
  externalCost: number
  externalVendor: string
  checklist: WoChecklistLine[]
  permitNo: string | null
  requiresPermit: boolean
  /** Minutes the asset was stopped for this job. */
  downtimeMinutes: number
  /** Cost of production lost while the asset was down, per minute. */
  verifiedBy: string | null
  verifiedOn: string | null
  closedOn: string | null
  /** A repeat visit for the same fault — drives first-time-fix rate. */
  isRework: boolean
  reworkOfDocNo: string | null
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Breakdowns ─────────────────────── */

export type BreakdownCategory = 'MECHANICAL' | 'ELECTRICAL' | 'HYDRAULIC' | 'PNEUMATIC' | 'ELECTRONIC' | 'TOOLING' | 'UTILITY' | 'OPERATOR'
export type BreakdownStatus = 'REPORTED' | 'ACKNOWLEDGED' | 'UNDER_REPAIR' | 'REPAIRED' | 'VERIFIED' | 'CLOSED' | 'CANCELLED'

export interface Breakdown {
  uid: string
  docNo: string
  assetCode: string
  assetName: string
  reportedBy: string
  reportedAt: string
  category: BreakdownCategory
  priority: WoPriority
  symptoms: string
  immediateAction: string
  /** Production order stopped by this failure, if any. */
  productionOrderNo: string
  downtimeStart: string
  downtimeEnd: string | null
  /** Minutes between the failure and a technician arriving — the response gap. */
  responseMinutes: number | null
  rootCause: string
  causeCategory: BreakdownCategory | null
  correctiveAction: string
  preventiveAction: string
  workOrderNo: string | null
  status: BreakdownStatus
  verifiedBy: string | null
  closedOn: string | null
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Condition monitoring ─────────────────────── */

export type ConditionParameter =
  | 'VIBRATION' | 'TEMPERATURE' | 'PRESSURE' | 'NOISE' | 'OIL_QUALITY'
  | 'VACUUM' | 'CURRENT' | 'MOTOR_LOAD' | 'BEARING'

export interface ConditionPoint {
  uid: string
  assetCode: string
  assetName: string
  parameter: ConditionParameter
  uom: string
  /** Normal operating band. Outside it is a warning; outside the trip is a stop. */
  warnLow: number | null
  warnHigh: number | null
  tripLow: number | null
  tripHigh: number | null
  isActive: boolean
  version: number
  deletedAt?: string | null
}

export interface ConditionReading {
  uid: string
  pointUid: string
  assetCode: string
  parameter: ConditionParameter
  readAt: string
  value: number
  readBy: string
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Spares ─────────────────────── */

export interface SparePart {
  uid: string
  itemCode: string
  itemName: string
  category: string
  uom: string
  /** Assets this part fits — the where-used that makes a spare findable. */
  compatibleAssets: string[]
  minStock: number
  maxStock: number
  reorderQty: number
  onHand: number
  /** Committed to open work orders but not yet issued. */
  reserved: number
  isCritical: boolean
  preferredVendor: string
  leadTimeDays: number
  rate: number
  binLocation: string
  version: number
  deletedAt?: string | null
}

export type SpareTxnType = 'RESERVE' | 'ISSUE' | 'RETURN' | 'SCRAP' | 'RECEIPT'

export interface SpareTxn {
  uid: string
  docNo: string
  txnType: SpareTxnType
  itemCode: string
  itemName: string
  qty: number
  uom: string
  workOrderNo: string
  assetCode: string
  txnAt: string
  byWhom: string
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Technicians ─────────────────────── */

export interface Technician {
  uid: string
  code: string
  name: string
  trade: string
  skills: string[]
  certifications: { name: string; validUntil: string }[]
  shift: 'A' | 'B' | 'C' | 'GENERAL'
  /** Hourly cost used in maintenance costing. */
  hourlyRate: number
  /** Hours available per shift, for load planning. */
  shiftHours: number
  isAvailable: boolean
  phone: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Permits ─────────────────────── */

export type PermitType = 'LOTO' | 'HOT_WORK' | 'HEIGHT' | 'CONFINED_SPACE' | 'GAS_TESTING' | 'CONTRACTOR' | 'ELECTRICAL'
export type PermitStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'CLOSED' | 'EXPIRED' | 'CANCELLED'

export interface MaintPermit {
  uid: string
  docNo: string
  permitType: PermitType
  workOrderNo: string
  assetCode: string
  assetName: string
  requestedBy: string
  issuedBy: string | null
  /** Everyone covered by this permit — nobody else may work under it. */
  workers: string[]
  contractor: string
  riskAssessment: string
  ppeChecklist: { item: string; confirmed: boolean }[]
  isolationPoints: { point: string; locked: boolean; tagNo: string }[]
  validFrom: string
  validUntil: string
  status: PermitStatus
  closedBy: string | null
  closedAt: string | null
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Utilities ─────────────────────── */

export interface UtilityLog {
  uid: string
  assetCode: string
  assetName: string
  logDate: string
  runningHours: number
  /** Electrical units consumed on the day. */
  energyKwh: number
  /** Diesel for a DG set, in litres. */
  fuelLitres: number
  /** Output delivered — m³ of air, TR of cooling, kWh generated. */
  output: number
  outputUom: string
  downtimeMinutes: number
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Shutdowns ─────────────────────── */

export type ShutdownType = 'ANNUAL' | 'LINE' | 'MACHINE' | 'EMERGENCY'
export type ShutdownStatus = 'PLANNED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface ShutdownTask {
  uid: string
  seq: number
  description: string
  assetCode: string
  owner: string
  contractor: string
  plannedHours: number
  actualHours: number | null
  /** Tasks that must finish before this one can start. */
  dependsOnSeq: number[]
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED'
  permitNo: string | null
}

export interface Shutdown {
  uid: string
  docNo: string
  shutdownType: ShutdownType
  title: string
  scope: string
  plant: string
  plannedStart: string
  plannedEnd: string
  actualStart: string | null
  actualEnd: string | null
  status: ShutdownStatus
  tasks: ShutdownTask[]
  contractors: string[]
  budgetedCost: number
  actualCost: number
  coordinator: string
  remarks: string
  version: number
  deletedAt?: string | null
}
