/**
 * Shop Floor Execution (MES) — Volume 8.
 *
 * A released production order becomes a chain of work orders, one per routing
 * operation. Each work order is executed on a machine by an operator in a
 * shift, producing good, scrap and rework quantities. Everything else in this
 * module — WIP, OEE, downtime, labour, genealogy — is derived from those
 * confirmations.
 */

export type OrderStatus =
  | 'PLANNED'
  | 'RELEASED'
  | 'MATERIAL_ALLOCATED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED'

export type WorkOrderStatus = 'QUEUED' | 'READY' | 'SETUP' | 'RUNNING' | 'PAUSED' | 'QC_HOLD' | 'COMPLETED' | 'CANCELLED'

export type Shift = 'A' | 'B' | 'C'

export interface ProductionOrder {
  uid: string
  deletedAt?: string | null
  docNo: string
  docDate: string
  status: OrderStatus
  plant: string
  line: string
  itemCode: string
  itemName: string
  bomRevision: string
  routingRevision: string
  plannedQty: number
  producedQty: number
  scrapQty: number
  reworkQty: number
  uom: string
  batchNo: string | null
  salesOrderNo: string | null
  customer: string | null
  plannedStart: string
  plannedEnd: string
  actualStart: string | null
  actualEnd: string | null
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  /** Release checks — all four must pass before work orders are generated. */
  materialReady: boolean
  machineReady: boolean
  toolingReady: boolean
  manpowerReady: boolean
  releasedBy: string | null
  releasedAt: string | null
  createdBy: string
  createdAt: string
  version: number
  remarks?: string
}

export interface WorkOrder {
  uid: string
  deletedAt?: string | null
  docNo: string
  productionOrderNo: string
  itemName: string
  sequence: number
  operationCode: string
  operationName: string
  workCentre: string
  machine: string | null
  tool: string | null
  operator: string | null
  shift: Shift | null
  status: WorkOrderStatus
  inputQty: number
  plannedQty: number
  producedQty: number
  scrapQty: number
  reworkQty: number
  uom: string
  standardMinutes: number
  setupMinutes: number
  actualMinutes: number
  plannedStart: string
  startedAt: string | null
  completedAt: string | null
  qcRequired: boolean
  qcResult: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_REQUIRED'
  batchNo: string | null
  remarks?: string
}

export type MachineState = 'RUNNING' | 'IDLE' | 'SETUP' | 'BREAKDOWN' | 'MAINTENANCE' | 'OFF'

export interface Machine {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  workCentre: string
  line: string
  state: MachineState
  currentWorkOrder: string | null
  currentOperator: string | null
  /** OEE inputs for the current shift. */
  plannedMinutes: number
  runMinutes: number
  downMinutes: number
  idealCycleSeconds: number
  totalPieces: number
  goodPieces: number
  lastMaintenanceOn: string
  nextMaintenanceOn: string
  calibrationDueOn: string | null
  capacityPerHour: number
}

export type DowntimeReason =
  | 'PLANNED_MAINTENANCE'
  | 'BREAKDOWN'
  | 'POWER_FAILURE'
  | 'TOOL_CHANGE'
  | 'MATERIAL_SHORTAGE'
  | 'OPERATOR_UNAVAILABLE'
  | 'WAITING_FOR_QC'
  | 'CHANGEOVER'

export interface DowntimeEvent {
  uid: string
  deletedAt?: string | null
  docNo: string
  machine: string
  machineCode: string
  workCentre: string
  reason: DowntimeReason
  startedAt: string
  endedAt: string | null
  minutes: number
  shift: Shift
  reportedBy: string
  correctiveAction: string | null
  maintenanceRequestNo: string | null
  isOpen: boolean
}

export interface ProductionEntry {
  uid: string
  deletedAt?: string | null
  docNo: string
  entryDate: string
  workOrderNo: string
  productionOrderNo: string
  operationName: string
  machine: string
  operator: string
  shift: Shift
  startedAt: string
  endedAt: string
  goodQty: number
  scrapQty: number
  reworkQty: number
  uom: string
  batchNo: string | null
  cycleSeconds: number
  remarks?: string
  postedBy: string
}

export type WipState = 'READY' | 'IN_PROCESS' | 'QUALITY_HOLD' | 'WAITING' | 'TRANSFERRED' | 'COMPLETED'

export interface WipLot {
  uid: string
  deletedAt?: string | null
  lotNo: string
  productionOrderNo: string
  itemCode: string
  itemName: string
  batchNo: string
  quantity: number
  uom: string
  currentOperation: string
  nextOperation: string | null
  workCentre: string
  location: string
  machine: string | null
  operator: string | null
  state: WipState
  waitingMinutes: number
  enteredAt: string
  value: number
}

export type ScrapReason =
  | 'WELDING_DEFECT'
  | 'LEAK_FAILURE'
  | 'DENT'
  | 'SCRATCH'
  | 'PAINT_DEFECT'
  | 'PRINTING_ERROR'
  | 'DIMENSION_FAILURE'
  | 'MATERIAL_DEFECT'

export type ScrapAction = 'SCRAP' | 'REWORK' | 'HOLD' | 'DISPOSE'

export interface ScrapRecord {
  uid: string
  deletedAt?: string | null
  docNo: string
  entryDate: string
  workOrderNo: string
  productionOrderNo: string
  operationName: string
  itemCode: string
  itemName: string
  batchNo: string | null
  quantity: number
  uom: string
  reason: ScrapReason
  action: ScrapAction
  machine: string
  operator: string
  shift: Shift
  unitCost: number
  detectedBy: string
  correctiveAction: string | null
  status: 'OPEN' | 'ACTIONED' | 'CLOSED'
}

export type ReworkStatus = 'RAISED' | 'IN_REPAIR' | 'INSPECTION' | 'ACCEPTED' | 'REJECTED'

export interface ReworkOrder {
  uid: string
  deletedAt?: string | null
  docNo: string
  raisedOn: string
  sourceWorkOrderNo: string
  productionOrderNo: string
  itemCode: string
  itemName: string
  batchNo: string | null
  quantity: number
  repairedQty: number
  scrappedQty: number
  uom: string
  defect: ScrapReason
  operation: string
  assignedTo: string | null
  status: ReworkStatus
  raisedBy: string
  inspectionNo: string | null
  costPerUnit: number
  remarks?: string
}

export interface ShiftLog {
  uid: string
  deletedAt?: string | null
  logDate: string
  shift: Shift
  line: string
  supervisor: string
  targetQty: number
  actualQty: number
  scrapQty: number
  reworkQty: number
  manpowerPlanned: number
  manpowerPresent: number
  runMinutes: number
  downMinutes: number
  handoverNotes: string
  status: 'OPEN' | 'CLOSED'
}

export interface OperatorStat {
  uid: string
  deletedAt?: string | null
  employeeCode: string
  name: string
  skill: string
  certifiedFor: string[]
  workCentre: string
  shift: Shift
  present: boolean
  /** Today's performance. */
  producedQty: number
  scrapQty: number
  standardMinutes: number
  actualMinutes: number
  attendanceDays: number
  incentiveEligible: boolean
}

export interface OeePoint {
  period: string
  availability: number
  performance: number
  quality: number
  oee: number
}

export interface HourlyOutput {
  hour: string
  planned: number
  actual: number
  scrap: number
}

/** One row per operation in the traveller card / genealogy chain. */
export interface TravellerStep {
  sequence: number
  operationName: string
  workCentre: string
  machine: string | null
  operator: string | null
  tool: string | null
  startedAt: string | null
  completedAt: string | null
  inputQty: number
  outputQty: number
  scrapQty: number
  qcResult: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_REQUIRED'
  inputBatches: string[]
}

export interface WorkInstruction {
  uid: string
  deletedAt?: string | null
  code: string
  operationCode: string
  operationName: string
  itemCode: string
  revision: string
  effectiveFrom: string
  approvedBy: string
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED'
  safetyNotes: string[]
  steps: string[]
  machineSettings: { label: string; value: string }[]
  qualityCheckpoints: { parameter: string; specification: string; frequency: string }[]
  attachments: { name: string; kind: 'SOP' | 'DRAWING' | 'IMAGE' | 'VIDEO' }[]
}
