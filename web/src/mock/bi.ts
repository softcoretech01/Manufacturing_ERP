/**
 * Analytics layer for the whole ERP.
 *
 * Almost nothing here is invented. The readings are computed from the same mock
 * data the operational screens render, so a figure on the CEO dashboard and the
 * figure on the shop-floor screen it came from are the same number by
 * construction rather than by luck. Where a genuine external series is needed —
 * a market price index, a sales pipeline that no module owns yet — it is stated
 * as such rather than dressed up as derived.
 */

import { daysAgo, daysAhead } from './data'
import { machines, downtimeEvents, oeeTrend, scrapRecords, shiftLogs, hourlyOutput, productionOrders } from './mes'
import { qualityTrend, complaints, ncrs, capas, supplierQuality } from './quality'
import { financeTrend, standardCostCards, actualCosts, budgetLines } from './finance'
import { stockPositions, ageingRows, nonMoving, valueTrend, accuracyTrend, reorderRows } from './inventory'
import { spendTrend, supplierSpend, priceTrend, purchaseOrders, evaluations } from './procurement'
import { assets, breakdowns, maintenanceTrend, utilityLogs, workOrders as maintWorkOrders } from './maintenance'
import {
  attendance,
  attendanceTrend,
  attritionTrend,
  hrEmployees,
  incentiveEarnings,
  labourCostLines,
  payrollTrend,
  productivityTrend,
  headcountByDepartment,
} from './hrms'
import { shipments, dispatchTrend, regionDispatch, transporterScores, salesReturns } from './dispatch'
import type {
  AccessLogEntry,
  AlertEvent,
  AlertRule,
  BiReport,
  DashboardAccess,
  DashboardDefinition,
  DataSource,
  FailureRisk,
  ForecastModel,
  Insight,
  KpiDefinition,
  KpiReading,
  MetricStatus,
  ParetoPoint,
  RegionSales,
} from '@/types/bi'

const d = (n: number) => daysAgo(n).slice(0, 10)
const at = (n: number, h = 0) => daysAgo(n, h)
const fwd = (n: number) => daysAhead(n).slice(0, 10)

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp
const last = <T,>(xs: T[]) => xs[xs.length - 1]

/* ═══════════════════ Derived figures from each module ════════════════════ */

/** Production — from the MES machines and their run/down minutes. */
const machinesWithTime = machines.filter((m) => m.plannedMinutes > 0)
const plannedMin = sum(machinesWithTime.map((m) => m.plannedMinutes))
const downMin = sum(machinesWithTime.map((m) => m.downMinutes))
const runMin = sum(machinesWithTime.map((m) => m.runMinutes))
const idealMin = sum(machinesWithTime.map((m) => (m.totalPieces * m.idealCycleSeconds) / 60))
const totalPieces = sum(machinesWithTime.map((m) => m.totalPieces))
const goodPieces = sum(machinesWithTime.map((m) => m.goodPieces))

const availabilityPct = plannedMin ? ((plannedMin - downMin) / plannedMin) * 100 : 0
const performancePct = runMin ? Math.min(100, (idealMin / runMin) * 100) : 0
const qualityPct = totalPieces ? (goodPieces / totalPieces) * 100 : 0
export const plantOee = round((availabilityPct * performancePct * qualityPct) / 10_000)

const plannedOutput = sum(hourlyOutput.map((h) => h.planned))
const actualOutput = sum(hourlyOutput.map((h) => h.actual))
export const productionAttainment = round(plannedOutput ? (actualOutput / plannedOutput) * 100 : 0)
export const bottlesToday = actualOutput

const scrapPieces = sum(scrapRecords.map((s) => s.quantity))
export const scrapPct = round(totalPieces ? (scrapPieces / totalPieces) * 100 : 0, 2)
export const downtimeHours = round(sum(downtimeEvents.map((e) => e.minutes)) / 60)

/** Quality — the latest month of the quality trend, plus open records. */
const q = last(qualityTrend)
const qPrev = qualityTrend[qualityTrend.length - 2]
export const fpyPct = q.fpyPct
export const internalPpm = q.internalPpm
export const openComplaints = complaints.filter((c) => c.status !== 'CLOSED').length
export const openNcrs = ncrs.filter((n) => n.status !== 'CLOSED').length
const closedCapas = capas.filter((c) => c.status === 'CLOSED' || c.status === 'VERIFICATION').length
export const capaClosurePct = round(capas.length ? (closedCapas / capas.length) * 100 : 0)

/** Finance — the latest month of the finance trend. */
const f = last(financeTrend)
const fPrev = financeTrend[financeTrend.length - 2]
export const revenue = f.revenue
export const profit = f.profit
export const grossMarginPct = round(f.revenue ? (f.profit / f.revenue) * 100 : 0)
export const cashFlow = f.cashIn - f.cashOut
const budgetTotal = sum(budgetLines.map((b) => b.budgetAmount))
// Committed is spend already promised against the budget — a purchase order
// raised counts against it long before the invoice arrives.
const budgetActual = sum(budgetLines.map((b) => b.committedAmount))
export const budgetVariancePct = round(budgetTotal ? ((budgetActual - budgetTotal) / budgetTotal) * 100 : 0)

/** Manufacturing cost per bottle — the standard against the actual. */
const stdCard = standardCostCards[0]
const actual = actualCosts[0]
export const standardCostPerBottle = stdCard ? round(stdCard.total, 2) : 0
export const actualCostPerBottle = actual && actual.outputQty
  ? round(
      (actual.actualMaterialQty * actual.actualMaterialRate +
        (actual.actualLabourHours ?? 0) * (actual.actualLabourRate ?? 0) +
        (actual.actualMachineHours ?? 0) * (actual.actualMachineRate ?? 0)) / actual.outputQty,
      2,
    )
  : standardCostPerBottle

/** Inventory — value, ageing and coverage. */
export const inventoryValue = Math.round(sum(stockPositions.map((p) => p.onHand * p.rate)))
const slowValue = Math.round(sum(nonMoving.map((n) => n.value)))
export const slowMovingPct = round(inventoryValue ? (slowValue / inventoryValue) * 100 : 0)
export const stockAccuracyPct = last(accuracyTrend)?.accuracyPct ?? 98.4
export const inventoryTurns = round(inventoryValue ? (revenue * 12) / (inventoryValue * 12) : 0, 2)
export const shortageCount = reorderRows.filter((r) => r.action !== 'COVERED').length

/** Procurement — spend, price movement and supplier performance. */
const sp = last(spendTrend)
export const purchaseValue = sp ? sp.spend : 0
const firstPrice = priceTrend[0]
const lastPrice = last(priceTrend)
export const coilPriceChangePct =
  firstPrice && lastPrice ? round(((lastPrice.ss304 - firstPrice.ss304) / firstPrice.ss304) * 100) : 0
const otifScores = evaluations.map((e) => e.deliveryScore).filter((n) => Number.isFinite(n) && n > 0)
export const supplierOtifPct = round(otifScores.length ? sum(otifScores) / otifScores.length : 92.4)

/** Maintenance — reliability and compliance. */
const m = last(maintenanceTrend)
export const mtbfHours = m?.mtbfHours ?? 412
export const mttrHours = m?.mttrHours ?? 3.8
export const pmCompliancePct = m?.pmCompliancePct ?? 61
export const openBreakdowns = breakdowns.filter((b) => b.status !== 'CLOSED').length
export const assetAvailabilityPct = round(
  assets.length ? (assets.filter((a) => a.status !== 'BREAKDOWN').length / assets.length) * 100 : 0,
)

/** Workforce — attendance, cost and productivity. */
const present = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
export const attendancePct = round(attendance.length ? (present.length / attendance.length) * 100 : 0)
export const absenteeismPct = round(
  attendance.length ? (attendance.filter((a) => a.status === 'ABSENT').length / attendance.length) * 100 : 0,
)
export const headcount = hrEmployees.filter((e) => e.status !== 'EXITED').length
export const attritionPct = round(
  headcount ? (sum(attritionTrend.map((x) => x.exited)) / headcount) * (12 / attritionTrend.length) * 100 : 0,
)
const payroll = last(payrollTrend)
export const payrollCost = payroll?.gross ?? 0
export const overtimeCost = payroll?.overtime ?? 0
export const incentiveCost = sum(incentiveEarnings.map((i) => i.earnedIncentive))
const labourTotal = sum(labourCostLines.map((l) => l.totalCost))
const labourUnits = sum(labourCostLines.map((l) => l.unitsProduced))
export const labourCostPerBottle = round(labourUnits ? labourTotal / labourUnits : 0, 2)
export const unitsPerOperator = last(productivityTrend)?.unitsPerOperator ?? 0

/** Dispatch & sales service level. */
const delivered = shipments.filter((sh) => sh.status === 'DELIVERED' || sh.status === 'CLOSED')
const onTime = delivered.filter((sh) => !sh.etaAt || !sh.deliveredAt || new Date(sh.deliveredAt) <= new Date(sh.etaAt))
export const onTimeDeliveryPct = round(delivered.length ? (onTime.length / delivered.length) * 100 : 0)
export const openShipments = shipments.filter((sh) => sh.status === 'IN_TRANSIT' || sh.status === 'DISPATCHED').length
export const exportRevenueShare = round(
  regionDispatch.length ? ((regionDispatch.find((r) => r.region === 'Export')?.value ?? 0) / sum(regionDispatch.map((r) => r.value))) * 100 : 0,
)
export const openReturns = salesReturns.filter((r) => r.status !== 'CLOSED' && r.status !== 'REJECTED').length

/* ══════════════════════════ KPI definitions ═════════════════════════════ */

export const kpiDefinitions: KpiDefinition[] = [
  // Financial
  { uid: 'kpi-01', code: 'FIN-REV', name: 'Revenue', module: 'FINANCE', category: 'FINANCIAL', formula: 'Sum of invoiced sales for the period, net of credit notes', unit: '₹', format: 'CURRENCY', direction: 'HIGHER_BETTER', target: 13_000_000, watchBandPct: 8, frequency: 'MONTHLY', ownerRole: 'CFO', ownerName: 'S. Ganapathy', responsibleDepartment: 'Finance', reviewCycle: 'Monthly board review', drillTo: '/finance', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-02', code: 'FIN-GM', name: 'Gross margin', module: 'FINANCE', category: 'FINANCIAL', formula: '(Revenue − cost of goods sold) ÷ revenue', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 22, watchBandPct: 10, frequency: 'MONTHLY', ownerRole: 'CFO', ownerName: 'S. Ganapathy', responsibleDepartment: 'Finance', reviewCycle: 'Monthly', drillTo: '/finance/costing', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-03', code: 'FIN-CF', name: 'Net cash flow', module: 'FINANCE', category: 'FINANCIAL', formula: 'Cash received less cash paid in the period', unit: '₹', format: 'CURRENCY', direction: 'HIGHER_BETTER', target: 1_500_000, watchBandPct: 20, frequency: 'MONTHLY', ownerRole: 'CFO', ownerName: 'S. Ganapathy', responsibleDepartment: 'Finance', reviewCycle: 'Weekly', drillTo: '/finance/banking', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-04', code: 'FIN-BUD', name: 'Budget variance', module: 'FINANCE', category: 'FINANCIAL', formula: '(Actual − budget) ÷ budget, year to date', unit: '%', format: 'PERCENT', direction: 'LOWER_BETTER', target: 0, watchBandPct: 5, frequency: 'MONTHLY', ownerRole: 'CFO', ownerName: 'S. Ganapathy', responsibleDepartment: 'Finance', reviewCycle: 'Monthly', drillTo: '/finance/budgets', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-05', code: 'FIN-CPB', name: 'Manufacturing cost per bottle', module: 'FINANCE', category: 'FINANCIAL', formula: 'Total works cost ÷ good bottles produced', unit: '₹', format: 'CURRENCY', direction: 'LOWER_BETTER', target: standardCostPerBottle || 92, watchBandPct: 5, frequency: 'MONTHLY', ownerRole: 'CFO', ownerName: 'S. Ganapathy', responsibleDepartment: 'Finance', reviewCycle: 'Monthly', drillTo: '/finance/costing', sensitivity: 'FINANCIAL', isActive: true },

  // Production
  { uid: 'kpi-06', code: 'PRD-OEE', name: 'Plant OEE', module: 'PRODUCTION', category: 'OPERATIONAL', formula: 'Availability × performance × quality, computed from machine totals rather than averaged', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 85, watchBandPct: 8, frequency: 'DAILY', ownerRole: 'Plant Head', ownerName: 'Meera Rajan', responsibleDepartment: 'Production', reviewCycle: 'Daily production meeting', drillTo: '/production/oee', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-07', code: 'PRD-ATT', name: 'Production attainment', module: 'PRODUCTION', category: 'OPERATIONAL', formula: 'Bottles made ÷ bottles planned for the day', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 100, watchBandPct: 6, frequency: 'DAILY', ownerRole: 'Production Manager', ownerName: 'Prakash Menon', responsibleDepartment: 'Production', reviewCycle: 'Daily', drillTo: '/production', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-08', code: 'PRD-OUT', name: 'Bottles produced', module: 'PRODUCTION', category: 'OPERATIONAL', formula: 'Good bottles confirmed against production entries', unit: 'bottles', format: 'NUMBER', direction: 'HIGHER_BETTER', target: 3_400, watchBandPct: 8, frequency: 'DAILY', ownerRole: 'Production Manager', ownerName: 'Prakash Menon', responsibleDepartment: 'Production', reviewCycle: 'Daily', drillTo: '/production/entry', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-09', code: 'PRD-DT', name: 'Downtime hours', module: 'PRODUCTION', category: 'OPERATIONAL', formula: 'Sum of recorded downtime minutes ÷ 60', unit: 'h', format: 'HOURS', direction: 'LOWER_BETTER', target: 4, watchBandPct: 25, frequency: 'DAILY', ownerRole: 'Maintenance Manager', ownerName: 'Suresh Babu', responsibleDepartment: 'Maintenance', reviewCycle: 'Daily', drillTo: '/production/downtime', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-10', code: 'PRD-SCRAP', name: 'Scrap rate', module: 'PRODUCTION', category: 'QUALITY', formula: 'Scrapped pieces ÷ total pieces produced', unit: '%', format: 'PERCENT', direction: 'LOWER_BETTER', target: 1.5, watchBandPct: 20, frequency: 'DAILY', ownerRole: 'Quality Manager', ownerName: 'Lakshmi Narayanan', responsibleDepartment: 'Quality', reviewCycle: 'Daily', drillTo: '/production/scrap', sensitivity: 'OPEN', isActive: true },

  // Quality
  { uid: 'kpi-11', code: 'QLT-FPY', name: 'First pass yield', module: 'QUALITY', category: 'QUALITY', formula: 'Units passing every operation first time ÷ units started', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 96, watchBandPct: 3, frequency: 'MONTHLY', ownerRole: 'Quality Manager', ownerName: 'Lakshmi Narayanan', responsibleDepartment: 'Quality', reviewCycle: 'Weekly', drillTo: '/quality', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-12', code: 'QLT-PPM', name: 'Internal defect PPM', module: 'QUALITY', category: 'QUALITY', formula: 'Defective parts per million produced', unit: 'ppm', format: 'PPM', direction: 'LOWER_BETTER', target: 3_000, watchBandPct: 20, frequency: 'MONTHLY', ownerRole: 'Quality Manager', ownerName: 'Lakshmi Narayanan', responsibleDepartment: 'Quality', reviewCycle: 'Monthly', drillTo: '/quality/ncr', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-13', code: 'QLT-CAPA', name: 'CAPA closure rate', module: 'QUALITY', category: 'QUALITY', formula: 'CAPAs closed or verified ÷ CAPAs raised', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 90, watchBandPct: 10, frequency: 'MONTHLY', ownerRole: 'Quality Manager', ownerName: 'Lakshmi Narayanan', responsibleDepartment: 'Quality', reviewCycle: 'Monthly', drillTo: '/quality/capa', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-14', code: 'QLT-COMP', name: 'Open customer complaints', module: 'QUALITY', category: 'CUSTOMER', formula: 'Complaints not yet closed', unit: 'open', format: 'NUMBER', direction: 'LOWER_BETTER', target: 2, watchBandPct: 50, frequency: 'WEEKLY', ownerRole: 'Quality Manager', ownerName: 'Lakshmi Narayanan', responsibleDepartment: 'Quality', reviewCycle: 'Weekly', drillTo: '/quality/complaints', sensitivity: 'OPEN', isActive: true },

  // Supply chain
  { uid: 'kpi-15', code: 'SCM-INV', name: 'Inventory value', module: 'INVENTORY', category: 'SUPPLY_CHAIN', formula: 'Valued stock on hand across all warehouses', unit: '₹', format: 'CURRENCY', direction: 'LOWER_BETTER', target: 18_000_000, watchBandPct: 12, frequency: 'MONTHLY', ownerRole: 'Warehouse Manager', ownerName: 'Divya Sundaram', responsibleDepartment: 'Stores', reviewCycle: 'Monthly', drillTo: '/inventory/valuation', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-16', code: 'SCM-SLOW', name: 'Slow-moving stock', module: 'INVENTORY', category: 'SUPPLY_CHAIN', formula: 'Value of stock with no movement in 90 days ÷ total stock value', unit: '%', format: 'PERCENT', direction: 'LOWER_BETTER', target: 8, watchBandPct: 25, frequency: 'MONTHLY', ownerRole: 'Warehouse Manager', ownerName: 'Divya Sundaram', responsibleDepartment: 'Stores', reviewCycle: 'Monthly', drillTo: '/inventory/ageing', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-17', code: 'SCM-ACC', name: 'Stock accuracy', module: 'INVENTORY', category: 'SUPPLY_CHAIN', formula: 'Bins counted exactly right ÷ bins counted', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 99, watchBandPct: 2, frequency: 'MONTHLY', ownerRole: 'Warehouse Manager', ownerName: 'Divya Sundaram', responsibleDepartment: 'Stores', reviewCycle: 'Monthly', drillTo: '/inventory/counting', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-18', code: 'SCM-OTIF', name: 'Supplier OTIF', module: 'PROCUREMENT', category: 'SUPPLY_CHAIN', formula: 'Purchase order lines delivered on time and in full ÷ all lines', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 95, watchBandPct: 5, frequency: 'MONTHLY', ownerRole: 'Purchase Manager', ownerName: 'Anand Krishnan', responsibleDepartment: 'Procurement', reviewCycle: 'Monthly', drillTo: '/procurement/evaluation', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-19', code: 'SCM-PRICE', name: 'Coil price movement', module: 'PROCUREMENT', category: 'SUPPLY_CHAIN', formula: 'Change in the weighted purchase rate of stainless coil since the start of the series', unit: '%', format: 'PERCENT', direction: 'LOWER_BETTER', target: 3, watchBandPct: 50, frequency: 'MONTHLY', ownerRole: 'Purchase Manager', ownerName: 'Anand Krishnan', responsibleDepartment: 'Procurement', reviewCycle: 'Monthly', drillTo: '/procurement/analytics', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-20', code: 'SCM-SHORT', name: 'Material shortages', module: 'INVENTORY', category: 'SUPPLY_CHAIN', formula: 'Items below reorder level with no cover on order', unit: 'items', format: 'NUMBER', direction: 'LOWER_BETTER', target: 0, watchBandPct: 100, frequency: 'DAILY', ownerRole: 'Purchase Manager', ownerName: 'Anand Krishnan', responsibleDepartment: 'Procurement', reviewCycle: 'Daily', drillTo: '/inventory/reorder', sensitivity: 'OPEN', isActive: true },

  // Customer & dispatch
  { uid: 'kpi-21', code: 'CUS-OTD', name: 'On-time delivery', module: 'DISPATCH', category: 'CUSTOMER', formula: 'Shipments delivered on or before the promised date ÷ shipments delivered', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 95, watchBandPct: 5, frequency: 'WEEKLY', ownerRole: 'Sales Manager', ownerName: 'Vignesh Kumar', responsibleDepartment: 'Dispatch', reviewCycle: 'Weekly', drillTo: '/dispatch/tracking', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-22', code: 'CUS-EXP', name: 'Export share of dispatch', module: 'DISPATCH', category: 'CUSTOMER', formula: 'Export dispatched value ÷ total dispatched value', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 35, watchBandPct: 15, frequency: 'MONTHLY', ownerRole: 'Sales Manager', ownerName: 'Vignesh Kumar', responsibleDepartment: 'Sales', reviewCycle: 'Monthly', drillTo: '/dispatch/transporters', sensitivity: 'FINANCIAL', isActive: true },
  { uid: 'kpi-23', code: 'CUS-RET', name: 'Open sales returns', module: 'DISPATCH', category: 'CUSTOMER', formula: 'Returns raised and not yet closed', unit: 'open', format: 'NUMBER', direction: 'LOWER_BETTER', target: 2, watchBandPct: 50, frequency: 'WEEKLY', ownerRole: 'Sales Manager', ownerName: 'Vignesh Kumar', responsibleDepartment: 'Dispatch', reviewCycle: 'Weekly', drillTo: '/dispatch/returns', sensitivity: 'OPEN', isActive: true },

  // Maintenance
  { uid: 'kpi-24', code: 'MNT-MTBF', name: 'MTBF', module: 'MAINTENANCE', category: 'OPERATIONAL', formula: 'Operating hours ÷ number of breakdowns', unit: 'h', format: 'HOURS', direction: 'HIGHER_BETTER', target: 500, watchBandPct: 15, frequency: 'MONTHLY', ownerRole: 'Maintenance Manager', ownerName: 'Suresh Babu', responsibleDepartment: 'Maintenance', reviewCycle: 'Monthly', drillTo: '/maintenance', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-25', code: 'MNT-MTTR', name: 'MTTR', module: 'MAINTENANCE', category: 'OPERATIONAL', formula: 'Total repair hours ÷ number of breakdowns', unit: 'h', format: 'HOURS', direction: 'LOWER_BETTER', target: 3, watchBandPct: 25, frequency: 'MONTHLY', ownerRole: 'Maintenance Manager', ownerName: 'Suresh Babu', responsibleDepartment: 'Maintenance', reviewCycle: 'Monthly', drillTo: '/maintenance', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-26', code: 'MNT-PM', name: 'PM compliance', module: 'MAINTENANCE', category: 'OPERATIONAL', formula: 'Preventive tasks done on schedule ÷ tasks due', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 95, watchBandPct: 10, frequency: 'MONTHLY', ownerRole: 'Maintenance Manager', ownerName: 'Suresh Babu', responsibleDepartment: 'Maintenance', reviewCycle: 'Monthly', drillTo: '/maintenance', sensitivity: 'OPEN', isActive: true },

  // People
  { uid: 'kpi-27', code: 'HR-ATT', name: 'Attendance', module: 'HRMS', category: 'PEOPLE', formula: 'People present ÷ people on roll for the day', unit: '%', format: 'PERCENT', direction: 'HIGHER_BETTER', target: 95, watchBandPct: 4, frequency: 'DAILY', ownerRole: 'HR Manager', ownerName: 'P. Vidya', responsibleDepartment: 'HR', reviewCycle: 'Daily', drillTo: '/hrms/attendance', sensitivity: 'OPEN', isActive: true },
  { uid: 'kpi-28', code: 'HR-ATTR', name: 'Attrition', module: 'HRMS', category: 'PEOPLE', formula: 'Exits over twelve months ÷ average headcount, annualised', unit: '%', format: 'PERCENT', direction: 'LOWER_BETTER', target: 12, watchBandPct: 25, frequency: 'MONTHLY', ownerRole: 'HR Manager', ownerName: 'P. Vidya', responsibleDepartment: 'HR', reviewCycle: 'Monthly', drillTo: '/hrms', sensitivity: 'PEOPLE', isActive: true },
  { uid: 'kpi-29', code: 'HR-LCB', name: 'Labour cost per bottle', module: 'HRMS', category: 'PEOPLE', formula: 'Allocated labour cost ÷ good bottles produced', unit: '₹', format: 'CURRENCY', direction: 'LOWER_BETTER', target: 3.2, watchBandPct: 10, frequency: 'MONTHLY', ownerRole: 'Plant Head', ownerName: 'Meera Rajan', responsibleDepartment: 'HR', reviewCycle: 'Monthly', drillTo: '/hrms/labour-cost', sensitivity: 'PEOPLE', isActive: true },
  { uid: 'kpi-30', code: 'HR-PROD', name: 'Units per operator', module: 'HRMS', category: 'PEOPLE', formula: 'Good units produced ÷ operators on the floor', unit: 'units', format: 'NUMBER', direction: 'HIGHER_BETTER', target: 1_150, watchBandPct: 8, frequency: 'MONTHLY', ownerRole: 'Plant Head', ownerName: 'Meera Rajan', responsibleDepartment: 'Production', reviewCycle: 'Monthly', drillTo: '/hrms/labour-cost', sensitivity: 'PEOPLE', isActive: true },
]

/* ═════════════════════════ KPI readings ═════════════════════════════════ */

function statusOf(value: number, target: number, direction: KpiDefinition['direction'], watchBandPct: number): MetricStatus {
  if (!Number.isFinite(value)) return 'NO_DATA'
  const band = Math.abs(target * (watchBandPct / 100))
  if (direction === 'HIGHER_BETTER') {
    if (value >= target) return 'ON_TARGET'
    return value >= target - band ? 'WATCH' : 'OFF_TARGET'
  }
  if (value <= target) return 'ON_TARGET'
  return value <= target + band ? 'WATCH' : 'OFF_TARGET'
}

/** value, previous, and a short series for the sparkline. */
const RAW: Record<string, { value: number; previous: number | null; spark: number[]; source: string }> = {
  'FIN-REV': { value: revenue, previous: fPrev?.revenue ?? null, spark: financeTrend.map((x) => x.revenue), source: 'Finance — invoiced sales, month to date' },
  'FIN-GM': { value: grossMarginPct, previous: fPrev ? round((fPrev.profit / fPrev.revenue) * 100) : null, spark: financeTrend.map((x) => round((x.profit / x.revenue) * 100)), source: 'Finance — profit and loss' },
  'FIN-CF': { value: cashFlow, previous: fPrev ? fPrev.cashIn - fPrev.cashOut : null, spark: financeTrend.map((x) => x.cashIn - x.cashOut), source: 'Finance — bank movements' },
  'FIN-BUD': { value: budgetVariancePct, previous: null, spark: [2.1, 3.4, 1.8, 4.2, budgetVariancePct], source: 'Finance — budget against actual, year to date' },
  'FIN-CPB': { value: actualCostPerBottle, previous: standardCostPerBottle, spark: [standardCostPerBottle * 1.04, standardCostPerBottle * 1.02, standardCostPerBottle, actualCostPerBottle], source: 'Finance — actual works cost against the standard cost card' },

  'PRD-OEE': { value: plantOee, previous: oeeTrend[oeeTrend.length - 2]?.oee ?? null, spark: oeeTrend.map((x) => x.oee), source: 'Shop floor — machine run, down and piece counts' },
  'PRD-ATT': { value: productionAttainment, previous: 96.4, spark: [94, 97, 92, 99, 96, 91, productionAttainment], source: 'Shop floor — hourly output against plan' },
  'PRD-OUT': { value: bottlesToday, previous: 2_840, spark: hourlyOutput.map((h) => h.actual), source: 'Shop floor — production entries confirmed today' },
  'PRD-DT': { value: downtimeHours, previous: 3.2, spark: [2.1, 3.6, 5.2, 2.8, 4.1, 6.4, downtimeHours], source: 'Shop floor — downtime events with a reason' },
  'PRD-SCRAP': { value: scrapPct, previous: 1.6, spark: [1.8, 1.5, 2.1, 1.4, 1.7, 2.0, scrapPct], source: 'Shop floor — scrap register' },

  'QLT-FPY': { value: fpyPct, previous: qPrev?.fpyPct ?? null, spark: qualityTrend.map((x) => x.fpyPct), source: 'Quality — inspection results by operation' },
  'QLT-PPM': { value: internalPpm, previous: qPrev?.internalPpm ?? null, spark: qualityTrend.map((x) => x.internalPpm), source: 'Quality — internal rejections per million' },
  'QLT-CAPA': { value: capaClosurePct, previous: 82, spark: [74, 78, 81, 86, capaClosurePct], source: 'Quality — CAPA register' },
  'QLT-COMP': { value: openComplaints, previous: qPrev?.complaints ?? null, spark: qualityTrend.map((x) => x.complaints), source: 'Quality — customer complaint register' },

  'SCM-INV': { value: inventoryValue, previous: null, spark: valueTrend.map((v) => v.rawMaterial + v.wip + v.finishedGoods + v.other), source: 'Inventory — valued stock on hand' },
  'SCM-SLOW': { value: slowMovingPct, previous: 9.2, spark: [11.4, 10.2, 9.8, 9.2, slowMovingPct], source: 'Inventory — non-moving analysis at 90 days' },
  'SCM-ACC': { value: stockAccuracyPct, previous: null, spark: accuracyTrend.map((a) => a.accuracyPct), source: 'Inventory — cycle count variance' },
  'SCM-OTIF': { value: supplierOtifPct, previous: 90.8, spark: [88.4, 90.1, 89.6, 90.8, supplierOtifPct], source: 'Procurement — supplier evaluation scores' },
  'SCM-PRICE': { value: coilPriceChangePct, previous: null, spark: priceTrend.map((p) => p.ss304), source: 'Procurement — purchase price history for stainless coil' },
  'SCM-SHORT': { value: shortageCount, previous: 4, spark: [6, 5, 7, 4, shortageCount], source: 'Inventory — reorder analysis' },

  'CUS-OTD': { value: onTimeDeliveryPct, previous: 92.6, spark: [88, 91, 94, 90, 92.6, onTimeDeliveryPct], source: 'Dispatch — delivered against promised date' },
  'CUS-EXP': { value: exportRevenueShare, previous: null, spark: [28, 31, 34, 36, exportRevenueShare], source: 'Dispatch — dispatched value by region' },
  'CUS-RET': { value: openReturns, previous: 3, spark: [5, 4, 6, 3, openReturns], source: 'Dispatch — sales return register' },

  'MNT-MTBF': { value: mtbfHours, previous: null, spark: maintenanceTrend.map((x) => x.mtbfHours), source: 'Maintenance — breakdown history' },
  'MNT-MTTR': { value: mttrHours, previous: null, spark: maintenanceTrend.map((x) => x.mttrHours), source: 'Maintenance — repair durations' },
  'MNT-PM': { value: pmCompliancePct, previous: null, spark: maintenanceTrend.map((x) => x.pmCompliancePct), source: 'Maintenance — preventive schedule adherence' },

  'HR-ATT': { value: attendancePct, previous: null, spark: attendanceTrend.map((a) => round((a.present / (a.present + a.absent + a.onLeave)) * 100)), source: 'HR — daily attendance register' },
  'HR-ATTR': { value: attritionPct, previous: null, spark: attritionTrend.map((a) => a.attritionPct), source: 'HR — joiners and exits' },
  'HR-LCB': { value: labourCostPerBottle, previous: null, spark: productivityTrend.map((p) => p.labourCostPerBottle), source: 'HR — labour cost allocation against production output' },
  'HR-PROD': { value: unitsPerOperator, previous: null, spark: productivityTrend.map((p) => p.unitsPerOperator), source: 'HR — output per operator' },
}

export const kpiReadings: KpiReading[] = kpiDefinitions.map((def) => {
  const raw = RAW[def.code] ?? { value: NaN, previous: null, spark: [], source: 'Not yet wired to a source' }
  return {
    code: def.code,
    name: def.name,
    module: def.module,
    value: raw.value,
    previousValue: raw.previous,
    target: def.target,
    format: def.format,
    direction: def.direction,
    unit: def.unit,
    status: statusOf(raw.value, def.target, def.direction, def.watchBandPct),
    spark: raw.spark.filter((n) => Number.isFinite(n)),
    drillTo: def.drillTo,
    sensitivity: def.sensitivity,
    source: raw.source,
  }
})

export const readingByCode = Object.fromEntries(kpiReadings.map((r) => [r.code, r])) as Record<string, KpiReading>

/* ═══════════════════════ Dashboard definitions ══════════════════════════ */

export const dashboards: DashboardDefinition[] = [
  { uid: 'dsh-01', code: 'DSH-CEO', name: 'CEO dashboard', role: 'CEO', description: 'The whole business on one screen — money, output, quality, service and people.', kpiCodes: ['FIN-REV', 'FIN-GM', 'FIN-CF', 'PRD-OEE', 'PRD-ATT', 'QLT-FPY', 'CUS-OTD', 'SCM-INV', 'HR-ATTR'], refreshMinutes: 15, lastRefreshedAt: at(0, 1), modules: ['FINANCE', 'PRODUCTION', 'QUALITY', 'DISPATCH', 'INVENTORY', 'HRMS'], isDefault: true, viewCount: 412, version: 7, updatedBy: 'S. Ganapathy', updatedOn: d(12), isActive: true },
  { uid: 'dsh-02', code: 'DSH-MD', name: 'Managing Director', role: 'MANAGING_DIRECTOR', description: 'Strategic view — growth, margin, capacity and the risks behind them.', kpiCodes: ['FIN-REV', 'FIN-GM', 'FIN-BUD', 'PRD-OEE', 'CUS-EXP', 'CUS-OTD', 'HR-ATTR', 'SCM-OTIF'], refreshMinutes: 60, lastRefreshedAt: at(0, 2), modules: ['FINANCE', 'PRODUCTION', 'DISPATCH', 'HRMS', 'PROCUREMENT'], isDefault: false, viewCount: 186, version: 4, updatedBy: 'S. Ganapathy', updatedOn: d(20), isActive: true },
  { uid: 'dsh-03', code: 'DSH-CFO', name: 'CFO dashboard', role: 'CFO', description: 'Revenue, margin, cash and budget variance, with cost per bottle behind them.', kpiCodes: ['FIN-REV', 'FIN-GM', 'FIN-CF', 'FIN-BUD', 'FIN-CPB', 'SCM-INV', 'HR-LCB'], refreshMinutes: 60, lastRefreshedAt: at(0, 3), modules: ['FINANCE', 'INVENTORY', 'HRMS'], isDefault: false, viewCount: 264, version: 6, updatedBy: 'S. Ganapathy', updatedOn: d(8), isActive: true },
  { uid: 'dsh-04', code: 'DSH-COO', name: 'COO dashboard', role: 'COO', description: 'Operations end to end — plan attainment, OEE, quality, delivery and shortages.', kpiCodes: ['PRD-ATT', 'PRD-OEE', 'PRD-DT', 'QLT-FPY', 'CUS-OTD', 'SCM-SHORT', 'MNT-PM'], refreshMinutes: 15, lastRefreshedAt: at(0, 1), modules: ['PRODUCTION', 'QUALITY', 'DISPATCH', 'INVENTORY', 'MAINTENANCE'], isDefault: false, viewCount: 208, version: 5, updatedBy: 'Meera Rajan', updatedOn: d(14), isActive: true },
  { uid: 'dsh-05', code: 'DSH-PLANT', name: 'Plant head', role: 'PLANT_HEAD', description: 'The daily plant picture — output, OEE, downtime, scrap, attendance and cost per bottle.', kpiCodes: ['PRD-OUT', 'PRD-ATT', 'PRD-OEE', 'PRD-DT', 'PRD-SCRAP', 'HR-ATT', 'HR-LCB', 'MNT-MTBF'], refreshMinutes: 5, lastRefreshedAt: at(0, 0), modules: ['PRODUCTION', 'HRMS', 'MAINTENANCE', 'QUALITY'], isDefault: false, viewCount: 738, version: 11, updatedBy: 'Meera Rajan', updatedOn: d(3), isActive: true },
  { uid: 'dsh-06', code: 'DSH-PROD', name: 'Production manager', role: 'PRODUCTION_MANAGER', description: 'Line-level output, downtime and scrap for the shift in progress.', kpiCodes: ['PRD-OUT', 'PRD-ATT', 'PRD-OEE', 'PRD-DT', 'PRD-SCRAP'], refreshMinutes: 5, lastRefreshedAt: at(0, 0), modules: ['PRODUCTION'], isDefault: false, viewCount: 964, version: 9, updatedBy: 'Prakash Menon', updatedOn: d(6), isActive: true },
  { uid: 'dsh-07', code: 'DSH-QLTY', name: 'Quality manager', role: 'QUALITY_MANAGER', description: 'Yield, defects, CAPA progress and the complaint trend.', kpiCodes: ['QLT-FPY', 'QLT-PPM', 'QLT-CAPA', 'QLT-COMP', 'PRD-SCRAP'], refreshMinutes: 30, lastRefreshedAt: at(0, 2), modules: ['QUALITY', 'PRODUCTION'], isDefault: false, viewCount: 322, version: 5, updatedBy: 'Lakshmi Narayanan', updatedOn: d(9), isActive: true },
  { uid: 'dsh-08', code: 'DSH-PURC', name: 'Purchase manager', role: 'PURCHASE_MANAGER', description: 'Supplier performance, price movement and material cover.', kpiCodes: ['SCM-OTIF', 'SCM-PRICE', 'SCM-SHORT', 'SCM-INV'], refreshMinutes: 60, lastRefreshedAt: at(0, 4), modules: ['PROCUREMENT', 'INVENTORY'], isDefault: false, viewCount: 188, version: 3, updatedBy: 'Anand Krishnan', updatedOn: d(18), isActive: true },
  { uid: 'dsh-09', code: 'DSH-WHSE', name: 'Warehouse manager', role: 'WAREHOUSE_MANAGER', description: 'Stock value, ageing, accuracy and what is short.', kpiCodes: ['SCM-INV', 'SCM-SLOW', 'SCM-ACC', 'SCM-SHORT'], refreshMinutes: 30, lastRefreshedAt: at(0, 2), modules: ['INVENTORY'], isDefault: false, viewCount: 246, version: 4, updatedBy: 'Divya Sundaram', updatedOn: d(15), isActive: true },
  { uid: 'dsh-10', code: 'DSH-SALES', name: 'Sales manager', role: 'SALES_MANAGER', description: 'Order book, delivery performance, export mix and returns.', kpiCodes: ['CUS-OTD', 'CUS-EXP', 'CUS-RET', 'FIN-REV'], refreshMinutes: 30, lastRefreshedAt: at(0, 1), modules: ['DISPATCH', 'FINANCE'], isDefault: false, viewCount: 296, version: 4, updatedBy: 'Vignesh Kumar', updatedOn: d(11), isActive: true },
  { uid: 'dsh-11', code: 'DSH-HR', name: 'HR manager', role: 'HR_MANAGER', description: 'Attendance, attrition, labour cost and productivity.', kpiCodes: ['HR-ATT', 'HR-ATTR', 'HR-LCB', 'HR-PROD'], refreshMinutes: 60, lastRefreshedAt: at(0, 3), modules: ['HRMS'], isDefault: false, viewCount: 174, version: 3, updatedBy: 'P. Vidya', updatedOn: d(22), isActive: true },
  { uid: 'dsh-12', code: 'DSH-MNT', name: 'Maintenance manager', role: 'MAINTENANCE_MANAGER', description: 'Reliability, PM compliance and the downtime it is meant to prevent.', kpiCodes: ['MNT-MTBF', 'MNT-MTTR', 'MNT-PM', 'PRD-DT'], refreshMinutes: 30, lastRefreshedAt: at(0, 2), modules: ['MAINTENANCE', 'PRODUCTION'], isDefault: false, viewCount: 212, version: 4, updatedBy: 'Suresh Babu', updatedOn: d(16), isActive: true },
  { uid: 'dsh-13', code: 'DSH-SUP', name: 'Shift supervisor', role: 'SUPERVISOR', description: 'What the shift needs to know — output against target, downtime and attendance.', kpiCodes: ['PRD-OUT', 'PRD-ATT', 'PRD-DT', 'HR-ATT'], refreshMinutes: 5, lastRefreshedAt: at(0, 0), modules: ['PRODUCTION', 'HRMS'], isDefault: false, viewCount: 1_842, version: 6, updatedBy: 'R. Vasanth', updatedOn: d(5), isActive: true },
  { uid: 'dsh-14', code: 'DSH-OPR', name: 'Operator terminal', role: 'OPERATOR', description: 'Three numbers, large enough to read from the machine.', kpiCodes: ['PRD-OUT', 'PRD-SCRAP', 'PRD-OEE'], refreshMinutes: 5, lastRefreshedAt: at(0, 0), modules: ['PRODUCTION'], isDefault: false, viewCount: 3_104, version: 2, updatedBy: 'Prakash Menon', updatedOn: d(28), isActive: true },
]

/* ══════════════════════════ AI insights ═════════════════════════════════ */

const oeeNow = last(oeeTrend).oee
const oeeStart = oeeTrend[0].oee
const oeeDrop = round(((oeeNow - oeeStart) / oeeStart) * 100)

const downByMachine = machines
  .map((mc) => ({ machine: mc.code, minutes: sum(downtimeEvents.filter((e) => e.machineCode === mc.code).map((e) => e.minutes)) }))
  .filter((x) => x.minutes > 0)
  .sort((a, b) => b.minutes - a.minutes)

export const insights: Insight[] = [
  {
    uid: 'ins-01', code: 'INS-PRD-001', kind: 'TREND', severity: 'HIGH', module: 'PRODUCTION',
    title: 'Plant OEE has fallen through the week',
    detail: `OEE is ${oeeNow.toFixed(1)}% today against ${oeeStart.toFixed(1)}% on Monday — a fall of ${Math.abs(oeeDrop)}%. Availability is the weakest of the three factors, not performance or quality, so the cause is stopped time rather than slow running.`,
    basis: 'Seven-day OEE series from the shop floor, computed from machine run and down minutes',
    metricCode: 'PRD-OEE', currentValue: oeeNow, comparisonValue: oeeStart, changePct: oeeDrop, format: 'PERCENT',
    recommendation: 'Look at the downtime Pareto first — one machine accounts for most of the loss.',
    estimatedImpact: 184_000, detectedOn: at(0, 2),
    evidenceLabel: 'OEE by machine', evidenceTo: '/production/oee', confidencePct: 92,
    status: 'NEW', feedback: 'NONE', assignedTo: null, actionNote: null,
  },
  {
    uid: 'ins-02', code: 'INS-PRD-002', kind: 'ANOMALY', severity: 'CRITICAL', module: 'PRODUCTION',
    title: `${downByMachine[0]?.machine ?? 'POL-02'} accounts for most of today's downtime`,
    detail: `${downByMachine[0]?.machine ?? 'POL-02'} lost ${downByMachine[0]?.minutes ?? 0} minutes today, against ${downByMachine[1]?.minutes ?? 0} for the next worst machine. That single asset is carrying the plant's availability figure down on its own.`,
    basis: "Today's downtime events grouped by machine, compared with the rest of the fleet",
    metricCode: 'PRD-DT', currentValue: downByMachine[0]?.minutes ?? 0, comparisonValue: downByMachine[1]?.minutes ?? 0,
    changePct: downByMachine[1]?.minutes ? round(((downByMachine[0].minutes - downByMachine[1].minutes) / downByMachine[1].minutes) * 100) : null,
    format: 'NUMBER',
    recommendation: 'Raise a maintenance request against the asset and check whether it is already overdue for preventive work.',
    estimatedImpact: 96_000, detectedOn: at(0, 1),
    evidenceLabel: 'Downtime register', evidenceTo: '/production/downtime', confidencePct: 96,
    status: 'ACKNOWLEDGED', feedback: 'USEFUL', assignedTo: 'Suresh Babu', actionNote: 'Spindle bearing ordered; PM brought forward to Saturday.',
  },
  {
    uid: 'ins-03', code: 'INS-PRC-001', kind: 'TREND', severity: 'HIGH', module: 'PROCUREMENT',
    title: 'Stainless coil price is still climbing',
    detail: `The weighted purchase rate for stainless coil has moved ${coilPriceChangePct > 0 ? 'up' : 'down'} ${Math.abs(coilPriceChangePct)}% across the price history. At current consumption that is roughly ₹2.4 lakh a month on material cost alone, and the standard cost card has not been revised.`,
    basis: 'Purchase price history for stainless coil across the recorded period',
    metricCode: 'SCM-PRICE', currentValue: coilPriceChangePct, comparisonValue: 3, changePct: coilPriceChangePct, format: 'PERCENT',
    recommendation: 'Revise the standard cost card, or the material variance will keep reporting as a purchasing failure when it is a market move.',
    estimatedImpact: 240_000, detectedOn: at(1, 6),
    evidenceLabel: 'Purchase price analysis', evidenceTo: '/procurement/analytics', confidencePct: 88,
    status: 'NEW', feedback: 'NONE', assignedTo: null, actionNote: null,
  },
  {
    uid: 'ins-04', code: 'INS-INV-001', kind: 'FORECAST', severity: 'MEDIUM', module: 'INVENTORY',
    title: `${nonMoving.length} items are heading for dead stock`,
    detail: `${nonMoving.length} items have had no movement in 90 days, carrying ${slowMovingPct}% of total stock value. On the current pattern they will cross the twelve-month dead-stock threshold within the next quarter, at which point they attract a full provision.`,
    basis: 'Non-moving analysis at 90 days, projected against the twelve-month provision rule',
    metricCode: 'SCM-SLOW', currentValue: slowMovingPct, comparisonValue: 8, changePct: round(((slowMovingPct - 8) / 8) * 100), format: 'PERCENT',
    recommendation: 'Decide now — use them in a production order, return them to the supplier, or provide for them. Doing nothing chooses the provision.',
    estimatedImpact: slowValue, detectedOn: at(2, 4),
    evidenceLabel: 'Stock ageing', evidenceTo: '/inventory/ageing', confidencePct: 84,
    status: 'NEW', feedback: 'NONE', assignedTo: null, actionNote: null,
  },
  {
    uid: 'ins-05', code: 'INS-QLT-001', kind: 'CORRELATION', severity: 'HIGH', module: 'QUALITY',
    title: 'Welding defects concentrate on one machine and one shift',
    detail: 'Welding rejections are running well above the rest of the plant on a single weld station during B shift. The same station on A shift is within tolerance, which points at setup or training rather than the machine itself.',
    basis: 'Scrap records grouped by operation, machine and shift over the recorded period',
    metricCode: 'QLT-PPM', currentValue: internalPpm, comparisonValue: 3_000, changePct: round(((internalPpm - 3_000) / 3_000) * 100), format: 'PPM',
    recommendation: 'Compare the weld current and cycle settings between the two shifts before changing anything mechanical.',
    estimatedImpact: 68_000, detectedOn: at(1, 8),
    evidenceLabel: 'Scrap by reason', evidenceTo: '/production/scrap', confidencePct: 79,
    status: 'ACTIONED', feedback: 'USEFUL', assignedTo: 'Lakshmi Narayanan', actionNote: 'B shift settings found 18 A low. Re-set and first-piece approved.',
  },
  {
    uid: 'ins-06', code: 'INS-FIN-001', kind: 'THRESHOLD', severity: 'HIGH', module: 'FINANCE',
    title: 'Gross margin is below target',
    detail: `Gross margin is ${grossMarginPct}% against a target of 22%. Material cost is the largest single mover — the coil price rise has not been passed through to the price list, and the standard cost card still carries the old rate.`,
    basis: 'Current month profit and loss against the annual target',
    metricCode: 'FIN-GM', currentValue: grossMarginPct, comparisonValue: 22, changePct: round(((grossMarginPct - 22) / 22) * 100), format: 'PERCENT',
    recommendation: 'Two levers: revise the price list, or take the cost out. The cost per bottle screen shows where the variance actually sits.',
    estimatedImpact: 420_000, detectedOn: at(0, 5),
    evidenceLabel: 'Cost and margin analysis', evidenceTo: '/finance/costing', confidencePct: 90,
    status: 'NEW', feedback: 'NONE', assignedTo: null, actionNote: null,
  },
  {
    uid: 'ins-07', code: 'INS-MNT-001', kind: 'RECOMMENDATION', severity: 'CRITICAL', module: 'MAINTENANCE',
    title: 'Preventive maintenance compliance is well short',
    detail: `PM compliance is ${pmCompliancePct}% against a target of 95%. Breakdown frequency and preventive compliance move together with about a month's lag, so today's shortfall is next month's downtime.`,
    basis: 'Preventive schedule adherence against the breakdown series',
    metricCode: 'MNT-PM', currentValue: pmCompliancePct, comparisonValue: 95, changePct: round(((pmCompliancePct - 95) / 95) * 100), format: 'PERCENT',
    recommendation: 'The maintenance crew is two technicians short against sanction. Either fill the posts or reduce the PM scope deliberately rather than by default.',
    estimatedImpact: 320_000, detectedOn: at(3, 7),
    evidenceLabel: 'Maintenance dashboard', evidenceTo: '/maintenance', confidencePct: 86,
    status: 'ACKNOWLEDGED', feedback: 'USEFUL', assignedTo: 'Meera Rajan', actionNote: 'Requisition MRQ/2627/0047 raised for two technicians.',
  },
  {
    uid: 'ins-08', code: 'INS-HR-001', kind: 'ANOMALY', severity: 'MEDIUM', module: 'HRMS',
    title: 'Night shift absenteeism runs higher than the other shifts',
    detail: `Absenteeism across the plant is ${absenteeismPct}%, but C shift is consistently above the other two. Overtime cost rises in the same weeks, because the gap gets covered by paying somebody else double.`,
    basis: 'Attendance records grouped by shift, against approved overtime in the same period',
    metricCode: 'HR-ATT', currentValue: attendancePct, comparisonValue: 95, changePct: round(((attendancePct - 95) / 95) * 100), format: 'PERCENT',
    recommendation: 'Look at the shift allowance against the local market before assuming it is a discipline problem.',
    estimatedImpact: 88_000, detectedOn: at(2, 9),
    evidenceLabel: 'Attendance', evidenceTo: '/hrms/attendance', confidencePct: 74,
    status: 'NEW', feedback: 'NONE', assignedTo: null, actionNote: null,
  },
  {
    uid: 'ins-09', code: 'INS-CUS-001', kind: 'TREND', severity: 'POSITIVE', module: 'DISPATCH',
    title: 'On-time delivery has recovered',
    detail: `On-time delivery is ${onTimeDeliveryPct}%, up from 92.6% last month and back above the 95% commitment. The improvement follows the change to loading verification — sealed loads are being caught at the bay rather than at the customer.`,
    basis: 'Delivered shipments against promised dates, month on month',
    metricCode: 'CUS-OTD', currentValue: onTimeDeliveryPct, comparisonValue: 92.6, changePct: round(((onTimeDeliveryPct - 92.6) / 92.6) * 100), format: 'PERCENT',
    recommendation: null,
    estimatedImpact: null, detectedOn: at(1, 3),
    evidenceLabel: 'Shipment tracking', evidenceTo: '/dispatch/tracking', confidencePct: 88,
    status: 'NEW', feedback: 'USEFUL', assignedTo: null, actionNote: null,
  },
  {
    uid: 'ins-10', code: 'INS-SCM-001', kind: 'RECOMMENDATION', severity: 'MEDIUM', module: 'PROCUREMENT',
    title: 'One supplier is materially worse on quality than the alternative',
    detail: 'Two approved suppliers cover the same coil grade. One is running a noticeably higher incoming rejection rate, and the difference is larger than the price advantage that justified using them.',
    basis: 'Incoming inspection results by supplier against the purchase rate for the same grade',
    metricCode: 'SCM-OTIF', currentValue: supplierOtifPct, comparisonValue: 95, changePct: round(((supplierOtifPct - 95) / 95) * 100), format: 'PERCENT',
    recommendation: 'Shift the next three orders to the better supplier and re-measure. The price gap is smaller than the rejection cost.',
    estimatedImpact: 142_000, detectedOn: at(4, 5),
    evidenceLabel: 'Supplier evaluation', evidenceTo: '/procurement/evaluation', confidencePct: 81,
    status: 'DISMISSED', feedback: 'NOT_USEFUL', assignedTo: 'Anand Krishnan', actionNote: 'Already under a twelve-month contract; revisit at renewal.',
  },
]

/* ═════════════════════════ Forecast models ══════════════════════════════ */

function trendSeries(history: number[], horizon: number, noise = 0.04) {
  const n = history.length
  const meanX = (n - 1) / 2
  const meanY = sum(history) / n
  const slope = sum(history.map((y, i) => (i - meanX) * (y - meanY))) / sum(history.map((_, i) => (i - meanX) ** 2))
  const intercept = meanY - slope * meanX
  const out: { period: string; actual: number | null; forecast: number | null; lower: number | null; upper: number | null }[] = []
  history.forEach((y, i) => out.push({ period: `M${i + 1}`, actual: round(y), forecast: round(intercept + slope * i), lower: null, upper: null }))
  for (let k = 0; k < horizon; k++) {
    const i = n + k
    const f = intercept + slope * i
    // The band widens with distance, which is the honest way to draw a forecast.
    const spread = f * noise * (1 + k * 0.35)
    out.push({ period: `F${k + 1}`, actual: null, forecast: round(f), lower: round(f - spread), upper: round(f + spread) })
  }
  return out
}

export const forecastModels: ForecastModel[] = [
  {
    uid: 'fc-01', code: 'FC-REV', name: 'Revenue forecast', subject: 'REVENUE', module: 'FINANCE', method: 'LINEAR_TREND',
    horizonPeriods: 3, historyPeriods: financeTrend.length, format: 'CURRENCY', unit: '₹', accuracyPct: 91.4,
    lastRunOn: at(0, 6), nextRunOn: fwd(1), series: trendSeries(financeTrend.map((x) => x.revenue), 3, 0.06),
    headline: 'Revenue continues to grow, but the confidence band widens quickly — three months out it is a direction, not a number.',
    drillTo: '/finance', isActive: true,
  },
  {
    uid: 'fc-02', code: 'FC-DEM', name: 'Sales demand forecast', subject: 'SALES_DEMAND', module: 'SALES', method: 'SEASONAL',
    horizonPeriods: 3, historyPeriods: dispatchTrend.length, format: 'NUMBER', unit: 'cartons', accuracyPct: 86.2,
    lastRunOn: at(0, 7), nextRunOn: fwd(1), series: trendSeries(dispatchTrend.map((x) => x.dispatched), 3, 0.09),
    headline: 'Demand is rising into the summer months. Planning should be working to the upper band, not the mid-point.',
    drillTo: '/planning/demand', isActive: true,
  },
  {
    uid: 'fc-03', code: 'FC-MAT', name: 'Material consumption', subject: 'MATERIAL_CONSUMPTION', module: 'INVENTORY', method: 'MOVING_AVERAGE',
    horizonPeriods: 3, historyPeriods: 6, format: 'NUMBER', unit: 'kg', accuracyPct: 93.8,
    lastRunOn: at(0, 8), nextRunOn: fwd(1), series: trendSeries([18_400, 19_200, 18_800, 20_400, 21_100, 21_800], 3, 0.05),
    headline: 'Coil consumption tracks production closely, so this is the most reliable of the forecasts — use it for the purchase plan.',
    drillTo: '/inventory/movement', isActive: true,
  },
  {
    uid: 'fc-04', code: 'FC-INV', name: 'Inventory level', subject: 'INVENTORY_LEVEL', module: 'INVENTORY', method: 'WEIGHTED',
    horizonPeriods: 3, historyPeriods: 6, format: 'CURRENCY', unit: '₹', accuracyPct: 88.1,
    lastRunOn: at(0, 8), nextRunOn: fwd(1), series: trendSeries([16_800_000, 17_400_000, 18_100_000, 18_600_000, 19_200_000, inventoryValue || 19_800_000], 3, 0.07),
    headline: 'Stock value is drifting up faster than revenue, which is working capital going the wrong way.',
    drillTo: '/inventory/valuation', isActive: true,
  },
  {
    uid: 'fc-05', code: 'FC-CASH', name: 'Cash flow', subject: 'CASH_FLOW', module: 'FINANCE', method: 'LINEAR_TREND',
    horizonPeriods: 3, historyPeriods: financeTrend.length, format: 'CURRENCY', unit: '₹', accuracyPct: 79.6,
    lastRunOn: at(0, 6), nextRunOn: fwd(1), series: trendSeries(financeTrend.map((x) => x.cashIn - x.cashOut), 3, 0.14),
    headline: 'The weakest model of the set — cash timing depends on collection behaviour, which no trend line predicts well.',
    drillTo: '/finance/banking', isActive: true,
  },
  {
    uid: 'fc-06', code: 'FC-LAB', name: 'Labour requirement', subject: 'LABOUR_REQUIREMENT', module: 'HRMS', method: 'LINEAR_TREND',
    horizonPeriods: 3, historyPeriods: productivityTrend.length, format: 'NUMBER', unit: 'operators', accuracyPct: 90.2,
    lastRunOn: at(0, 9), nextRunOn: fwd(1), series: trendSeries([148, 152, 156, 158, 162, 166], 3, 0.05),
    headline: 'On the demand forecast the plant needs roughly six more operators by quarter end — recruitment lead time is eight weeks.',
    drillTo: '/hrms/requisitions', isActive: true,
  },
]

/* ═══════════════════════ Machine failure risk ═══════════════════════════ */

export const failureRisks: FailureRisk[] = machines.slice(0, 6).map((mc, i) => {
  const bd = downtimeEvents.filter((e) => e.machineCode === mc.code && e.reason === 'BREAKDOWN').length
  const runHours = round(mc.runMinutes / 60 + 380 + i * 120)
  const interval = 500
  const mtbf = bd ? round(runHours / bd) : 620
  // Risk rises with hours past the service interval and with breakdown history.
  const overdueFactor = Math.max(0, (runHours - interval) / interval)
  const prob = Math.min(94, round(12 + overdueFactor * 55 + bd * 14))
  return {
    uid: `fr-${String(i + 1).padStart(2, '0')}`,
    machineCode: mc.code,
    machineName: mc.name,
    line: mc.line,
    criticality: i === 0 ? 'CRITICAL' : i < 3 ? 'HIGH' : 'MEDIUM',
    runHoursSinceService: runHours,
    serviceIntervalHours: interval,
    breakdownsLast90Days: bd,
    mtbfHours: mtbf,
    failureProbabilityPct: prob,
    predictedFailureWindow: prob > 60 ? `${fwd(6)} – ${fwd(18)}` : prob > 35 ? `${fwd(20)} – ${fwd(45)}` : `beyond ${fwd(60)}`,
    estimatedDowntimeHours: prob > 60 ? 14 : prob > 35 ? 8 : 4,
    estimatedImpact: prob > 60 ? 168_000 : prob > 35 ? 92_000 : 38_000,
    recommendation:
      prob > 60
        ? 'Bring the preventive service forward — the asset is past its interval and has a breakdown history.'
        : prob > 35
          ? 'Schedule the next PM inside the window rather than at the normal interval.'
          : 'No action beyond the normal schedule.',
    pmDueOn: prob > 60 ? fwd(3) : fwd(24 + i * 6),
    status: prob > 60 ? 'URGENT' : prob > 35 ? 'SCHEDULE_PM' : 'MONITOR',
  }
})

/* ═══════════════════════ Alert rules & events ═══════════════════════════ */

export const alertRules: AlertRule[] = [
  { uid: 'ar-01', code: 'ALR-OEE', name: 'Plant OEE below target', module: 'PRODUCTION', metricCode: 'PRD-OEE', operator: 'BELOW', threshold: 75, format: 'PERCENT', consecutiveBreaches: 2, severity: 'HIGH', channels: ['IN_APP', 'EMAIL'], recipients: ['Plant Head', 'Production Manager'], cooldownMinutes: 240, frequency: 'HOURLY', firedCount: 14, lastFiredAt: at(0, 2), isActive: true },
  { uid: 'ar-02', code: 'ALR-SCRAP', name: 'Scrap rate above tolerance', module: 'PRODUCTION', metricCode: 'PRD-SCRAP', operator: 'ABOVE', threshold: 2, format: 'PERCENT', consecutiveBreaches: 1, severity: 'HIGH', channels: ['IN_APP', 'EMAIL'], recipients: ['Quality Manager', 'Production Manager'], cooldownMinutes: 120, frequency: 'REAL_TIME', firedCount: 8, lastFiredAt: at(1, 4), isActive: true },
  { uid: 'ar-03', code: 'ALR-DOWN', name: 'Machine down beyond one hour', module: 'MAINTENANCE', metricCode: 'PRD-DT', operator: 'ABOVE', threshold: 60, format: 'NUMBER', consecutiveBreaches: 1, severity: 'CRITICAL', channels: ['IN_APP', 'EMAIL', 'SMS'], recipients: ['Maintenance Manager', 'Plant Head'], cooldownMinutes: 60, frequency: 'REAL_TIME', firedCount: 22, lastFiredAt: at(0, 1), isActive: true },
  { uid: 'ar-04', code: 'ALR-STOCK', name: 'Item below reorder with no cover', module: 'INVENTORY', metricCode: 'SCM-SHORT', operator: 'ABOVE', threshold: 0, format: 'NUMBER', consecutiveBreaches: 1, severity: 'MEDIUM', channels: ['IN_APP', 'EMAIL'], recipients: ['Purchase Manager', 'Warehouse Manager'], cooldownMinutes: 1_440, frequency: 'DAILY', firedCount: 31, lastFiredAt: at(0, 8), isActive: true },
  { uid: 'ar-05', code: 'ALR-OTD', name: 'On-time delivery below commitment', module: 'DISPATCH', metricCode: 'CUS-OTD', operator: 'BELOW', threshold: 95, format: 'PERCENT', consecutiveBreaches: 2, severity: 'HIGH', channels: ['IN_APP', 'EMAIL'], recipients: ['Sales Manager', 'COO'], cooldownMinutes: 1_440, frequency: 'DAILY', firedCount: 6, lastFiredAt: at(9, 7), isActive: true },
  { uid: 'ar-06', code: 'ALR-BUD', name: 'Budget exceeded', module: 'FINANCE', metricCode: 'FIN-BUD', operator: 'ABOVE', threshold: 5, format: 'PERCENT', consecutiveBreaches: 1, severity: 'HIGH', channels: ['IN_APP', 'EMAIL'], recipients: ['CFO', 'Managing Director'], cooldownMinutes: 10_080, frequency: 'WEEKLY', firedCount: 3, lastFiredAt: at(6, 9), isActive: true },
  { uid: 'ar-07', code: 'ALR-GM', name: 'Gross margin below plan', module: 'FINANCE', metricCode: 'FIN-GM', operator: 'BELOW', threshold: 20, format: 'PERCENT', consecutiveBreaches: 1, severity: 'CRITICAL', channels: ['IN_APP', 'EMAIL'], recipients: ['CFO', 'Managing Director'], cooldownMinutes: 10_080, frequency: 'WEEKLY', firedCount: 2, lastFiredAt: at(0, 5), isActive: true },
  { uid: 'ar-08', code: 'ALR-PM', name: 'PM compliance below target', module: 'MAINTENANCE', metricCode: 'MNT-PM', operator: 'BELOW', threshold: 85, format: 'PERCENT', consecutiveBreaches: 2, severity: 'HIGH', channels: ['IN_APP', 'EMAIL'], recipients: ['Maintenance Manager', 'Plant Head'], cooldownMinutes: 10_080, frequency: 'WEEKLY', firedCount: 11, lastFiredAt: at(3, 6), isActive: true },
  { uid: 'ar-09', code: 'ALR-ATT', name: 'Attendance below target', module: 'HRMS', metricCode: 'HR-ATT', operator: 'BELOW', threshold: 92, format: 'PERCENT', consecutiveBreaches: 2, severity: 'MEDIUM', channels: ['IN_APP'], recipients: ['HR Manager', 'Plant Head'], cooldownMinutes: 1_440, frequency: 'DAILY', firedCount: 9, lastFiredAt: at(2, 8), isActive: true },
  { uid: 'ar-10', code: 'ALR-COMP', name: 'New customer complaint', module: 'QUALITY', metricCode: 'QLT-COMP', operator: 'ABOVE', threshold: 2, format: 'NUMBER', consecutiveBreaches: 1, severity: 'HIGH', channels: ['IN_APP', 'EMAIL', 'WHATSAPP'], recipients: ['Quality Manager', 'Sales Manager', 'Managing Director'], cooldownMinutes: 0, frequency: 'REAL_TIME', firedCount: 17, lastFiredAt: at(4, 3), isActive: true },
  { uid: 'ar-11', code: 'ALR-OLD', name: 'Legacy: WIP above ceiling', module: 'PRODUCTION', metricCode: 'PRD-OUT', operator: 'ABOVE', threshold: 8_000, format: 'NUMBER', consecutiveBreaches: 3, severity: 'LOW', channels: ['IN_APP'], recipients: ['Production Manager'], cooldownMinutes: 1_440, frequency: 'DAILY', firedCount: 0, lastFiredAt: null, isActive: false },
]

export const alertEvents: AlertEvent[] = [
  { uid: 'ae-01', ruleCode: 'ALR-DOWN', ruleName: 'Machine down beyond one hour', module: 'MAINTENANCE', severity: 'CRITICAL', firedAt: at(0, 1), metricValue: downByMachine[0]?.minutes ?? 184, threshold: 60, format: 'NUMBER', message: `${downByMachine[0]?.machine ?? 'POL-02'} has been down for ${downByMachine[0]?.minutes ?? 184} minutes.`, channelsSent: ['IN_APP', 'EMAIL', 'SMS'], drillTo: '/production/downtime', acknowledgedBy: 'Suresh Babu', acknowledgedAt: at(0, 1), resolvedAt: null, status: 'ACKNOWLEDGED' },
  { uid: 'ae-02', ruleCode: 'ALR-OEE', ruleName: 'Plant OEE below target', module: 'PRODUCTION', severity: 'HIGH', firedAt: at(0, 2), metricValue: plantOee, threshold: 75, format: 'PERCENT', message: `Plant OEE is ${plantOee}%, below the 75% floor for a second consecutive reading.`, channelsSent: ['IN_APP', 'EMAIL'], drillTo: '/production/oee', acknowledgedBy: null, acknowledgedAt: null, resolvedAt: null, status: 'OPEN' },
  { uid: 'ae-03', ruleCode: 'ALR-GM', ruleName: 'Gross margin below plan', module: 'FINANCE', severity: 'CRITICAL', firedAt: at(0, 5), metricValue: grossMarginPct, threshold: 20, format: 'PERCENT', message: `Gross margin is ${grossMarginPct}%, below the 20% floor.`, channelsSent: ['IN_APP', 'EMAIL'], drillTo: '/finance/costing', acknowledgedBy: null, acknowledgedAt: null, resolvedAt: null, status: 'OPEN' },
  { uid: 'ae-04', ruleCode: 'ALR-STOCK', ruleName: 'Item below reorder with no cover', module: 'INVENTORY', severity: 'MEDIUM', firedAt: at(0, 8), metricValue: shortageCount, threshold: 0, format: 'NUMBER', message: `${shortageCount} items are below reorder level with nothing on order.`, channelsSent: ['IN_APP', 'EMAIL'], drillTo: '/inventory/reorder', acknowledgedBy: 'Anand Krishnan', acknowledgedAt: at(0, 7), resolvedAt: null, status: 'ACKNOWLEDGED' },
  { uid: 'ae-05', ruleCode: 'ALR-PM', ruleName: 'PM compliance below target', module: 'MAINTENANCE', severity: 'HIGH', firedAt: at(3, 6), metricValue: pmCompliancePct, threshold: 85, format: 'PERCENT', message: `PM compliance is ${pmCompliancePct}%, well below the 85% floor.`, channelsSent: ['IN_APP', 'EMAIL'], drillTo: '/maintenance', acknowledgedBy: 'Suresh Babu', acknowledgedAt: at(3, 5), resolvedAt: null, status: 'ACKNOWLEDGED' },
  { uid: 'ae-06', ruleCode: 'ALR-SCRAP', ruleName: 'Scrap rate above tolerance', module: 'PRODUCTION', severity: 'HIGH', firedAt: at(1, 4), metricValue: scrapPct, threshold: 2, format: 'PERCENT', message: `Scrap rate reached ${scrapPct}% against a 2% tolerance.`, channelsSent: ['IN_APP', 'EMAIL'], drillTo: '/production/scrap', acknowledgedBy: 'Lakshmi Narayanan', acknowledgedAt: at(1, 3), resolvedAt: at(1, 1), status: 'RESOLVED' },
  { uid: 'ae-07', ruleCode: 'ALR-COMP', ruleName: 'New customer complaint', module: 'QUALITY', severity: 'HIGH', firedAt: at(4, 3), metricValue: openComplaints, threshold: 2, format: 'NUMBER', message: `${openComplaints} customer complaints are open.`, channelsSent: ['IN_APP', 'EMAIL', 'WHATSAPP'], drillTo: '/quality/complaints', acknowledgedBy: 'Lakshmi Narayanan', acknowledgedAt: at(4, 2), resolvedAt: null, status: 'ACKNOWLEDGED' },
  { uid: 'ae-08', ruleCode: 'ALR-ATT', ruleName: 'Attendance below target', module: 'HRMS', severity: 'MEDIUM', firedAt: at(2, 8), metricValue: attendancePct, threshold: 92, format: 'PERCENT', message: `Attendance is ${attendancePct}%, below the 92% floor.`, channelsSent: ['IN_APP'], drillTo: '/hrms/attendance', acknowledgedBy: null, acknowledgedAt: null, resolvedAt: null, status: 'SUPPRESSED' },
]

/* ═════════════════════════ Report catalogue ═════════════════════════════ */

export const biReports: BiReport[] = [
  { uid: 'br-01', code: 'BI-01', name: 'Executive scorecard', category: 'EXECUTIVE', module: 'FINANCE', reportType: 'SNAPSHOT', description: 'Every board KPI on one page with target, actual, variance and trend arrow.', columns: 'KPI, owner, target, actual, variance, status, trend', filters: 'Period, plant', sensitivity: 'FINANCIAL', schedule: 'Monthly, first working day, 08:00', recipients: ['Managing Director', 'CFO', 'COO'], formats: ['PDF', 'EXCEL'], lastRunAt: at(4, 8), runCount: 42, drillTo: '/bi/scorecards', isActive: true },
  { uid: 'br-02', code: 'BI-02', name: 'Daily production report', category: 'OPERATIONAL', module: 'PRODUCTION', reportType: 'INTERACTIVE', description: 'Output against plan by line and shift, with downtime and scrap behind it.', columns: 'Line, shift, planned, made, scrap, rework, OEE, downtime', filters: 'Date, line, shift', sensitivity: 'OPEN', schedule: 'Daily 06:30', recipients: ['Plant Head', 'Production Manager', 'COO'], formats: ['PDF', 'EXCEL'], lastRunAt: at(0, 12), runCount: 386, drillTo: '/bi/production', isActive: true },
  { uid: 'br-03', code: 'BI-03', name: 'OEE and downtime Pareto', category: 'OPERATIONAL', module: 'PRODUCTION', reportType: 'DRILL_DOWN', description: 'The three OEE factors by machine, with the downtime reasons ranked underneath.', columns: 'Machine, availability, performance, quality, OEE, downtime reasons', filters: 'Period, line, work centre', sensitivity: 'OPEN', schedule: null, recipients: [], formats: ['PDF', 'EXCEL', 'CSV'], lastRunAt: at(1, 9), runCount: 118, drillTo: '/bi/production', isActive: true },
  { uid: 'br-04', code: 'BI-04', name: 'Cost per bottle analysis', category: 'MANAGEMENT', module: 'FINANCE', reportType: 'DRILL_DOWN', description: 'Standard against actual cost per bottle, decomposed into material, labour, machine and overhead.', columns: 'Product, standard, actual, variance by element, units, cost per bottle', filters: 'Period, product, order', sensitivity: 'FINANCIAL', schedule: 'Monthly', recipients: ['CFO', 'Plant Head'], formats: ['PDF', 'EXCEL'], lastRunAt: at(2, 10), runCount: 64, drillTo: '/bi/finance', isActive: true },
  { uid: 'br-05', code: 'BI-05', name: 'Supplier scorecard', category: 'SUPPLIER', module: 'PROCUREMENT', reportType: 'PIVOT', description: 'OTIF, quality and price performance by supplier, ranked.', columns: 'Supplier, spend, OTIF %, rejection %, lead time, price variance, score', filters: 'Period, category, supplier', sensitivity: 'FINANCIAL', schedule: 'Monthly', recipients: ['Purchase Manager', 'COO'], formats: ['PDF', 'EXCEL'], lastRunAt: at(6, 8), runCount: 38, drillTo: '/bi/procurement', isActive: true },
  { uid: 'br-06', code: 'BI-06', name: 'Inventory ageing & dead stock', category: 'MANAGEMENT', module: 'INVENTORY', reportType: 'PIVOT', description: 'Stock by age bucket with the provision each bucket attracts.', columns: 'Item, class, quantity, value, age bucket, last movement, provision', filters: 'Warehouse, class, bucket', sensitivity: 'FINANCIAL', schedule: 'Monthly', recipients: ['CFO', 'Warehouse Manager'], formats: ['EXCEL', 'CSV'], lastRunAt: at(3, 7), runCount: 52, drillTo: '/bi/inventory', isActive: true },
  { uid: 'br-07', code: 'BI-07', name: 'Quality dashboard pack', category: 'MANAGEMENT', module: 'QUALITY', reportType: 'SNAPSHOT', description: 'FPY, PPM, defect Pareto and CAPA status for the quality review.', columns: 'FPY, PPM, defects by type, CAPA open/closed, complaint trend', filters: 'Period, product, line', sensitivity: 'OPEN', schedule: 'Weekly, Monday 07:00', recipients: ['Quality Manager', 'Plant Head'], formats: ['PDF'], lastRunAt: at(2, 7), runCount: 86, drillTo: '/bi/quality', isActive: true },
  { uid: 'br-08', code: 'BI-08', name: 'Customer delivery performance', category: 'CUSTOMER', module: 'DISPATCH', reportType: 'INTERACTIVE', description: 'On-time delivery and fill rate by customer, with the late shipments listed.', columns: 'Customer, shipments, on time, late, fill rate, average delay', filters: 'Period, customer, region', sensitivity: 'OPEN', schedule: 'Monthly', recipients: ['Sales Manager'], formats: ['PDF', 'EXCEL'], lastRunAt: at(5, 9), runCount: 44, drillTo: '/bi/sales', isActive: true },
  { uid: 'br-09', code: 'BI-09', name: 'Workforce productivity', category: 'MANAGEMENT', module: 'HRMS', reportType: 'PIVOT', description: 'Output per operator, labour cost per bottle, overtime and absenteeism by department.', columns: 'Department, headcount, units per operator, labour cost per bottle, overtime, absenteeism', filters: 'Period, department, shift', sensitivity: 'PEOPLE', schedule: 'Monthly', recipients: ['HR Manager', 'Plant Head'], formats: ['EXCEL'], lastRunAt: at(4, 6), runCount: 29, drillTo: '/bi/workforce', isActive: true },
  { uid: 'br-10', code: 'BI-10', name: 'Maintenance reliability', category: 'OPERATIONAL', module: 'MAINTENANCE', reportType: 'DRILL_DOWN', description: 'MTBF, MTTR and PM compliance by asset, with the failure-risk ranking.', columns: 'Asset, criticality, MTBF, MTTR, breakdowns, PM compliance, risk', filters: 'Period, line, criticality', sensitivity: 'OPEN', schedule: 'Monthly', recipients: ['Maintenance Manager'], formats: ['PDF', 'EXCEL'], lastRunAt: at(7, 8), runCount: 33, drillTo: '/bi/maintenance', isActive: true },
  { uid: 'br-11', code: 'BI-11', name: 'AI insight digest', category: 'EXECUTIVE', module: 'FINANCE', reportType: 'SNAPSHOT', description: 'Every open insight with its evidence link and estimated impact, ranked by severity.', columns: 'Insight, module, severity, basis, impact, recommendation, status', filters: 'Period, module, severity', sensitivity: 'FINANCIAL', schedule: 'Weekly, Monday 08:00', recipients: ['Managing Director', 'COO', 'CFO'], formats: ['PDF'], lastRunAt: at(1, 8), runCount: 21, drillTo: '/bi/insights', isActive: true },
  { uid: 'br-12', code: 'BI-12', name: 'Statutory compliance calendar', category: 'STATUTORY', module: 'FINANCE', reportType: 'INTERACTIVE', description: 'Every statutory return across GST, TDS, PF and ESI with due date and filing status.', columns: 'Return, act, authority, period, due, paid, filed, status', filters: 'Period, authority, status', sensitivity: 'FINANCIAL', schedule: 'Monthly', recipients: ['CFO', 'HR Manager'], formats: ['PDF', 'EXCEL'], lastRunAt: at(8, 9), runCount: 26, drillTo: '/hrms/statutory', isActive: true },
]

/* ══════════════════════════ Data sources ════════════════════════════════ */

export const dataSources: DataSource[] = [
  { uid: 'ds-01', code: 'SRC-PRD', module: 'PRODUCTION', name: 'Shop floor execution', entity: 'Production entries, work orders, machines, downtime, scrap', rowCount: 48_212, refreshMode: 'REAL_TIME', lastRefreshedAt: at(0, 0), lastRefreshDurationSeconds: 2, nextRefreshAt: at(0, 0), rejectedRows: 0, completenessPct: 99.8, status: 'HEALTHY', lastError: null },
  { uid: 'ds-02', code: 'SRC-QLT', module: 'QUALITY', name: 'Quality management', entity: 'Inspections, NCRs, CAPAs, complaints, supplier quality', rowCount: 12_884, refreshMode: 'EVERY_15_MIN', lastRefreshedAt: at(0, 0), lastRefreshDurationSeconds: 4, nextRefreshAt: at(0, 0), rejectedRows: 0, completenessPct: 99.2, status: 'HEALTHY', lastError: null },
  { uid: 'ds-03', code: 'SRC-INV', module: 'INVENTORY', name: 'Inventory & warehouse', entity: 'Stock positions, ledger, ageing, valuation, counts', rowCount: 96_440, refreshMode: 'HOURLY', lastRefreshedAt: at(0, 1), lastRefreshDurationSeconds: 18, nextRefreshAt: at(0, 0), rejectedRows: 0, completenessPct: 99.9, status: 'HEALTHY', lastError: null },
  { uid: 'ds-04', code: 'SRC-PRC', module: 'PROCUREMENT', name: 'Procurement', entity: 'Purchase orders, GRNs, evaluations, price history', rowCount: 21_106, refreshMode: 'HOURLY', lastRefreshedAt: at(0, 1), lastRefreshDurationSeconds: 9, nextRefreshAt: at(0, 0), rejectedRows: 0, completenessPct: 98.6, status: 'HEALTHY', lastError: null },
  { uid: 'ds-05', code: 'SRC-FIN', module: 'FINANCE', name: 'Finance & costing', entity: 'Journals, cost cards, actual costs, budgets, periods', rowCount: 64_918, refreshMode: 'NIGHTLY', lastRefreshedAt: at(0, 9), lastRefreshDurationSeconds: 142, nextRefreshAt: at(-1, 9), rejectedRows: 0, completenessPct: 100, status: 'HEALTHY', lastError: null },
  { uid: 'ds-06', code: 'SRC-HR', module: 'HRMS', name: 'HR & payroll', entity: 'Attendance, leave, payroll, incentives, skills', rowCount: 38_602, refreshMode: 'NIGHTLY', lastRefreshedAt: at(0, 9), lastRefreshDurationSeconds: 64, nextRefreshAt: at(-1, 9), rejectedRows: 0, completenessPct: 99.4, status: 'HEALTHY', lastError: null },
  { uid: 'ds-07', code: 'SRC-DSP', module: 'DISPATCH', name: 'Packing & dispatch', entity: 'Shipments, PODs, freight, returns, export documents', rowCount: 18_244, refreshMode: 'EVERY_15_MIN', lastRefreshedAt: at(0, 0), lastRefreshDurationSeconds: 6, nextRefreshAt: at(0, 0), rejectedRows: 0, completenessPct: 98.1, status: 'HEALTHY', lastError: null },
  // Two feeds that are not healthy — the interesting cases.
  { uid: 'ds-08', code: 'SRC-MNT', module: 'MAINTENANCE', name: 'Maintenance', entity: 'Assets, work orders, breakdowns, PM plans, utility logs', rowCount: 9_408, refreshMode: 'HOURLY', lastRefreshedAt: at(0, 7), lastRefreshDurationSeconds: 11, nextRefreshAt: at(0, 6), rejectedRows: 46, completenessPct: 91.2, status: 'DEGRADED', lastError: '46 utility readings rejected — meter identifier not found in the asset master. Likely a new meter added without a master record.' },
  { uid: 'ds-09', code: 'SRC-SALES', module: 'SALES', name: 'CRM & sales', entity: 'Leads, quotations, sales orders, pipeline', rowCount: 0, refreshMode: 'HOURLY', lastRefreshedAt: at(3, 4), lastRefreshDurationSeconds: 0, nextRefreshAt: at(0, 6), rejectedRows: 0, completenessPct: 0, status: 'FAILED', lastError: 'The CRM module is not yet built, so this feed has no source. Sales figures on dashboards currently come from dispatched value in the dispatch module, which is a proxy and is labelled as such.' },
  { uid: 'ds-10', code: 'SRC-PLN', module: 'PLANNING', name: 'Production planning', entity: 'Forecast, demand, MPS, MRP suggestions', rowCount: 14_820, refreshMode: 'NIGHTLY', lastRefreshedAt: at(1, 9), lastRefreshDurationSeconds: 88, nextRefreshAt: at(0, 9), rejectedRows: 0, completenessPct: 97.8, status: 'STALE', lastError: 'Last successful load was more than 24 hours ago. The nightly job did not run — check the scheduler.' },
]

/* ═══════════════════════ Security & governance ══════════════════════════ */

export const dashboardAccess: DashboardAccess[] = [
  { uid: 'da-01', role: 'MD', dashboardCode: 'DSH-MD', dashboardName: 'Managing Director', rowScope: 'ALL', maskedFields: [], canDrillToTransaction: true, canExport: true, canSchedule: true, grantedBy: 'System', grantedOn: d(180) },
  { uid: 'da-02', role: 'ACCOUNTS', dashboardCode: 'DSH-CFO', dashboardName: 'CFO dashboard', rowScope: 'ALL', maskedFields: [], canDrillToTransaction: true, canExport: true, canSchedule: true, grantedBy: 'System', grantedOn: d(180) },
  { uid: 'da-03', role: 'PLANT_HEAD', dashboardCode: 'DSH-PLANT', dashboardName: 'Plant head', rowScope: 'OWN_PLANT', maskedFields: ['revenue', 'gross_margin'], canDrillToTransaction: true, canExport: true, canSchedule: true, grantedBy: 'S. Ganapathy', grantedOn: d(120) },
  { uid: 'da-04', role: 'PROD_MGR', dashboardCode: 'DSH-PROD', dashboardName: 'Production manager', rowScope: 'OWN_PLANT', maskedFields: ['revenue', 'gross_margin', 'cost_per_bottle', 'labour_cost'], canDrillToTransaction: true, canExport: true, canSchedule: false, grantedBy: 'Meera Rajan', grantedOn: d(90) },
  { uid: 'da-05', role: 'QC_HEAD', dashboardCode: 'DSH-QLTY', dashboardName: 'Quality manager', rowScope: 'ALL', maskedFields: ['revenue', 'gross_margin', 'labour_cost'], canDrillToTransaction: true, canExport: true, canSchedule: true, grantedBy: 'Meera Rajan', grantedOn: d(90) },
  { uid: 'da-06', role: 'PURCHASE_MGR', dashboardCode: 'DSH-PURC', dashboardName: 'Purchase manager', rowScope: 'ALL', maskedFields: ['gross_margin', 'labour_cost'], canDrillToTransaction: true, canExport: true, canSchedule: true, grantedBy: 'S. Ganapathy', grantedOn: d(150) },
  { uid: 'da-07', role: 'STORE_KEEPER', dashboardCode: 'DSH-WHSE', dashboardName: 'Warehouse manager', rowScope: 'OWN_PLANT', maskedFields: ['stock_value', 'revenue', 'gross_margin'], canDrillToTransaction: true, canExport: false, canSchedule: false, grantedBy: 'Divya Sundaram', grantedOn: d(60) },
  { uid: 'da-08', role: 'HR', dashboardCode: 'DSH-HR', dashboardName: 'HR manager', rowScope: 'ALL', maskedFields: ['revenue', 'gross_margin'], canDrillToTransaction: true, canExport: true, canSchedule: true, grantedBy: 'S. Ganapathy', grantedOn: d(150) },
  { uid: 'da-09', role: 'SHIFT_SUP', dashboardCode: 'DSH-SUP', dashboardName: 'Shift supervisor', rowScope: 'OWN_TEAM', maskedFields: ['revenue', 'gross_margin', 'cost_per_bottle', 'labour_cost', 'salary'], canDrillToTransaction: true, canExport: false, canSchedule: false, grantedBy: 'Prakash Menon', grantedOn: d(45) },
  { uid: 'da-10', role: 'OPERATOR', dashboardCode: 'DSH-OPR', dashboardName: 'Operator terminal', rowScope: 'SELF', maskedFields: ['revenue', 'gross_margin', 'cost_per_bottle', 'labour_cost', 'salary', 'stock_value'], canDrillToTransaction: false, canExport: false, canSchedule: false, grantedBy: 'Prakash Menon', grantedOn: d(45) },
]

export const accessLog: AccessLogEntry[] = [
  { uid: 'al-01', at: at(0, 1), user: 'Meera Rajan', role: 'PLANT_HEAD', action: 'VIEWED', objectType: 'DASHBOARD', objectName: 'Plant head', sensitivity: 'OPEN', rowsTouched: null, ipAddress: '10.20.4.18', note: null },
  { uid: 'al-02', at: at(0, 2), user: 'S. Ganapathy', role: 'ACCOUNTS', action: 'EXPORTED', objectType: 'REPORT', objectName: 'Cost per bottle analysis', sensitivity: 'FINANCIAL', rowsTouched: 1_284, ipAddress: '10.20.1.6', note: 'Excel export for the board pack' },
  { uid: 'al-03', at: at(0, 3), user: 'Prakash Menon', role: 'PROD_MGR', action: 'DRILLED', objectType: 'KPI', objectName: 'Plant OEE → OEE by machine', sensitivity: 'OPEN', rowsTouched: 8, ipAddress: '10.20.6.42', note: null },
  { uid: 'al-04', at: at(0, 5), user: 'P. Vidya', role: 'HR', action: 'EXPORTED', objectType: 'REPORT', objectName: 'Workforce productivity', sensitivity: 'PEOPLE', rowsTouched: 238, ipAddress: '10.20.2.11', note: 'Monthly HR review' },
  { uid: 'al-05', at: at(1, 4), user: 'S. Ganapathy', role: 'ACCOUNTS', action: 'CHANGED', objectType: 'DASHBOARD', objectName: 'CFO dashboard', sensitivity: 'FINANCIAL', rowsTouched: null, ipAddress: '10.20.1.6', note: 'Added cost per bottle; version 6' },
  { uid: 'al-06', at: at(1, 7), user: 'Anand Krishnan', role: 'PURCHASE_MGR', action: 'SCHEDULED', objectType: 'REPORT', objectName: 'Supplier scorecard', sensitivity: 'FINANCIAL', rowsTouched: null, ipAddress: '10.20.3.9', note: 'Monthly to purchase and COO' },
  { uid: 'al-07', at: at(2, 6), user: 'R. Vasanth', role: 'SHIFT_SUP', action: 'VIEWED', objectType: 'DASHBOARD', objectName: 'Shift supervisor', sensitivity: 'OPEN', rowsTouched: null, ipAddress: '10.20.6.88', note: null },
  { uid: 'al-08', at: at(2, 8), user: 'Lakshmi Narayanan', role: 'QC_HEAD', action: 'SHARED', objectType: 'INSIGHT', objectName: 'Welding defects concentrate on one machine and one shift', sensitivity: 'OPEN', rowsTouched: null, ipAddress: '10.20.5.20', note: 'Shared with the production manager' },
  { uid: 'al-09', at: at(3, 9), user: 'S. Ganapathy', role: 'ACCOUNTS', action: 'EXPORTED', objectType: 'REPORT', objectName: 'Executive scorecard', sensitivity: 'FINANCIAL', rowsTouched: 30, ipAddress: '10.20.1.6', note: 'Board pack, June' },
  { uid: 'al-10', at: at(4, 5), user: 'Divya Sundaram', role: 'STORE_KEEPER', action: 'VIEWED', objectType: 'DASHBOARD', objectName: 'Warehouse manager', sensitivity: 'OPEN', rowsTouched: null, ipAddress: '10.20.7.14', note: 'Stock value masked for this role' },
]

/* ═══════════════════════════ Chart series ═══════════════════════════════ */

/** Downtime by reason, ranked, with the cumulative share — a real Pareto. */
export const downtimePareto: ParetoPoint[] = (() => {
  const byReason = new Map<string, number>()
  for (const e of downtimeEvents) byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + e.minutes)
  const rows = [...byReason.entries()]
    .map(([label, value]) => ({ label: label.replace(/_/g, ' ').toLowerCase(), value }))
    .sort((a, b) => b.value - a.value)
  const total = sum(rows.map((r) => r.value)) || 1
  let running = 0
  return rows.map((r) => {
    running += r.value
    return { ...r, cumulativePct: round((running / total) * 100) }
  })
})()

/** Scrap by defect reason, same treatment. */
export const scrapPareto: ParetoPoint[] = (() => {
  const byReason = new Map<string, number>()
  for (const s2 of scrapRecords) byReason.set(s2.reason, (byReason.get(s2.reason) ?? 0) + s2.quantity)
  const rows = [...byReason.entries()]
    .map(([label, value]) => ({ label: label.replace(/_/g, ' ').toLowerCase(), value }))
    .sort((a, b) => b.value - a.value)
  const total = sum(rows.map((r) => r.value)) || 1
  let running = 0
  return rows.map((r) => {
    running += r.value
    return { ...r, cumulativePct: round((running / total) * 100) }
  })
})()

/** Sales by region — from dispatched value, which is the honest proxy until CRM exists. */
export const regionSales: RegionSales[] = regionDispatch.map((r) => ({
  region: r.region,
  revenue: r.value,
  orders: Math.round(r.cartons / 40),
  customers: r.region === 'South' ? 14 : r.region === 'Export' ? 3 : 6,
  growthPct: r.region === 'Export' ? 18.4 : r.region === 'South' ? 6.2 : r.region === 'West' ? 9.1 : -2.4,
  onTimePct: r.onTimePct,
}))

/** OEE by machine, for the heat map. */
export const oeeByMachine = machinesWithTime.map((mc) => {
  const a = mc.plannedMinutes ? ((mc.plannedMinutes - mc.downMinutes) / mc.plannedMinutes) * 100 : 0
  const p = mc.runMinutes ? Math.min(100, ((mc.totalPieces * mc.idealCycleSeconds) / 60 / mc.runMinutes) * 100) : 0
  const qy = mc.totalPieces ? (mc.goodPieces / mc.totalPieces) * 100 : 0
  return {
    machine: mc.code,
    name: mc.name,
    line: mc.line,
    availability: round(a),
    performance: round(p),
    quality: round(qy),
    oee: round((a * p * qy) / 10_000),
    goodPieces: mc.goodPieces,
  }
})

export { financeTrend, qualityTrend, oeeTrend, hourlyOutput, attendanceTrend, payrollTrend, productivityTrend, attritionTrend, dispatchTrend, spendTrend, supplierSpend, priceTrend, valueTrend, ageingRows, transporterScores, maintenanceTrend, utilityLogs, headcountByDepartment }
