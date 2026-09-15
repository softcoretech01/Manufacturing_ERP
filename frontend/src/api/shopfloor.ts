/**
 * Reading the shop floor.
 *
 * Everything here is a projection of rows the floor has already written. None
 * of it is computed in the browser, and none of it is seeded: an empty floor
 * returns empty lists, which is the correct answer rather than a gap to fill
 * with samples.
 *
 * Several screens want a figure this system does not yet keep — machine
 * availability, downtime reasons, labour cost. Those arrive in `unavailable`
 * with the reason attached, so a screen can say why a tile is blank instead of
 * showing a zero that reads like a measurement.
 */

import { api } from './client'

export interface UnavailableMetric {
  metric: string
  reason: string
}

export interface EntryDefect {
  defectCode: string
  defectName: string
  qty: number
  reason: string
}

export interface ProductionEntryRow {
  uid: string
  docNo: string
  workOrderDocNo: string
  orderDocNo: string
  productCode: string
  seq: number
  operationCode: string
  operationName: string
  workCentreCode: string
  machineCode: string | null
  operatorCode: string | null
  operatorName: string | null
  shiftCode: string | null
  businessDate: string | null
  startedAt: string | null
  endedAt: string | null
  goodQty: number
  scrapQty: number
  reworkQty: number
  uom: string
  setupMinutes: number
  runMinutes: number
  downMinutes: number
  batchNo: string
  status: string
  postedAt: string | null
  isReversal: boolean
  reversalOfDocNo: string | null
  remarks: string
  defects: EntryDefect[]
}

export interface ScrapRow {
  uid: string
  docNo: string
  source: string
  businessDate: string | null
  orderDocNo: string
  workOrderDocNo: string
  entryDocNo: string
  seq: number
  operationName: string
  workCentreCode: string
  machineCode: string | null
  operatorName: string | null
  shiftCode: string | null
  itemCode: string
  itemName: string
  uom: string
  batchNo: string
  qty: number
  unitCost: number
  value: number
  defectCode: string
  defectName: string
  reason: string
  disposition: string
  decisionNote: string
  status: string
  warehouseCode: string
  inventoryDocNo: string
  remarks: string
}

export interface ScrapResult {
  records: ScrapRow[]
  totals: { documents: number; qty: number; value: number }
  byReason: { reason: string; qty: number; value: number; count: number }[]
}

export interface WipLotRow {
  uid: string
  docNo: string
  orderDocNo: string
  productCode: string
  productName: string
  seq: number
  operationCode: string
  operationName: string
  workCentreCode: string
  machineCode: string | null
  batchNo: string
  uom: string
  inputQty: number
  producedQty: number
  scrapQty: number
  reworkQty: number
  heldQty: number
  state: string
  startedAt: string | null
  /** Null until the operation has actually started — there is no clock before that. */
  ageHours: number | null
  qcResult: string
}

export interface WipResult {
  lots: WipLotRow[]
  byWorkCentre: { workCentreCode: string; lots: number; qty: number }[]
  totals: { lots: number; qty: number }
}

export interface TravellerStep {
  uid: string
  docNo: string
  seq: number
  operationCode: string
  operationName: string
  workCentreCode: string
  machineCode: string | null
  operatorName: string | null
  shiftCode: string | null
  status: string
  qcCheckpoint: boolean
  qcResult: string
  uom: string
  inputQty: number
  producedQty: number
  scrapQty: number
  reworkQty: number
  setupMinutesStd: number
  runMinutesStd: number
  setupMinutesAct: number
  runMinutesAct: number
  batchNo: string
  startedAt: string | null
  completedAt: string | null
  entries: {
    docNo: string
    businessDate: string | null
    operatorName: string | null
    shiftCode: string | null
    goodQty: number
    scrapQty: number
    reworkQty: number
    isReversal: boolean
  }[]
}

export interface TravellerResult {
  order: {
    uid: string
    docNo: string
    productCode: string
    productName: string
    uom: string
    qty: number
    producedQty: number
    rejectedQty: number
    status: string
    plant: string
    warehouse: string
    bomDocNo: string
    bomRevision: number
    routingDocNo: string
    routingRevision: number
    plannedStart: string | null
    plannedFinish: string | null
  }
  steps: TravellerStep[]
  components: {
    itemCode: string
    itemName: string
    uom: string
    requiredQty: number
    reservedQty: number
    issuedQty: number
  }[]
}

export interface DashboardResult {
  date: string
  orders: { status: string; count: number; qty: number }[]
  workOrders: { status: string; count: number }[]
  today: {
    goodQty: number
    scrapQty: number
    reworkQty: number
    entries: number
    /** Null when nothing was booked — a yield of zero would be a lie. */
    yieldPct: number | null
  }
  trend: { date: string | null; goodQty: number; scrapQty: number }[]
  byWorkCentre: {
    workCentreCode: string
    goodQty: number
    scrapQty: number
    entries: number
    yieldPct: number | null
  }[]
  wip: { lots: number; qty: number }
  unavailable: UnavailableMetric[]
}


export interface ProductionOrderRow {
  uid: string
  docNo: string
  orderType: string
  productCode: string
  productName: string
  uom: string
  qty: number
  producedQty: number
  rejectedQty: number
  status: string
  priority: string
  plant: string
  warehouse: string
  bomDocNo: string
  bomRevision: number
  routingDocNo: string
  routingRevision: number
  estimatedUnitCost: number
  plannedStart: string | null
  plannedFinish: string | null
  remarks: string
  operations: number
  operationsDone: number
  /** Good quantity off the last operation — what has genuinely been made. */
  completedQty: number
  released: boolean
}

export interface ReadinessLine {
  itemCode: string
  itemName: string
  uom: string
  requiredQty: number
  reservedQty: number
  issuedQty: number
  outstandingQty: number
  /** False means the component has no inventory item at all, not merely no stock. */
  inInventoryMaster: boolean
  onHandQty: number
  freeQty: number
  shortQty: number
  covered: boolean
}

export interface ReadinessResult {
  orderDocNo: string
  status: string
  components: ReadinessLine[]
  material: {
    answerable: boolean
    ready: boolean
    missingFromInventory: string[]
    short: { itemCode: string; shortQty: number; uom: string }[]
  }
  /** Checks a shop floor normally makes that this system holds no model for. */
  unknown: { check: string; reason: string }[]
}


export interface EffectivenessRow {
  workCentreCode: string
  entries: number
  goodQty: number
  scrapQty: number
  reworkQty: number
  runMinutes: number
  downMinutes: number
  standardMinutes: number
  /** Good over everything booked. A measurement. */
  qualityPct: number | null
  /** Standard time for the booked output over the time it actually took. */
  performancePct: number | null
  /** Always null: running time over planned time cannot be sourced. */
  availabilityPct: number | null
  /** Always null: OEE needs all three factors. */
  oeePct: number | null
}

export interface EffectivenessResult {
  from: string | null
  workCentres: EffectivenessRow[]
  overall: {
    qualityPct: number | null
    performancePct: number | null
    availabilityPct: number | null
    oeePct: number | null
    goodQty: number
    runMinutes: number
    standardMinutes: number
  }
  cannotCompute: { factor: string; reason: string; needs: string }[]
}


export interface OutputByRow {
  key: string
  operatorName: string | null
  goodQty: number
  scrapQty: number
  reworkQty: number
  runMinutes: number
  downMinutes: number
  entries: number
  firstBooked: string | null
  lastBooked: string | null
  yieldPct: number | null
}

export interface OutputByResult {
  dimension: string
  rows: OutputByRow[]
  unavailable: UnavailableMetric[]
}


export interface IntegrityResult {
  /** Work orders whose totals do not match the entries behind them. */
  quantitiesWithoutEntries: {
    docNo: string
    orderDocNo: string
    seq: number
    operationName: string
    status: string
    workOrderProduced: number
    workOrderScrap: number
    entriesGood: number
    entriesScrap: number
    entries: number
    goodDifference: number
    scrapDifference: number
  }[]
  overIssuedComponents: {
    orderDocNo: string
    itemCode: string
    requiredQty: number
    issuedQty: number
    excessQty: number
  }[]
  componentsNotInInventory: { orderDocNo: string; itemCode: string }[]
  clean: boolean
}

export const shopFloorApi = {
  /** Where the floor's own figures disagree with the entries behind them. */
  integrity: () => api.get<IntegrityResult>('/production/integrity'),

  /** Booked output grouped by shift or by operator. */
  outputBy: (dimension: 'shift' | 'operator', fromDate?: string) =>
    api.get<OutputByResult>(`/production/output-by/${dimension}`, fromDate ? { fromDate } : undefined),

  /** Quality and performance per work centre, with availability named absent. */
  effectiveness: (fromDate?: string) =>
    api.get<EffectivenessResult>('/production/effectiveness', fromDate ? { fromDate } : undefined),

  orders: (status?: string) =>
    api.get<ProductionOrderRow[]>('/production/orders', status ? { status } : undefined),

  /** Material coverage for a release decision, plus what cannot be checked. */
  readiness: (orderUid: string) =>
    api.get<ReadinessResult>(`/production/orders/${orderUid}/readiness`),

  dashboard: (on?: string) => api.get<DashboardResult>('/production/dashboard', on ? { on } : undefined),

  entries: (params?: {
    orderDocNo?: string
    workOrderDocNo?: string
    workCentre?: string
    shift?: string
    fromDate?: string
    toDate?: string
    limit?: number
  }) => api.get<ProductionEntryRow[]>('/production/entries', params),

  scrap: (params?: {
    orderDocNo?: string
    workCentre?: string
    disposition?: string
    fromDate?: string
    toDate?: string
    limit?: number
  }) => api.get<ScrapResult>('/production/scrap', params),

  wip: (workCentre?: string) =>
    api.get<WipResult>('/production/wip', workCentre ? { workCentre } : undefined),

  /** One order's route card. The document number goes in the path, slashes and all. */
  traveller: (orderDocNo: string) =>
    api.get<TravellerResult>(`/production/traveller/${orderDocNo}`),
}
