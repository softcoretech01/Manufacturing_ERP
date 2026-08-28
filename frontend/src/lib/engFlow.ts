/**
 * Product engineering arithmetic.
 *
 *   Product ──► BOM ──► multi-level explosion ──► material cost
 *          └──► Routing ──► work centre rates ──► labour, machine, tooling
 *                                              └──► cost roll-up ──► standard cost
 *
 * Every figure the engineering screens display is computed here rather than
 * stored, so a BOM edit is reflected in the explosion, the where-used list and
 * the roll-up in the same instant. The screens stay presentation; this file is
 * where the rules live and where they can be reasoned about on their own.
 */

import type {
  Bom,
  BomLine,
  ChangeLine,
  EngChange,
  EngProduct,
  Lifecycle,
  Routing,
  Tool,
  EngWorkCentre,
} from '@/types/engineering'
import type { Item } from '@/types/masters'

/* ═══════════════════════════ Numbering ═══════════════════════════ */

/** Next document number in a series, derived from the rows already present. */
export function nextDocNo(prefix: string, rows: { docNo: string }[], width = 4) {
  const highest = rows.reduce((max, r) => {
    const n = Number(r.docNo.slice(-width))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `${prefix}/26-27/${String(highest + 1).padStart(width, '0')}`
}

/* ═══════════════════════════ BOM selection ═══════════════════════════ */

/** A BOM row is live if it is the current revision, not a superseded one. */
export function isLiveBom(b: Bom) {
  return b.status === 'ACTIVE' || b.status === 'APPROVED'
}

/** Every revision of every BOM raised against a product, newest revision first. */
export function bomsForProduct(productCode: string, boms: Bom[]) {
  return boms
    .filter((b) => b.productCode === productCode)
    .sort((a, b) => b.revision - a.revision)
}

/**
 * The BOM planning and costing use when nothing else is specified: the highest
 * live revision flagged default, falling back to the highest live revision.
 */
export function defaultBomFor(productCode: string, boms: Bom[]): Bom | undefined {
  const live = bomsForProduct(productCode, boms).filter(isLiveBom)
  return live.find((b) => b.isDefault) ?? live[0]
}

/** Alternate BOMs — the same product built a different way for a customer. */
export function alternateBomsFor(productCode: string, boms: Bom[]) {
  return bomsForProduct(productCode, boms).filter((b) => isLiveBom(b) && !b.isDefault)
}

export function latestRevisionOf(docNo: string, boms: Bom[]): Bom | undefined {
  return boms.filter((b) => b.docNo === docNo).sort((a, b) => b.revision - a.revision)[0]
}

/* ═══════════════════════════ Multi-level explosion ═══════════════════════════ */

export interface ExplodedLine {
  /** Stable key for the row — the path makes it unique even when an item repeats. */
  key: string
  /** 1 = a direct component of the product being exploded. */
  level: number
  parentCode: string
  itemCode: string
  itemName: string
  uom: string
  /** Quantity for one of the immediate parent, before scrap. */
  qtyPer: number
  scrapPct: number
  /** Quantity needed for the whole order, scrap compounded at every level. */
  extendedQty: number
  isPhantom: boolean
  /** True when this component is itself manufactured and has its own BOM. */
  hasBom: boolean
  childBomNo: string | null
  operationSeq: number | null
  notes: string
}

/**
 * Explodes a product to every level of its structure.
 *
 * Scrap compounds down the tree, which is the point of exploding rather than
 * multiplying: if a sub-assembly loses 2% and its shell loses 3%, the coil
 * requirement carries both losses, not the larger of the two.
 *
 * A product that appears inside its own structure would recurse forever, so the
 * path is carried down and a repeat stops the branch instead of hanging.
 */
export function explodeBom(
  productCode: string,
  orderQty: number,
  boms: Bom[],
  opts: { maxLevels?: number } = {},
): ExplodedLine[] {
  const maxLevels = opts.maxLevels ?? 12
  const out: ExplodedLine[] = []

  const walk = (code: string, qty: number, level: number, path: string[]) => {
    if (level > maxLevels || path.includes(code)) return
    const bom = defaultBomFor(code, boms)
    if (!bom || bom.baseQty <= 0) return
    const factor = qty / bom.baseQty

    for (const line of [...bom.lines].sort((a, b) => a.seq - b.seq)) {
      const extendedQty = line.qtyPer * factor * (1 + line.scrapPct / 100)
      const childBom = defaultBomFor(line.itemCode, boms)
      out.push({
        key: `${path.join('>')}>${code}>${line.itemCode}>${line.seq}`,
        level,
        parentCode: code,
        itemCode: line.itemCode,
        itemName: line.itemName,
        uom: line.uom,
        qtyPer: line.qtyPer,
        scrapPct: line.scrapPct,
        extendedQty,
        isPhantom: line.isPhantom,
        hasBom: !!childBom,
        childBomNo: childBom?.docNo ?? null,
        operationSeq: line.operationSeq,
        notes: line.notes,
      })
      if (childBom) walk(line.itemCode, extendedQty, level + 1, [...path, code])
    }
  }

  walk(productCode, orderQty, 1, [])
  return out
}

/**
 * Flattens an explosion to net requirements per item — what procurement and MRP
 * actually consume. Sub-assemblies that are made in house are excluded because
 * their components are already in the list; including both would double count.
 */
export function netRequirements(lines: ExplodedLine[]) {
  const map = new Map<string, { itemCode: string; itemName: string; uom: string; qty: number; levels: number[] }>()
  for (const l of lines) {
    if (l.hasBom || l.isPhantom) continue
    const e = map.get(l.itemCode)
    if (e) {
      e.qty += l.extendedQty
      if (!e.levels.includes(l.level)) e.levels.push(l.level)
    } else {
      map.set(l.itemCode, { itemCode: l.itemCode, itemName: l.itemName, uom: l.uom, qty: l.extendedQty, levels: [l.level] })
    }
  }
  return [...map.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode))
}

/* ═══════════════════════════ Where used ═══════════════════════════ */

export interface WhereUsedRow {
  key: string
  level: number
  bomDocNo: string
  bomRevision: number
  parentCode: string
  parentName: string
  qtyPer: number
  uom: string
  bomStatus: Bom['status']
  isDefault: boolean
}

/**
 * Walks upward: which BOMs consume this item, and which products consume those.
 * Answering "if I obsolete this seal, what stops shipping" needs the whole
 * chain, not just the immediate parent.
 */
export function whereUsed(itemCode: string, boms: Bom[], opts: { liveOnly?: boolean } = {}): WhereUsedRow[] {
  const liveOnly = opts.liveOnly ?? true
  const pool = liveOnly ? boms.filter(isLiveBom) : boms
  const out: WhereUsedRow[] = []

  const walk = (code: string, level: number, path: string[]) => {
    if (level > 12 || path.includes(code)) return
    for (const bom of pool) {
      const line = bom.lines.find((l) => l.itemCode === code)
      if (!line) continue
      out.push({
        key: `${path.join('>')}>${bom.uid}>${code}`,
        level,
        bomDocNo: bom.docNo,
        bomRevision: bom.revision,
        parentCode: bom.productCode,
        parentName: bom.productName,
        qtyPer: line.qtyPer,
        uom: line.uom,
        bomStatus: bom.status,
        isDefault: bom.isDefault,
      })
      walk(bom.productCode, level + 1, [...path, code])
    }
  }

  walk(itemCode, 1, [])
  return out
}

/**
 * Guards the BOM form: adding a component that already contains this product,
 * anywhere below it, would make the structure circular.
 */
export function wouldCreateCycle(productCode: string, componentCode: string, boms: Bom[]): boolean {
  if (productCode === componentCode) return true
  const exploded = explodeBom(componentCode, 1, boms)
  return exploded.some((l) => l.itemCode === productCode)
}

/* ═══════════════════════════ Routing ═══════════════════════════ */

export function routingsForProduct(productCode: string, routings: Routing[]) {
  return routings.filter((r) => r.productCode === productCode).sort((a, b) => b.revision - a.revision)
}

export function defaultRoutingFor(productCode: string, routings: Routing[]): Routing | undefined {
  const live = routingsForProduct(productCode, routings).filter(
    (r) => r.status === 'ACTIVE' || r.status === 'APPROVED',
  )
  return live.find((r) => r.isDefault) ?? live[0]
}

export interface RoutingTime {
  /** Setup minutes for the whole lot, incurred once per operation. */
  setupMinutes: number
  /** Run minutes for the whole lot. */
  runMinutes: number
  totalMinutes: number
  /** Minutes per finished piece, setup amortised over the costing lot. */
  minutesPerUnit: number
  operationCount: number
  qcCheckpoints: number
}

export function routingTime(routing: Routing): RoutingTime {
  const lot = Math.max(1, routing.costingLotSize)
  const setupMinutes = routing.operations.reduce((s, o) => s + o.setupMinutes, 0)
  const runMinutes = routing.operations.reduce((s, o) => s + (o.cycleSeconds / 60) * lot, 0)
  const totalMinutes = setupMinutes + runMinutes
  return {
    setupMinutes,
    runMinutes,
    totalMinutes,
    minutesPerUnit: totalMinutes / lot,
    operationCount: routing.operations.length,
    qcCheckpoints: routing.operations.filter((o) => o.qcCheckpoint).length,
  }
}

/* ═══════════════════════════ Cost roll-up ═══════════════════════════ */

export interface CostBuckets {
  rawMaterial: number
  packing: number
  consumables: number
  labour: number
  machine: number
  tooling: number
  overhead: number
}

export interface MaterialCostLine {
  itemCode: string
  itemName: string
  uom: string
  qtyPer: number
  scrapPct: number
  /** Quantity for one finished unit, including scrap. */
  effectiveQty: number
  unitCost: number
  amount: number
  /** Where the unit cost came from — a rolled sub-assembly or the item master. */
  source: 'ROLLED' | 'STANDARD_COST' | 'LAST_PURCHASE' | 'MISSING'
  bucket: keyof Pick<CostBuckets, 'rawMaterial' | 'packing' | 'consumables'>
}

export interface OperationCostLine {
  seq: number
  operationName: string
  workCentreCode: string
  setupMinutes: number
  cycleSeconds: number
  operators: number
  labour: number
  machine: number
  tooling: number
  overhead: number
  total: number
}

export interface CostRollUp {
  productCode: string
  productName: string
  buckets: CostBuckets
  materialTotal: number
  conversionTotal: number
  total: number
  materialLines: MaterialCostLine[]
  operationLines: OperationCostLine[]
  bomDocNo: string | null
  bomRevision: number | null
  routingDocNo: string | null
  routingRevision: number | null
  lotSize: number
  warnings: string[]
}

export interface CostContext {
  boms: Bom[]
  routings: Routing[]
  workCentres: EngWorkCentre[]
  tools: Tool[]
  items: Item[]
  products: EngProduct[]
}

export interface Simulation {
  /** Percentage move applied to every material cost, e.g. a steel price rise. */
  materialPct: number
  /** Percentage move applied to labour and machine rates. */
  conversionPct: number
  /** Overrides the routing's costing lot size, if given. */
  lotSize: number | null
}

export const NO_SIMULATION: Simulation = { materialPct: 0, conversionPct: 0, lotSize: null }

const emptyBuckets = (): CostBuckets => ({
  rawMaterial: 0,
  packing: 0,
  consumables: 0,
  labour: 0,
  machine: 0,
  tooling: 0,
  overhead: 0,
})

function bucketFor(item: Item | undefined): MaterialCostLine['bucket'] {
  if (!item) return 'rawMaterial'
  if (item.itemType === 'PACKING') return 'packing'
  if (item.itemType === 'CONSUMABLE') return 'consumables'
  return 'rawMaterial'
}

/**
 * Rolls a product's cost up from its structure.
 *
 * A manufactured component is rolled recursively rather than read from its
 * stored standard cost, so a change three levels down reaches the finished
 * product's cost immediately — that recursion is the whole reason roll-up
 * exists. Its buckets are merged into the parent's, so a sub-assembly's labour
 * still reports as labour on the finished bottle.
 */
export function rollUpCost(
  productCode: string,
  ctx: CostContext,
  sim: Simulation = NO_SIMULATION,
  path: string[] = [],
): CostRollUp {
  const product = ctx.products.find((p) => p.code === productCode)
  const item = ctx.items.find((i) => i.code === productCode)
  const warnings: string[] = []
  const buckets = emptyBuckets()
  const materialLines: MaterialCostLine[] = []
  const operationLines: OperationCostLine[] = []

  const name = product?.name ?? item?.name ?? productCode

  if (path.includes(productCode)) {
    warnings.push(`Circular structure at ${productCode} — the branch was stopped.`)
    return blankRollUp(productCode, name, warnings)
  }

  /* ── Material ─────────────────────────────────────────────────────── */
  const bom = defaultBomFor(productCode, ctx.boms)
  if (!bom) {
    warnings.push('No live bill of material — material cost is zero.')
  } else if (bom.baseQty <= 0) {
    warnings.push('The BOM base quantity is zero, so nothing can be costed against it.')
  } else {
    for (const line of [...bom.lines].sort((a, b) => a.seq - b.seq)) {
      const effectiveQty = (line.qtyPer / bom.baseQty) * (1 + line.scrapPct / 100)
      const childBom = defaultBomFor(line.itemCode, ctx.boms)
      const childItem = ctx.items.find((i) => i.code === line.itemCode)

      if (childBom) {
        // Manufactured component — roll it and merge its buckets in.
        const child = rollUpCost(line.itemCode, ctx, sim, [...path, productCode])
        const unitCost = child.total
        buckets.rawMaterial += child.buckets.rawMaterial * effectiveQty
        buckets.packing += child.buckets.packing * effectiveQty
        buckets.consumables += child.buckets.consumables * effectiveQty
        buckets.labour += child.buckets.labour * effectiveQty
        buckets.machine += child.buckets.machine * effectiveQty
        buckets.tooling += child.buckets.tooling * effectiveQty
        buckets.overhead += child.buckets.overhead * effectiveQty
        materialLines.push({
          itemCode: line.itemCode,
          itemName: line.itemName,
          uom: line.uom,
          qtyPer: line.qtyPer,
          scrapPct: line.scrapPct,
          effectiveQty,
          unitCost,
          amount: unitCost * effectiveQty,
          source: 'ROLLED',
          bucket: 'rawMaterial',
        })
        for (const w of child.warnings) warnings.push(`${line.itemCode}: ${w}`)
        continue
      }

      // Bought-out or unstructured component — priced from the item master.
      let unitCost = 0
      let source: MaterialCostLine['source'] = 'MISSING'
      if (childItem) {
        if (childItem.standardCost > 0) {
          unitCost = childItem.standardCost
          source = 'STANDARD_COST'
        } else if (childItem.lastPurchaseRate > 0) {
          unitCost = childItem.lastPurchaseRate
          source = 'LAST_PURCHASE'
        } else {
          warnings.push(`${line.itemCode} has neither a standard cost nor a last purchase rate.`)
        }
      } else {
        warnings.push(`${line.itemCode} is not in the item master — it cannot be costed or purchased.`)
      }

      const adjusted = unitCost * (1 + sim.materialPct / 100)
      const bucket = bucketFor(childItem)
      buckets[bucket] += adjusted * effectiveQty
      materialLines.push({
        itemCode: line.itemCode,
        itemName: line.itemName,
        uom: line.uom,
        qtyPer: line.qtyPer,
        scrapPct: line.scrapPct,
        effectiveQty,
        unitCost: adjusted,
        amount: adjusted * effectiveQty,
        source,
        bucket,
      })
    }
  }

  /* ── Conversion ───────────────────────────────────────────────────── */
  const routing = defaultRoutingFor(productCode, ctx.routings)
  const lotSize = Math.max(1, sim.lotSize ?? routing?.costingLotSize ?? 1)

  if (!routing) {
    warnings.push('No live routing — labour, machine and tooling cost are zero.')
  } else {
    for (const op of [...routing.operations].sort((a, b) => a.seq - b.seq)) {
      const wc = ctx.workCentres.find((w) => w.code === op.workCentreCode && !w.deletedAt)
      if (!wc) {
        warnings.push(`Operation ${op.seq} points at work centre ${op.workCentreCode}, which does not exist.`)
        continue
      }
      const rateFactor = 1 + sim.conversionPct / 100
      const labourRate = wc.labourRatePerHour * rateFactor
      const machineRate = wc.machineRatePerHour * rateFactor

      // Setup is incurred once per lot, so per unit it divides by the lot size.
      const setupHours = op.setupMinutes / 60
      const runHours = op.cycleSeconds / 3600

      const labour = (setupHours * labourRate * op.operators) / lotSize + runHours * labourRate * op.operators
      const machine = (setupHours * machineRate) / lotSize + runHours * machineRate

      // Tooling is amortised across the pieces the tool is rated to produce.
      const tool = op.toolCode ? ctx.tools.find((t) => t.code === op.toolCode && !t.deletedAt) : undefined
      let tooling = 0
      if (op.toolCode && !tool) {
        warnings.push(`Operation ${op.seq} calls for tool ${op.toolCode}, which is not in the tool register.`)
      } else if (tool && tool.lifeStrokes > 0) {
        tooling = tool.replacementCost / tool.lifeStrokes
      }

      const overhead = (labour + machine) * (wc.overheadPct / 100)

      buckets.labour += labour
      buckets.machine += machine
      buckets.tooling += tooling
      buckets.overhead += overhead

      operationLines.push({
        seq: op.seq,
        operationName: op.operationName,
        workCentreCode: op.workCentreCode,
        setupMinutes: op.setupMinutes,
        cycleSeconds: op.cycleSeconds,
        operators: op.operators,
        labour,
        machine,
        tooling,
        overhead,
        total: labour + machine + tooling + overhead,
      })
    }
  }

  const materialTotal = buckets.rawMaterial + buckets.packing + buckets.consumables
  const conversionTotal = buckets.labour + buckets.machine + buckets.tooling + buckets.overhead

  return {
    productCode,
    productName: name,
    buckets,
    materialTotal,
    conversionTotal,
    total: materialTotal + conversionTotal,
    materialLines,
    operationLines,
    bomDocNo: bom?.docNo ?? null,
    bomRevision: bom?.revision ?? null,
    routingDocNo: routing?.docNo ?? null,
    routingRevision: routing?.revision ?? null,
    lotSize,
    warnings,
  }
}

function blankRollUp(productCode: string, productName: string, warnings: string[]): CostRollUp {
  return {
    productCode,
    productName,
    buckets: emptyBuckets(),
    materialTotal: 0,
    conversionTotal: 0,
    total: 0,
    materialLines: [],
    operationLines: [],
    bomDocNo: null,
    bomRevision: null,
    routingDocNo: null,
    routingRevision: null,
    lotSize: 1,
    warnings,
  }
}

/* ═══════════════════════════ Lifecycle ═══════════════════════════ */

/** Ch 18. A state may only move to one of its successors. */
export const LIFECYCLE_FLOW: Record<Lifecycle, Lifecycle[]> = {
  CONCEPT: ['DESIGN', 'ARCHIVED'],
  DESIGN: ['PROTOTYPE', 'CONCEPT', 'ARCHIVED'],
  PROTOTYPE: ['TESTING', 'DESIGN', 'ARCHIVED'],
  TESTING: ['APPROVED', 'PROTOTYPE', 'ARCHIVED'],
  APPROVED: ['PRODUCTION', 'TESTING'],
  PRODUCTION: ['OBSOLETE'],
  OBSOLETE: ['ARCHIVED', 'PRODUCTION'],
  ARCHIVED: [],
}

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  CONCEPT: 'Concept',
  DESIGN: 'Design',
  PROTOTYPE: 'Prototype',
  TESTING: 'Testing',
  APPROVED: 'Approved',
  PRODUCTION: 'Production',
  OBSOLETE: 'Obsolete',
  ARCHIVED: 'Archived',
}

/**
 * Why a product cannot be released to production yet.
 *
 * Releasing without a routing gives the shop floor nothing to confirm against,
 * and without a roll-up finance has no standard cost to value the output at —
 * so both are blocking, and the reason is shown rather than the button silently
 * doing nothing.
 */
export function releaseBlockers(product: EngProduct, ctx: Pick<CostContext, 'boms' | 'routings'>): string[] {
  const blockers: string[] = []
  const bom = defaultBomFor(product.code, ctx.boms)
  const routing = defaultRoutingFor(product.code, ctx.routings)

  // A product already in production has, by definition, been released. Asking
  // what blocks its release would report it as blocked by its own success.
  if (product.lifecycle === 'PRODUCTION') return []


  if (!bom) blockers.push('No approved bill of material.')
  else if (!bom.lines.length) blockers.push(`${bom.docNo} has no components.`)
  if (!routing) blockers.push('No approved routing.')
  else if (!routing.operations.length) blockers.push(`${routing.docNo} has no operations.`)
  if (product.standardCost <= 0) blockers.push('No standard cost has been published from a roll-up.')

  return blockers
}

/* ═══════════════════════════ Engineering change ═══════════════════════════ */

export const CHANGE_CATEGORY_LABEL: Record<EngChange['category'], string> = {
  COST_REDUCTION: 'Cost reduction',
  QUALITY: 'Quality',
  CUSTOMER: 'Customer requirement',
  STATUTORY: 'Statutory',
  OBSOLESCENCE: 'Obsolescence',
  SAFETY: 'Safety',
  DESIGN: 'Design improvement',
}

export interface ChangeImpact {
  affectedBoms: string[]
  affectedProducts: { code: string; name: string; level: number }[]
  costBefore: number
  costAfter: number
  costDelta: number
  costDeltaPct: number
  warnings: string[]
}

/**
 * What an ECN will actually do, worked out before anyone approves it.
 *
 * The cost figures are produced by applying the change lines to a throw-away
 * copy of the BOMs and rolling the product up again — a simulated future, not
 * an estimate, so approval is a decision made on the real number.
 */
export function analyseChange(ecn: EngChange, ctx: CostContext): ChangeImpact {
  const warnings: string[] = []
  const affectedBoms = [...new Set(ecn.changeLines.map((l) => l.bomDocNo))].filter(Boolean)

  const before = rollUpCost(ecn.productCode, ctx)
  const projectedBoms = projectBoms(ecn, ctx.boms, warnings)
  const after = rollUpCost(ecn.productCode, { ...ctx, boms: projectedBoms })

  // Everything upstream of the touched BOMs also moves.
  const affectedProducts: { code: string; name: string; level: number }[] = []
  for (const docNo of affectedBoms) {
    const bom = latestRevisionOf(docNo, ctx.boms)
    if (!bom) continue
    if (!affectedProducts.some((p) => p.code === bom.productCode)) {
      affectedProducts.push({ code: bom.productCode, name: bom.productName, level: 0 })
    }
    for (const row of whereUsed(bom.productCode, ctx.boms)) {
      if (!affectedProducts.some((p) => p.code === row.parentCode)) {
        affectedProducts.push({ code: row.parentCode, name: row.parentName, level: row.level })
      }
    }
  }

  const costDelta = after.total - before.total
  return {
    affectedBoms,
    affectedProducts,
    costBefore: before.total,
    costAfter: after.total,
    costDelta,
    costDeltaPct: before.total > 0 ? (costDelta / before.total) * 100 : 0,
    warnings,
  }
}

/** Applies the change lines to a copy of the BOM set, without persisting. */
function projectBoms(ecn: EngChange, boms: Bom[], warnings: string[]): Bom[] {
  const byDoc = new Map<string, ChangeLine[]>()
  for (const l of ecn.changeLines) {
    if (!l.bomDocNo) continue
    byDoc.set(l.bomDocNo, [...(byDoc.get(l.bomDocNo) ?? []), l])
  }

  let projected = boms
  for (const [docNo, lines] of byDoc) {
    const base = latestRevisionOf(docNo, projected)
    if (!base) {
      warnings.push(`${docNo} no longer exists — its change lines were skipped.`)
      continue
    }
    const revised = applyChangeLines(base, lines, warnings)
    projected = projected.map((b) => (b.uid === base.uid ? revised : b))
  }
  return projected
}

/** Rewrites a BOM's lines from the change instructions. Pure — returns a copy. */
export function applyChangeLines(base: Bom, lines: ChangeLine[], warnings: string[] = []): Bom {
  let out: BomLine[] = base.lines.map((l) => ({ ...l }))

  for (const change of lines) {
    const target = out.find((l) => l.itemCode === change.itemCode)

    if (change.action === 'REMOVE') {
      if (!target) {
        warnings.push(`${change.itemCode} is not on ${base.docNo}; nothing to remove.`)
        continue
      }
      out = out.filter((l) => l.itemCode !== change.itemCode)
    } else if (change.action === 'REPLACE') {
      if (!target) {
        warnings.push(`${change.itemCode} is not on ${base.docNo}; nothing to replace.`)
        continue
      }
      out = out.map((l) =>
        l.itemCode === change.itemCode
          ? {
              ...l,
              itemCode: change.newItemCode,
              itemName: change.newItemName,
              qtyPer: change.newQtyPer > 0 ? change.newQtyPer : l.qtyPer,
              scrapPct: change.newScrapPct >= 0 ? change.newScrapPct : l.scrapPct,
              notes: change.note || l.notes,
            }
          : l,
      )
    } else if (change.action === 'QTY_CHANGE') {
      if (!target) {
        warnings.push(`${change.itemCode} is not on ${base.docNo}; its quantity cannot be changed.`)
        continue
      }
      out = out.map((l) =>
        l.itemCode === change.itemCode
          ? { ...l, qtyPer: change.newQtyPer, scrapPct: change.newScrapPct, notes: change.note || l.notes }
          : l,
      )
    } else if (change.action === 'ADD') {
      if (target) {
        warnings.push(`${change.itemCode} is already on ${base.docNo}; its quantity was updated instead.`)
        out = out.map((l) => (l.itemCode === change.itemCode ? { ...l, qtyPer: change.newQtyPer } : l))
        continue
      }
      out.push({
        uid: `boml-${base.uid}-${change.uid}`,
        seq: out.length + 1,
        itemCode: change.itemCode,
        itemName: change.itemName,
        uom: 'NOS',
        qtyPer: change.newQtyPer,
        scrapPct: change.newScrapPct,
        isPhantom: false,
        operationSeq: null,
        notes: change.note,
      })
    }
  }

  // Re-sequence so the printed BOM has no gaps after removals.
  out = out.map((l, i) => ({ ...l, seq: i + 1 }))

  return {
    ...base,
    lines: out,
    revision: base.revision + 1,
    version: base.version + 1,
  }
}

/* ═══════════════════════════ Tools ═══════════════════════════ */

export function toolLifePct(t: Tool) {
  if (t.lifeStrokes <= 0) return 0
  return Math.min(100, (t.usedStrokes / t.lifeStrokes) * 100)
}

export function toolNeedsAttention(t: Tool) {
  if (t.status === 'RETIRED') return false
  if (toolLifePct(t) >= 85) return true
  if (!t.nextCalibrationOn) return false
  return new Date(t.nextCalibrationOn).getTime() - Date.now() < 30 * 86_400_000
}

/* ═══════════════════════════ Validation ═══════════════════════════ */

/** Problems that must be cleared before a BOM can be approved. */
export function bomProblems(bom: Bom, boms: Bom[], items: Item[]): string[] {
  const problems: string[] = []
  if (!bom.lines.length) problems.push('The BOM has no components.')
  if (bom.baseQty <= 0) problems.push('The base quantity must be greater than zero.')

  const seen = new Set<string>()
  for (const l of bom.lines) {
    if (seen.has(l.itemCode)) problems.push(`${l.itemCode} appears more than once — combine the quantities.`)
    seen.add(l.itemCode)
    if (l.qtyPer <= 0) problems.push(`${l.itemCode} has a quantity of zero.`)
    if (!items.some((i) => i.code === l.itemCode)) problems.push(`${l.itemCode} is not in the item master.`)
    if (l.itemCode === bom.productCode) problems.push(`${l.itemCode} cannot be a component of itself.`)
  }

  const others = boms.filter((b) => b.uid !== bom.uid)
  for (const l of bom.lines) {
    if (wouldCreateCycle(bom.productCode, l.itemCode, others)) {
      problems.push(`${l.itemCode} already contains ${bom.productCode} — that would make the structure circular.`)
    }
  }
  return [...new Set(problems)]
}

/** Problems that must be cleared before a routing can be approved. */
export function routingProblems(routing: Routing, workCentres: EngWorkCentre[]): string[] {
  const problems: string[] = []
  if (!routing.operations.length) problems.push('The routing has no operations.')
  if (routing.costingLotSize <= 0) problems.push('The costing lot size must be greater than zero.')

  const seqs = new Set<number>()
  for (const op of routing.operations) {
    if (seqs.has(op.seq)) problems.push(`Sequence ${op.seq} is used twice.`)
    seqs.add(op.seq)
    if (!workCentres.some((w) => w.code === op.workCentreCode && !w.deletedAt)) {
      problems.push(`Operation ${op.seq} points at work centre ${op.workCentreCode}, which does not exist.`)
    }
    if (op.cycleSeconds <= 0) problems.push(`Operation ${op.seq} has no cycle time.`)
    if (op.operators <= 0) problems.push(`Operation ${op.seq} has no operators assigned.`)
  }
  return [...new Set(problems)]
}
