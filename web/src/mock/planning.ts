/**
 * Production planning seed data.
 *
 * The demand is deliberately a little more than the plant can comfortably take,
 * because a planning module that only ever shows a green board teaches nobody
 * anything. There are firm export orders competing with domestic forecast, an
 * overdue sales order that MRP cannot cover inside its lead time, a sipper cap
 * on a 21-day lead that is already too late to order, a new SKU with no BOM
 * yet, and a manual assembly bay running at 93% in its worst week — tight
 * enough that a single extra order tips it over.
 */

import { daysAgo, daysAhead } from './data'
import { bucketStarts } from '@/lib/planFlow'
import type {
  CalendarDay,
  DemandLine,
  ForecastLine,
  MpsLine,
  PlanningPolicy,
  ProductionOrder,
} from '@/types/planning'

const d = (n: number) => daysAgo(n).slice(0, 10)
const ahead = (n: number) => daysAhead(n).slice(0, 10)

/** The same weekly grid every planning screen reads. */
export const HORIZON = 12
export const STARTS = bucketStarts(HORIZON)

/* ═══════════════════════════ Demand ═══════════════════════════ */

let demSeq = 0
const dem = (
  docNo: string,
  source: DemandLine['source'],
  productCode: string,
  productName: string,
  qty: number,
  requiredOn: string,
  customer: string,
  o: Partial<DemandLine> = {},
): DemandLine => ({
  uid: `dem-${String(++demSeq).padStart(2, '0')}`,
  docNo,
  source,
  productCode,
  productName,
  uom: 'NOS',
  qty,
  qtyPlanned: 0,
  requiredOn,
  customer,
  market: 'DOMESTIC',
  isFirm: source === 'SALES_ORDER' || source === 'EXPORT_CONTRACT',
  status: 'OPEN',
  remarks: '',
  createdAt: daysAgo(10),
  version: 1,
  ...o,
})

export const demandLines: DemandLine[] = [
  dem('SO/26-27/00512', 'SALES_ORDER', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 4_800, STARTS[1], 'Metro Retail Chain Pvt Ltd', { remarks: 'Festive replenishment. Penalty clause on late delivery.' }),
  dem('SO/26-27/00518', 'SALES_ORDER', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 2_400, STARTS[3], 'Bharat E-commerce Ventures'),
  dem('SO/26-27/00521', 'SALES_ORDER', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 1_800, STARTS[2], 'Trek Outdoors India'),
  dem('EXP/26-27/00044', 'EXPORT_CONTRACT', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 6_000, STARTS[4], 'Nordwind Handels GmbH', { market: 'EXPORT', remarks: 'SS 316 body per ECN/26-27/0002 once approved. Ships from Chennai port.' }),
  dem('EXP/26-27/00046', 'EXPORT_CONTRACT', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 2_500, STARTS[5], 'Nordwind Handels GmbH', { market: 'EXPORT' }),
  dem('SO/26-27/00498', 'SALES_ORDER', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 900, d(4), 'Trek Outdoors India', { remarks: 'Overdue — customer has agreed to a revised date, not yet confirmed in writing.' }),
  dem('BLK/26-27/0009', 'BLANKET', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 3_000, STARTS[6], 'Metro Retail Chain Pvt Ltd', { isFirm: false, remarks: 'Blanket call-off, quantity confirmed 30 days ahead.' }),
  dem('CS/26-27/00121', 'CUSTOMER_SCHEDULE', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 1_500, STARTS[8], 'Bharat E-commerce Ventures', { isFirm: false, market: 'OEM' }),
  dem('FC/26-27/W07', 'FORECAST', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 2_600, STARTS[7], 'Domestic channel', { isFirm: false }),
  dem('FC/26-27/W09', 'FORECAST', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 2_600, STARTS[9], 'Domestic channel', { isFirm: false }),
  dem('FC/26-27/W10', 'FORECAST', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 1_200, STARTS[10], 'Domestic channel', { isFirm: false }),
  dem('SO/26-27/00524', 'SALES_ORDER', 'FG-SS-500-BLU', 'Vacuum Flask 500 ml — Ocean Blue', 1_200, STARTS[6], 'Metro Retail Chain Pvt Ltd', { remarks: 'New SKU — depends on the 500 ml BOM and routing being approved.' }),
]

/* ═══════════════════════════ Forecast ═══════════════════════════ */

const month = (offset: number) => {
  const dt = new Date()
  dt.setMonth(dt.getMonth() + offset, 1)
  return dt.toISOString().slice(0, 7)
}

let fcSeq = 0
const fc = (
  productCode: string,
  productName: string,
  period: string,
  method: ForecastLine['method'],
  baseQty: number,
  factorPct: number,
  o: Partial<ForecastLine> = {},
): ForecastLine => {
  const forecastQty = Math.round(baseQty * (1 + factorPct / 100))
  return {
    uid: `fcl-${String(++fcSeq).padStart(2, '0')}`,
    docNo: `FC/26-27/${String(fcSeq).padStart(4, '0')}`,
    productCode,
    productName,
    uom: 'NOS',
    period,
    method,
    baseQty,
    factorPct,
    forecastQty,
    confidencePct: 75,
    actualQty: null,
    market: 'DOMESTIC',
    version: 1,
    status: 'APPROVED',
    remarks: '',
    createdBy: 'A. Lakshmi',
    createdAt: daysAgo(40),
    ...o,
  }
}

export const forecastLines: ForecastLine[] = [
  // Closed months, so forecast accuracy has something to measure.
  fc('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', month(-3), 'HISTORICAL_AVERAGE', 11_000, 5, { actualQty: 12_140, confidencePct: 80 }),
  fc('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', month(-2), 'SEASONAL', 11_500, 12, { actualQty: 11_600, confidencePct: 78 }),
  fc('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', month(-1), 'GROWTH_PERCENT', 12_000, 8, { actualQty: 14_820, confidencePct: 72, remarks: 'Under-forecast — the festive pull started two weeks early.' }),
  fc('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', month(-2), 'HISTORICAL_AVERAGE', 4_200, 0, { actualQty: 3_960, confidencePct: 70 }),
  fc('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', month(-1), 'SEASONAL', 4_400, 6, { actualQty: 4_120, confidencePct: 70 }),
  // Open months.
  fc('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', month(0), 'SEASONAL', 13_000, 15, { confidencePct: 82 }),
  fc('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', month(1), 'SEASONAL', 13_000, 22, { confidencePct: 68, remarks: 'Diwali peak. Confidence is low; watch the weekly call-offs.' }),
  fc('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', month(2), 'GROWTH_PERCENT', 13_500, -10, { confidencePct: 74 }),
  fc('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', month(0), 'HISTORICAL_AVERAGE', 4_300, 4, { confidencePct: 75 }),
  fc('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', month(1), 'SEASONAL', 4_400, 18, { confidencePct: 65 }),
  fc('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', month(1), 'MANUAL', 5_000, 0, { market: 'EXPORT', confidencePct: 90, remarks: 'Nordwind contract volume, confirmed by contract not by model.' }),
  fc('FG-SS-500-BLU', 'Vacuum Flask 500 ml — Ocean Blue', month(1), 'MANUAL', 2_000, 0, { confidencePct: 45, status: 'DRAFT', remarks: 'New SKU launch estimate. No history to base it on.' }),
]

/* ═══════════════════════════ Master production schedule ═══════════════════════════ */

let mpsSeq = 0
const mps = (
  productCode: string,
  productName: string,
  bucket: number,
  demandQty: number,
  plannedQty: number,
  o: Partial<MpsLine> = {},
): MpsLine => ({
  uid: `mps-${String(++mpsSeq).padStart(2, '0')}`,
  docNo: 'MPS/26-27/0001',
  productCode,
  productName,
  uom: 'NOS',
  bucket,
  bucketStart: STARTS[bucket],
  demandQty,
  plannedQty,
  isFirm: bucket <= 1,
  status: 'APPROVED',
  remarks: '',
  createdBy: 'A. Lakshmi',
  createdAt: daysAgo(6),
  version: 1,
  ...o,
})

/**
 * The planner has levelled the 750 ml demand across the horizon rather than
 * chasing the weekly peaks — the reason an MPS exists at all.
 */
export const mpsLines: MpsLine[] = [
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 0, 0, 2_000),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 1, 4_800, 3_500),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 2, 0, 3_500),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 3, 2_400, 3_500),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 4, 6_000, 3_500),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 5, 0, 3_000),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 6, 3_000, 3_000),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 7, 2_600, 2_500),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 8, 1_500, 2_500),
  mps('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 9, 2_600, 2_500),

  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 0, 900, 1_200),
  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 1, 0, 1_200),
  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 2, 1_800, 1_200),
  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 3, 0, 1_000),
  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 4, 0, 1_000),
  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 5, 2_500, 1_200),
  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 6, 0, 1_000),
  mps('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 10, 1_200, 1_000),
]

/* ═══════════════════════════ Planning policy ═══════════════════════════ */

let polSeq = 0
const pol = (
  itemCode: string,
  itemName: string,
  lotSizeRule: PlanningPolicy['lotSizeRule'],
  minOrderQty: number,
  orderMultiple: number,
  o: Partial<PlanningPolicy> = {},
): PlanningPolicy => ({
  uid: `pol-${String(++polSeq).padStart(2, '0')}`,
  itemCode,
  itemName,
  lotSizeRule,
  minOrderQty,
  orderMultiple,
  safetyStockOverride: null,
  leadTimeOverride: null,
  frozenDays: 7,
  isActive: true,
  version: 1,
  ...o,
})

export const planningPolicies: PlanningPolicy[] = [
  pol('RM-SS304-050', 'SS 304 Coil 0.50 mm × 400 mm', 'MIN_ORDER_QTY', 2_000, 500, { frozenDays: 21, safetyStockOverride: 3_200 }),
  pol('RM-SS316-060', 'SS 316 Coil 0.60 mm × 400 mm', 'MIN_ORDER_QTY', 2_000, 500, { frozenDays: 21 }),
  pol('CMP-LID-SCR-SS', 'Screw Cap — Stainless with Silicone Seal', 'MIN_ORDER_QTY', 5_000, 500, { frozenDays: 14 }),
  pol('CMP-DISC-BOT-73', 'Bottom Disc — SS 304, 73 mm', 'MIN_ORDER_QTY', 10_000, 1_000, { frozenDays: 14 }),
  pol('CMP-SEAL-SIL', 'Silicone Seal Ring — Food Grade', 'MIN_ORDER_QTY', 10_000, 1_000, { frozenDays: 14 }),
  pol('CMP-INS-THRD', 'Thread Insert — Polypropylene', 'MIN_ORDER_QTY', 10_000, 1_000, { frozenDays: 12 }),
  pol('CMP-LID-SIPPER', 'Sipper Cap Assembly — Trek', 'MIN_ORDER_QTY', 2_000, 500, { frozenDays: 21 }),
  pol('PKG-CTN-24', 'Corrugated Carton — 24 units', 'MIN_ORDER_QTY', 500, 500, { frozenDays: 9 }),
  pol('PKG-BOX-IND', 'Individual Gift Box — Printed', 'MIN_ORDER_QTY', 5_000, 1_000, { frozenDays: 12 }),
  pol('PKG-LBL-BAR', 'Barcode Label — EAN-13', 'MIN_ORDER_QTY', 10_000, 5_000, { frozenDays: 7 }),
  pol('PKG-MAN-USR', 'User Manual & Warranty Card', 'MIN_ORDER_QTY', 5_000, 1_000, { frozenDays: 10 }),
  pol('CON-PWD-BLK', 'Powder Coating — Matte Black RAL 9005', 'FIXED_ORDER_QTY', 200, 0, { frozenDays: 10 }),
  pol('CON-GAS-ARG', 'Argon Gas — Welding Grade', 'FIXED_ORDER_QTY', 70, 0, { frozenDays: 7 }),
  pol('SF-BODY-750', 'Bottle Body Shell — 750 ml', 'MIN_ORDER_QTY', 1_000, 100, { frozenDays: 5 }),
  pol('SF-BODY-1000', 'Bottle Body Shell — 1000 ml', 'MIN_ORDER_QTY', 800, 100, { frozenDays: 5 }),
  pol('SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 'MIN_ORDER_QTY', 2_000, 500, { frozenDays: 4 }),
  pol('FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 'LOT_FOR_LOT', 0, 0, { frozenDays: 7 }),
  pol('FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 'LOT_FOR_LOT', 0, 0, { frozenDays: 7 }),
]

/* ═══════════════════════════ Production orders ═══════════════════════════ */

let poSeq = 0
const prod = (
  docNo: string,
  productCode: string,
  productName: string,
  qty: number,
  status: ProductionOrder['status'],
  plannedStart: string,
  plannedFinish: string,
  o: Partial<ProductionOrder> = {},
): ProductionOrder => ({
  uid: `pro-${String(++poSeq).padStart(2, '0')}`,
  docNo,
  orderType: 'STANDARD',
  productCode,
  productName,
  uom: 'NOS',
  qty,
  producedQty: 0,
  rejectedQty: 0,
  plant: 'Chennai — Unit 1',
  warehouse: 'Finished Goods Store',
  priority: 'NORMAL',
  plannedStart,
  plannedFinish,
  status,
  bomDocNo: '',
  bomRevision: 0,
  routingDocNo: '',
  routingRevision: 0,
  components: [],
  operations: [],
  demandRefs: [],
  estimatedUnitCost: 0,
  remarks: '',
  createdBy: 'A. Lakshmi',
  createdAt: daysAgo(5),
  version: 1,
  ...o,
})

/**
 * Two orders already on the floor and one just released, so the MRP run has
 * scheduled receipts to net against rather than starting from a blank plant.
 */
export const productionOrders: ProductionOrder[] = [
  prod('PRD/26-27/0128', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 2_000, 'IN_PRODUCTION', d(3), ahead(2), {
    producedQty: 1_240,
    rejectedQty: 18,
    priority: 'HIGH',
    bomDocNo: 'BOM/26-27/0001',
    bomRevision: 3,
    routingDocNo: 'RTG/26-27/0001',
    routingRevision: 3,
    demandRefs: ['SO/26-27/00512'],
    estimatedUnitCost: 200.77,
    remarks: 'Running on line A. Coating booth was down for four hours on day two.',
  }),
  prod('PRD/26-27/0129', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', 6_000, 'MATERIAL_ISSUED', d(1), ahead(5), {
    warehouse: 'Work in Progress Store',
    bomDocNo: 'BOM/26-27/0002',
    bomRevision: 2,
    routingDocNo: 'RTG/26-27/0002',
    routingRevision: 2,
    estimatedUnitCost: 104.29,
  }),
  prod('PRD/26-27/0130', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 1_200, 'RELEASED', ahead(1), ahead(8), {
    bomDocNo: 'BOM/26-27/0005',
    bomRevision: 1,
    routingDocNo: 'RTG/26-27/0005',
    routingRevision: 1,
    demandRefs: ['SO/26-27/00521', 'SO/26-27/00498'],
    estimatedUnitCost: 297.48,
    remarks: 'Covers the overdue Trek order plus the week-3 call-off.',
  }),
  prod('PRD/26-27/0126', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 3_000, 'COMPLETED', d(18), d(9), {
    producedQty: 2_982,
    rejectedQty: 18,
    bomDocNo: 'BOM/26-27/0001',
    bomRevision: 3,
    routingDocNo: 'RTG/26-27/0001',
    routingRevision: 3,
    estimatedUnitCost: 199.9,
    remarks: 'Closed with a 0.6% reject rate, within the 1% allowance.',
  }),
]

/* ═══════════════════════════ Production calendar ═══════════════════════════ */

const cal = (date: string, dayType: CalendarDay['dayType'], hours: number, shifts: number, reason = ''): CalendarDay => ({
  uid: `cal-${date}`,
  date,
  dayType,
  hours,
  shifts,
  reason,
  plant: 'Chennai — Unit 1',
  version: 1,
})

/**
 * Only the exceptions are stored. Any date not listed follows the standing rule
 * — Monday to Saturday, two shifts, Sunday off — which is how a calendar stays
 * maintainable instead of needing 365 rows a year.
 */
export const calendarDays: CalendarDay[] = [
  cal(ahead(9), 'HOLIDAY', 0, 0, 'Independence Day'),
  cal(ahead(23), 'HOLIDAY', 0, 0, 'Ganesh Chaturthi'),
  cal(ahead(30), 'SHUTDOWN', 0, 0, 'Annual preventive maintenance shutdown'),
  cal(ahead(31), 'SHUTDOWN', 0, 0, 'Annual preventive maintenance shutdown'),
  cal(ahead(32), 'SHUTDOWN', 0, 0, 'Annual preventive maintenance shutdown'),
  cal(ahead(12), 'OVERTIME', 24, 3, 'Third shift added to recover the export order'),
  cal(ahead(13), 'OVERTIME', 24, 3, 'Third shift added to recover the export order'),
  cal(ahead(14), 'WORKING', 16, 2, 'Sunday worked to recover the coating booth downtime'),
  cal(ahead(51), 'HOLIDAY', 0, 0, 'Diwali'),
  cal(ahead(52), 'HOLIDAY', 0, 0, 'Diwali'),
]

/* ═══════════════════════════ Dashboard trend ═══════════════════════════ */

/** Plan against actual output, last eight weeks. */
export const planVsActual = [
  { week: 'W-8', planned: 4_200, actual: 4_050, onTimePct: 94 },
  { week: 'W-7', planned: 4_200, actual: 4_310, onTimePct: 97 },
  { week: 'W-6', planned: 4_500, actual: 3_980, onTimePct: 88 },
  { week: 'W-5', planned: 4_500, actual: 4_460, onTimePct: 96 },
  { week: 'W-4', planned: 4_800, actual: 4_120, onTimePct: 86 },
  { week: 'W-3', planned: 4_800, actual: 4_740, onTimePct: 93 },
  { week: 'W-2', planned: 5_000, actual: 5_020, onTimePct: 98 },
  { week: 'W-1', planned: 5_000, actual: 4_580, onTimePct: 91 },
]
