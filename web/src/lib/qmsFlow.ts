/**
 * Quality arithmetic — sampling, evaluation, disposition and the metrics.
 *
 *   Lot ──► sampling plan ──► readings ──► evaluation ──► disposition
 *                                                    └──► defects ──► NCR ──► CAPA
 *
 * The sampling is real ISO 2859-1, not a percentage dressed up as one. That
 * matters because the accept and reject numbers are the whole argument: an
 * inspector who finds two defects in a sample of 125 needs to know whether the
 * lot passes, and "about 2%" does not answer it.
 */

import type {
  Capa,
  CauseCategory,
  Complaint,
  DefectSeverity,
  Disposition,
  Inspection,
  InspectionPlan,
  InspectionReading,
  Instrument,
  Ncr,
  PlanCharacteristic,
  SupplierGrade,
  SupplierQualityRecord,
} from '@/types/quality'

/* ═══════════════════════════ ISO 2859-1 sampling ═══════════════════════════ */

/**
 * Sample size code letters, general inspection level II. The band a lot falls
 * into decides how many pieces are drawn — which is why doubling a lot size
 * does not double the sample.
 */
const CODE_LETTERS: { max: number; letter: string }[] = [
  { max: 8, letter: 'A' },
  { max: 15, letter: 'B' },
  { max: 25, letter: 'C' },
  { max: 50, letter: 'D' },
  { max: 90, letter: 'E' },
  { max: 150, letter: 'F' },
  { max: 280, letter: 'G' },
  { max: 500, letter: 'H' },
  { max: 1200, letter: 'J' },
  { max: 3200, letter: 'K' },
  { max: 10_000, letter: 'L' },
  { max: 35_000, letter: 'M' },
  { max: 150_000, letter: 'N' },
  { max: 500_000, letter: 'P' },
  { max: Infinity, letter: 'Q' },
]

const SAMPLE_SIZE: Record<string, number> = {
  A: 2, B: 3, C: 5, D: 8, E: 13, F: 20, G: 32, H: 50,
  J: 80, K: 125, L: 200, M: 315, N: 500, P: 800, Q: 1250,
}

const LETTER_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q']

/**
 * Single sampling, normal inspection: accept numbers by code letter and AQL.
 *
 * `null` is the standard's arrow — the plan at that intersection does not
 * exist, and you move down the column to the first letter that has one, taking
 * its sample size with you. Getting that wrong is how a lot of 30 ends up being
 * "inspected" with a sample of 8 against an accept number that was never
 * defined for it.
 */
const ACCEPT_TABLE: Record<string, Record<string, number | null>> = {
  //        0.65   1.0    1.5    2.5    4.0    6.5
  A: { '0.65': null, '1.0': null, '1.5': null, '2.5': null, '4.0': null, '6.5': 0 },
  B: { '0.65': null, '1.0': null, '1.5': null, '2.5': null, '4.0': 0, '6.5': 0 },
  C: { '0.65': null, '1.0': null, '1.5': null, '2.5': 0, '4.0': 0, '6.5': 1 },
  D: { '0.65': null, '1.0': null, '1.5': 0, '2.5': 0, '4.0': 1, '6.5': 1 },
  E: { '0.65': null, '1.0': 0, '1.5': 0, '2.5': 1, '4.0': 1, '6.5': 2 },
  F: { '0.65': 0, '1.0': 0, '1.5': 1, '2.5': 1, '4.0': 2, '6.5': 3 },
  G: { '0.65': 0, '1.0': 1, '1.5': 1, '2.5': 2, '4.0': 3, '6.5': 5 },
  H: { '0.65': 1, '1.0': 1, '1.5': 2, '2.5': 3, '4.0': 5, '6.5': 7 },
  J: { '0.65': 1, '1.0': 2, '1.5': 3, '2.5': 5, '4.0': 7, '6.5': 10 },
  K: { '0.65': 2, '1.0': 3, '1.5': 5, '2.5': 7, '4.0': 10, '6.5': 14 },
  L: { '0.65': 3, '1.0': 5, '1.5': 7, '2.5': 10, '4.0': 14, '6.5': 21 },
  M: { '0.65': 5, '1.0': 7, '1.5': 10, '2.5': 14, '4.0': 21, '6.5': 21 },
  N: { '0.65': 7, '1.0': 10, '1.5': 14, '2.5': 21, '4.0': 21, '6.5': 21 },
  P: { '0.65': 10, '1.0': 14, '1.5': 21, '2.5': 21, '4.0': 21, '6.5': 21 },
  Q: { '0.65': 14, '1.0': 21, '1.5': 21, '2.5': 21, '4.0': 21, '6.5': 21 },
}

export const SUPPORTED_AQL = [0.65, 1.0, 1.5, 2.5, 4.0, 6.5]

export interface SamplingPlan {
  lotSize: number
  codeLetter: string
  sampleSize: number
  acceptNumber: number
  rejectNumber: number
  aql: number
  /** True when the standard's arrow moved us to a different code letter. */
  arrowApplied: boolean
  /** True when the sample would exceed the lot, so everything is checked. */
  isFullInspection: boolean
  note: string
}

export function codeLetterFor(lotSize: number): string {
  if (lotSize < 2) return 'A'
  return CODE_LETTERS.find((c) => lotSize <= c.max)!.letter
}

/**
 * The sampling plan for a lot at a given AQL, per ISO 2859-1 general level II,
 * single sampling, normal inspection.
 */
export function aqlPlan(lotSize: number, aql: number): SamplingPlan {
  const key = SUPPORTED_AQL.includes(aql) ? aql.toFixed(aql === 0.65 ? 2 : 1) : '1.0'
  const normalisedKey = key === '0.65' ? '0.65' : key
  let letter = codeLetterFor(lotSize)
  let arrowApplied = false

  // Follow the arrow down to the first letter that has a plan at this AQL.
  let guard = 0
  while (ACCEPT_TABLE[letter]?.[normalisedKey] === null && guard++ < LETTER_ORDER.length) {
    const next = LETTER_ORDER[LETTER_ORDER.indexOf(letter) + 1]
    if (!next) break
    letter = next
    arrowApplied = true
  }

  const ac = ACCEPT_TABLE[letter]?.[normalisedKey] ?? 0
  let sampleSize = SAMPLE_SIZE[letter] ?? 2
  let isFullInspection = false

  if (sampleSize >= lotSize) {
    sampleSize = Math.max(1, Math.floor(lotSize))
    isFullInspection = true
  }

  return {
    lotSize,
    codeLetter: letter,
    sampleSize,
    acceptNumber: ac,
    rejectNumber: ac + 1,
    aql: Number(normalisedKey),
    arrowApplied,
    isFullInspection,
    note: isFullInspection
      ? 'The sample would be the whole lot, so every piece is checked.'
      : arrowApplied
        ? `No plan exists at code letter ${codeLetterFor(lotSize)} for AQL ${normalisedKey}; the standard moves to ${letter}.`
        : `Code letter ${letter}, general inspection level II, single sampling, normal.`,
  }
}

/** Resolves whatever sampling rule a plan carries into a concrete sample. */
export function samplingFor(plan: Pick<InspectionPlan, 'samplingMethod' | 'aql' | 'fixedSampleSize' | 'randomPercent'>, lotSize: number): SamplingPlan {
  if (plan.samplingMethod === 'AQL') return aqlPlan(lotSize, plan.aql)

  if (plan.samplingMethod === 'FULL') {
    return {
      lotSize,
      codeLetter: '—',
      sampleSize: Math.max(1, Math.floor(lotSize)),
      acceptNumber: 0,
      rejectNumber: 1,
      aql: 0,
      arrowApplied: false,
      isFullInspection: true,
      note: '100% inspection — every piece is checked and one defect rejects the lot.',
    }
  }

  const size =
    plan.samplingMethod === 'FIXED'
      ? plan.fixedSampleSize
      : Math.ceil((lotSize * plan.randomPercent) / 100)

  const capped = Math.max(1, Math.min(Math.floor(lotSize), Math.floor(size)))
  return {
    lotSize,
    codeLetter: '—',
    sampleSize: capped,
    acceptNumber: 0,
    rejectNumber: 1,
    aql: 0,
    arrowApplied: false,
    isFullInspection: capped >= lotSize,
    note:
      plan.samplingMethod === 'FIXED'
        ? `Fixed sample of ${plan.fixedSampleSize}, capped at the lot size.`
        : `${plan.randomPercent}% of the lot, rounded up.`,
  }
}

/* ═══════════════════════════ Characteristic evaluation ═══════════════════════════ */

export type ReadingVerdict = 'PENDING' | 'PASS' | 'FAIL'

/**
 * Whether one reading passes.
 *
 * A measured characteristic is inside its limits; an attribute or document
 * check carries the inspector's verdict directly. A missing photograph on a
 * characteristic that demands one is a fail, not an oversight — that is the
 * point of marking it mandatory.
 */
export function evaluateReading(r: InspectionReading): ReadingVerdict {
  if (r.requiresPhoto && !r.photoAttached) {
    // Only blocks once the check itself has been done.
    const done = r.type === 'MEASURED' ? r.actual !== null : r.verdict !== 'PENDING'
    if (done) return 'FAIL'
  }

  if (r.type !== 'MEASURED') return r.verdict

  // Anything that is not a finite number is "not measured yet". A missing
  // reading must never fall through to a pass — that is the one failure mode
  // that would let an unchecked characteristic ship.
  if (typeof r.actual !== 'number' || !Number.isFinite(r.actual)) return 'PENDING'
  if (r.lowerLimit !== null && r.actual < r.lowerLimit) return 'FAIL'
  if (r.upperLimit !== null && r.actual > r.upperLimit) return 'FAIL'
  return 'PASS'
}

/** How far a reading sits from its target, as a share of the tolerance band. */
export function deviationPct(r: InspectionReading): number | null {
  if (r.type !== 'MEASURED' || r.actual === null || r.target === null) return null
  const halfBand =
    r.upperLimit !== null && r.lowerLimit !== null
      ? (r.upperLimit - r.lowerLimit) / 2
      : r.upperLimit !== null
        ? r.upperLimit - r.target
        : r.lowerLimit !== null
          ? r.target - r.lowerLimit
          : 0
  if (halfBand <= 0) return null
  return ((r.actual - r.target) / halfBand) * 100
}

/* ═══════════════════════════ Inspection evaluation ═══════════════════════════ */

export interface InspectionEvaluation {
  totalChecks: number
  completed: number
  passed: number
  failed: number
  pending: number
  /** A mandatory characteristic that failed. Any one of these fails the lot. */
  mandatoryFailures: InspectionReading[]
  criticalFailures: InspectionReading[]
  missingPhotos: InspectionReading[]
  defectCount: number
  criticalDefects: number
  majorDefects: number
  minorDefects: number
  /** Defects found against the accept number from the sampling plan. */
  withinAcceptNumber: boolean
  isComplete: boolean
  /** What the rules say the disposition should be. */
  suggestedDisposition: Disposition
  reasons: string[]
}

/**
 * Turns readings and defects into a verdict.
 *
 * The order matters. A critical defect or a failed mandatory characteristic
 * rejects outright, whatever the accept number says — an AQL is a tolerance for
 * minor variation, not permission to ship a cracked weld.
 */
export function evaluateInspection(inspection: Inspection): InspectionEvaluation {
  const readings = inspection.readings
  const verdicts = readings.map((r) => ({ r, v: evaluateReading(r) }))

  const passed = verdicts.filter((x) => x.v === 'PASS').length
  const failed = verdicts.filter((x) => x.v === 'FAIL').length
  const pending = verdicts.filter((x) => x.v === 'PENDING').length

  const mandatoryFailures = verdicts.filter((x) => x.v === 'FAIL' && x.r.isMandatory).map((x) => x.r)
  const criticalFailures = verdicts.filter((x) => x.v === 'FAIL' && x.r.severity === 'CRITICAL').map((x) => x.r)
  const missingPhotos = readings.filter(
    (r) => r.requiresPhoto && !r.photoAttached && (r.type === 'MEASURED' ? r.actual !== null : r.verdict !== 'PENDING'),
  )

  const criticalDefects = inspection.defects.filter((d) => d.severity === 'CRITICAL').reduce((s, d) => s + d.qty, 0)
  const majorDefects = inspection.defects.filter((d) => d.severity === 'MAJOR').reduce((s, d) => s + d.qty, 0)
  const minorDefects = inspection.defects.filter((d) => d.severity === 'MINOR').reduce((s, d) => s + d.qty, 0)
  const defectCount = criticalDefects + majorDefects + minorDefects

  const withinAcceptNumber = defectCount <= inspection.acceptNumber
  const isComplete = pending === 0 && readings.length > 0

  const reasons: string[] = []
  let suggested: Disposition = 'PENDING'

  if (!isComplete) {
    reasons.push(`${pending} of ${readings.length} characteristics still have no result.`)
  } else if (criticalDefects > 0) {
    suggested = 'REJECTED'
    reasons.push(`${criticalDefects} critical defect${criticalDefects === 1 ? '' : 's'} found — a critical defect rejects the lot regardless of the accept number.`)
  } else if (criticalFailures.length > 0) {
    suggested = 'REJECTED'
    reasons.push(`${criticalFailures.length} critical characteristic${criticalFailures.length === 1 ? '' : 's'} out of limits: ${criticalFailures.map((r) => r.name).join(', ')}.`)
  } else if (mandatoryFailures.length > 0) {
    suggested = 'REJECTED'
    reasons.push(`${mandatoryFailures.length} mandatory characteristic${mandatoryFailures.length === 1 ? '' : 's'} failed: ${mandatoryFailures.map((r) => r.name).join(', ')}.`)
  } else if (!withinAcceptNumber) {
    suggested = 'REJECTED'
    reasons.push(`${defectCount} defects against an accept number of ${inspection.acceptNumber} — the lot exceeds the reject number of ${inspection.rejectNumber}.`)
  } else if (failed > 0) {
    suggested = 'ACCEPTED_WITH_DEVIATION'
    reasons.push(`${failed} non-mandatory characteristic${failed === 1 ? '' : 's'} out of limits, but within the accept number. A deviation needs approval and a reason.`)
  } else {
    suggested = 'ACCEPTED'
    reasons.push(`All ${readings.length} characteristics inside limits and ${defectCount} defects against an accept number of ${inspection.acceptNumber}.`)
  }

  if (missingPhotos.length > 0) {
    reasons.push(`${missingPhotos.length} characteristic${missingPhotos.length === 1 ? '' : 's'} require a photograph that has not been attached.`)
  }

  return {
    totalChecks: readings.length,
    completed: readings.length - pending,
    passed,
    failed,
    pending,
    mandatoryFailures,
    criticalFailures,
    missingPhotos,
    defectCount,
    criticalDefects,
    majorDefects,
    minorDefects,
    withinAcceptNumber,
    isComplete,
    suggestedDisposition: suggested,
    reasons,
  }
}

/* ═══════════════════════════ Calibration gate ═══════════════════════════ */

export function instrumentStatus(inst: Pick<Instrument, 'nextDueOn' | 'status'>, today = new Date()): Instrument['status'] {
  if (inst.status === 'CONDEMNED' || inst.status === 'UNDER_CALIBRATION') return inst.status
  const due = new Date(inst.nextDueOn).setHours(0, 0, 0, 0)
  const now = new Date(today).setHours(0, 0, 0, 0)
  if (due < now) return 'OVERDUE'
  if (due - now <= 15 * 86_400_000) return 'DUE'
  return 'VALID'
}

export interface CalibrationBlock {
  instrumentCode: string
  instrumentName: string
  status: Instrument['status']
  nextDueOn: string
  characteristics: string[]
}

/**
 * Ch 24 — an inspection cannot be approved on readings taken with an instrument
 * that is out of calibration. Not a warning: the reading is not evidence.
 */
export function calibrationBlocks(inspection: Inspection, instruments: Instrument[], today = new Date()): CalibrationBlock[] {
  const used = new Map<string, string[]>()
  for (const r of inspection.readings) {
    if (!r.instrumentCode) continue
    used.set(r.instrumentCode, [...(used.get(r.instrumentCode) ?? []), r.name])
  }

  const blocks: CalibrationBlock[] = []
  for (const [code, chars] of used) {
    const inst = instruments.find((i) => i.code === code && !i.deletedAt)
    if (!inst) {
      blocks.push({ instrumentCode: code, instrumentName: '(not in the register)', status: 'CONDEMNED', nextDueOn: '—', characteristics: chars })
      continue
    }
    const status = instrumentStatus(inst, today)
    if (status === 'OVERDUE' || status === 'CONDEMNED') {
      blocks.push({ instrumentCode: code, instrumentName: inst.name, status, nextDueOn: inst.nextDueOn, characteristics: chars })
    }
  }
  return blocks
}

/** Everything standing between this inspection and approval. */
export function approvalBlockers(inspection: Inspection, instruments: Instrument[], today = new Date()): string[] {
  const out: string[] = []
  const evaluation = evaluateInspection(inspection)

  if (!evaluation.isComplete) out.push(`${evaluation.pending} characteristic${evaluation.pending === 1 ? '' : 's'} still have no result.`)
  if (evaluation.missingPhotos.length) out.push(`A photograph is mandatory on ${evaluation.missingPhotos.map((r) => r.name).join(', ')}.`)
  if (inspection.disposition === 'PENDING') out.push('No disposition has been recorded.')
  if ((inspection.disposition === 'REJECTED' || inspection.disposition === 'ACCEPTED_WITH_DEVIATION') && !inspection.dispositionReason.trim())
    out.push('A rejection or a deviation needs a written reason.')
  if (inspection.acceptedQty + inspection.rejectedQty + inspection.reworkQty !== inspection.lotSize)
    out.push(`Accepted, rejected and rework quantities total ${inspection.acceptedQty + inspection.rejectedQty + inspection.reworkQty} against a lot of ${inspection.lotSize}.`)

  for (const b of calibrationBlocks(inspection, instruments, today)) {
    out.push(`${b.instrumentCode} (${b.instrumentName}) is ${b.status.toLowerCase()} — readings for ${b.characteristics.join(', ')} are not valid evidence.`)
  }

  return out
}

/** Builds the reading rows for a new inspection from its plan. */
export function readingsFromPlan(characteristics: PlanCharacteristic[], prefix: string): InspectionReading[] {
  return characteristics
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((c, i) => ({
      uid: `rdg-${prefix}-${i}`,
      characteristicUid: c.uid,
      name: c.name,
      type: c.type,
      uom: c.uom,
      target: c.target,
      lowerLimit: c.lowerLimit,
      upperLimit: c.upperLimit,
      instrumentCode: c.instrumentCode,
      severity: c.severity,
      isMandatory: c.isMandatory,
      requiresPhoto: c.requiresPhoto,
      actual: null,
      verdict: 'PENDING',
      photoAttached: false,
      remarks: '',
    }))
}

/* ═══════════════════════════ Quality metrics ═══════════════════════════ */

/** Rejected pieces per million. The number a customer audit asks for. */
export function ppm(rejectedQty: number, inspectedQty: number): number {
  if (inspectedQty <= 0) return 0
  return (rejectedQty / inspectedQty) * 1_000_000
}

/**
 * First pass yield — lots accepted outright, without a deviation or a rework.
 * Accepting with a deviation is still not a first-time pass.
 */
export function firstPassYield(inspections: Inspection[]): { fpyPct: number; passed: number; total: number } {
  const done = inspections.filter((i) => i.status === 'COMPLETED' && !i.deletedAt)
  if (!done.length) return { fpyPct: 0, passed: 0, total: 0 }
  const passed = done.filter((i) => i.disposition === 'ACCEPTED').length
  return { fpyPct: (passed / done.length) * 100, passed, total: done.length }
}

export function acceptanceRate(inspections: Inspection[]): number {
  const done = inspections.filter((i) => i.status === 'COMPLETED' && !i.deletedAt)
  if (!done.length) return 0
  const accepted = done.filter((i) => i.disposition === 'ACCEPTED' || i.disposition === 'ACCEPTED_WITH_DEVIATION').length
  return (accepted / done.length) * 100
}

export function rejectionPct(inspections: Inspection[]): number {
  const done = inspections.filter((i) => i.status === 'COMPLETED' && !i.deletedAt)
  const inspected = done.reduce((s, i) => s + i.lotSize, 0)
  const rejected = done.reduce((s, i) => s + i.rejectedQty, 0)
  return inspected > 0 ? (rejected / inspected) * 100 : 0
}

/* ═══════════════════════════ Pareto ═══════════════════════════ */

export interface ParetoRow {
  code: string
  name: string
  severity: DefectSeverity
  qty: number
  pct: number
  cumulativePct: number
  /** Inside the 80% cumulative band — the few causes worth working on. */
  isVital: boolean
}

/**
 * Ch 15. Defects ranked by frequency with a running cumulative, so the handful
 * of causes carrying most of the loss is visible rather than argued about.
 */
export function paretoOf(inspections: Inspection[]): ParetoRow[] {
  const map = new Map<string, { code: string; name: string; severity: DefectSeverity; qty: number }>()
  for (const i of inspections) {
    if (i.deletedAt) continue
    for (const d of i.defects) {
      const e = map.get(d.defectCode) ?? { code: d.defectCode, name: d.defectName, severity: d.severity, qty: 0 }
      e.qty += d.qty
      map.set(d.defectCode, e)
    }
  }
  const rows = [...map.values()].sort((a, b) => b.qty - a.qty)
  const total = rows.reduce((s, r) => s + r.qty, 0)
  let running = 0
  return rows.map((r) => {
    const pct = total > 0 ? (r.qty / total) * 100 : 0
    running += pct
    return { ...r, pct, cumulativePct: running, isVital: running - pct < 80 }
  })
}

/* ═══════════════════════════ Cost of poor quality ═══════════════════════════ */

export interface Copq {
  scrap: number
  rework: number
  complaints: number
  /** Inspection effort is a prevention cost, reported alongside the failures. */
  total: number
  byCategory: { label: string; value: number }[]
}

export function copq(ncrs: Ncr[], complaints: Complaint[]): Copq {
  const scrapAndRework = ncrs.filter((n) => !n.deletedAt).reduce((s, n) => s + n.costImpact, 0)
  const scrap = ncrs.filter((n) => !n.deletedAt).reduce((s, n) => s + n.quantityScrapped, 0)
  const rework = ncrs.filter((n) => !n.deletedAt).reduce((s, n) => s + n.quantityReworked, 0)
  const share = scrap + rework
  const scrapCost = share > 0 ? (scrapAndRework * scrap) / share : scrapAndRework
  const reworkCost = scrapAndRework - scrapCost
  const complaintCost = complaints.filter((c) => !c.deletedAt).reduce((s, c) => s + c.resolutionValue, 0)

  return {
    scrap: scrapCost,
    rework: reworkCost,
    complaints: complaintCost,
    total: scrapCost + reworkCost + complaintCost,
    byCategory: [
      { label: 'Scrap', value: scrapCost },
      { label: 'Rework', value: reworkCost },
      { label: 'Customer complaints', value: complaintCost },
    ],
  }
}

/* ═══════════════════════════ Supplier quality ═══════════════════════════ */

export interface SupplierScore {
  supplierCode: string
  supplierName: string
  lotAcceptancePct: number
  ppm: number
  documentCompliancePct: number
  ncrClosurePct: number
  capaResponseDays: number
  /** Weighted 0–100. Quality is worth more than paperwork, and is weighted so. */
  score: number
  grade: SupplierGrade
  reasons: string[]
}

const GRADE_FLOOR: { min: number; grade: SupplierGrade }[] = [
  { min: 90, grade: 'PREFERRED' },
  { min: 75, grade: 'APPROVED' },
  { min: 60, grade: 'CONDITIONAL' },
  { min: 0, grade: 'BLOCKED' },
]

/**
 * Ch 17. Score and grade from what actually happened, not from an opinion.
 *
 * A supplier above 5,000 PPM is capped at conditional however good the
 * paperwork is — a grade that can be earned back with documentation while the
 * material keeps failing is worse than no grade at all.
 */
export function scoreSupplier(r: SupplierQualityRecord): SupplierScore {
  const lotAcceptancePct = r.lotsReceived > 0 ? (r.lotsAccepted / r.lotsReceived) * 100 : 0
  const partsPerMillion = ppm(r.qtyRejected, r.qtyReceived)
  const documentCompliancePct = r.lotsReceived > 0 ? (r.lotsWithValidDocs / r.lotsReceived) * 100 : 0
  const ncrClosurePct = r.ncrsRaised > 0 ? (r.ncrsClosedOnTime / r.ncrsRaised) * 100 : 100

  // PPM scored against a 5,000 ceiling — at or above it, this component is zero.
  const ppmScore = Math.max(0, 100 - (partsPerMillion / 5000) * 100)
  // Response scored against a 7-day target.
  const responseScore = Math.max(0, 100 - Math.max(0, r.capaResponseDays - 7) * 10)

  const score =
    lotAcceptancePct * 0.35 + ppmScore * 0.3 + documentCompliancePct * 0.15 + ncrClosurePct * 0.1 + responseScore * 0.1

  let grade = GRADE_FLOOR.find((g) => score >= g.min)!.grade
  const reasons: string[] = []

  if (partsPerMillion > 5000 && grade === 'PREFERRED') {
    grade = 'CONDITIONAL'
    reasons.push(`${Math.round(partsPerMillion).toLocaleString('en-IN')} PPM is above the 5,000 ceiling, so the grade is capped at conditional.`)
  } else if (partsPerMillion > 5000 && grade === 'APPROVED') {
    grade = 'CONDITIONAL'
    reasons.push(`${Math.round(partsPerMillion).toLocaleString('en-IN')} PPM is above the 5,000 ceiling.`)
  }
  if (lotAcceptancePct < 80) reasons.push(`Only ${lotAcceptancePct.toFixed(0)}% of lots were accepted.`)
  if (documentCompliancePct < 90) reasons.push(`${(100 - documentCompliancePct).toFixed(0)}% of lots arrived without a valid test certificate.`)
  if (r.capaResponseDays > 7) reasons.push(`CAPA responses average ${r.capaResponseDays} days against a 7-day target.`)
  if (!reasons.length) reasons.push('Meets every threshold.')

  return {
    supplierCode: r.supplierCode,
    supplierName: r.supplierName,
    lotAcceptancePct,
    ppm: partsPerMillion,
    documentCompliancePct,
    ncrClosurePct,
    capaResponseDays: r.capaResponseDays,
    score,
    grade,
    reasons,
  }
}

/* ═══════════════════════════ NCR & CAPA lifecycle ═══════════════════════════ */

export const NCR_FLOW: Record<Ncr['status'], Ncr['status'][]> = {
  OPEN: ['CONTAINED', 'CANCELLED'],
  CONTAINED: ['UNDER_INVESTIGATION', 'CANCELLED'],
  UNDER_INVESTIGATION: ['ROOT_CAUSE_IDENTIFIED', 'CANCELLED'],
  ROOT_CAUSE_IDENTIFIED: ['CORRECTIVE_ACTION', 'UNDER_INVESTIGATION'],
  CORRECTIVE_ACTION: ['VERIFICATION'],
  VERIFICATION: ['CLOSED', 'CORRECTIVE_ACTION'],
  CLOSED: [],
  CANCELLED: [],
}

export const NCR_STATUS_LABEL: Record<Ncr['status'], string> = {
  OPEN: 'Open',
  CONTAINED: 'Contained',
  UNDER_INVESTIGATION: 'Under investigation',
  ROOT_CAUSE_IDENTIFIED: 'Root cause identified',
  CORRECTIVE_ACTION: 'Corrective action',
  VERIFICATION: 'Verification',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}

/** What must be in place before an NCR can move to the next step. */
export function ncrStepBlockers(n: Ncr, to: Ncr['status']): string[] {
  const out: string[] = []
  if (to === 'UNDER_INVESTIGATION' && !n.containment.trim())
    out.push('Record the containment action first — bad material must be stopped before anyone investigates why.')
  if (to === 'CORRECTIVE_ACTION') {
    if (!n.rootCause.trim()) out.push('A root cause is required.')
    if (!n.causeCategory) out.push('Classify the cause against one of the six categories.')
    if (n.fiveWhys.filter((w) => w.answer.trim()).length < 3)
      out.push('Answer at least three whys — a root cause reached in two steps is usually a symptom.')
  }
  if (to === 'CLOSED' && !n.capaDocNo) out.push('An NCR closes through a CAPA. Raise one and close that first.')
  return out
}

export const CAPA_FLOW: Record<Capa['status'], Capa['status'][]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['VERIFICATION', 'CANCELLED'],
  VERIFICATION: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
}

export function capaStepBlockers(c: Capa, to: Capa['status']): string[] {
  const out: string[] = []
  if (to === 'IN_PROGRESS') {
    if (!c.correctiveAction.trim()) out.push('A corrective action is required.')
    if (!c.preventiveAction.trim()) out.push('A preventive action is required — fixing this batch is not a CAPA.')
  }
  if (to === 'VERIFICATION' && !c.verificationMethod.trim())
    out.push('Say how the fix will be proved to work before moving to verification.')
  if (to === 'CLOSED') {
    if (!c.verificationResult.trim()) out.push('Record what the verification found.')
    if (!c.recurrenceChecked) out.push('Confirm the defect has not recurred since the action was taken.')
  }
  return out
}

/** Days a CAPA is overdue, or zero. */
export function overdueDays(dueOn: string, closedOn: string | null, today = new Date()): number {
  if (closedOn) return 0
  const due = new Date(dueOn).setHours(0, 0, 0, 0)
  const now = new Date(today).setHours(0, 0, 0, 0)
  return now > due ? Math.round((now - due) / 86_400_000) : 0
}

/** Average days from raising to closing, over the CAPAs that closed. */
export function capaClosureDays(capas: Capa[]): { avgDays: number | null; closed: number; open: number; overdue: number } {
  const live = capas.filter((c) => !c.deletedAt)
  const closed = live.filter((c) => c.status === 'CLOSED' && c.closedOn)
  const open = live.filter((c) => !['CLOSED', 'CANCELLED'].includes(c.status))
  const avg = closed.length
    ? closed.reduce((s, c) => s + Math.max(0, (new Date(c.closedOn!).getTime() - new Date(c.raisedOn).getTime()) / 86_400_000), 0) / closed.length
    : null
  return {
    avgDays: avg,
    closed: closed.length,
    open: open.length,
    overdue: open.filter((c) => overdueDays(c.dueOn, c.closedOn) > 0).length,
  }
}

/* ═══════════════════════════ Labels ═══════════════════════════ */

export const STAGE_LABEL: Record<Inspection['stage'], string> = {
  IQC: 'Incoming',
  FIRST_PIECE: 'First piece',
  IPQC: 'In-process',
  FQC: 'Final',
  OQA: 'Outgoing',
}

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  ACCEPTED_WITH_DEVIATION: 'Accepted with deviation',
  REJECTED: 'Rejected',
  HOLD: 'Hold for review',
}

export const CAUSE_LABEL: Record<CauseCategory, string> = {
  MAN: 'Man',
  MACHINE: 'Machine',
  MATERIAL: 'Material',
  METHOD: 'Method',
  MEASUREMENT: 'Measurement',
  ENVIRONMENT: 'Environment',
}

export const CAUSE_CATEGORIES: CauseCategory[] = ['MAN', 'MACHINE', 'MATERIAL', 'METHOD', 'MEASUREMENT', 'ENVIRONMENT']
