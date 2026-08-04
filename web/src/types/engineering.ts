/**
 * Product Engineering — BOM & Routing (Volume 6).
 *
 * This module is the single source of truth for what a product is made of and
 * how it is made. Planning explodes the BOM, production executes the routing,
 * costing rolls both up, and quality hangs its checkpoints off the operations.
 * Because four other modules read these records, nothing here is edited in
 * place once released — a change goes through the engineering change process
 * and lands as a new revision.
 */

export type EngStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'OBSOLETE'

/** Product lifecycle (Ch 18). Manufacturing is only allowed from PRODUCTION. */
export type Lifecycle =
  | 'CONCEPT'
  | 'DESIGN'
  | 'PROTOTYPE'
  | 'TESTING'
  | 'APPROVED'
  | 'PRODUCTION'
  | 'OBSOLETE'
  | 'ARCHIVED'

export type ProductType =
  | 'FINISHED'
  | 'SEMI_FINISHED'
  | 'RAW_MATERIAL'
  | 'PACKING'
  | 'CONSUMABLE'
  | 'SPARE'
  | 'TOOLING'
  | 'ACCESSORY'

/* ─────────────────────────── Product ─────────────────────────── */

/** Engineering specification block (Ch 5). Every field is a controlled value. */
export interface ProductSpec {
  materialGrade: string
  thicknessMm: number | null
  diameterMm: number | null
  heightMm: number | null
  neckDiameterMm: number | null
  baseDiameterMm: number | null
  capacityMl: number | null
  wallThicknessMm: number | null
  vacuumType: string
  insulationType: string
  coatingType: string
  paintSpec: string
  surfaceFinish: string
  logoSpec: string
  printingMethod: string
  packagingStandard: string
}

export interface EngProduct {
  uid: string
  code: string
  name: string
  productType: ProductType
  family: string
  /** Bottle capacity in ml — the attribute the whole catalogue is organised by. */
  capacityMl: number | null
  colour: string
  brand: string
  baseUom: string
  netWeightG: number | null
  lifecycle: Lifecycle
  revision: number
  effectiveFrom: string
  spec: ProductSpec
  /** Standard cost last published from a roll-up. Zero until first rolled. */
  standardCost: number
  costRolledAt: string | null
  createdBy: string
  createdAt: string
  modifiedAt: string
  version: number
  remarks: string
  deletedAt?: string | null
}

/* ─────────────────────────── Bill of materials ─────────────────────────── */

export type BomType = 'MANUFACTURING' | 'ENGINEERING' | 'PACKING' | 'SALES' | 'ALTERNATE' | 'PHANTOM'

export interface BomLine {
  uid: string
  /** Position on the printed BOM. Kept stable across revisions. */
  seq: number
  itemCode: string
  itemName: string
  uom: string
  /** Quantity per BOM base quantity, before scrap. */
  qtyPer: number
  /** Process loss allowance, added on top of qtyPer during explosion. */
  scrapPct: number
  /**
   * A phantom line is a grouping only — it is not stocked or issued; the
   * explosion passes straight through it to its own components.
   */
  isPhantom: boolean
  /** Routing operation that consumes this component, for backflush. */
  operationSeq: number | null
  notes: string
}

export interface Bom {
  uid: string
  docNo: string
  productCode: string
  productName: string
  bomType: BomType
  revision: number
  status: EngStatus
  /** Quantities on the lines are "per this many" of the product. */
  baseQty: number
  uom: string
  effectiveFrom: string
  effectiveTo: string | null
  /** The BOM MRP picks when nothing else is specified. One per product. */
  isDefault: boolean
  /** For an alternate BOM: which product variant or customer it serves. */
  alternateFor: string
  lines: BomLine[]
  createdBy: string
  createdAt: string
  approvedBy: string | null
  approvedAt: string | null
  /** ECN that produced this revision, if it came from one. */
  sourceEcn: string | null
  changeReason: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Work centre & operations ────────────────── */

export interface EngWorkCentre {
  uid: string
  code: string
  name: string
  plant: string
  /** Machine hour rate — depreciation, power and consumables. */
  machineRatePerHour: number
  /** Fully loaded labour rate for one operator. */
  labourRatePerHour: number
  /** Overhead recovery applied on the conversion cost of this centre. */
  overheadPct: number
  shiftPattern: string
  hoursPerDay: number
  oeeTargetPct: number
  machineCodes: string[]
  isActive: boolean
  createdAt: string
  version: number
  deletedAt?: string | null
}

export interface Operation {
  uid: string
  code: string
  name: string
  defaultWorkCentre: string
  /** Minutes to prepare the centre once per lot. */
  setupMinutes: number
  /** Seconds of machine time for one piece. */
  cycleSeconds: number
  operators: number
  skill: string
  /** In-process inspection is raised automatically when true. */
  qcCheckpoint: boolean
  instructions: string
  isActive: boolean
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Routing ─────────────────────────── */

export interface RoutingOperation {
  uid: string
  seq: number
  operationCode: string
  operationName: string
  workCentreCode: string
  machineCode: string
  setupMinutes: number
  cycleSeconds: number
  operators: number
  skill: string
  toolCode: string | null
  qcCheckpoint: boolean
  instructions: string
}

export interface Routing {
  uid: string
  docNo: string
  productCode: string
  productName: string
  revision: number
  status: EngStatus
  effectiveFrom: string
  effectiveTo: string | null
  isDefault: boolean
  /**
   * Lot size the setup time is amortised over when costing. Costing a setup
   * against one piece is what makes a standard cost meaningless.
   */
  costingLotSize: number
  operations: RoutingOperation[]
  createdBy: string
  createdAt: string
  approvedBy: string | null
  approvedAt: string | null
  sourceEcn: string | null
  changeReason: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Tools ─────────────────────────── */

export type ToolType = 'DIE' | 'PUNCH' | 'MOULD' | 'FIXTURE' | 'JIG' | 'WHEEL' | 'GAUGE'

export interface Tool {
  uid: string
  code: string
  name: string
  toolType: ToolType
  machineCode: string
  /** Total pieces the tool is rated for before replacement. */
  lifeStrokes: number
  usedStrokes: number
  lastMaintenanceOn: string | null
  nextCalibrationOn: string | null
  replacementCost: number
  location: string
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'CALIBRATION' | 'RETIRED'
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Engineering change ─────────────────────── */

export type ChangeAction = 'ADD' | 'REMOVE' | 'REPLACE' | 'QTY_CHANGE'

/**
 * A concrete, machine-applicable change. The ECN is not a memo — approving it
 * rewrites the BOM into a new revision from exactly these instructions.
 */
export interface ChangeLine {
  uid: string
  bomDocNo: string
  action: ChangeAction
  itemCode: string
  itemName: string
  /** For REPLACE. */
  newItemCode: string
  newItemName: string
  /** For ADD and QTY_CHANGE. */
  newQtyPer: number
  newScrapPct: number
  note: string
}

export interface EngChange {
  uid: string
  docNo: string
  /** ECR is the request; it is promoted to an ECN once technically reviewed. */
  changeType: 'ECR' | 'ECN'
  title: string
  reason: string
  category: 'COST_REDUCTION' | 'QUALITY' | 'CUSTOMER' | 'STATUTORY' | 'OBSOLESCENCE' | 'SAFETY' | 'DESIGN'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  requestedBy: string
  requestedOn: string
  productCode: string
  productName: string
  changeLines: ChangeLine[]
  impactNote: string
  effectiveFrom: string
  status: 'DRAFT' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'IMPLEMENTED' | 'REJECTED' | 'CANCELLED'
  /** ECR this notice was raised from. */
  sourceEcr: string | null
  /** BOM revision the approval produced, once implemented. */
  resultingBom: string | null
  approvals: { level: number; role: string; approver: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; actedAt?: string; remarks?: string }[]
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Documents ─────────────────────────── */

export type DocType =
  | 'CAD_DRAWING'
  | 'MODEL_3D'
  | 'PDF_DRAWING'
  | 'SOP'
  | 'WORK_INSTRUCTION'
  | 'CUSTOMER_SPEC'
  | 'CERTIFICATE'
  | 'DATASHEET'
  | 'IMAGE'

export interface EngDocument {
  uid: string
  code: string
  title: string
  docType: DocType
  productCode: string
  revision: number
  fileName: string
  sizeKb: number
  status: EngStatus
  uploadedBy: string
  uploadedOn: string
  approvedBy: string | null
  approvedOn: string | null
  remarks: string
  version: number
  deletedAt?: string | null
}
