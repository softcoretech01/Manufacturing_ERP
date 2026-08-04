/**
 * Production planning arithmetic — MRP, CRP, scheduling and simulation.
 *
 *   Demand ──► MPS ──► MRP ──► planned orders ──► CRP ──► production orders
 *
 * The MRP run here is a real time-phased, level-by-level netting, not a
 * shortage list dressed up as one. That matters because the two things a
 * planner actually needs — *when* to release an order, and whether releasing it
 * is already too late — only fall out of time phasing. A single-bucket
 * "requirement minus stock" calculation can tell you that you are short; it
 * cannot tell you that the coil had to be ordered eleven days ago.
 *
 * Everything is computed from the live records. Nothing is stored except the
 * plan the planner deliberately commits to.
 */

import type { Bom, EngWorkCentre, Routing } from '@/types/engineering'
import type { Item } from '@/types/masters'
import type { StockPosition } from '@/types/inventory'
import type { PurchaseOrder } from '@/types/procurement'
import type {
  CalendarDay,
  DemandLine,
  MpsLine,
  PlanningPolicy,
  ProductionOrder,
  WorkOrderOp,
} from '@/types/planning'
import { defaultBomFor, defaultRoutingFor, isLiveBom } from '@/lib/engFlow'

/* ═══════════════════════════ Time buckets ═══════════════════════════ */

/** Planning runs in weekly buckets. Weeks start on Monday. */
export const BUCKET_DAYS = 7
export const DEFAULT_HORIZON = 12

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Dates are handled entirely in local time.
 *
 * `new Date('2026-07-27')` parses as UTC midnight, and `toISOString()` converts
 * back to UTC — so east of Greenwich a date round-trips to the day before, and
 * every bucket in the plan silently shifts by one. Parsing and formatting from
 * the local calendar components avoids the whole problem.
 */
export function parseDate(input: Date | string): Date {
  if (input instanceof Date) {
    const d = new Date(input)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const [y, m, day] = input.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, day ?? 1)
}

export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function mondayOf(input: Date | string): Date {
  const d = parseDate(input)
  const offset = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - offset)
  return d
}

export function addDays(date: Date | string, days: number): Date {
  const d = parseDate(date)
  d.setDate(d.getDate() + days)
  return d
}

/** The first day of each bucket across the horizon. */
export function bucketStarts(count: number, from: Date | string = new Date()): string[] {
  const m = mondayOf(from)
  return Array.from({ length: count }, (_, i) => iso(addDays(m, i * BUCKET_DAYS)))
}

/**
 * Which bucket a date lands in.
 *
 * A date before the horizon returns 0 — a requirement that was due last month
 * has not gone away, it is due now and late, and burying it outside the grid is
 * how a plan quietly ignores its own backlog. A date past the horizon returns
 * -1 and is left out of the run.
 */
export function bucketIndex(date: string, starts: string[]): number {
  if (!starts.length) return -1
  const t = parseDate(date).getTime()
  const first = parseDate(starts[0]).getTime()
  if (t < first) return 0
  const last = parseDate(starts[starts.length - 1]).getTime()
  if (t > last + (BUCKET_DAYS - 1) * 86_400_000) return -1
  // Rounded to whole days first, so a daylight-saving hour cannot shift a bucket.
  const days = Math.round((t - first) / 86_400_000)
  return Math.min(starts.length - 1, Math.floor(days / BUCKET_DAYS))
}

/** Whether a required-by date is already behind us. */
export function isPastDue(date: string, today: Date = new Date()) {
  return parseDate(date).getTime() < parseDate(today).getTime()
}

/* ═══════════════════════════ Low-level codes ═══════════════════════════ */

/**
 * An item's deepest position in any structure.
 *
 * MRP must plan a component only once, after every parent that consumes it has
 * been planned — otherwise the shell is netted before the flask has told it how
 * many are needed. The low-level code is what makes that ordering possible.
 */
export function lowLevelCodes(boms: Bom[]): Map<string, number> {
  const live = boms.filter(isLiveBom)
  const childrenOf = new Map<string, string[]>()
  for (const b of live) {
    const kids = childrenOf.get(b.productCode) ?? []
    childrenOf.set(b.productCode, [...kids, ...b.lines.map((l) => l.itemCode)])
  }

  const llc = new Map<string, number>()
  const assign = (code: string, level: number, path: string[]) => {
    if (path.includes(code) || level > 20) return
    const current = llc.get(code) ?? 0
    if (level > current || !llc.has(code)) llc.set(code, Math.max(current, level))
    for (const child of childrenOf.get(code) ?? []) assign(child, Math.max(current, level) + 1, [...path, code])
  }

  // Roots are products nothing else consumes.
  const allChildren = new Set([...childrenOf.values()].flat())
  const roots = [...childrenOf.keys()].filter((c) => !allChildren.has(c))
  for (const r of roots) assign(r, 0, [])
  // Anything unreachable from a root — an orphan structure — still gets planned.
  for (const c of childrenOf.keys()) if (!llc.has(c)) assign(c, 0, [])
  for (const c of allChildren) if (!llc.has(c)) llc.set(c, 1)

  return llc
}

/* ═══════════════════════════ Item planning picture ═══════════════════════════ */

export interface PlanningItem {
  code: string
  name: string
  uom: string
  /** Whether a live bill of material exists — not the same as being made here. */
  hasBom: boolean
  /** Free stock — on hand less what is already committed elsewhere. */
  available: number
  onHand: number
  reserved: number
  safetyStock: number
  leadTimeDays: number
  rate: number
  isManufactured: boolean
  maxLevel: number
  policy?: PlanningPolicy
}

export interface PlanningContext {
  boms: Bom[]
  routings: Routing[]
  workCentres: EngWorkCentre[]
  items: Item[]
  stock: StockPosition[]
  policies: PlanningPolicy[]
  calendar: CalendarDay[]
}

/**
 * Assembles what planning needs to know about an item, from inventory first and
 * the item master as the fallback. A component that has never been stocked has
 * no stock row; planning still has to be able to order it.
 */
export function planningItem(code: string, ctx: PlanningContext): PlanningItem {
  const sp = ctx.stock.find((s) => s.itemCode === code && !s.deletedAt)
  const item = ctx.items.find((i) => i.code === code)
  const policy = ctx.policies.find((p) => p.itemCode === code && p.isActive && !p.deletedAt)
  const hasBom = !!defaultBomFor(code, ctx.boms)

  return {
    /**
     * An item the item master calls manufactured is planned as production even
     * when it has no BOM yet — otherwise MRP quietly proposes buying something
     * the plant makes, and nobody notices until purchasing asks who the
     * supplier is. The missing BOM is raised as an exception instead.
     */
    hasBom,
    code,
    name: sp?.itemName ?? item?.name ?? code,
    uom: sp?.uom ?? item?.baseUom ?? 'NOS',
    available: sp?.available ?? 0,
    onHand: sp?.onHand ?? 0,
    reserved: sp?.reserved ?? 0,
    safetyStock: policy?.safetyStockOverride ?? sp?.safetyStock ?? item?.minStock ?? 0,
    leadTimeDays: policy?.leadTimeOverride ?? sp?.leadTimeDays ?? item?.leadTimeDays ?? 7,
    rate: sp?.rate ?? item?.standardCost ?? item?.lastPurchaseRate ?? 0,
    isManufactured: hasBom || !!item?.isManufactured,
    maxLevel: sp?.maxLevel ?? item?.maxStock ?? 0,
    policy,
  }
}

/** Rounds a net requirement to something the supplier or the line will accept. */
export function applyLotSize(net: number, policy?: PlanningPolicy): number {
  if (net <= 0) return 0
  if (!policy) return net
  let q = net
  if (policy.lotSizeRule === 'FIXED_ORDER_QTY' && policy.minOrderQty > 0) {
    q = Math.ceil(net / policy.minOrderQty) * policy.minOrderQty
  } else if (policy.lotSizeRule === 'MIN_ORDER_QTY') {
    q = Math.max(net, policy.minOrderQty)
  }
  if (policy.orderMultiple > 0) q = Math.ceil(q / policy.orderMultiple) * policy.orderMultiple
  return q
}

/* ═══════════════════════════ MRP ═══════════════════════════ */

export interface MrpBucketRow {
  bucket: number
  start: string
  grossRequirement: number
  scheduledReceipts: number
  /** Stock at the end of the bucket, after receipts and issues. */
  projectedOnHand: number
  netRequirement: number
  plannedReceipt: number
  /** Planned receipt offset back by the lead time. Negative means overdue. */
  releaseBucket: number | null
  releaseDate: string | null
}

export interface MrpItemPlan {
  itemCode: string
  itemName: string
  uom: string
  llc: number
  isManufactured: boolean
  openingStock: number
  safetyStock: number
  leadTimeDays: number
  rate: number
  buckets: MrpBucketRow[]
  totalGross: number
  totalPlanned: number
  /** First bucket where the plan needs an order released before today. */
  firstLateBucket: number | null
}

export interface PlannedOrder {
  uid: string
  itemCode: string
  itemName: string
  uom: string
  qty: number
  orderType: 'PURCHASE' | 'PRODUCTION'
  releaseDate: string
  dueDate: string
  bucket: number
  releaseBucket: number
  /** True when the release date has already passed — the order starts late. */
  isLate: boolean
  daysLate: number
  value: number
  /** What this order exists to cover: a demand document, or a parent order. */
  peggedTo: string
  llc: number
}

export interface MrpException {
  uid: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  itemCode: string
  itemName: string
  type: string
  message: string
  action: string
}

export interface MrpShortage {
  itemCode: string
  itemName: string
  uom: string
  requiredOn: string
  shortQty: number
  value: number
  leadTimeDays: number
  daysLate: number
}

export interface MrpResult {
  runAt: string
  horizon: number
  starts: string[]
  plans: MrpItemPlan[]
  plannedOrders: PlannedOrder[]
  exceptions: MrpException[]
  shortages: MrpShortage[]
  stats: {
    itemsPlanned: number
    purchaseOrders: number
    productionOrders: number
    purchaseValue: number
    lateOrders: number
    exceptions: number
  }
}

export interface MrpInput {
  demand: DemandLine[]
  mps: MpsLine[]
  purchaseOrders: PurchaseOrder[]
  productionOrders: ProductionOrder[]
  ctx: PlanningContext
  horizon?: number
  today?: Date
  /** When true, the MPS replaces raw demand for products that have one. */
  useMps?: boolean
}

/**
 * A full MRP run.
 *
 * Level by level, earliest bucket first:
 *
 *   projected on hand = previous + scheduled receipts − gross requirement
 *   net requirement   = safety stock − projected on hand, when that is positive
 *   planned receipt   = net requirement, sized to the item's lot rule
 *   planned release   = receipt bucket − lead time
 *
 * A manufactured item's planned release becomes gross requirement on its
 * components in the release bucket, which is why the ordering by low-level code
 * matters: by the time the shell is planned, every flask that needs one has
 * already said so.
 */
export function runMrp(input: MrpInput): MrpResult {
  const today = input.today ?? new Date()
  const horizon = input.horizon ?? DEFAULT_HORIZON
  const useMps = input.useMps ?? true
  const { ctx } = input
  const starts = bucketStarts(horizon, today)

  const plans: MrpItemPlan[] = []
  const plannedOrders: PlannedOrder[] = []
  const exceptions: MrpException[] = []
  const shortages: MrpShortage[] = []
  let exSeq = 0
  /**
   * Repeat-suppressed per item and type. Twelve identical "the lot rule rounded
   * this up" messages for one item is not twelve pieces of information, and a
   * list a planner scrolls past is a list a planner stops reading.
   */
  const seenOnce = new Set<string>()
  const ONCE_PER_ITEM = new Set(['LOT_SIZE_ROUNDING', 'INSIDE_FROZEN_WINDOW', 'NO_BOM', 'EXCESS_STOCK'])
  const raise = (
    severity: MrpException['severity'],
    item: PlanningItem | { code: string; name: string },
    type: string,
    message: string,
    action: string,
  ) => {
    const code = 'code' in item ? item.code : ''
    if (ONCE_PER_ITEM.has(type)) {
      const key = `${type}:${code}`
      if (seenOnce.has(key)) return
      seenOnce.add(key)
    }
    exceptions.push({
      uid: `exc-${++exSeq}`,
      severity,
      itemCode: code,
      itemName: 'name' in item ? item.name : '',
      type,
      message,
      action,
    })
  }

  /* ── 1. Independent demand, bucketed ─────────────────────────────── */

  const gross = new Map<string, number[]>()
  const pegs = new Map<string, string[][]>()
  const blank = () => Array.from({ length: horizon }, () => 0)
  const addGross = (code: string, bucket: number, qty: number, peg: string) => {
    if (qty <= 0 || bucket < 0 || bucket >= horizon) return
    if (!gross.has(code)) gross.set(code, blank())
    if (!pegs.has(code)) pegs.set(code, Array.from({ length: horizon }, () => [] as string[]))
    gross.get(code)![bucket] += qty
    const p = pegs.get(code)![bucket]
    if (!p.includes(peg)) p.push(peg)
  }

  const mpsProducts = new Set(
    input.mps.filter((m) => !m.deletedAt && m.status !== 'DRAFT').map((m) => m.productCode),
  )

  if (useMps) {
    for (const m of input.mps) {
      if (m.deletedAt || m.status === 'DRAFT') continue
      addGross(m.productCode, m.bucket, m.plannedQty, `${m.docNo} bucket ${m.bucket + 1}`)
    }
  }

  for (const d of input.demand) {
    if (d.deletedAt || d.status === 'CLOSED' || d.status === 'CANCELLED') continue
    // A product with a committed MPS is planned from the MPS, not twice.
    if (useMps && mpsProducts.has(d.productCode)) continue
    const open = Math.max(0, d.qty - d.qtyPlanned)
    if (open <= 0) continue
    const b = bucketIndex(d.requiredOn, starts)
    if (b < 0) continue
    if (isPastDue(d.requiredOn, today)) {
      raise(
        'WARNING',
        { code: d.productCode, name: d.productName },
        'PAST_DUE_DEMAND',
        `${d.docNo} was required on ${d.requiredOn} and is still open for ${open.toLocaleString('en-IN')} ${d.uom}.`,
        'Confirm the new date with the customer, or expedite.',
      )
    }
    addGross(d.productCode, b, open, d.docNo)
  }

  /* ── 2. Scheduled receipts already on the books ───────────────────── */

  const receipts = new Map<string, number[]>()
  const addReceipt = (code: string, bucket: number, qty: number) => {
    if (qty <= 0 || bucket < 0 || bucket >= horizon) return
    if (!receipts.has(code)) receipts.set(code, blank())
    receipts.get(code)![bucket] += qty
  }

  for (const po of input.purchaseOrders) {
    if (po.deletedAt) continue
    if (!['APPROVED', 'IN_PROGRESS', 'PARTIALLY_EXECUTED'].includes(po.status)) continue
    for (const l of po.lines) {
      const open = Math.max(0, l.qty - l.receivedQty)
      if (open <= 0) continue
      addReceipt(l.itemCode, bucketIndex(l.dueDate, starts), open)
    }
  }

  for (const wo of input.productionOrders) {
    if (wo.deletedAt) continue
    if (['COMPLETED', 'CLOSED', 'CANCELLED'].includes(wo.status)) continue
    const open = Math.max(0, wo.qty - wo.producedQty)
    if (open <= 0) continue
    addReceipt(wo.productCode, bucketIndex(wo.plannedFinish, starts), open)
    // A released order has already claimed its components, so they are not
    // planned for again.
  }

  /* ── 3. Net, level by level ──────────────────────────────────────── */

  const llc = lowLevelCodes(ctx.boms)
  const seeded = new Set([...gross.keys(), ...receipts.keys()])
  for (const code of seeded) if (!llc.has(code)) llc.set(code, 0)
  const maxLevel = Math.max(0, ...[...llc.values()])

  for (let level = 0; level <= maxLevel; level++) {
    const codesAtLevel = [...llc.entries()]
      .filter(([, l]) => l === level)
      .map(([c]) => c)
      .filter((c) => gross.has(c) || receipts.has(c))
      .sort()

    for (const code of codesAtLevel) {
      const item = planningItem(code, ctx)
      const g = gross.get(code) ?? blank()
      const r = receipts.get(code) ?? blank()
      const peg = pegs.get(code) ?? Array.from({ length: horizon }, () => [] as string[])

      // Lead time in whole buckets, always rounded up — half a week of lead
      // time still means the order goes out a week earlier.
      const leadBuckets = Math.ceil(item.leadTimeDays / BUCKET_DAYS)
      const rows: MrpBucketRow[] = []
      let running = item.available
      let firstLateBucket: number | null = null

      for (let b = 0; b < horizon; b++) {
        const projectedBefore = running + r[b] - g[b]
        let net = 0
        let plannedReceipt = 0
        let releaseBucket: number | null = null
        let releaseDate: string | null = null

        if (projectedBefore < item.safetyStock) {
          net = item.safetyStock - projectedBefore
          plannedReceipt = applyLotSize(net, item.policy)
          releaseBucket = b - leadBuckets
          releaseDate = iso(addDays(starts[0], releaseBucket * BUCKET_DAYS))

          if (releaseBucket < 0 && firstLateBucket === null) firstLateBucket = b

          const isProduction = item.isManufactured
          const daysLate = releaseBucket < 0 ? -releaseBucket * BUCKET_DAYS : 0
          const order: PlannedOrder = {
            uid: `plo-${code}-${b}`,
            itemCode: code,
            itemName: item.name,
            uom: item.uom,
            qty: plannedReceipt,
            orderType: isProduction ? 'PRODUCTION' : 'PURCHASE',
            releaseDate: releaseDate!,
            dueDate: starts[b],
            bucket: b,
            releaseBucket,
            isLate: releaseBucket < 0,
            daysLate,
            value: plannedReceipt * item.rate,
            peggedTo: peg[b].slice(0, 3).join(', ') || '—',
            llc: level,
          }
          plannedOrders.push(order)

          if (releaseBucket < 0) {
            shortages.push({
              itemCode: code,
              itemName: item.name,
              uom: item.uom,
              requiredOn: starts[b],
              shortQty: net,
              value: net * item.rate,
              leadTimeDays: item.leadTimeDays,
              daysLate,
            })
            raise(
              'ERROR',
              item,
              'RELEASE_IN_THE_PAST',
              `${plannedReceipt.toLocaleString('en-IN')} ${item.uom} is needed by ${starts[b]}, but at ${item.leadTimeDays} days' lead time it had to be released on ${releaseDate}.`,
              isProduction ? 'Split the lot, or pull the due date out.' : 'Expedite with the supplier, or re-time the demand.',
            )
          }

          if (item.policy && item.policy.frozenDays > 0) {
            const frozenUntil = addDays(today, item.policy.frozenDays)
            if (new Date(starts[b]) <= frozenUntil && releaseBucket >= 0) {
              raise(
                'WARNING',
                item,
                'INSIDE_FROZEN_WINDOW',
                `A new order lands on ${starts[b]}, inside the ${item.policy.frozenDays}-day frozen window.`,
                'Planner approval is required before this is released.',
              )
            }
          }

          if (plannedReceipt > net * 1.5 && net > 0) {
            raise(
              'INFO',
              item,
              'LOT_SIZE_ROUNDING',
              `Net requirement is ${net.toFixed(0)} ${item.uom} but the lot rule raises the order to ${plannedReceipt.toLocaleString('en-IN')}.`,
              'Expected — the excess carries into the following weeks.',
            )
          }

          // A manufactured item's release is its components' requirement.
          if (isProduction) {
            const bom = item.hasBom ? defaultBomFor(code, ctx.boms) : undefined
            if (bom && bom.baseQty > 0) {
              const childBucket = Math.max(0, releaseBucket)
              for (const line of bom.lines) {
                const need = (line.qtyPer / bom.baseQty) * (1 + line.scrapPct / 100) * plannedReceipt
                addGross(line.itemCode, childBucket, need, `${code} order wk ${b + 1}`)
                if (!llc.has(line.itemCode)) llc.set(line.itemCode, level + 1)
              }
            } else {
              raise(
                'ERROR',
                item,
                'NO_BOM',
                `${code} is planned for production but has no live bill of material, so nothing was raised for its components.`,
                'Approve a BOM in engineering before this can be built.',
              )
            }
          }
        }

        running = projectedBefore + plannedReceipt
        rows.push({
          bucket: b,
          start: starts[b],
          grossRequirement: g[b],
          scheduledReceipts: r[b],
          projectedOnHand: running,
          netRequirement: net,
          plannedReceipt,
          releaseBucket,
          releaseDate,
        })
      }

      const totalGross = g.reduce((s, v) => s + v, 0)
      const totalPlanned = rows.reduce((s, x) => s + x.plannedReceipt, 0)

      if (item.maxLevel > 0 && running > item.maxLevel) {
        raise(
          'WARNING',
          item,
          'EXCESS_STOCK',
          `Projected stock at the end of the horizon is ${running.toFixed(0)} ${item.uom} against a maximum of ${item.maxLevel.toLocaleString('en-IN')}.`,
          'Review the lot size or defer the last order.',
        )
      }

      plans.push({
        itemCode: code,
        itemName: item.name,
        uom: item.uom,
        llc: level,
        isManufactured: item.isManufactured,
        openingStock: item.available,
        safetyStock: item.safetyStock,
        leadTimeDays: item.leadTimeDays,
        rate: item.rate,
        buckets: rows,
        totalGross,
        totalPlanned,
        firstLateBucket,
      })
    }
  }

  plans.sort((a, b) => a.llc - b.llc || a.itemCode.localeCompare(b.itemCode))
  plannedOrders.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.itemCode.localeCompare(b.itemCode))
  shortages.sort((a, b) => b.daysLate - a.daysLate || b.value - a.value)

  const purchases = plannedOrders.filter((o) => o.orderType === 'PURCHASE')
  return {
    runAt: new Date().toISOString(),
    horizon,
    starts,
    plans,
    plannedOrders,
    exceptions,
    shortages,
    stats: {
      itemsPlanned: plans.length,
      purchaseOrders: purchases.length,
      productionOrders: plannedOrders.length - purchases.length,
      purchaseValue: purchases.reduce((s, o) => s + o.value, 0),
      lateOrders: plannedOrders.filter((o) => o.isLate).length,
      exceptions: exceptions.length,
    },
  }
}

/* ═══════════════════════════ Calendar ═══════════════════════════ */

/** Hours the plant is open on a date. Weekends are off unless the calendar says otherwise. */
export function plantHoursOn(date: string, calendar: CalendarDay[], defaultHours = 16): number {
  const entry = calendar.find((c) => c.date === date && !c.deletedAt)
  if (entry) return entry.hours
  const day = new Date(date).getDay()
  if (day === 0) return 0 // Sunday
  return defaultHours
}

export function isWorkingDay(date: string, calendar: CalendarDay[]) {
  return plantHoursOn(date, calendar) > 0
}

/** Working days inside a bucket, from the calendar. */
export function workingDaysInBucket(bucketStart: string, calendar: CalendarDay[]): number {
  let n = 0
  for (let i = 0; i < BUCKET_DAYS; i++) if (isWorkingDay(iso(addDays(bucketStart, i)), calendar)) n++
  return n
}

/* ═══════════════════════════ Capacity (CRP) ═══════════════════════════ */

export interface CrpCell {
  bucket: number
  start: string
  requiredHours: number
  availableHours: number
  loadPct: number
}

export interface CrpRow {
  workCentreCode: string
  workCentreName: string
  cells: CrpCell[]
  totalRequired: number
  totalAvailable: number
  peakLoadPct: number
  overloadedBuckets: number
  isBottleneck: boolean
}

export interface CapacityDemand {
  productCode: string
  qty: number
  bucket: number
}

/**
 * Loads every work centre with the hours the plan asks of it.
 *
 * Available hours are the centre's shift hours across the working days the
 * calendar allows, derated by its OEE target — planning against nameplate hours
 * is how a plan that looks 90% loaded turns out to be 115% loaded.
 */
export function capacityPlan(
  demand: CapacityDemand[],
  ctx: PlanningContext,
  starts: string[],
): CrpRow[] {
  const rows = new Map<string, CrpRow>()

  for (const wc of ctx.workCentres) {
    if (wc.deletedAt || !wc.isActive) continue
    rows.set(wc.code, {
      workCentreCode: wc.code,
      workCentreName: wc.name,
      cells: starts.map((start, bucket) => ({
        bucket,
        start,
        requiredHours: 0,
        availableHours: workingDaysInBucket(start, ctx.calendar) * wc.hoursPerDay * (wc.oeeTargetPct / 100),
        loadPct: 0,
      })),
      totalRequired: 0,
      totalAvailable: 0,
      peakLoadPct: 0,
      overloadedBuckets: 0,
      isBottleneck: false,
    })
  }

  for (const d of demand) {
    if (d.bucket < 0 || d.bucket >= starts.length || d.qty <= 0) continue
    const routing = defaultRoutingFor(d.productCode, ctx.routings)
    if (!routing) continue
    for (const op of routing.operations) {
      const row = rows.get(op.workCentreCode)
      if (!row) continue
      const hours = op.setupMinutes / 60 + (d.qty * op.cycleSeconds) / 3600
      row.cells[d.bucket].requiredHours += hours
    }
  }

  for (const row of rows.values()) {
    for (const c of row.cells) {
      c.loadPct = c.availableHours > 0 ? (c.requiredHours / c.availableHours) * 100 : c.requiredHours > 0 ? 999 : 0
      row.totalRequired += c.requiredHours
      row.totalAvailable += c.availableHours
      if (c.loadPct > 100) row.overloadedBuckets++
      row.peakLoadPct = Math.max(row.peakLoadPct, c.loadPct)
    }
    row.isBottleneck = row.peakLoadPct > 100
  }

  return [...rows.values()].sort((a, b) => b.peakLoadPct - a.peakLoadPct)
}

/* ═══════════════════════════ Scheduling ═══════════════════════════ */

/** The shift starts at 06:00; a day's capacity runs forward from there. */
export const SHIFT_START_HOUR = 6

/**
 * A point in shop time: a date, and how many minutes of that day's capacity
 * have already been consumed. Tracking the minutes matters — scheduling at
 * whole-day granularity collapses a five-operation routing into one date and
 * tells the planner nothing about the sequence.
 */
export interface ShopTime {
  date: string
  used: number
}

export function shopTimeAt(date: string): ShopTime {
  return { date, used: 0 }
}

/**
 * Formats a point in shop time as a stamp the UI can show.
 *
 * On a three-shift day the clock runs past midnight; it is clamped to the end
 * of the same date rather than wrapped, because a stamp that says 02:00 on the
 * date the work finished reads as the small hours of the wrong morning.
 */
export function formatShopTime(t: ShopTime): string {
  const total = SHIFT_START_HOUR * 60 + t.used
  const h = Math.floor(total / 60)
  if (h >= 24) return `${t.date}T23:59`
  return `${t.date}T${pad(h)}:${pad(Math.round(total % 60))}`
}

/** Walks a duration forward across the calendar, skipping non-working days. */
export function addWorkingMinutes(from: ShopTime, minutes: number, calendar: CalendarDay[]): ShopTime {
  let { date, used } = from
  let remaining = minutes
  let guard = 0
  while (guard++ < 800) {
    const capacity = plantHoursOn(date, calendar) * 60
    if (capacity <= 0) {
      date = iso(addDays(date, 1))
      used = 0
      continue
    }
    const free = capacity - used
    if (remaining <= free) return { date, used: used + remaining }
    remaining -= free
    date = iso(addDays(date, 1))
    used = 0
  }
  return { date, used }
}

/** Walks a duration backward — what has to start when, to finish on time. */
export function subWorkingMinutes(until: ShopTime, minutes: number, calendar: CalendarDay[]): ShopTime {
  let { date, used } = until
  let remaining = minutes
  let guard = 0
  while (guard++ < 800) {
    const capacity = plantHoursOn(date, calendar) * 60
    if (capacity <= 0 || used <= 0) {
      date = iso(addDays(date, -1))
      used = plantHoursOn(date, calendar) * 60
      continue
    }
    if (remaining <= used) return { date, used: used - remaining }
    remaining -= used
    date = iso(addDays(date, -1))
    used = plantHoursOn(date, calendar) * 60
  }
  return { date, used }
}

/**
 * Turns a routing into dated work order operations.
 *
 * Forward scheduling starts on a date and reports when it finishes; backward
 * scheduling starts from the date it must finish and reports when it has to
 * begin — which is the one that tells you the order is already late.
 */
export function scheduleRouting(
  routing: Routing,
  qty: number,
  anchorInput: string,
  direction: 'FORWARD' | 'BACKWARD',
  calendar: CalendarDay[],
): WorkOrderOp[] {
  // The anchor is a date. Forward means "start at the beginning of this day";
  // backward means "be finished by the end of it".
  const anchor = anchorInput.slice(0, 10)
  const ops = [...routing.operations].sort((a, b) => a.seq - b.seq)
  const minutesOf = (o: Routing['operations'][number]) => o.setupMinutes + (qty * o.cycleSeconds) / 60

  const out: WorkOrderOp[] = []

  if (direction === 'FORWARD') {
    // A non-working anchor date is pushed to the next day the plant is open.
    let cursor = shopTimeAt(anchor)
    let guard = 0
    while (plantHoursOn(cursor.date, calendar) <= 0 && guard++ < 30) cursor = shopTimeAt(iso(addDays(cursor.date, 1)))
    for (const o of ops) {
      const mins = minutesOf(o)
      const finish = addWorkingMinutes(cursor, mins, calendar)
      out.push(toWorkOrderOp(o, mins, formatShopTime(cursor), formatShopTime(finish)))
      cursor = finish
    }
  } else {
    let cursor: ShopTime = { date: anchor, used: plantHoursOn(anchor, calendar) * 60 }
    let guard = 0
    while (plantHoursOn(cursor.date, calendar) <= 0 && guard++ < 30) {
      const prev = iso(addDays(cursor.date, -1))
      cursor = { date: prev, used: plantHoursOn(prev, calendar) * 60 }
    }
    for (const o of [...ops].reverse()) {
      const mins = minutesOf(o)
      const start = subWorkingMinutes(cursor, mins, calendar)
      out.unshift(toWorkOrderOp(o, mins, formatShopTime(start), formatShopTime(cursor)))
      cursor = start
    }
  }
  return out
}

function toWorkOrderOp(
  o: Routing['operations'][number],
  runMinutes: number,
  start: string,
  finish: string,
): WorkOrderOp {
  return {
    uid: `wop-${o.uid}`,
    seq: o.seq,
    operationCode: o.operationCode,
    operationName: o.operationName,
    workCentreCode: o.workCentreCode,
    machineCode: o.machineCode,
    operators: o.operators,
    skill: o.skill,
    toolCode: o.toolCode,
    qcCheckpoint: o.qcCheckpoint,
    setupMinutes: o.setupMinutes,
    runMinutes: Math.round(runMinutes - o.setupMinutes),
    plannedStart: start,
    plannedFinish: finish,
    status: 'PLANNED',
  }
}

/** Total shop minutes a routing needs for a quantity. */
export function routingMinutesFor(routing: Routing, qty: number) {
  return routing.operations.reduce((s, o) => s + o.setupMinutes + (qty * o.cycleSeconds) / 60, 0)
}

/* ═══════════════════════════ Simulation ═══════════════════════════ */

export interface SimMaterialLine {
  itemCode: string
  itemName: string
  uom: string
  required: number
  available: number
  shortQty: number
  coveragePct: number
  leadTimeDays: number
  value: number
}

export interface SimCapacityLine {
  workCentreCode: string
  workCentreName: string
  requiredHours: number
  availableHoursPerWeek: number
  weeksNeeded: number
  loadPct: number
}

export interface OrderSimulation {
  productCode: string
  productName: string
  qty: number
  materialLines: SimMaterialLine[]
  materialOk: boolean
  shortCount: number
  capacityLines: SimCapacityLine[]
  capacityOk: boolean
  totalMinutes: number
  plannedStart: string
  plannedFinish: string
  operations: WorkOrderOp[]
  unitCost: number
  totalCost: number
  warnings: string[]
}

/**
 * Everything a planner needs to know before releasing an order: whether the
 * material is there, whether the machines can take it, what it will cost and
 * when it will be done. Run before release, not after.
 */
export function simulateOrder(
  productCode: string,
  qty: number,
  startDate: string,
  ctx: PlanningContext,
  unitCost: number,
): OrderSimulation {
  const warnings: string[] = []
  const bom = defaultBomFor(productCode, ctx.boms)
  const routing = defaultRoutingFor(productCode, ctx.routings)
  const product = planningItem(productCode, ctx)

  /* Material — the BOM's direct components against free stock. */
  const materialLines: SimMaterialLine[] = []
  if (!bom) {
    warnings.push('No live bill of material — the material check cannot run.')
  } else if (bom.baseQty > 0) {
    for (const line of bom.lines) {
      const comp = planningItem(line.itemCode, ctx)
      const required = (line.qtyPer / bom.baseQty) * (1 + line.scrapPct / 100) * qty
      const shortQty = Math.max(0, required - comp.available)
      materialLines.push({
        itemCode: line.itemCode,
        itemName: line.itemName,
        uom: line.uom,
        required,
        available: comp.available,
        shortQty,
        coveragePct: required > 0 ? Math.min(100, (comp.available / required) * 100) : 100,
        leadTimeDays: comp.leadTimeDays,
        value: required * comp.rate,
      })
    }
  }

  /* Capacity — this order's hours against one week at each centre. */
  const capacityLines: SimCapacityLine[] = []
  let totalMinutes = 0
  let operations: WorkOrderOp[] = []
  let plannedFinish = startDate

  if (!routing) {
    warnings.push('No live routing — the capacity check and the finish date cannot be computed.')
  } else {
    totalMinutes = routingMinutesFor(routing, qty)
    operations = scheduleRouting(routing, qty, startDate, 'FORWARD', ctx.calendar)
    plannedFinish = operations.length ? operations[operations.length - 1].plannedFinish : startDate

    const byCentre = new Map<string, number>()
    for (const o of routing.operations) {
      const hours = o.setupMinutes / 60 + (qty * o.cycleSeconds) / 3600
      byCentre.set(o.workCentreCode, (byCentre.get(o.workCentreCode) ?? 0) + hours)
    }
    for (const [code, hours] of byCentre) {
      const wc = ctx.workCentres.find((w) => w.code === code)
      if (!wc) {
        warnings.push(`Work centre ${code} is on the routing but not in the master.`)
        continue
      }
      const weekly = workingDaysInBucket(iso(mondayOf(startDate)), ctx.calendar) * wc.hoursPerDay * (wc.oeeTargetPct / 100)
      capacityLines.push({
        workCentreCode: code,
        workCentreName: wc.name,
        requiredHours: hours,
        availableHoursPerWeek: weekly,
        weeksNeeded: weekly > 0 ? hours / weekly : 0,
        loadPct: weekly > 0 ? (hours / weekly) * 100 : 999,
      })
    }
    capacityLines.sort((a, b) => b.loadPct - a.loadPct)
  }

  const shortCount = materialLines.filter((l) => l.shortQty > 0).length
  if (unitCost <= 0) warnings.push('The product has no rolled cost, so the estimate is zero.')

  return {
    productCode,
    productName: product.name,
    qty,
    materialLines,
    materialOk: shortCount === 0 && !!bom,
    shortCount,
    capacityLines,
    capacityOk: capacityLines.every((c) => c.loadPct <= 100),
    totalMinutes,
    plannedStart: startDate,
    plannedFinish,
    operations,
    unitCost,
    totalCost: unitCost * qty,
    warnings,
  }
}

/* ═══════════════════════════ Reservation ═══════════════════════════ */

export interface ReservationCheck {
  itemCode: string
  requested: number
  freeStock: number
  alreadyReserved: number
  canReserve: number
  isOverAllocated: boolean
}

/**
 * Guards against promising the same stock twice. Free stock is what inventory
 * reports less everything other open production orders have already claimed.
 */
export function reservationCheck(
  itemCode: string,
  requested: number,
  orders: ProductionOrder[],
  excludeOrderUid: string | null,
  ctx: PlanningContext,
): ReservationCheck {
  const item = planningItem(itemCode, ctx)
  const alreadyReserved = orders
    .filter((o) => !o.deletedAt && o.uid !== excludeOrderUid && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status))
    .flatMap((o) => o.components)
    .filter((c) => c.itemCode === itemCode)
    .reduce((s, c) => s + c.reservedQty, 0)

  const free = Math.max(0, item.available - alreadyReserved)
  return {
    itemCode,
    requested,
    freeStock: item.available,
    alreadyReserved,
    canReserve: Math.min(requested, free),
    isOverAllocated: requested > free,
  }
}

/* ═══════════════════════════ Order lifecycle ═══════════════════════════ */

/** Ch 11. A production order may only move to one of its successors. */
export const ORDER_FLOW: Record<ProductionOrder['status'], ProductionOrder['status'][]> = {
  PLANNED: ['FIRM_PLANNED', 'CANCELLED'],
  FIRM_PLANNED: ['RELEASED', 'PLANNED', 'CANCELLED'],
  RELEASED: ['MATERIAL_RESERVED', 'CANCELLED'],
  MATERIAL_RESERVED: ['MATERIAL_ISSUED', 'RELEASED', 'CANCELLED'],
  MATERIAL_ISSUED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

export const ORDER_STATUS_LABEL: Record<ProductionOrder['status'], string> = {
  PLANNED: 'Planned',
  FIRM_PLANNED: 'Firm planned',
  RELEASED: 'Released',
  MATERIAL_RESERVED: 'Material reserved',
  MATERIAL_ISSUED: 'Material issued',
  IN_PRODUCTION: 'In production',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}

/** Why an order cannot be released yet. */
export function releaseBlockers(order: ProductionOrder, ctx: PlanningContext): string[] {
  const blockers: string[] = []
  if (!defaultBomFor(order.productCode, ctx.boms)) blockers.push('The product has no live bill of material.')
  if (!defaultRoutingFor(order.productCode, ctx.routings)) blockers.push('The product has no live routing.')
  if (!order.components.length) blockers.push('The order has no component list.')
  if (!order.operations.length) blockers.push('The order has no operations.')
  const short = order.components.filter((c) => c.availableAtPlanning < c.requiredQty)
  if (short.length) blockers.push(`${short.length} component${short.length === 1 ? '' : 's'} short at planning: ${short.slice(0, 3).map((c) => c.itemCode).join(', ')}.`)
  return blockers
}

/* ═══════════════════════════ Forecast accuracy ═══════════════════════════ */

/**
 * Mean absolute percentage error against actuals, for the periods that have
 * closed. A forecast nobody measures is a wish.
 */
export function forecastAccuracy(rows: { forecastQty: number; actualQty: number | null }[]) {
  const closed = rows.filter((r) => r.actualQty !== null && r.actualQty > 0)
  if (!closed.length) return { mapePct: null as number | null, biasPct: null as number | null, periods: 0 }
  const mape = closed.reduce((s, r) => s + Math.abs(r.forecastQty - (r.actualQty ?? 0)) / (r.actualQty ?? 1), 0) / closed.length
  const bias = closed.reduce((s, r) => s + (r.forecastQty - (r.actualQty ?? 0)) / (r.actualQty ?? 1), 0) / closed.length
  return { mapePct: mape * 100, biasPct: bias * 100, periods: closed.length }
}
