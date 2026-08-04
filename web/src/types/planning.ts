/**
 * Production Planning & MRP (Volume 7).
 *
 * The module that turns demand into a plan. Nothing here is authored twice:
 * structures come from engineering, stock from inventory, open orders from
 * procurement. What this module owns is the demand it is planning against, the
 * schedule it produces, and the orders that schedule becomes.
 */

/* ─────────────────────────── Demand ─────────────────────────── */

export type DemandSource = 'SALES_ORDER' | 'FORECAST' | 'BLANKET' | 'CUSTOMER_SCHEDULE' | 'EXPORT_CONTRACT' | 'SAFETY_STOCK'

/**
 * Ch 6 demand priority. A firm customer order outranks a forecast, so when
 * capacity or material is short it is the forecast that gives way.
 */
export const DEMAND_PRIORITY: Record<DemandSource, number> = {
  SALES_ORDER: 1,
  EXPORT_CONTRACT: 2,
  CUSTOMER_SCHEDULE: 3,
  BLANKET: 4,
  SAFETY_STOCK: 5,
  FORECAST: 6,
}

export interface DemandLine {
  uid: string
  docNo: string
  source: DemandSource
  productCode: string
  productName: string
  uom: string
  qty: number
  /** Quantity already covered by a firmed or released production order. */
  qtyPlanned: number
  requiredOn: string
  customer: string
  market: 'DOMESTIC' | 'EXPORT' | 'OEM'
  /** Firm demand is planned as-is; unfirm demand can be re-timed by the planner. */
  isFirm: boolean
  status: 'OPEN' | 'PLANNED' | 'CLOSED' | 'CANCELLED'
  remarks: string
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Forecast ─────────────────────────── */

export type ForecastMethod = 'MANUAL' | 'HISTORICAL_AVERAGE' | 'SEASONAL' | 'GROWTH_PERCENT'

export interface ForecastLine {
  uid: string
  docNo: string
  productCode: string
  productName: string
  uom: string
  /** ISO month the forecast covers, e.g. 2026-08. */
  period: string
  method: ForecastMethod
  /** Actual demand in the comparable prior period, used to derive the forecast. */
  baseQty: number
  /** Percentage applied to the base by the growth or seasonal method. */
  factorPct: number
  forecastQty: number
  /** Planner's confidence, 0–100. Low confidence is planned but flagged. */
  confidencePct: number
  /** Actual shipped in this period, once it is in the past. Null while open. */
  actualQty: number | null
  market: 'DOMESTIC' | 'EXPORT' | 'OEM'
  version: number
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED'
  remarks: string
  createdBy: string
  createdAt: string
  deletedAt?: string | null
}

/* ─────────────────────────── Master production schedule ────────────── */

export interface MpsLine {
  uid: string
  docNo: string
  productCode: string
  productName: string
  uom: string
  /** Bucket index into the planning horizon, 0 = the current week. */
  bucket: number
  bucketStart: string
  /** Demand landing in this bucket, from sales orders and forecast. */
  demandQty: number
  /** What the planner has committed to build. Drives MRP, not the demand. */
  plannedQty: number
  /** Firm bucket: MRP will not move or resize it. */
  isFirm: boolean
  status: 'DRAFT' | 'APPROVED' | 'RELEASED'
  remarks: string
  createdBy: string
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Planning policy ─────────────────────── */

export type LotSizeRule = 'LOT_FOR_LOT' | 'MIN_ORDER_QTY' | 'FIXED_ORDER_QTY'

/**
 * How MRP is allowed to size an order for an item. Without this, MRP proposes a
 * purchase of 47 kg of steel coil, which no mill will accept.
 */
export interface PlanningPolicy {
  uid: string
  itemCode: string
  itemName: string
  lotSizeRule: LotSizeRule
  minOrderQty: number
  /** Orders are rounded up to a multiple of this. Zero means no rounding. */
  orderMultiple: number
  /** Days of cover held above the net requirement. */
  safetyStockOverride: number | null
  leadTimeOverride: number | null
  /** Inside this many days the plan is frozen and MRP only raises an exception. */
  frozenDays: number
  isActive: boolean
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Production order ─────────────────────── */

export type ProductionOrderType = 'STANDARD' | 'BATCH' | 'TRIAL' | 'PROTOTYPE' | 'REWORK' | 'REPAIR' | 'SAMPLE' | 'URGENT'

export type ProductionOrderStatus =
  | 'PLANNED'
  | 'FIRM_PLANNED'
  | 'RELEASED'
  | 'MATERIAL_RESERVED'
  | 'MATERIAL_ISSUED'
  | 'IN_PRODUCTION'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED'

export interface WorkOrderOp {
  uid: string
  seq: number
  operationCode: string
  operationName: string
  workCentreCode: string
  machineCode: string
  operators: number
  skill: string
  toolCode: string | null
  qcCheckpoint: boolean
  setupMinutes: number
  runMinutes: number
  plannedStart: string
  plannedFinish: string
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
}

export interface OrderComponent {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  /** Quantity the BOM calls for at this order quantity, scrap included. */
  requiredQty: number
  reservedQty: number
  issuedQty: number
  availableAtPlanning: number
}

export interface ProductionOrder {
  uid: string
  docNo: string
  orderType: ProductionOrderType
  productCode: string
  productName: string
  uom: string
  qty: number
  producedQty: number
  rejectedQty: number
  plant: string
  warehouse: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  plannedStart: string
  plannedFinish: string
  status: ProductionOrderStatus
  bomDocNo: string
  bomRevision: number
  routingDocNo: string
  routingRevision: number
  components: OrderComponent[]
  operations: WorkOrderOp[]
  /** Demand this order was raised to satisfy. */
  demandRefs: string[]
  /** Estimated cost at release, from the engineering roll-up at that moment. */
  estimatedUnitCost: number
  remarks: string
  createdBy: string
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────────── Calendar ─────────────────────────── */

export type CalendarDayType = 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY' | 'SHUTDOWN' | 'OVERTIME'

export interface CalendarDay {
  uid: string
  date: string
  dayType: CalendarDayType
  /** Hours the plant is open. Zero on a non-working day. */
  hours: number
  shifts: number
  reason: string
  plant: string
  version: number
  deletedAt?: string | null
}
