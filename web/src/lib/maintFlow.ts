/**
 * Volume 13 — the maintenance engine.
 *
 * Everything the screens report is computed here from the records, so a number
 * on the dashboard and the same number on a report cannot drift apart. The
 * reliability figures follow their standard definitions rather than convenient
 * approximations: MTBF is uptime over failures, not calendar time over
 * failures, and availability falls out of the two rather than being entered.
 */

import type {
  Breakdown, ConditionPoint, ConditionReading, MaintAsset, MaintPermit, MaintWorkOrder,
  PmPlan, SparePart, Technician, UtilityLog, Shutdown, WoStatus, PermitType,
} from '@/types/maintenance'

export const EPS = 0.005
export const round2 = (n: number) => Math.round(n * 100) / 100
export const round1 = (n: number) => Math.round(n * 10) / 10

const live = <T extends { deletedAt?: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

/** Local-date parse. `new Date('2026-07-30')` is UTC midnight and shifts a day in IST. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / 86_400_000)
}

/** Minutes between two timestamps, floored at zero. */
export function minutesBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.max(0, Math.round(ms / 60_000))
}

/* ═══════════════════════ Asset hierarchy ═══════════════════════ */

export interface AssetNode {
  asset: MaintAsset
  children: AssetNode[]
  depth: number
}

/**
 * The register as a tree. An asset whose parent is missing or deleted is
 * surfaced at the root rather than silently dropped — losing a press because
 * its line was archived is exactly the failure this guards against.
 */
export function assetTree(assets: MaintAsset[]): AssetNode[] {
  const rows = live(assets)
  const codes = new Set(rows.map((a) => a.code))
  const byParent = new Map<string, MaintAsset[]>()
  for (const a of rows) {
    const key = a.parentCode && codes.has(a.parentCode) ? a.parentCode : '__root__'
    byParent.set(key, [...(byParent.get(key) ?? []), a])
  }
  const build = (parent: string, depth: number, seen: Set<string>): AssetNode[] =>
    (byParent.get(parent) ?? [])
      .filter((a) => !seen.has(a.code))
      .sort((x, y) => x.code.localeCompare(y.code))
      .map((asset) => ({
        asset,
        depth,
        // Guard against a cycle in the parent chain, which would recurse forever.
        children: build(asset.code, depth + 1, new Set([...seen, asset.code])),
      }))
  return build('__root__', 0, new Set())
}

/** Every descendant of an asset, itself included — the scope of a shutdown. */
export function assetSubtree(code: string, assets: MaintAsset[]): string[] {
  const rows = live(assets)
  const out = new Set<string>([code])
  let added = true
  while (added) {
    added = false
    for (const a of rows) {
      if (a.parentCode && out.has(a.parentCode) && !out.has(a.code)) { out.add(a.code); added = true }
    }
  }
  return [...out]
}

/** True when the asset is inside its warranty or AMC on the given date. */
export function coverState(a: MaintAsset, today = isoDate(new Date())): { covered: boolean; kind: 'WARRANTY' | 'AMC' | 'NONE'; expiresIn: number | null } {
  if (a.warrantyUntil && a.warrantyUntil >= today) return { covered: true, kind: 'WARRANTY', expiresIn: daysBetween(today, a.warrantyUntil) }
  if (a.amcUntil && a.amcUntil >= today) return { covered: true, kind: 'AMC', expiresIn: daysBetween(today, a.amcUntil) }
  return { covered: false, kind: 'NONE', expiresIn: null }
}

/* ═══════════════════════ Preventive maintenance due ═══════════════════════ */

export interface PmDue {
  plan: PmPlan
  /** Date it falls due, for a calendar plan. Null for a pure meter plan. */
  dueOn: string | null
  /** Meter value at which it falls due, for an hours/cycles plan. */
  dueAtMeter: number | null
  currentMeter: number
  /** Negative when overdue. */
  daysRemaining: number | null
  unitsRemaining: number | null
  /** 0–100+; over 100 means the interval has been exceeded. */
  elapsedPct: number
  isDue: boolean
  isOverdue: boolean
  /** Whether a work order should be raised now, allowing for the lead time. */
  shouldRaise: boolean
  basis: string
}

/**
 * When a plan next falls due.
 *
 * A plan can be driven by the calendar or by a meter, and where a plan has
 * both, whichever arrives first wins — a press due at 500 hours does not get a
 * reprieve because the quarter has not ended.
 */
export function pmDue(plan: PmPlan, asset: MaintAsset | undefined, today = isoDate(new Date())): PmDue {
  const currentMeter =
    plan.trigger === 'CYCLES' || plan.trigger === 'PRODUCTION_QTY'
      ? asset?.cycleCount ?? 0
      : asset?.runningHours ?? 0

  let dueOn: string | null = null
  let daysRemaining: number | null = null
  let calendarPct = 0

  if (plan.trigger === 'CALENDAR' && plan.intervalDays > 0) {
    const base = plan.lastDoneOn ?? asset?.commissionedOn ?? asset?.installedOn ?? today
    dueOn = addDays(base, plan.intervalDays)
    daysRemaining = daysBetween(today, dueOn)
    const elapsed = daysBetween(base, today)
    calendarPct = (elapsed / plan.intervalDays) * 100
  }

  let dueAtMeter: number | null = null
  let unitsRemaining: number | null = null
  let meterPct = 0

  if (plan.trigger !== 'CALENDAR' && plan.trigger !== 'CONDITION' && plan.intervalUnits > 0) {
    dueAtMeter = plan.lastDoneMeter + plan.intervalUnits
    unitsRemaining = round1(dueAtMeter - currentMeter)
    meterPct = ((currentMeter - plan.lastDoneMeter) / plan.intervalUnits) * 100
  }

  const elapsedPct = Math.max(calendarPct, meterPct)
  const overdueByDate = daysRemaining !== null && daysRemaining < 0
  const overdueByMeter = unitsRemaining !== null && unitsRemaining < 0
  const isOverdue = overdueByDate || overdueByMeter

  // Due once inside the lead window on either basis.
  const dueByDate = daysRemaining !== null && daysRemaining <= plan.leadDays
  const dueByMeter = unitsRemaining !== null && unitsRemaining <= plan.intervalUnits * 0.1
  const isDue = dueByDate || dueByMeter || isOverdue

  const basis = isOverdue
    ? overdueByDate && overdueByMeter
      ? `Overdue on both the calendar and the meter.`
      : overdueByDate
        ? `${Math.abs(daysRemaining as number)} days past its due date.`
        : `${Math.abs(unitsRemaining as number)} ${plan.trigger === 'CYCLES' ? 'cycles' : 'hours'} past its interval.`
    : plan.trigger === 'CALENDAR'
      ? `Due in ${daysRemaining} days.`
      : plan.trigger === 'CONDITION'
        ? 'Raised by a condition alert, not on a schedule.'
        : `Due in ${unitsRemaining} ${plan.trigger === 'CYCLES' ? 'cycles' : 'hours'}.`

  return {
    plan, dueOn, dueAtMeter, currentMeter, daysRemaining, unitsRemaining,
    elapsedPct: round1(elapsedPct),
    isDue, isOverdue,
    shouldRaise: plan.isActive && isDue,
    basis,
  }
}

/** What stops a PM plan being saved. */
export function planBlockers(p: Partial<PmPlan>, assets: MaintAsset[], existingUid?: string, all: PmPlan[] = []): string[] {
  const out: string[] = []
  if (!p.code?.trim()) out.push('A plan code is required.')
  if (!p.name?.trim()) out.push('Give the plan a name.')
  if (!p.assetCode || !live(assets).some((a) => a.code === p.assetCode)) out.push('Choose the asset this plan covers.')
  if (all.some((x) => !x.deletedAt && x.code === p.code && x.uid !== existingUid)) out.push('That plan code is already in use.')
  if (p.trigger === 'CALENDAR' && (p.intervalDays ?? 0) <= 0) out.push('A calendar plan needs an interval in days.')
  if (p.trigger && p.trigger !== 'CALENDAR' && p.trigger !== 'CONDITION' && (p.intervalUnits ?? 0) <= 0) {
    out.push('A meter-driven plan needs an interval in hours, cycles or units.')
  }
  if ((p.leadDays ?? 0) < 0) out.push('Lead time cannot be negative.')
  if (p.trigger === 'CALENDAR' && (p.leadDays ?? 0) >= (p.intervalDays ?? 1)) {
    out.push('Lead time must be shorter than the interval, or every plan is permanently due.')
  }
  if (!p.tasks?.length) out.push('A plan with no tasks generates a work order with nothing to do.')
  if (p.tasks?.some((t) => !t.description.trim())) out.push('Every task needs a description.')
  if (p.requiresPermit && !p.permitTypes?.length) out.push('Say which permit the work needs.')
  return out
}

/* ═══════════════════════ Work order generation ═══════════════════════ */

/**
 * Turn a due plan into a work order.
 *
 * The checklist is copied from the plan rather than referenced, so revising a
 * plan next year does not rewrite what a technician signed last year.
 */
export function workOrderFromPlan(
  plan: PmPlan,
  asset: MaintAsset | undefined,
  docNo: string,
  today = isoDate(new Date()),
  newId: (p: string) => string = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`,
): MaintWorkOrder {
  const due = pmDue(plan, asset, today)
  const plannedStart = due.dueOn ?? today
  return {
    uid: newId('wo'),
    docNo,
    woType: 'PREVENTIVE',
    priority: asset?.criticality === 'A' ? 'HIGH' : asset?.criticality === 'B' ? 'MEDIUM' : 'LOW',
    assetCode: plan.assetCode,
    assetName: plan.assetName,
    sourceDocNo: plan.code,
    title: plan.name,
    description: `Preventive maintenance per plan ${plan.code}. ${due.basis}`,
    raisedBy: 'System',
    raisedOn: today,
    supervisor: '',
    plannedStart,
    plannedFinish: addDays(plannedStart, Math.max(0, Math.ceil(plan.estimatedHours / 8))),
    actualStart: null,
    actualFinish: null,
    status: 'PLANNED',
    labour: [],
    spares: [],
    externalCost: 0,
    externalVendor: '',
    checklist: plan.tasks
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((t) => ({
        uid: newId('cl'),
        seq: t.seq,
        description: t.description,
        mandatory: t.mandatory,
        capture: t.capture,
        uom: t.uom,
        done: false,
        reading: null,
        result: null,
        remarks: '',
      })),
    permitNo: null,
    requiresPermit: plan.requiresPermit,
    downtimeMinutes: 0,
    verifiedBy: null,
    verifiedOn: null,
    closedOn: null,
    isRework: false,
    reworkOfDocNo: null,
    remarks: '',
    version: 1,
  }
}

/* ═══════════════════════ Work order lifecycle ═══════════════════════ */

export const WO_FLOW: Record<WoStatus, WoStatus[]> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'ON_HOLD'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['VERIFIED', 'IN_PROGRESS'],
  VERIFIED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

export const WO_STATUS_LABEL: Record<WoStatus, string> = {
  DRAFT: 'Draft', PLANNED: 'Planned', ASSIGNED: 'Assigned', IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold', COMPLETED: 'Completed', VERIFIED: 'Verified', CLOSED: 'Closed', CANCELLED: 'Cancelled',
}

/**
 * What stops a work order moving on.
 *
 * The rule that matters most is at COMPLETED: every mandatory checklist line
 * must be signed and every captured reading actually recorded. A work order
 * that can close with an unsigned safety check is a maintenance system that
 * certifies work nobody did.
 */
export function woBlockers(wo: MaintWorkOrder, to: WoStatus, permits: MaintPermit[] = []): string[] {
  const out: string[] = []

  if (to === 'ASSIGNED' && !wo.labour.length) out.push('Assign at least one technician before the job is released.')
  if (to === 'ASSIGNED' && !wo.supervisor.trim()) out.push('Name the supervisor accountable for the job.')

  if (to === 'IN_PROGRESS') {
    if (!wo.labour.length) out.push('Nobody is assigned to this work order.')
    if (wo.requiresPermit) {
      const permit = permits.find((p) => !p.deletedAt && p.docNo === wo.permitNo)
      if (!wo.permitNo) out.push('This job needs a safety permit and none is attached.')
      else if (!permit) out.push(`Permit ${wo.permitNo} does not exist.`)
      else if (permit.status !== 'ACTIVE') out.push(`Permit ${wo.permitNo} is ${permit.status.toLowerCase().replace('_', ' ')}, not active. Work cannot start under it.`)
    }
  }

  if (to === 'COMPLETED') {
    if (!wo.actualStart) out.push('Record when the work actually started.')
    const unsigned = wo.checklist.filter((c) => c.mandatory && !c.done)
    if (unsigned.length) out.push(`${unsigned.length} mandatory checklist item${unsigned.length === 1 ? ' is' : 's are'} unsigned.`)
    const missingReading = wo.checklist.filter((c) => c.done && c.capture === 'READING' && (c.reading === null || !Number.isFinite(c.reading)))
    if (missingReading.length) out.push(`${missingReading.length} item(s) signed without the reading they were meant to capture.`)
    const missingResult = wo.checklist.filter((c) => c.done && c.capture === 'PASS_FAIL' && c.result === null)
    if (missingResult.length) out.push(`${missingResult.length} pass/fail item(s) signed without a result.`)
    if (!wo.labour.length || wo.labour.every((l) => l.hours <= 0)) out.push('Record the labour hours actually spent.')
  }

  if (to === 'VERIFIED') {
    if (!wo.actualFinish) out.push('Record when the work finished.')
    const failed = wo.checklist.filter((c) => c.result === 'FAIL')
    if (failed.length) out.push(`${failed.length} checklist item(s) failed. Raise a corrective work order before verifying this one.`)
  }

  if (to === 'CLOSED') {
    if (!wo.verifiedBy) out.push('The work has not been verified by anyone.')
    if (wo.requiresPermit && wo.permitNo) {
      const permit = permits.find((p) => !p.deletedAt && p.docNo === wo.permitNo)
      if (permit && permit.status === 'ACTIVE') out.push(`Permit ${wo.permitNo} is still open. Close and return it before closing the job.`)
    }
    const unreturned = wo.spares.filter((s) => s.qtyIssued - s.qtyReturned < 0)
    if (unreturned.length) out.push('More spares returned than were issued — check the quantities.')
  }

  return out
}

export interface WoCost {
  labour: number
  spares: number
  external: number
  total: number
  labourHours: number
  /** Minutes the asset was unavailable because of this job. */
  downtimeMinutes: number
}

/** What a work order cost. Spares net off anything returned to the store. */
export function woCost(wo: MaintWorkOrder): WoCost {
  const labourHours = round2(wo.labour.reduce((s, l) => s + l.hours, 0))
  const labour = round2(wo.labour.reduce((s, l) => s + l.hours * l.rate * (l.isOvertime ? 1.5 : 1), 0))
  const spares = round2(wo.spares.reduce((s, x) => s + (x.qtyIssued - x.qtyReturned) * x.rate, 0))
  const external = round2(wo.externalCost)
  return {
    labour, spares, external,
    total: round2(labour + spares + external),
    labourHours,
    downtimeMinutes: wo.downtimeMinutes,
  }
}

/** How far through its checklist a job is. */
export function woProgress(wo: MaintWorkOrder): { done: number; total: number; pct: number; mandatoryLeft: number } {
  const total = wo.checklist.length
  const done = wo.checklist.filter((c) => c.done).length
  return {
    done, total,
    pct: total ? round1((done / total) * 100) : 0,
    mandatoryLeft: wo.checklist.filter((c) => c.mandatory && !c.done).length,
  }
}

/* ═══════════════════════ Reliability ═══════════════════════ */

export interface Reliability {
  assetCode: string
  assetName: string
  /** Failures in the window. */
  failures: number
  /** Minutes the asset was down for any reason. */
  downtimeMinutes: number
  /** Minutes it was available to run. */
  uptimeMinutes: number
  /** Uptime ÷ failures, in hours. Infinite when nothing failed. */
  mtbfHours: number | null
  /** Total repair time ÷ repairs, in hours. */
  mttrHours: number | null
  availabilityPct: number
  criticality: string
}

/**
 * MTBF, MTTR and availability for one asset over a window.
 *
 * MTBF is **uptime** between failures, not elapsed calendar time — an asset
 * that ran 400 hours and was down 100 has a mean time *between failures* of
 * 400/n, not 500/n. Availability then falls out as MTBF / (MTBF + MTTR), which
 * is the same as uptime / total time, so the two can never disagree.
 */
export function reliabilityOf(
  asset: MaintAsset,
  breakdowns: Breakdown[],
  fromIso: string,
  toIso: string,
  hoursPerDay = 24,
  now: Date = new Date(),
): Reliability {
  const windowDays = Math.max(1, daysBetween(fromIso, toIso) + 1)
  const totalMinutes = windowDays * hoursPerDay * 60

  const events = live(breakdowns).filter(
    (b) => b.assetCode === asset.code && b.status !== 'CANCELLED' && b.downtimeStart.slice(0, 10) >= fromIso && b.downtimeStart.slice(0, 10) <= toIso,
  )

  /**
   * A breakdown still in progress has no end time, and counting it as zero
   * downtime would report an asset that has been stopped for two days as 100%
   * available. Accrue it to now — the machine is down whether or not anyone has
   * closed the ticket.
   */
  const downtimeMinutes = events.reduce(
    (s, b) => s + minutesBetween(b.downtimeStart, b.downtimeEnd ?? now.toISOString()),
    0,
  )
  const uptimeMinutes = Math.max(0, totalMinutes - downtimeMinutes)
  const failures = events.length

  /**
   * MTTR is measured only over repairs that finished. A job still running has
   * no repair time yet, and letting its accruing minutes into the mean would
   * make MTTR climb every time the page was refreshed.
   */
  const closed = events.filter((b) => b.downtimeEnd)
  const closedDowntime = closed.reduce((s, b) => s + minutesBetween(b.downtimeStart, b.downtimeEnd as string), 0)

  return {
    assetCode: asset.code,
    assetName: asset.name,
    failures,
    downtimeMinutes,
    uptimeMinutes,
    mtbfHours: failures > 0 ? round1(uptimeMinutes / 60 / failures) : null,
    mttrHours: closed.length > 0 ? round1(closedDowntime / 60 / closed.length) : null,
    availabilityPct: totalMinutes > 0 ? round1((uptimeMinutes / totalMinutes) * 100) : 0,
    criticality: asset.criticality,
  }
}

/**
 * Availability derived the other way, from MTBF and MTTR. Kept separate so the
 * two definitions can be checked against each other rather than assumed equal.
 */
export function availabilityFromMtbf(mtbfHours: number | null, mttrHours: number | null): number | null {
  if (mtbfHours === null) return null
  const mttr = mttrHours ?? 0
  return mtbfHours + mttr > 0 ? round1((mtbfHours / (mtbfHours + mttr)) * 100) : null
}

/* ═══════════════════════ PM compliance ═══════════════════════ */

export interface PmCompliance {
  due: number
  completed: number
  onTime: number
  late: number
  /** Completed on time, over everything that fell due. The honest measure. */
  compliancePct: number
  /** Completed at all, on time or not. */
  completionPct: number
}

/**
 * PM compliance over a window.
 *
 * Compliance counts work done **by the date it was due**, not work done at all.
 * A plant that does every job a month late has 100% completion and 0%
 * compliance, and only the second number tells you the machines were unprotected.
 */
export function pmCompliance(workOrders: MaintWorkOrder[], fromIso: string, toIso: string): PmCompliance {
  const pms = live(workOrders).filter(
    (w) => w.woType === 'PREVENTIVE' && w.status !== 'CANCELLED' && w.plannedFinish >= fromIso && w.plannedFinish <= toIso,
  )
  const finished = pms.filter((w) => ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(w.status) && w.actualFinish)
  const onTime = finished.filter((w) => (w.actualFinish as string).slice(0, 10) <= w.plannedFinish)

  return {
    due: pms.length,
    completed: finished.length,
    onTime: onTime.length,
    late: finished.length - onTime.length,
    compliancePct: pms.length ? round1((onTime.length / pms.length) * 100) : 0,
    completionPct: pms.length ? round1((finished.length / pms.length) * 100) : 0,
  }
}

/* ═══════════════════════ Condition monitoring ═══════════════════════ */

export type ConditionVerdict = 'NORMAL' | 'WARNING' | 'TRIP' | 'NO_LIMITS'

/**
 * A reading against its band. The trip band is checked first — a value outside
 * both must report the more serious of the two, not the first one matched.
 */
export function evaluateReading(point: ConditionPoint, value: number): { verdict: ConditionVerdict; message: string } {
  const hasWarn = point.warnLow !== null || point.warnHigh !== null
  const hasTrip = point.tripLow !== null || point.tripHigh !== null
  if (!hasWarn && !hasTrip) return { verdict: 'NO_LIMITS', message: 'No limits configured, so nothing can be judged.' }

  if (point.tripHigh !== null && value > point.tripHigh) return { verdict: 'TRIP', message: `${value} ${point.uom} is above the trip limit of ${point.tripHigh}. Stop the asset.` }
  if (point.tripLow !== null && value < point.tripLow) return { verdict: 'TRIP', message: `${value} ${point.uom} is below the trip limit of ${point.tripLow}. Stop the asset.` }
  if (point.warnHigh !== null && value > point.warnHigh) return { verdict: 'WARNING', message: `${value} ${point.uom} is above the warning limit of ${point.warnHigh}.` }
  if (point.warnLow !== null && value < point.warnLow) return { verdict: 'WARNING', message: `${value} ${point.uom} is below the warning limit of ${point.warnLow}.` }
  return { verdict: 'NORMAL', message: `${value} ${point.uom} is inside the normal band.` }
}

export interface ConditionTrend {
  point: ConditionPoint
  readings: ConditionReading[]
  latest: ConditionReading | null
  verdict: ConditionVerdict
  message: string
  /** Change per reading over the series. Positive means it is climbing. */
  slope: number
  /** Readings until the value reaches the trip limit at the current slope. */
  readingsToTrip: number | null
}

/**
 * A point's history with a least-squares slope.
 *
 * The slope is what makes this predictive rather than reactive: a bearing at
 * 4.1 mm/s inside a 4.5 limit is fine today, and a problem if it has climbed
 * 0.3 every week.
 */
export function conditionTrend(point: ConditionPoint, readings: ConditionReading[]): ConditionTrend {
  const series = live(readings)
    .filter((r) => r.pointUid === point.uid)
    .sort((a, b) => a.readAt.localeCompare(b.readAt))

  const latest = series.length ? series[series.length - 1] : null
  const evaluation = latest ? evaluateReading(point, latest.value) : { verdict: 'NO_LIMITS' as ConditionVerdict, message: 'No readings taken.' }

  // Least squares over the index, which is adequate for evenly spaced rounds.
  let slope = 0
  if (series.length >= 2) {
    const n = series.length
    const meanX = (n - 1) / 2
    const meanY = series.reduce((s, r) => s + r.value, 0) / n
    let num = 0
    let den = 0
    series.forEach((r, i) => {
      num += (i - meanX) * (r.value - meanY)
      den += (i - meanX) ** 2
    })
    slope = den > 0 ? num / den : 0
  }

  let readingsToTrip: number | null = null
  if (latest && Math.abs(slope) > 1e-9) {
    if (slope > 0 && point.tripHigh !== null && latest.value < point.tripHigh) readingsToTrip = Math.ceil((point.tripHigh - latest.value) / slope)
    else if (slope < 0 && point.tripLow !== null && latest.value > point.tripLow) readingsToTrip = Math.ceil((point.tripLow - latest.value) / slope)
  }

  return {
    point,
    readings: series,
    latest,
    verdict: evaluation.verdict,
    message: evaluation.message,
    slope: Math.round(slope * 1000) / 1000,
    readingsToTrip,
  }
}

/* ═══════════════════════ Spares ═══════════════════════ */

export interface SpareStatus {
  part: SparePart
  /** On hand less what is committed to open work orders. */
  available: number
  belowMin: boolean
  /** Quantity to order to reach the maximum, allowing for reservations. */
  suggestedOrder: number
  /** Days of cover at the observed consumption rate. */
  daysOfCover: number | null
  stockoutRisk: 'NONE' | 'WATCH' | 'URGENT'
}

/**
 * Stock position for a spare.
 *
 * Availability nets off reservations, because a critical bearing physically on
 * the shelf but committed to tomorrow's overhaul is not available for tonight's
 * breakdown. Ordering targets the maximum, not the minimum — reordering to the
 * reorder point guarantees you sit at the reorder point forever.
 */
export function spareStatus(part: SparePart, txns: { itemCode: string; txnType: string; qty: number; txnAt: string; deletedAt?: string | null }[] = [], windowDays = 90): SpareStatus {
  const available = round2(part.onHand - part.reserved)
  const belowMin = available < part.minStock - EPS

  const consumed = live(txns)
    .filter((t) => t.itemCode === part.itemCode && t.txnType === 'ISSUE')
    .reduce((s, t) => s + t.qty, 0)
  const returned = live(txns)
    .filter((t) => t.itemCode === part.itemCode && t.txnType === 'RETURN')
    .reduce((s, t) => s + t.qty, 0)
  const netConsumption = Math.max(0, consumed - returned)
  const perDay = netConsumption / windowDays
  const daysOfCover = perDay > 0 ? Math.floor(available / perDay) : null

  const suggestedOrder = belowMin ? Math.max(part.reorderQty, round2(part.maxStock - available)) : 0

  let stockoutRisk: SpareStatus['stockoutRisk'] = 'NONE'
  if (available <= 0) stockoutRisk = 'URGENT'
  else if (daysOfCover !== null && daysOfCover < part.leadTimeDays) stockoutRisk = 'URGENT'
  else if (belowMin) stockoutRisk = 'WATCH'

  return { part, available, belowMin, suggestedOrder, daysOfCover, stockoutRisk }
}

/** What stops a spare issue going through. */
export function issueBlockers(part: SparePart | undefined, qty: number): string[] {
  const out: string[] = []
  if (!part) return ['That spare is not in the register.']
  if (qty <= 0) out.push('Enter a quantity greater than nil.')
  if (qty > part.onHand) out.push(`Only ${part.onHand} ${part.uom} on hand; ${qty} cannot be issued.`)
  else if (qty > part.onHand - part.reserved) {
    out.push(`${part.reserved} ${part.uom} is reserved for other jobs. Issuing ${qty} would leave those short.`)
  }
  return out
}

/* ═══════════════════════ Technicians ═══════════════════════ */

export interface TechnicianLoad {
  technician: Technician
  openJobs: number
  /** Hours booked against open work orders. */
  assignedHours: number
  /** Hours booked on completed work in the window. */
  completedHours: number
  jobsCompleted: number
  /** Mean hours per completed job. */
  avgRepairHours: number | null
  /** Jobs closed without a repeat visit, as a percentage. */
  firstTimeFixPct: number | null
  /** Assigned hours over available hours. Over 100 means overbooked. */
  utilisationPct: number
  isOverloaded: boolean
}

/**
 * Load and productivity for a technician.
 *
 * First-time-fix counts a job as failed if a later work order was raised as
 * rework of it — the measure only means anything if the follow-up is linked
 * back, which is why the work order carries `reworkOfDocNo`.
 */
export function technicianLoad(tech: Technician, workOrders: MaintWorkOrder[], windowDays = 30): TechnicianLoad {
  const mine = live(workOrders).filter((w) => w.labour.some((l) => l.technicianCode === tech.code))
  const hoursOn = (w: MaintWorkOrder) => w.labour.filter((l) => l.technicianCode === tech.code).reduce((s, l) => s + l.hours, 0)

  const open = mine.filter((w) => ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(w.status))
  const done = mine.filter((w) => ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(w.status))

  const assignedHours = round2(open.reduce((s, w) => s + hoursOn(w), 0))
  const completedHours = round2(done.reduce((s, w) => s + hoursOn(w), 0))

  // A job is a first-time fix unless something was later raised as rework of it.
  const reworkTargets = new Set(live(workOrders).filter((w) => w.isRework && w.reworkOfDocNo).map((w) => w.reworkOfDocNo as string))
  const firstTime = done.filter((w) => !reworkTargets.has(w.docNo)).length

  const capacityHours = tech.shiftHours * Math.min(windowDays, 30)
  const utilisationPct = capacityHours > 0 ? round1((assignedHours / tech.shiftHours) * 100) : 0

  return {
    technician: tech,
    openJobs: open.length,
    assignedHours,
    completedHours,
    jobsCompleted: done.length,
    avgRepairHours: done.length ? round1(completedHours / done.length) : null,
    firstTimeFixPct: done.length ? round1((firstTime / done.length) * 100) : null,
    utilisationPct,
    isOverloaded: assignedHours > tech.shiftHours + EPS,
  }
}

/** Technicians who hold the skill a job needs, least loaded first. */
export function eligibleTechnicians(skill: string, techs: Technician[], workOrders: MaintWorkOrder[]): TechnicianLoad[] {
  return live(techs)
    .filter((t) => t.isAvailable && (!skill || t.skills.includes(skill) || t.trade === skill))
    .map((t) => technicianLoad(t, workOrders))
    .sort((a, b) => a.assignedHours - b.assignedHours)
}

/* ═══════════════════════ Permits ═══════════════════════ */

export const PERMIT_LABEL: Record<PermitType, string> = {
  LOTO: 'Lockout / tagout',
  HOT_WORK: 'Hot work',
  HEIGHT: 'Work at height',
  CONFINED_SPACE: 'Confined space entry',
  GAS_TESTING: 'Gas testing',
  CONTRACTOR: 'Contractor safety',
  ELECTRICAL: 'Electrical isolation',
}

/**
 * What stops a permit being issued.
 *
 * A permit is the last thing between a technician and a live machine, so the
 * checks here are deliberately unforgiving: every isolation point locked, every
 * PPE item confirmed, a named issuer, and a validity window that has not
 * already passed.
 */
export function permitBlockers(p: MaintPermit, to: 'ACTIVE' | 'CLOSED', today = new Date().toISOString()): string[] {
  const out: string[] = []
  if (to === 'ACTIVE') {
    if (!p.issuedBy?.trim()) out.push('A permit must be issued by a named person.')
    if (!p.workers.length) out.push('List everyone who will work under this permit — nobody else may.')
    if (p.riskAssessment.trim().length < 10) out.push('Record the risk assessment.')
    const ppe = p.ppeChecklist.filter((x) => !x.confirmed)
    if (ppe.length) out.push(`${ppe.length} PPE item(s) not confirmed: ${ppe.map((x) => x.item).join(', ')}.`)
    const unlocked = p.isolationPoints.filter((x) => !x.locked)
    if (unlocked.length) out.push(`${unlocked.length} isolation point(s) not locked: ${unlocked.map((x) => x.point).join(', ')}.`)
    if (p.permitType === 'LOTO' && !p.isolationPoints.length) out.push('A lockout permit with no isolation points isolates nothing.')
    if (p.validUntil < today.slice(0, 10)) out.push('The validity window has already passed.')
    if (p.validUntil < p.validFrom) out.push('The permit expires before it starts.')
  }
  if (to === 'CLOSED') {
    if (!p.closedBy?.trim()) out.push('Record who closed the permit and returned the isolations.')
  }
  return out
}

/** A permit past its validity that nobody closed. */
export function isPermitExpired(p: MaintPermit, today = new Date().toISOString().slice(0, 10)): boolean {
  return p.status === 'ACTIVE' && p.validUntil < today
}

/* ═══════════════════════ Utilities ═══════════════════════ */

export interface UtilityEfficiency {
  assetCode: string
  assetName: string
  days: number
  runningHours: number
  energyKwh: number
  fuelLitres: number
  output: number
  outputUom: string
  downtimeMinutes: number
  /** Energy per unit of output — the number that says whether it is degrading. */
  specificEnergy: number | null
  /** Output per litre, for a fuel-driven asset. */
  fuelEfficiency: number | null
  /** Running hours over hours in the window. */
  loadFactorPct: number | null
  availabilityPct: number
}

/**
 * Utility performance over a window.
 *
 * Specific energy — kWh per unit delivered — is the figure that matters. Total
 * consumption rising is expected when output rises; consumption per unit rising
 * means the machine is getting worse.
 */
export function utilityEfficiency(asset: MaintAsset, logs: UtilityLog[], fromIso: string, toIso: string): UtilityEfficiency {
  const rows = live(logs).filter((l) => l.assetCode === asset.code && l.logDate >= fromIso && l.logDate <= toIso)
  const days = Math.max(1, daysBetween(fromIso, toIso) + 1)

  const runningHours = round1(rows.reduce((s, l) => s + l.runningHours, 0))
  const energyKwh = round1(rows.reduce((s, l) => s + l.energyKwh, 0))
  const fuelLitres = round1(rows.reduce((s, l) => s + l.fuelLitres, 0))
  const output = round1(rows.reduce((s, l) => s + l.output, 0))
  const downtimeMinutes = rows.reduce((s, l) => s + l.downtimeMinutes, 0)

  const windowMinutes = days * 24 * 60

  return {
    assetCode: asset.code,
    assetName: asset.name,
    days,
    runningHours,
    energyKwh,
    fuelLitres,
    output,
    outputUom: rows[0]?.outputUom ?? '',
    downtimeMinutes,
    specificEnergy: output > 0 ? Math.round((energyKwh / output) * 1000) / 1000 : null,
    fuelEfficiency: fuelLitres > 0 ? Math.round((output / fuelLitres) * 100) / 100 : null,
    loadFactorPct: days > 0 ? round1((runningHours / (days * 24)) * 100) : null,
    availabilityPct: round1(((windowMinutes - downtimeMinutes) / windowMinutes) * 100),
  }
}

/* ═══════════════════════ Shutdowns ═══════════════════════ */

export interface ShutdownProgress {
  total: number
  done: number
  inProgress: number
  pending: number
  skipped: number
  pctComplete: number
  plannedHours: number
  actualHours: number
  /** Tasks blocked because something they depend on is not finished. */
  blocked: { seq: number; description: string; waitingOn: number[] }[]
  /** Critical path length in hours, following the dependency chain. */
  criticalPathHours: number
  costVariance: number
}

/**
 * Where a shutdown stands.
 *
 * The critical path is the longest dependency chain, which is what actually
 * sets the duration — the sum of all task hours would be the answer only if one
 * person did everything in sequence.
 */
export function shutdownProgress(s: Shutdown): ShutdownProgress {
  const tasks = s.tasks
  const bySeq = new Map(tasks.map((t) => [t.seq, t]))

  const blocked = tasks
    .filter((t) => t.status === 'PENDING')
    .map((t) => ({
      seq: t.seq,
      description: t.description,
      waitingOn: t.dependsOnSeq.filter((d) => {
        const dep = bySeq.get(d)
        return dep && dep.status !== 'DONE' && dep.status !== 'SKIPPED'
      }),
    }))
    .filter((b) => b.waitingOn.length > 0)

  // Longest path through the dependency graph, memoised.
  const memo = new Map<number, number>()
  const pathOf = (seq: number, seen: Set<number>): number => {
    if (memo.has(seq)) return memo.get(seq) as number
    if (seen.has(seq)) return 0 // a cycle contributes nothing rather than hanging
    const t = bySeq.get(seq)
    if (!t) return 0
    const upstream = t.dependsOnSeq.length
      ? Math.max(...t.dependsOnSeq.map((d) => pathOf(d, new Set([...seen, seq]))))
      : 0
    const v = upstream + t.plannedHours
    memo.set(seq, v)
    return v
  }
  const criticalPathHours = tasks.length ? Math.max(...tasks.map((t) => pathOf(t.seq, new Set()))) : 0

  const done = tasks.filter((t) => t.status === 'DONE').length
  const skipped = tasks.filter((t) => t.status === 'SKIPPED').length

  return {
    total: tasks.length,
    done,
    inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    pending: tasks.filter((t) => t.status === 'PENDING').length,
    skipped,
    pctComplete: tasks.length ? round1(((done + skipped) / tasks.length) * 100) : 0,
    plannedHours: round1(tasks.reduce((s2, t) => s2 + t.plannedHours, 0)),
    actualHours: round1(tasks.reduce((s2, t) => s2 + (t.actualHours ?? 0), 0)),
    blocked,
    criticalPathHours: round1(criticalPathHours),
    costVariance: round2(s.actualCost - s.budgetedCost),
  }
}

/** A shutdown task cannot start while anything it depends on is unfinished. */
export function taskStartBlockers(s: Shutdown, seq: number): string[] {
  const t = s.tasks.find((x) => x.seq === seq)
  if (!t) return ['That task does not exist.']
  const bySeq = new Map(s.tasks.map((x) => [x.seq, x]))
  const waiting = t.dependsOnSeq
    .map((d) => bySeq.get(d))
    .filter((d): d is NonNullable<typeof d> => !!d && d.status !== 'DONE' && d.status !== 'SKIPPED')
  return waiting.map((d) => `Task ${d.seq} — ${d.description} — must finish first.`)
}

/* ═══════════════════════ Cost roll-up ═══════════════════════ */

export interface MaintCost {
  labour: number
  spares: number
  external: number
  total: number
  /** Cost of production lost while assets were down. */
  downtimeCost: number
  byType: { woType: string; value: number; count: number }[]
  byAsset: { assetCode: string; assetName: string; value: number; count: number }[]
}

/**
 * Maintenance spend over a window, split the ways the reports need it.
 *
 * Downtime cost is shown separately rather than folded into the total: it is a
 * real loss but it is not maintenance spend, and adding it to the maintenance
 * budget would make every breakdown look like an overspend by the department
 * that fixed it.
 */
export function maintenanceCost(
  workOrders: MaintWorkOrder[],
  fromIso: string,
  toIso: string,
  downtimeCostPerMinute = 0,
): MaintCost {
  const rows = live(workOrders).filter((w) => w.status !== 'CANCELLED' && w.raisedOn >= fromIso && w.raisedOn <= toIso)

  let labour = 0
  let spares = 0
  let external = 0
  let downtime = 0
  const byType = new Map<string, { value: number; count: number }>()
  const byAsset = new Map<string, { assetName: string; value: number; count: number }>()

  for (const w of rows) {
    const c = woCost(w)
    labour += c.labour
    spares += c.spares
    external += c.external
    downtime += c.downtimeMinutes * downtimeCostPerMinute

    const t = byType.get(w.woType) ?? { value: 0, count: 0 }
    t.value += c.total
    t.count += 1
    byType.set(w.woType, t)

    const a = byAsset.get(w.assetCode) ?? { assetName: w.assetName, value: 0, count: 0 }
    a.value += c.total
    a.count += 1
    byAsset.set(w.assetCode, a)
  }

  return {
    labour: round2(labour),
    spares: round2(spares),
    external: round2(external),
    total: round2(labour + spares + external),
    downtimeCost: round2(downtime),
    byType: [...byType.entries()].map(([woType, v]) => ({ woType, ...v, value: round2(v.value) })).sort((x, y) => y.value - x.value),
    byAsset: [...byAsset.entries()].map(([assetCode, v]) => ({ assetCode, assetName: v.assetName, count: v.count, value: round2(v.value) })).sort((x, y) => y.value - x.value),
  }
}

/**
 * Preventive against reactive spend.
 *
 * The ratio is the headline of a maintenance programme: money moving from
 * breakdown to preventive is the department working, and the reverse is the
 * plant heading for trouble whatever the total says.
 */
export function pmVsBreakdown(workOrders: MaintWorkOrder[], fromIso: string, toIso: string): {
  preventiveCost: number; reactiveCost: number; preventiveJobs: number; reactiveJobs: number; preventiveSharePct: number
} {
  const rows = live(workOrders).filter((w) => w.status !== 'CANCELLED' && w.raisedOn >= fromIso && w.raisedOn <= toIso)
  const isPreventive = (t: string) => t === 'PREVENTIVE' || t === 'PREDICTIVE'
  const preventive = rows.filter((w) => isPreventive(w.woType))
  const reactive = rows.filter((w) => w.woType === 'BREAKDOWN' || w.woType === 'CORRECTIVE')

  const pCost = round2(preventive.reduce((s, w) => s + woCost(w).total, 0))
  const rCost = round2(reactive.reduce((s, w) => s + woCost(w).total, 0))

  return {
    preventiveCost: pCost,
    reactiveCost: rCost,
    preventiveJobs: preventive.length,
    reactiveJobs: reactive.length,
    preventiveSharePct: pCost + rCost > 0 ? round1((pCost / (pCost + rCost)) * 100) : 0,
  }
}

/* ═══════════════════════ Alerts ═══════════════════════ */

export interface MaintAlert {
  kind: 'PM_DUE' | 'PM_OVERDUE' | 'BREAKDOWN' | 'WO_OVERDUE' | 'SPARE_LOW' | 'CALIBRATION' | 'WARRANTY' | 'CONDITION' | 'PERMIT_EXPIRED' | 'SHUTDOWN'
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  title: string
  detail: string
  ref: string
  to: string
}

/**
 * Everything wanting attention, in one list (Ch 20).
 *
 * Ordered by severity then by how late the thing is, because a list ordered by
 * document number is a list nobody reads past the first screen.
 */
export function maintenanceAlerts(ctx: {
  assets: MaintAsset[]
  plans: PmPlan[]
  workOrders: MaintWorkOrder[]
  breakdowns: Breakdown[]
  spares: SparePart[]
  points: ConditionPoint[]
  readings: ConditionReading[]
  permits: MaintPermit[]
  shutdowns: Shutdown[]
  spareTxns?: { itemCode: string; txnType: string; qty: number; txnAt: string; deletedAt?: string | null }[]
  today?: string
}): MaintAlert[] {
  const today = ctx.today ?? isoDate(new Date())
  const out: MaintAlert[] = []
  const assetOf = (code: string) => live(ctx.assets).find((a) => a.code === code)

  for (const plan of live(ctx.plans).filter((p) => p.isActive)) {
    const due = pmDue(plan, assetOf(plan.assetCode), today)
    if (due.isOverdue) {
      out.push({ kind: 'PM_OVERDUE', severity: 'CRITICAL', title: `${plan.name} is overdue`, detail: `${plan.assetName} — ${due.basis}`, ref: plan.code, to: '/maintenance/pm' })
    } else if (due.isDue) {
      out.push({ kind: 'PM_DUE', severity: 'WARNING', title: `${plan.name} falls due`, detail: `${plan.assetName} — ${due.basis}`, ref: plan.code, to: '/maintenance/pm' })
    }
  }

  for (const b of live(ctx.breakdowns).filter((x) => !['CLOSED', 'CANCELLED'].includes(x.status))) {
    out.push({
      kind: 'BREAKDOWN',
      severity: b.priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      title: `${b.assetName} is down`,
      detail: b.downtimeEnd ? 'Repaired, awaiting verification.' : `Down since ${new Date(b.downtimeStart).toLocaleString('en-IN')}.`,
      ref: b.docNo,
      to: '/maintenance/breakdowns',
    })
  }

  for (const w of live(ctx.workOrders).filter((x) => ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(x.status))) {
    if (w.plannedFinish < today) {
      out.push({ kind: 'WO_OVERDUE', severity: 'WARNING', title: `${w.docNo} is past its planned finish`, detail: `${w.assetName} — ${Math.abs(daysBetween(today, w.plannedFinish))} days late.`, ref: w.docNo, to: '/maintenance/work-orders' })
    }
  }

  for (const part of live(ctx.spares)) {
    const st = spareStatus(part, ctx.spareTxns ?? [])
    if (st.stockoutRisk === 'URGENT') {
      out.push({ kind: 'SPARE_LOW', severity: part.isCritical ? 'CRITICAL' : 'WARNING', title: `${part.itemName} will run out`, detail: `${st.available} ${part.uom} available against a ${part.leadTimeDays}-day lead time.`, ref: part.itemCode, to: '/maintenance/spares' })
    } else if (st.belowMin) {
      out.push({ kind: 'SPARE_LOW', severity: 'INFO', title: `${part.itemName} is below its minimum`, detail: `${st.available} ${part.uom} against a minimum of ${part.minStock}.`, ref: part.itemCode, to: '/maintenance/spares' })
    }
  }

  for (const a of live(ctx.assets)) {
    if (a.warrantyUntil) {
      const d = daysBetween(today, a.warrantyUntil)
      if (d >= 0 && d <= 60) out.push({ kind: 'WARRANTY', severity: 'INFO', title: `${a.name} warranty expires`, detail: `${d} days left. Any repair after that is chargeable.`, ref: a.code, to: '/maintenance/assets' })
    }
  }

  for (const point of live(ctx.points).filter((p) => p.isActive)) {
    const t = conditionTrend(point, ctx.readings)
    if (t.verdict === 'TRIP') out.push({ kind: 'CONDITION', severity: 'CRITICAL', title: `${point.assetName} past its trip limit`, detail: t.message, ref: point.assetCode, to: '/maintenance/condition' })
    else if (t.verdict === 'WARNING') out.push({ kind: 'CONDITION', severity: 'WARNING', title: `${point.assetName} outside its normal band`, detail: t.message, ref: point.assetCode, to: '/maintenance/condition' })
    else if (t.readingsToTrip !== null && t.readingsToTrip <= 3 && t.readingsToTrip > 0) {
      out.push({ kind: 'CONDITION', severity: 'WARNING', title: `${point.assetName} trending towards its trip limit`, detail: `About ${t.readingsToTrip} more readings at the present rate.`, ref: point.assetCode, to: '/maintenance/condition' })
    }
  }

  for (const p of live(ctx.permits)) {
    if (isPermitExpired(p, today)) {
      out.push({ kind: 'PERMIT_EXPIRED', severity: 'CRITICAL', title: `Permit ${p.docNo} has expired but is still open`, detail: `${PERMIT_LABEL[p.permitType]} on ${p.assetName}. Isolations may still be in place.`, ref: p.docNo, to: '/maintenance/permits' })
    }
  }

  for (const s of live(ctx.shutdowns).filter((x) => x.status === 'PLANNED' || x.status === 'APPROVED')) {
    const d = daysBetween(today, s.plannedStart)
    if (d >= 0 && d <= 14) out.push({ kind: 'SHUTDOWN', severity: 'INFO', title: `${s.title} starts in ${d} days`, detail: `${s.tasks.length} tasks, ${shutdownProgress(s).criticalPathHours} hours on the critical path.`, ref: s.docNo, to: '/maintenance/shutdowns' })
  }

  const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title))
}

/* ═══════════════════════ Labels ═══════════════════════ */

export const ASSET_CATEGORY_LABEL: Record<string, string> = {
  PRODUCTION_MACHINE: 'Production machine',
  UTILITY: 'Utility',
  MATERIAL_HANDLING: 'Material handling',
  QUALITY_INSTRUMENT: 'Quality instrument',
  MOULD_DIE: 'Mould / die',
  JIG_FIXTURE: 'Jig / fixture',
  TOOL: 'Tool',
  IT: 'IT equipment',
  VEHICLE: 'Vehicle',
}

export const WO_TYPE_LABEL: Record<string, string> = {
  PREVENTIVE: 'Preventive',
  PREDICTIVE: 'Predictive',
  BREAKDOWN: 'Breakdown',
  CORRECTIVE: 'Corrective',
  CALIBRATION: 'Calibration',
  UTILITY: 'Utility',
  FACILITY: 'Facility',
}

export const TRIGGER_LABEL: Record<string, string> = {
  CALENDAR: 'Calendar',
  RUNNING_HOURS: 'Running hours',
  CYCLES: 'Machine cycles',
  PRODUCTION_QTY: 'Production quantity',
  METER: 'Meter reading',
  CONDITION: 'Condition',
}

export const PARAMETER_LABEL: Record<string, string> = {
  VIBRATION: 'Vibration',
  TEMPERATURE: 'Temperature',
  PRESSURE: 'Pressure',
  NOISE: 'Noise',
  OIL_QUALITY: 'Oil quality',
  VACUUM: 'Vacuum level',
  CURRENT: 'Current draw',
  MOTOR_LOAD: 'Motor load',
  BEARING: 'Bearing condition',
}

export const BREAKDOWN_CATEGORY_LABEL: Record<string, string> = {
  MECHANICAL: 'Mechanical',
  ELECTRICAL: 'Electrical',
  HYDRAULIC: 'Hydraulic',
  PNEUMATIC: 'Pneumatic',
  ELECTRONIC: 'Electronic',
  TOOLING: 'Tooling',
  UTILITY: 'Utility',
  OPERATOR: 'Operator error',
}
