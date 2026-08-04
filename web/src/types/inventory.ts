/**
 * Inventory & Warehouse Management (SRS Volume 4).
 *
 * The whole module hangs off two shapes: a **balance** keyed by
 * item × warehouse × bin × batch × status (V4-STK-FR-001), and an append-only
 * **ledger** row for every movement that changed one (V4-STK-FR-006). Every
 * document below exists to produce ledger rows; nothing edits a balance
 * directly.
 */

import type { ApprovalStep } from './procurement'

export type { ApprovalStep }

/* ─────────────────────────── Shared ─────────────────────────── */

export type InvStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_ISSUED'
  | 'ISSUED'
  | 'IN_TRANSIT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'COMPLETED'
  | 'POSTED'
  | 'SHORT_CLOSED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'ON_HOLD'

/** Stock status is an attribute of the stock, never of the location (Ch 2 §2.2.1). */
export type StockStatus =
  | 'AVAILABLE'
  | 'QUARANTINE'
  | 'BLOCKED'
  | 'REJECTED'
  | 'IN_TRANSIT'
  | 'AT_SUBCONTRACTOR'
  | 'EXPIRED'
  | 'SAMPLE'

export type ItemClass = 'RAW_MATERIAL' | 'COMPONENT' | 'CONSUMABLE' | 'PACKING' | 'SEMI_FINISHED' | 'FINISHED' | 'SCRAP'

export type AbcClass = 'A' | 'B' | 'C'
export type XyzClass = 'X' | 'Y' | 'Z'

/** Every inventory document carries the same governance envelope (Vol 0 §10). */
export interface InvDoc {
  uid: string
  deletedAt?: string | null
  docNo: string
  docDate: string
  status: InvStatus
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

/* ─────────────────────────── Stock ─────────────────────────── */

export interface StockBalance {
  uid: string
  deletedAt?: string | null
  itemCode: string
  itemName: string
  itemClass: ItemClass
  uom: string
  warehouse: string
  warehouseCode: string
  bin: string | null
  batchNo: string | null
  supplierBatchNo: string | null
  expiresOn: string | null
  status: StockStatus
  quantity: number
  reserved: number
  allocated: number
  rate: number
  /** Days since the batch was received — drives the ageing buckets (V4-VAL-FR-011). */
  ageDays: number
  lastMovementAt: string
}

/** Item-level roll-up of every bucket a caller might ask for (Ch 2 §2.4). */
export interface StockPosition {
  uid: string
  deletedAt?: string | null
  itemCode: string
  itemName: string
  itemClass: ItemClass
  uom: string
  abcClass: AbcClass
  xyzClass: XyzClass
  onHand: number
  available: number
  reserved: number
  quarantine: number
  blocked: number
  inTransit: number
  atSubcontractor: number
  onOrder: number
  wip: number
  rate: number
  reorderLevel: number
  minLevel: number
  maxLevel: number
  safetyStock: number
  avgDailyDemand: number
  leadTimeDays: number
  lastIssueOn: string | null
  isBatchTracked: boolean
  isSerialTracked: boolean
}

export type MovementDirection = 'IN' | 'OUT' | 'STATUS' | 'VALUE'

export interface LedgerEntry {
  uid: string
  deletedAt?: string | null
  postedAt: string
  businessDate: string
  movementType: string
  movementName: string
  direction: MovementDirection
  itemCode: string
  itemName: string
  uom: string
  warehouseCode: string
  bin: string | null
  batchNo: string | null
  quantity: number
  rate: number
  value: number
  runningQty: number
  docType: string
  docNo: string
  postedBy: string
  reason?: string
}

/* ─────────────────────── Warehouse, zone, bin ─────────────────────── */

export type BinStatus = 'AVAILABLE' | 'FULL' | 'BLOCKED' | 'UNDER_COUNT' | 'DAMAGED' | 'INACTIVE'

export interface BinSlot {
  uid: string
  deletedAt?: string | null
  warehouseCode: string
  zone: string
  code: string
  binType: string
  status: BinStatus
  utilisationPct: number
  maxWeightKg: number | null
  pickSequence: number
  fixedItem: string | null
  mixingAllowed: boolean
  contents: string
  itemCode: string | null
  batchNo: string | null
  quantity: number
  blockReason?: string
  lastCountedOn: string | null
}

/* Storage hierarchy: Warehouse → Zone → Rack → Shelf → Bin (Vol 5 Ch 3). */

export interface Zone {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  warehouseCode: string
  zoneType: string
  temperatureControlled: boolean
  rackCount: number
  isActive: boolean
}

export interface Rack {
  uid: string
  deletedAt?: string | null
  code: string
  warehouseCode: string
  zoneCode: string
  rackType: string
  levels: number
  maxWeightKg: number
  shelfCount: number
  isActive: boolean
}

export interface Shelf {
  uid: string
  deletedAt?: string | null
  code: string
  warehouseCode: string
  rackCode: string
  level: number
  maxWeightKg: number
  binCount: number
  isActive: boolean
}

export interface WarehouseSummary {
  uid: string
  code: string
  name: string
  warehouseType: string
  plant: string
  isBinManaged: boolean
  batchMandatory: boolean
  allowNegative: boolean
  putawayStrategy: string
  pickStrategy: string
  storekeeper: string
  valuationMethod: string
  binCount: number
  binsOccupied: number
  stockValue: number
  openMovements: number
  includeInAtp: boolean
}

/* ─────────────────────── Receipts & put-away ─────────────────────── */

export type ReceiptSource = 'PURCHASE' | 'PRODUCTION' | 'SALES_RETURN' | 'JOB_WORK' | 'TRANSFER' | 'OPENING'

export interface PutawayLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  batchNo: string | null
  expiresOn: string | null
  receivedQty: number
  binnedQty: number
  toBin: string | null
  proposedBin: string | null
  proposalReason: string
  overrideReason?: string
  stockStatus: StockStatus
  mtcNo?: string
  labelsPrinted: number
}

export interface PutawayDoc extends InvDoc {
  sourceType: ReceiptSource
  sourceDocNo: string
  sourceParty: string
  warehouse: string
  strategy: string
  receivedAt: string
  /** Hours since receipt — the put-away SLA is 4 h (V4-RCP-FR-013). */
  ageHours: number
  totalReceived: number
  totalBinned: number
  lines: PutawayLine[]
}

/** A goods receipt — the document that brings stock in, from any source. */
export interface GoodsReceipt extends InvDoc {
  sourceType: ReceiptSource
  sourceDocNo: string
  sourceParty: string
  warehouse: string
  itemCode: string
  itemName: string
  uom: string
  quantity: number
  acceptedQty: number
  rejectedQty: number
  batchNo: string | null
  expiresOn: string | null
  bin: string | null
  rate: number
  value: number
  qcRequired: boolean
  qcStatus: QcDecision
  receivedBy: string
  labelsPrinted: number
}

export type QcDecision = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DEVIATION_ACCEPTED' | 'NOT_REQUIRED'

export interface QuarantineLot {
  uid: string
  deletedAt?: string | null
  docNo: string
  receivedOn: string
  itemCode: string
  itemName: string
  uom: string
  batchNo: string
  supplierBatchNo: string | null
  supplier: string
  sourceDocNo: string
  quantity: number
  acceptedQty: number
  rejectedQty: number
  warehouse: string
  inspectionNo: string | null
  decision: QcDecision
  ageDays: number
  mtcReceived: boolean
  value: number
}

/* ─────────────────────── Issue & return ─────────────────────── */

export type ChargeType = 'PRODUCTION_ORDER' | 'COST_CENTRE' | 'PROJECT' | 'DISPATCH' | 'SAMPLE'

export interface IssueLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  bomStandardQty: number | null
  alreadyIssued: number
  quantity: number
  bin: string | null
  batchNo: string | null
  rate: number
  value: number
  returnedQty: number
  /** Set when the line exceeded the BOM standard beyond tolerance (V4-ISS-FR-011). */
  overIssueReason?: string
  fefoOverride?: boolean
  strategy: string
}

export interface MaterialIssue extends InvDoc {
  chargeType: ChargeType
  chargeRef: string
  chargeName: string
  operation?: string
  costCentre: string
  requisitionNo: string | null
  issuedTo: string
  fromWarehouse: string
  shift: string
  totalQty: number
  totalValue: number
  overIssueCount: number
  lines: IssueLine[]
}

export interface RequisitionLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  bomStandardQty: number | null
  quantity: number
  issuedQty: number
  available: number
  shortage: boolean
}

export interface MaterialRequisition extends InvDoc {
  department: string
  costCentre: string
  productionOrderNo: string | null
  requiredOn: string
  shift: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  requestedBy: string
  fromWarehouse: string
  estimatedValue: number
  lines: RequisitionLine[]
}

export type ReturnCondition = 'GOOD' | 'SUSPECT' | 'DAMAGED'

export interface MaterialReturn extends InvDoc {
  issueNo: string
  returnedBy: string
  toWarehouse: string
  itemCode: string
  itemName: string
  uom: string
  batchNo: string | null
  quantity: number
  condition: ReturnCondition
  weighmentRef?: string
  toBin: string | null
  value: number
}

/* ─────────────────────── Transfer & job work ─────────────────────── */

export type TransferType = 'BIN' | 'WAREHOUSE' | 'INTER_PLANT' | 'JOB_WORK'

export interface TransferLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  batchNo: string | null
  fromBin: string | null
  toBin: string | null
  quantity: number
  receivedQty: number
  shortQty: number
  damageQty: number
  varianceReason?: string
  value: number
}

export interface StockTransfer extends InvDoc {
  transferType: TransferType
  fromWarehouse: string
  toWarehouse: string
  toPlant: string
  reason: string
  vehicleNo?: string
  transporter?: string
  lrNo?: string
  ewayBillNo?: string
  expectedOn?: string
  dispatchedAt?: string
  receivedAt?: string
  isDistinctPerson: boolean
  /** Days the consignment has been in goods-in-transit (V4-TRF-FR-012). */
  transitDays: number
  totalQty: number
  totalValue: number
  lines: TransferLine[]
}

export interface JobworkChallan extends InvDoc {
  vendor: string
  subcontractPoNo: string
  process: string
  itemCode: string
  itemName: string
  uom: string
  batchNo: string | null
  issuedQty: number
  expectedReturnQty: number
  returnedQty: number
  scrapReturnedQty: number
  balanceQty: number
  agreedLossPct: number
  actualLossPct: number
  expectedReturnOn: string
  statutoryDueOn: string
  daysOutstanding: number
  value: number
}

/* ─────────────────── Adjustment, scrap, write-off ─────────────────── */

export type AdjustmentCategory = 'QUANTITY_CORRECTION' | 'DAMAGE' | 'EXPIRY' | 'PILFERAGE' | 'MIGRATION'

export interface AdjustmentLine {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  warehouseCode: string
  bin: string | null
  batchNo: string | null
  systemQty: number
  physicalQty: number
  deltaQty: number
  reasonCode: string
  note: string
  valueImpact: number
}

export interface StockAdjustment extends InvDoc {
  category: AdjustmentCategory
  warehouse: string
  reference: string
  netValueImpact: number
  /** The raiser can never be the approver — seeded SoD rule sod-05 (V4-ADJ-FR-005). */
  raisedBy: string
  lines: AdjustmentLine[]
}

export interface ScrapNote extends InvDoc {
  source: 'PRODUCTION_REJECTION' | 'HANDLING_DAMAGE' | 'EXPIRY' | 'MACHINE_TRIAL'
  productionOrderNo: string | null
  operation?: string
  defectCode: string | null
  costCentre: string
  responsibleShift: string
  itemCode: string
  itemName: string
  uom: string
  batchNo: string | null
  quantity: number
  bookValue: number
  scrapItem: string | null
  scrapQty: number
  recoveryValue: number
  tolerancePct: number
  actualPct: number
}

/* ─────────────────────── Counting ─────────────────────── */

export type CountType = 'CYCLE' | 'EVENT' | 'PHYSICAL_VERIFICATION'
export type CountStatus = 'PLANNED' | 'ASSIGNED' | 'COUNTED' | 'RECOUNT_REQUIRED' | 'PENDING_APPROVAL' | 'POSTED' | 'CANCELLED'
export type RootCause =
  | 'RECEIPT_ERROR'
  | 'ISSUE_ERROR'
  | 'PUT_AWAY_ERROR'
  | 'WEIGHMENT'
  | 'UOM_CONVERSION'
  | 'PILFERAGE'
  | 'DAMAGE_UNREPORTED'
  | 'SYSTEM_TIMING'
  | 'UNKNOWN'

export interface CountLine {
  uid: string
  bin: string | null
  itemCode: string
  itemName: string
  uom: string
  batchNo: string | null
  /** Hidden from the counter until the sheet is submitted (V4-CNT-BR-002). */
  systemQty: number | null
  countedQty: number | null
  varianceQty: number | null
  variancePct: number | null
  valueImpact: number
  tolerancePct: number
  withinTolerance: boolean
  recountRequired: boolean
  recountBy?: string
  reasonCode?: string
  rootCause?: RootCause
  isFoundStock: boolean
}

export interface CountDoc {
  uid: string
  deletedAt?: string | null
  docNo: string
  countType: CountType
  status: CountStatus
  warehouse: string
  scope: string
  abcClass: AbcClass | 'ALL'
  counter: string
  assignedOn: string
  dueOn: string
  countedOn?: string
  postedOn?: string
  binsPlanned: number
  binsCounted: number
  linesWithVariance: number
  accuracyPct: number
  netVarianceValue: number
  isFrozen: boolean
  approvals: ApprovalStep[]
  lines: CountLine[]
  version: number
  attachments: number
  comments: number
}

/* ─────────────────────── Batch & serial ─────────────────────── */

export type BatchStatus = 'ACTIVE' | 'QUARANTINE' | 'BLOCKED' | 'EXPIRED' | 'CONSUMED' | 'RECALLED'

export interface Batch {
  uid: string
  deletedAt?: string | null
  batchNo: string
  itemCode: string
  itemName: string
  uom: string
  supplierBatchNo: string | null
  supplier: string | null
  manufacturedOn: string | null
  receivedOn: string
  expiresOn: string | null
  quantityReceived: number
  quantityRemaining: number
  status: BatchStatus
  qcStatus: QcDecision
  qcInspectionNo: string | null
  sourceDocNo: string
  blockReason?: string
  // steel-specific
  steelGrade?: string
  thicknessMm?: number
  widthMm?: number
  coilWeightKg?: number
  mtcNo?: string
  mtcVerified?: boolean
  rate: number
  /** Batches this one was made from — the genealogy edge (V4-BAT-FR-017). */
  parents: { batchNo: string; itemName: string; quantity: number; docNo: string }[]
  children: { batchNo: string; itemName: string; quantity: number; docNo: string }[]
  locations: { warehouseCode: string; bin: string | null; quantity: number; status: StockStatus }[]
}

export type SerialStatus = 'IN_STOCK' | 'ALLOCATED' | 'DISPATCHED' | 'SOLD' | 'RETURNED' | 'SCRAPPED' | 'IN_SERVICE'

export interface SerialUnit {
  uid: string
  deletedAt?: string | null
  serialNo: string
  itemCode: string
  itemName: string
  batchNo: string
  status: SerialStatus
  warehouseCode: string | null
  bin: string | null
  productionOrderNo: string
  manufacturedOn: string
  cartonNo: string | null
  salesDocNo: string | null
  customer: string | null
  dispatchedOn: string | null
  warrantyTo: string | null
}

/* ─────────────────────── Valuation & ageing ─────────────────────── */

export interface ValuationRow {
  uid: string
  group: string
  itemClass: ItemClass
  opening: number
  receipts: number
  issues: number
  adjustments: number
  closing: number
  quantity: number
  method: string
}

export interface AgeingRow {
  uid: string
  group: string
  itemClass: ItemClass
  b0_30: number
  b31_60: number
  b61_90: number
  b91_180: number
  b181_365: number
  b365plus: number
  provision: number
  note?: string
}

export interface NonMovingItem {
  uid: string
  itemCode: string
  itemName: string
  itemClass: ItemClass
  uom: string
  quantity: number
  value: number
  lastMovementOn: string
  daysIdle: number
  reason: string
  recommendation: string
  provisionPct: number
}

/* ─────────────────── Replenishment & reservation ─────────────────── */

export interface ReorderRow {
  uid: string
  deletedAt?: string | null
  itemCode: string
  itemName: string
  itemClass: ItemClass
  uom: string
  abcClass: AbcClass
  xyzClass: XyzClass
  free: number
  onOrder: number
  reorderLevel: number
  minLevel: number
  maxLevel: number
  safetyStock: number
  avgDailyDemand: number
  leadTimeDays: number
  coverageDays: number
  suggestedQty: number
  moq: number
  lastRate: number
  preferredSupplier: string
  /** Set when another plant holds surplus — propose a transfer, not a purchase. */
  transferAlternative?: { plant: string; quantity: number }
  action: 'OK' | 'COVERED' | 'RAISE_PR' | 'TRANSFER' | 'URGENT'
  note?: string
}

export type ReservationState = 'RESERVED' | 'ALLOCATED' | 'CONSUMED' | 'RELEASED' | 'EXPIRED'

export interface Reservation {
  uid: string
  deletedAt?: string | null
  itemCode: string
  itemName: string
  uom: string
  warehouseCode: string
  batchNo: string | null
  quantity: number
  state: ReservationState
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  demandType: 'SALES_ORDER' | 'PRODUCTION_ORDER' | 'TRANSFER' | 'SAMPLE' | 'MANUAL'
  demandDocNo: string
  party: string
  requiredOn: string
  expiresOn: string
}

export interface ShortageRow {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  demandDocNo: string
  demandType: string
  party: string
  requiredQty: number
  availableQty: number
  gap: number
  requiredOn: string
  earliestCoverOn: string | null
  coverSource: string | null
  daysLate: number
}

/* ─────────────────────── Dashboard series ─────────────────────── */

/* ─────────────────────── Barcode & labels ─────────────────────── */

export type LabelObject = 'ITEM' | 'BATCH' | 'BIN' | 'CARTON' | 'PALLET' | 'SERIAL'

export interface LabelTemplate {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  objectType: LabelObject
  symbology: 'CODE128' | 'QR' | 'DATAMATRIX' | 'EAN13'
  sizeMm: string
  /** Payload pattern per Vol 0 §15, e.g. `v1|LOC|{WH}|{ZONE}|{BIN}`. */
  pattern: string
  fields: string[]
  printer: string
  printedCount: number
  isActive: boolean
}

export interface MovementDay {
  day: string
  receipts: number
  issues: number
  transfers: number
}

export interface ValueTrendPoint {
  month: string
  rawMaterial: number
  wip: number
  finishedGoods: number
  other: number
}

export interface AccuracyPoint {
  month: string
  accuracyPct: number
  variancePct: number
}
