/**
 * Quality seed data.
 *
 * Joined up to the rest of the system: the plans inspect real item codes, the
 * instruments are the ones the plans call for, the NCRs trace to inspections
 * that actually failed, and the complaint traces back through a batch to the
 * production order that made it. One instrument is deliberately overdue, so the
 * calibration gate has something to block.
 */

import { daysAgo, daysAhead } from './data'
import { readingsFromPlan, aqlPlan } from '@/lib/qmsFlow'
import type {
  Capa,
  Complaint,
  DefectEntry,
  DefectType,
  Inspection,
  InspectionPlan,
  Instrument,
  Ncr,
  PlanCharacteristic,
  QualityAudit,
  SupplierQualityRecord,
} from '@/types/quality'

const d = (n: number) => daysAgo(n).slice(0, 10)
const ahead = (n: number) => daysAhead(n).slice(0, 10)

/* ═══════════════════════════ Instruments ═══════════════════════════ */

const inst = (
  uid: string,
  code: string,
  name: string,
  instrumentType: string,
  range: string,
  leastCount: string,
  freq: number,
  lastDays: number,
  o: Partial<Instrument> = {},
): Instrument => {
  const lastCalibratedOn = d(lastDays)
  const next = new Date(lastCalibratedOn)
  next.setDate(next.getDate() + freq)
  const row: Instrument = {
    uid,
    code,
    name,
    instrumentType,
    make: 'Mitutoyo',
    serialNo: `SN-${code.slice(-4)}`,
    range,
    leastCount,
    location: 'Quality Lab',
    custodian: 'S. Meena',
    calibrationFrequencyDays: freq,
    lastCalibratedOn,
    nextDueOn: next.toISOString().slice(0, 10),
    agency: 'NABL — Precision Calibration Services',
    certificateNo: `CAL/2026/${code.slice(-4)}`,
    observedErrorPct: 0.4,
    permittedErrorPct: 1.0,
    status: 'VALID',
    remarks: '',
    version: 1,
    ...o,
  }
  return row
}

export const instruments: Instrument[] = [
  inst('ins-01', 'MI-0001', 'Digital Vernier Caliper 0–200 mm', 'Vernier Caliper', '0–200 mm', '0.01 mm', 365, 120),
  inst('ins-02', 'MI-0002', 'Outside Micrometer 0–25 mm', 'Micrometer', '0–25 mm', '0.001 mm', 365, 200, { observedErrorPct: 0.6 }),
  inst('ins-03', 'MI-0003', 'Coating Thickness Gauge', 'Thickness Gauge', '0–1500 µm', '1 µm', 180, 200, {
    // Deliberately past due — the calibration gate has to block on something.
    status: 'OVERDUE',
    observedErrorPct: 0.9,
    remarks: 'Overdue. Recall from the coating line before any further readings are taken.',
  }),
  inst('ins-04', 'MI-0004', 'Helium Leak Detector', 'Leak Detector', '1e-9 – 1e-3 mbar·L/s', '1e-9', 365, 60, { location: 'Leak Test Bay', make: 'Pfeiffer' }),
  inst('ins-05', 'MI-0005', 'Vacuum Gauge — Pirani', 'Vacuum Gauge', '1e-4 – 1000 mbar', '1e-4 mbar', 365, 40, { location: 'Vacuum Chamber', make: 'Leybold' }),
  inst('ins-06', 'MI-0006', 'Digital Weighing Scale 0–5 kg', 'Weighing Scale', '0–5 kg', '0.1 g', 365, 90, { make: 'Essae', location: 'Packing Line' }),
  inst('ins-07', 'MI-0007', 'Digital Torque Tester 0–5 Nm', 'Torque Tester', '0–5 Nm', '0.01 Nm', 365, 356, {
    status: 'DUE',
    // Inside the 15-day warning window.
    make: 'Cedar',
    location: 'Assembly Bay',
    observedErrorPct: 0.7,
  }),
  inst('ins-08', 'MI-0008', 'Height Gauge 0–300 mm', 'Height Gauge', '0–300 mm', '0.01 mm', 365, 30),
  inst('ins-09', 'MI-0009', 'Ultrasonic Thickness Gauge', 'Thickness Gauge', '0.75–300 mm', '0.01 mm', 365, 150, { make: 'Olympus' }),
  inst('ins-10', 'MI-0010', 'Barcode Verifier', 'Verifier', 'ISO/IEC 15416', 'Grade A–F', 365, 400, {
    status: 'UNDER_CALIBRATION',
    location: 'With the calibration agency',
    remarks: 'Sent out on the 12th; expected back within the week.',
  }),
]

/* ═══════════════════════════ Defect catalogue ═══════════════════════════ */

const defect = (
  uid: string,
  code: string,
  name: string,
  severity: DefectType['severity'],
  category: string,
  defaultCause: DefectType['defaultCause'],
  scrapCost: number,
  reworkCost: number,
): DefectType => ({
  uid,
  code,
  name,
  severity,
  category,
  defaultCause,
  scrapCostPerUnit: scrapCost,
  reworkCostPerUnit: reworkCost,
  isActive: true,
  version: 1,
})

export const defectTypes: DefectType[] = [
  defect('dft-01', 'DF-001', 'Leakage', 'CRITICAL', 'Function', 'MACHINE', 412, 0),
  defect('dft-02', 'DF-002', 'Weld crack', 'CRITICAL', 'Welding', 'MACHINE', 104, 0),
  defect('dft-03', 'DF-003', 'Vacuum loss', 'CRITICAL', 'Function', 'MACHINE', 412, 0),
  defect('dft-04', 'DF-004', 'Dent', 'MAJOR', 'Cosmetic', 'MAN', 412, 46),
  defect('dft-05', 'DF-005', 'Scratch', 'MINOR', 'Cosmetic', 'MAN', 0, 28),
  defect('dft-06', 'DF-006', 'Paint peel', 'MAJOR', 'Finishing', 'METHOD', 0, 62),
  defect('dft-07', 'DF-007', 'Colour variation', 'MINOR', 'Finishing', 'MATERIAL', 0, 62),
  defect('dft-08', 'DF-008', 'Printing misalignment', 'MAJOR', 'Branding', 'MACHINE', 0, 34),
  defect('dft-09', 'DF-009', 'Incorrect logo', 'CRITICAL', 'Branding', 'MAN', 412, 0),
  defect('dft-10', 'DF-010', 'Wrong lid fitted', 'MAJOR', 'Assembly', 'MAN', 0, 18),
  defect('dft-11', 'DF-011', 'Barcode unreadable', 'MAJOR', 'Packaging', 'MACHINE', 0, 4),
  defect('dft-12', 'DF-012', 'Wrong packaging', 'MINOR', 'Packaging', 'MAN', 0, 22),
  defect('dft-13', 'DF-013', 'Thickness out of specification', 'MAJOR', 'Material', 'MATERIAL', 244, 0),
  defect('dft-14', 'DF-014', 'Wrinkle after drawing', 'MAJOR', 'Forming', 'MACHINE', 96, 0),
  defect('dft-15', 'DF-015', 'Thread fit reject', 'MAJOR', 'Forming', 'MACHINE', 96, 38),
  defect('dft-16', 'DF-016', 'Coating thickness low', 'MINOR', 'Finishing', 'METHOD', 0, 62),
  defect('dft-17', 'DF-017', 'Mill certificate missing', 'MAJOR', 'Documentation', 'MATERIAL', 0, 0),
  defect('dft-18', 'DF-018', 'Transit damage', 'MAJOR', 'Logistics', 'ENVIRONMENT', 412, 0),
]

/* ═══════════════════════════ Inspection plans ═══════════════════════════ */

let charSeq = 0
const ch = (
  name: string,
  type: PlanCharacteristic['type'],
  o: Partial<PlanCharacteristic> = {},
): PlanCharacteristic => ({
  uid: `pch-${++charSeq}`,
  seq: 0,
  name,
  type,
  uom: '',
  target: null,
  lowerLimit: null,
  upperLimit: null,
  instrumentCode: '',
  severity: 'MAJOR',
  isMandatory: true,
  requiresPhoto: false,
  method: '',
  ...o,
})

const plan = (
  uid: string,
  docNo: string,
  name: string,
  stage: InspectionPlan['stage'],
  itemCode: string,
  itemName: string,
  characteristics: PlanCharacteristic[],
  o: Partial<InspectionPlan> = {},
): InspectionPlan => ({
  uid,
  docNo,
  name,
  stage,
  itemCode,
  itemName,
  operationCode: null,
  samplingMethod: 'AQL',
  aql: 1.0,
  fixedSampleSize: 0,
  randomPercent: 0,
  revision: 1,
  status: 'ACTIVE',
  effectiveFrom: d(200),
  characteristics: characteristics.map((c, i) => ({ ...c, seq: i + 1 })),
  inspectorRole: 'QC Inspector',
  frequency: 'Every lot',
  remarks: '',
  createdBy: 'S. Meena',
  createdAt: daysAgo(200),
  approvedBy: 'Meera Rajan',
  version: 1,
  ...o,
})

export const inspectionPlans: InspectionPlan[] = [
  /* ── Incoming: steel coil (Ch 25) ─────────────────────────────────── */
  plan('qip-01', 'QIP/26-27/0001', 'SS 304 Coil — incoming', 'IQC', 'RM-SS304-050', 'SS 304 Coil 0.50 mm × 400 mm', [
    ch('Mill test certificate', 'DOCUMENT', { severity: 'CRITICAL', method: 'Verify heat number against the certificate' }),
    ch('Heat number on coil matches certificate', 'ATTRIBUTE', { severity: 'CRITICAL', requiresPhoto: true, method: 'Visual against the tag' }),
    ch('Material grade', 'ATTRIBUTE', { severity: 'CRITICAL', method: 'Portable XRF spot check' }),
    ch('Coil thickness', 'MEASURED', { uom: 'mm', target: 0.5, lowerLimit: 0.48, upperLimit: 0.52, instrumentCode: 'MI-0002', severity: 'CRITICAL', method: 'Micrometer, three points across the width' }),
    ch('Coil width', 'MEASURED', { uom: 'mm', target: 400, lowerLimit: 398, upperLimit: 402, instrumentCode: 'MI-0001', severity: 'MAJOR' }),
    ch('Surface finish', 'ATTRIBUTE', { severity: 'MAJOR', isMandatory: false, method: 'Visual against the 2B reference panel' }),
    ch('Edge condition — no burr or wave', 'ATTRIBUTE', { severity: 'MINOR', isMandatory: false }),
  ], { aql: 1.0, samplingMethod: 'AQL', frequency: 'Every coil' }),

  /* ── Incoming: bought-out lid ─────────────────────────────────────── */
  plan('qip-02', 'QIP/26-27/0002', 'Screw cap — incoming', 'IQC', 'CMP-LID-SCR-SS', 'Screw Cap — Stainless with Silicone Seal', [
    ch('Visual — no dent, scratch or discolouration', 'ATTRIBUTE', { severity: 'MAJOR' }),
    ch('Thread diameter', 'MEASURED', { uom: 'mm', target: 44, lowerLimit: 43.8, upperLimit: 44.2, instrumentCode: 'MI-0001', severity: 'CRITICAL' }),
    ch('Cap height', 'MEASURED', { uom: 'mm', target: 34, lowerLimit: 33.5, upperLimit: 34.5, instrumentCode: 'MI-0008', severity: 'MAJOR', isMandatory: false }),
    ch('Silicone seal present and seated', 'ATTRIBUTE', { severity: 'CRITICAL', requiresPhoto: true }),
    ch('Food-contact certificate', 'DOCUMENT', { severity: 'CRITICAL' }),
  ], { aql: 2.5, samplingMethod: 'AQL' }),

  /* ── First piece: deep drawing ────────────────────────────────────── */
  plan('qip-03', 'QIP/26-27/0003', 'Body shell — first piece approval', 'FIRST_PIECE', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', [
    ch('Cup height', 'MEASURED', { uom: 'mm', target: 248, lowerLimit: 246.5, upperLimit: 249.5, instrumentCode: 'MI-0008', severity: 'CRITICAL', requiresPhoto: true }),
    ch('Outside diameter', 'MEASURED', { uom: 'mm', target: 73, lowerLimit: 72.7, upperLimit: 73.3, instrumentCode: 'MI-0001', severity: 'CRITICAL' }),
    ch('Wall thickness after drawing', 'MEASURED', { uom: 'mm', target: 0.42, lowerLimit: 0.38, upperLimit: 0.5, instrumentCode: 'MI-0009', severity: 'CRITICAL' }),
    ch('Neck diameter', 'MEASURED', { uom: 'mm', target: 44, lowerLimit: 43.8, upperLimit: 44.2, instrumentCode: 'MI-0001', severity: 'CRITICAL' }),
    ch('No wrinkle in the draw', 'ATTRIBUTE', { severity: 'MAJOR', requiresPhoto: true }),
    ch('No crack at the radius', 'ATTRIBUTE', { severity: 'CRITICAL', requiresPhoto: true }),
    ch('Drawing revision matches the traveller', 'DOCUMENT', { severity: 'MAJOR' }),
  ], { samplingMethod: 'FIXED', fixedSampleSize: 1, operationCode: 'OP-020', frequency: 'First piece of every lot and after every setup', inspectorRole: 'QC Inspector + Production Supervisor' }),

  /* ── In-process: welding and vacuum ───────────────────────────────── */
  plan('qip-04', 'QIP/26-27/0004', 'Bottom welding — in-process', 'IPQC', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', [
    ch('Weld penetration', 'MEASURED', { uom: 'mm', target: 0.6, lowerLimit: 0.45, upperLimit: 0.8, instrumentCode: 'MI-0009', severity: 'CRITICAL' }),
    ch('Weld bead uniform, no undercut', 'ATTRIBUTE', { severity: 'CRITICAL', requiresPhoto: true }),
    ch('No spatter on the outer surface', 'ATTRIBUTE', { severity: 'MINOR', isMandatory: false }),
    ch('Dye-penetrant on first and last piece', 'ATTRIBUTE', { severity: 'CRITICAL' }),
  ], { samplingMethod: 'RANDOM_PERCENT', randomPercent: 5, operationCode: 'OP-050', frequency: 'Every 2 hours' }),

  plan('qip-05', 'QIP/26-27/0005', 'Vacuum and leak — in-process', 'IPQC', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', [
    ch('Chamber vacuum at seal', 'MEASURED', { uom: 'mbar', target: 0.005, lowerLimit: 0, upperLimit: 0.008, instrumentCode: 'MI-0005', severity: 'CRITICAL' }),
    ch('Helium leak rate', 'MEASURED', { uom: 'mbar·L/s', target: 0.0000001, lowerLimit: 0, upperLimit: 0.000001, instrumentCode: 'MI-0004', severity: 'CRITICAL' }),
    ch('Pinch-off seal intact', 'ATTRIBUTE', { severity: 'CRITICAL', requiresPhoto: true }),
  ], { samplingMethod: 'FULL', operationCode: 'OP-070', frequency: '100% of production' }),

  /* ── In-process: coating ──────────────────────────────────────────── */
  plan('qip-06', 'QIP/26-27/0006', 'Powder coating — in-process', 'IPQC', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', [
    ch('Coating thickness', 'MEASURED', { uom: 'µm', target: 70, lowerLimit: 60, upperLimit: 80, instrumentCode: 'MI-0003', severity: 'MAJOR' }),
    ch('Colour match against the RAL 9005 panel', 'ATTRIBUTE', { severity: 'MAJOR', requiresPhoto: true }),
    ch('Cross-hatch adhesion, class 0 or 1', 'ATTRIBUTE', { severity: 'CRITICAL' }),
    ch('No orange peel or run', 'ATTRIBUTE', { severity: 'MINOR', isMandatory: false }),
    ch('Oven chart attached for the batch', 'DOCUMENT', { severity: 'MAJOR', isMandatory: false }),
  ], { samplingMethod: 'AQL', aql: 2.5, operationCode: 'OP-090', frequency: 'Every batch' }),

  /* ── Final ────────────────────────────────────────────────────────── */
  plan('qip-07', 'QIP/26-27/0007', 'Vacuum flask 750 ml — final', 'FQC', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', [
    ch('Appearance — no dent, scratch or peel', 'ATTRIBUTE', { severity: 'MAJOR', requiresPhoto: true }),
    ch('Filled capacity', 'MEASURED', { uom: 'ml', target: 750, lowerLimit: 735, upperLimit: 765, instrumentCode: 'MI-0006', severity: 'MAJOR' }),
    ch('Net weight', 'MEASURED', { uom: 'g', target: 385, lowerLimit: 375, upperLimit: 395, instrumentCode: 'MI-0006', severity: 'MINOR', isMandatory: false }),
    ch('Leak test — inverted, 30 minutes', 'ATTRIBUTE', { severity: 'CRITICAL' }),
    ch('Lid torque', 'MEASURED', { uom: 'Nm', target: 1.2, lowerLimit: 1.0, upperLimit: 1.5, instrumentCode: 'MI-0007', severity: 'MAJOR' }),
    ch('Logo position and alignment', 'ATTRIBUTE', { severity: 'MAJOR', requiresPhoto: true }),
    ch('Barcode readable, grade C or better', 'ATTRIBUTE', { severity: 'MAJOR', instrumentCode: 'MI-0010' }),
    ch('Insulation — 12 h hot retention on the sample', 'MEASURED', { uom: '°C', target: 62, lowerLimit: 55, upperLimit: 100, severity: 'CRITICAL' }),
  ], { samplingMethod: 'AQL', aql: 1.0 }),

  /* ── Outgoing ─────────────────────────────────────────────────────── */
  plan('qip-08', 'QIP/26-27/0008', 'Pre-dispatch — export carton', 'OQA', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', [
    ch('Carton count against the packing list', 'ATTRIBUTE', { severity: 'CRITICAL' }),
    ch('Units per carton', 'MEASURED', { uom: 'nos', target: 24, lowerLimit: 24, upperLimit: 24, severity: 'CRITICAL' }),
    ch('Customer label — artwork and language', 'ATTRIBUTE', { severity: 'CRITICAL', requiresPhoto: true }),
    ch('Export shipping marks', 'ATTRIBUTE', { severity: 'MAJOR' }),
    ch('Pallet configuration and strapping', 'ATTRIBUTE', { severity: 'MAJOR', isMandatory: false, requiresPhoto: true }),
    ch('Certificate of origin and test report', 'DOCUMENT', { severity: 'CRITICAL' }),
  ], { samplingMethod: 'FIXED', fixedSampleSize: 5, frequency: 'Every shipment', inspectorRole: 'QA Engineer' }),

  /* ── A draft awaiting approval ────────────────────────────────────── */
  plan('qip-09', 'QIP/26-27/0009', 'Vacuum flask 500 ml — final', 'FQC', 'FG-SS-500-BLU', 'Vacuum Flask 500 ml — Ocean Blue', [
    ch('Appearance', 'ATTRIBUTE', { severity: 'MAJOR' }),
    ch('Filled capacity', 'MEASURED', { uom: 'ml', target: 500, lowerLimit: 490, upperLimit: 510, instrumentCode: 'MI-0006', severity: 'MAJOR' }),
    ch('Leak test', 'ATTRIBUTE', { severity: 'CRITICAL' }),
  ], { status: 'DRAFT', approvedBy: null, effectiveFrom: d(2), createdAt: daysAgo(2), remarks: 'New SKU. Awaiting sign-off with the 500 ml drawing.' }),
]

/* ═══════════════════════════ Inspections ═══════════════════════════ */

let inspSeq = 0
let defSeq = 0
const dl = (defectCode: string, qty: number, source: string, remarks = ''): DefectEntry => {
  const t = defectTypes.find((x) => x.code === defectCode)!
  return { uid: `dfe-${++defSeq}`, defectCode, defectName: t.name, severity: t.severity, qty, source, remarks }
}

/**
 * Builds an inspection from its plan, then applies the readings given. Anything
 * not named keeps the plan's target as the actual — a lot where every check
 * lands on nominal is unrealistic, so the interesting ones are set explicitly.
 */
const insp = (
  docNo: string,
  planDocNo: string,
  lotSize: number,
  o: Partial<Inspection> & { readingOverrides?: Record<string, Partial<{ actual: number | null; verdict: 'PENDING' | 'PASS' | 'FAIL'; photoAttached: boolean; remarks: string }>> },
): Inspection => {
  const p = inspectionPlans.find((x) => x.docNo === planDocNo)!
  const sampling =
    p.samplingMethod === 'AQL'
      ? aqlPlan(lotSize, p.aql)
      : p.samplingMethod === 'FULL'
        ? { sampleSize: lotSize, acceptNumber: 0, rejectNumber: 1 }
        : p.samplingMethod === 'FIXED'
          ? { sampleSize: Math.min(lotSize, p.fixedSampleSize), acceptNumber: 0, rejectNumber: 1 }
          : { sampleSize: Math.ceil((lotSize * p.randomPercent) / 100), acceptNumber: 0, rejectNumber: 1 }

  const uid = `qin-${String(++inspSeq).padStart(2, '0')}`
  const readings = readingsFromPlan(p.characteristics, uid).map((r) => {
    const ov = o.readingOverrides?.[r.name]
    if (ov) return { ...r, ...ov, photoAttached: ov.photoAttached ?? r.requiresPhoto, remarks: ov.remarks ?? '' }
    // Default: measured lands on target, attributes and documents pass.
    return {
      ...r,
      actual: r.type === 'MEASURED' ? r.target : null,
      verdict: (r.type === 'MEASURED' ? 'PENDING' : 'PASS') as 'PENDING' | 'PASS' | 'FAIL',
      photoAttached: r.requiresPhoto,
    }
  })
  const { readingOverrides, ...rest } = o
  void readingOverrides

  return {
    uid,
    docNo,
    stage: p.stage,
    sourceType: p.stage === 'IQC' ? 'GRN' : p.stage === 'OQA' ? 'SHIPMENT' : 'PRODUCTION_ORDER',
    sourceDocNo: '',
    itemCode: p.itemCode,
    itemName: p.itemName,
    uom: 'NOS',
    batchNo: '',
    supplierCode: '',
    supplierName: '',
    operationCode: p.operationCode,
    workCentreCode: null,
    machineCode: null,
    shift: 'A',
    planDocNo: p.docNo,
    planRevision: p.revision,
    lotSize,
    sampleSize: sampling.sampleSize,
    acceptNumber: sampling.acceptNumber,
    rejectNumber: sampling.rejectNumber,
    samplingMethod: p.samplingMethod,
    aql: p.aql,
    acceptedQty: lotSize,
    rejectedQty: 0,
    reworkQty: 0,
    readings,
    defects: [],
    status: 'COMPLETED',
    disposition: 'ACCEPTED',
    dispositionReason: '',
    inspector: 'S. Meena',
    inspectedAt: daysAgo(3),
    approvedBy: 'Meera Rajan',
    approvedAt: daysAgo(3),
    ncrDocNo: null,
    remarks: '',
    createdAt: daysAgo(3),
    version: 1,
    ...rest,
  }
}

export const inspections: Inspection[] = [
  /* Incoming — a clean coil lot. */
  insp('QC/IQC/26-27/0101', 'QIP/26-27/0001', 12_000, {
    sourceDocNo: 'GRN/P1/2627/00317',
    uom: 'KG',
    batchNo: 'B2606-H4471',
    supplierCode: 'SUP-00001',
    supplierName: 'Jindal Stainless Limited',
    inspectedAt: daysAgo(6),
    approvedAt: daysAgo(6),
    createdAt: daysAgo(6),
    readingOverrides: {
      'Coil thickness': { actual: 0.499 },
      'Coil width': { actual: 400.4 },
    },
  }),

  /* Incoming — thickness out of tolerance on a critical characteristic. */
  insp('QC/IQC/26-27/0102', 'QIP/26-27/0001', 8_400, {
    sourceDocNo: 'GRN/P1/2627/00322',
    uom: 'KG',
    batchNo: 'B2607-H4488',
    supplierCode: 'SUP-00002',
    supplierName: 'Chennai Steel Traders',
    disposition: 'REJECTED',
    dispositionReason: 'Coil thickness measured 0.462 mm against a lower limit of 0.48 mm at three points. Grade certificate does not match the heat number stamped on the coil.',
    acceptedQty: 0,
    rejectedQty: 8_400,
    ncrDocNo: 'NCR/26-27/0021',
    inspectedAt: daysAgo(9),
    approvedAt: daysAgo(9),
    createdAt: daysAgo(9),
    defects: [dl('DF-013', 3, 'SUP-00002 heat H4488'), dl('DF-017', 1, 'SUP-00002 heat H4488', 'Certificate is for heat H4481.')],
    readingOverrides: {
      'Coil thickness': { actual: 0.462, remarks: 'Measured at three points across the width — 0.461, 0.462, 0.463.' },
      'Heat number on coil matches certificate': { verdict: 'FAIL', photoAttached: true, remarks: 'Coil stamped H4488, certificate issued for H4481.' },
      'Coil width': { actual: 399.6 },
    },
  }),

  /* Incoming — caps, accepted with a minor deviation. */
  insp('QC/IQC/26-27/0103', 'QIP/26-27/0002', 30_000, {
    sourceDocNo: 'GRN/P1/2627/00325',
    batchNo: 'LID-2607-A',
    supplierCode: 'SUP-00005',
    supplierName: 'Perfect Polymers Private Limited',
    disposition: 'ACCEPTED_WITH_DEVIATION',
    dispositionReason: 'Cap height 33.4 mm, just under the 33.5 mm limit, on a non-mandatory characteristic. Fitment trial on 50 pieces passed. Accepted for this lot only; supplier notified.',
    acceptedQty: 30_000,
    inspectedAt: daysAgo(4),
    approvedAt: daysAgo(4),
    createdAt: daysAgo(4),
    readingOverrides: {
      'Thread diameter': { actual: 44.05 },
      'Cap height': { actual: 33.4, remarks: 'Consistent across the sample — the tool is worn rather than the process drifting.' },
    },
  }),

  /* First piece — approved. */
  insp('QC/FAI/26-27/0044', 'QIP/26-27/0003', 6_000, {
    sourceType: 'WORK_ORDER',
    sourceDocNo: 'PRD/26-27/0129',
    batchNo: 'WIP-2607-B12',
    workCentreCode: 'WC-02',
    machineCode: 'MC-0002',
    inspector: 'Sneha Patel',
    inspectedAt: daysAgo(1),
    approvedAt: daysAgo(1),
    createdAt: daysAgo(1),
    readingOverrides: {
      'Cup height': { actual: 248.2 },
      'Outside diameter': { actual: 72.94 },
      'Wall thickness after drawing': { actual: 0.44 },
      'Neck diameter': { actual: 44.02 },
    },
  }),

  /* In-process welding — a weld crack found, batch held. */
  insp('QC/IPQC/26-27/0212', 'QIP/26-27/0004', 6_000, {
    sourceType: 'WORK_ORDER',
    sourceDocNo: 'PRD/26-27/0129',
    batchNo: 'WIP-2607-B12',
    workCentreCode: 'WC-04',
    machineCode: 'MC-0004',
    shift: 'B',
    disposition: 'HOLD',
    dispositionReason: 'Two weld cracks in a sample of 300. Machine MC-0004 was on a breakdown call this shift. Batch held pending 100% dye-penetrant.',
    acceptedQty: 0,
    rejectedQty: 0,
    reworkQty: 6_000,
    status: 'PENDING_APPROVAL',
    approvedBy: null,
    approvedAt: null,
    ncrDocNo: 'NCR/26-27/0022',
    inspector: 'Sneha Patel',
    inspectedAt: daysAgo(0),
    createdAt: daysAgo(0),
    defects: [dl('DF-002', 2, 'MC-0004 shift B')],
    readingOverrides: {
      'Weld penetration': { actual: 0.41, remarks: 'Below the 0.45 mm floor on both cracked pieces.' },
      'Weld bead uniform, no undercut': { verdict: 'FAIL', photoAttached: true },
    },
  }),

  /* In-process coating — readings taken on an overdue gauge. */
  insp('QC/IPQC/26-27/0213', 'QIP/26-27/0006', 2_000, {
    sourceType: 'WORK_ORDER',
    sourceDocNo: 'PRD/26-27/0128',
    batchNo: 'FG-2607-A08',
    workCentreCode: 'WC-07',
    machineCode: 'MC-0007',
    status: 'PENDING_APPROVAL',
    disposition: 'ACCEPTED',
    approvedBy: null,
    approvedAt: null,
    inspector: 'Sneha Patel',
    inspectedAt: daysAgo(0),
    createdAt: daysAgo(0),
    readingOverrides: {
      'Coating thickness': { actual: 68 },
    },
    remarks: 'Cannot be approved — the coating thickness gauge is out of calibration.',
  }),

  /* Final — clean. */
  insp('QC/FQC/26-27/0388', 'QIP/26-27/0007', 3_000, {
    sourceDocNo: 'PRD/26-27/0126',
    batchNo: 'FG-2606-D21',
    inspectedAt: daysAgo(9),
    approvedAt: daysAgo(9),
    createdAt: daysAgo(9),
    acceptedQty: 2_982,
    rejectedQty: 18,
    // Counted in the sample of 125, against an accept number of 3.
    defects: [dl('DF-005', 2, 'Assembly bay'), dl('DF-011', 1, 'Packing line')],
    disposition: 'ACCEPTED',
    readingOverrides: {
      'Filled capacity': { actual: 751 },
      'Net weight': { actual: 386.2 },
      'Lid torque': { actual: 1.24 },
      'Insulation — 12 h hot retention on the sample': { actual: 63.5 },
    },
  }),

  /* Final — leakage, rejected. */
  insp('QC/FQC/26-27/0389', 'QIP/26-27/0007', 1_200, {
    sourceDocNo: 'PRD/26-27/0128',
    batchNo: 'FG-2607-A08',
    disposition: 'REJECTED',
    dispositionReason: 'Four leakers in a sample of 80 against an accept number of 2. Traced to the vacuum seal on the batch coming off MC-0005 during the coating booth downtime.',
    acceptedQty: 0,
    rejectedQty: 62,
    reworkQty: 1_138,
    ncrDocNo: 'NCR/26-27/0023',
    inspectedAt: daysAgo(2),
    approvedAt: daysAgo(2),
    createdAt: daysAgo(2),
    defects: [dl('DF-001', 4, 'MC-0005 vacuum chamber'), dl('DF-003', 2, 'MC-0005 vacuum chamber'), dl('DF-004', 3, 'Assembly bay')],
    readingOverrides: {
      'Leak test — inverted, 30 minutes': { verdict: 'FAIL' },
      'Filled capacity': { actual: 748 },
      'Net weight': { actual: 384 },
      'Lid torque': { actual: 1.18 },
      'Insulation — 12 h hot retention on the sample': { actual: 48, remarks: 'Retention collapsed — consistent with vacuum loss.' },
    },
  }),

  /* Outgoing — export shipment cleared. */
  insp('QC/OQA/26-27/0090', 'QIP/26-27/0008', 250, {
    sourceType: 'SHIPMENT',
    sourceDocNo: 'SHP/26-27/00311',
    uom: 'CTN',
    batchNo: 'FG-2606-D21',
    inspector: 'Priya Menon',
    inspectedAt: daysAgo(7),
    approvedAt: daysAgo(7),
    createdAt: daysAgo(7),
    readingOverrides: { 'Units per carton': { actual: 24 } },
  }),

  /* Outgoing — waiting on the inspector. */
  insp('QC/OQA/26-27/0091', 'QIP/26-27/0008', 180, {
    sourceType: 'SHIPMENT',
    sourceDocNo: 'SHP/26-27/00314',
    uom: 'CTN',
    batchNo: 'FG-2607-A08',
    status: 'PENDING',
    disposition: 'PENDING',
    acceptedQty: 0,
    approvedBy: null,
    approvedAt: null,
    inspectedAt: null,
    inspector: 'Priya Menon',
    createdAt: daysAgo(0),
    readingOverrides: {
      'Carton count against the packing list': { verdict: 'PENDING' },
      'Units per carton': { actual: null },
      'Customer label — artwork and language': { verdict: 'PENDING', photoAttached: false },
      'Export shipping marks': { verdict: 'PENDING' },
      'Pallet configuration and strapping': { verdict: 'PENDING', photoAttached: false },
      'Certificate of origin and test report': { verdict: 'PENDING' },
    },
  }),
]

/* ═══════════════════════════ NCRs ═══════════════════════════ */

export const ncrs: Ncr[] = [
  {
    uid: 'ncr-01',
    docNo: 'NCR/26-27/0021',
    source: 'SUPPLIER',
    severity: 'CRITICAL',
    title: 'SS 304 coil under thickness and certificate mismatch',
    description:
      'Coil received against GRN/P1/2627/00322 measured 0.462 mm against a specified 0.48–0.52 mm. The mill test certificate supplied is for heat H4481; the coil is stamped H4488.',
    itemCode: 'RM-SS304-050',
    itemName: 'SS 304 Coil 0.50 mm × 400 mm',
    batchNo: 'B2607-H4488',
    originDocNo: 'QC/IQC/26-27/0102',
    supplierCode: 'SUP-00002',
    quantityAffected: 8_400,
    quantityScrapped: 0,
    quantityReworked: 0,
    uom: 'KG',
    containment: 'Full lot moved to the quarantine store and blocked in inventory. Supplier informed the same day; replacement coil requested against the same PO.',
    containedAt: d(9),
    rootCause:
      'The supplier shipped from a different heat than the one certified. Their despatch check compares the PO line to the coil tag but not to the certificate, so a substitution passes unnoticed.',
    causeCategory: 'METHOD',
    fiveWhys: [
      { level: 1, question: 'Why was under-thickness material received?', answer: 'The coil supplied was from heat H4488, not the certified H4481.' },
      { level: 2, question: 'Why was a different heat supplied?', answer: 'The certified coil had already been allocated to another customer.' },
      { level: 3, question: 'Why was the substitution not caught at despatch?', answer: 'The supplier’s despatch check matches the coil tag to the purchase order, not to the certificate.' },
      { level: 4, question: 'Why does the check not include the certificate?', answer: 'Their procedure treats the certificate as paperwork issued after loading.' },
      { level: 5, question: 'Why is the certificate issued after loading?', answer: 'It is generated by the quality department from the despatch note rather than driving it.' },
    ],
    status: 'CORRECTIVE_ACTION',
    raisedBy: 'S. Meena',
    raisedOn: d(9),
    owner: 'P. Suresh',
    dueOn: ahead(5),
    closedOn: null,
    capaDocNo: 'CAPA/26-27/0014',
    costImpact: 0,
    remarks: 'Replacement coil promised within 10 days. Debit note raised for inbound freight.',
    version: 3,
  },
  {
    uid: 'ncr-02',
    docNo: 'NCR/26-27/0022',
    source: 'PRODUCTION',
    severity: 'CRITICAL',
    title: 'Weld cracks on the bottom welding station',
    description:
      'Two cracked welds found in a patrol sample of 300 on shift B. Weld penetration measured 0.41 mm against a 0.45 mm floor. MC-0004 was on an open breakdown call the same shift.',
    itemCode: 'SF-BODY-750',
    itemName: 'Bottle Body Shell — 750 ml',
    batchNo: 'WIP-2607-B12',
    originDocNo: 'QC/IPQC/26-27/0212',
    supplierCode: '',
    quantityAffected: 6_000,
    quantityScrapped: 24,
    quantityReworked: 5_976,
    uom: 'NOS',
    containment: 'Line stopped. Batch held and routed for 100% dye-penetrant before it moves to vacuum. Welder recalled for re-certification.',
    containedAt: d(0),
    rootCause: '',
    causeCategory: null,
    fiveWhys: [
      { level: 1, question: 'Why did the welds crack?', answer: 'Penetration was below the specified minimum.' },
      { level: 2, question: 'Why was penetration low?', answer: '' },
      { level: 3, question: '', answer: '' },
      { level: 4, question: '', answer: '' },
      { level: 5, question: '', answer: '' },
    ],
    status: 'UNDER_INVESTIGATION',
    raisedBy: 'Sneha Patel',
    raisedOn: d(0),
    owner: 'S. Balaji',
    dueOn: ahead(7),
    closedOn: null,
    capaDocNo: null,
    costImpact: 2_496,
    remarks: 'Maintenance to report on the TIG current calibration on MC-0004.',
    version: 1,
  },
  {
    uid: 'ncr-03',
    docNo: 'NCR/26-27/0023',
    source: 'PRODUCTION',
    severity: 'CRITICAL',
    title: 'Vacuum loss and leakage on batch FG-2607-A08',
    description:
      'Four leakers and two vacuum failures in a final sample of 80 against an accept number of 2. Insulation retention on the sample collapsed to 48 °C against a 55 °C floor.',
    itemCode: 'FG-SS-750-BLK',
    itemName: 'Vacuum Flask 750 ml — Matte Black',
    batchNo: 'FG-2607-A08',
    originDocNo: 'QC/FQC/26-27/0389',
    supplierCode: '',
    quantityAffected: 1_200,
    quantityScrapped: 62,
    quantityReworked: 1_138,
    uom: 'NOS',
    containment: 'Batch blocked in the finished goods store and removed from the dispatch plan. The pending export shipment SHP/26-27/00314 is held at OQA.',
    containedAt: d(2),
    rootCause:
      'The vacuum chamber getter activation cycle ran short on the batch produced while the coating booth was down. The operator restarted the chamber mid-cycle rather than aborting and re-running it.',
    causeCategory: 'METHOD',
    fiveWhys: [
      { level: 1, question: 'Why did the bottles lose vacuum?', answer: 'The getter was not fully activated, so residual gas was not absorbed.' },
      { level: 2, question: 'Why was the getter not fully activated?', answer: 'The activation cycle was interrupted and restarted from the middle.' },
      { level: 3, question: 'Why was it restarted from the middle?', answer: 'The chamber allows a resume after a pause, and the operator used it to save time during the coating downtime.' },
      { level: 4, question: 'Why does the chamber allow a resume?', answer: 'The recipe has no interlock forcing a full re-run after an interruption.' },
      { level: 5, question: 'Why is there no interlock?', answer: 'The resume feature was enabled at commissioning for maintenance testing and never turned off for production.' },
    ],
    status: 'VERIFICATION',
    raisedBy: 'S. Meena',
    raisedOn: d(2),
    owner: 'S. Balaji',
    dueOn: ahead(3),
    closedOn: null,
    capaDocNo: 'CAPA/26-27/0015',
    costImpact: 96_512,
    remarks: 'Rework routed back through the vacuum chamber with a full cycle. First re-tested lot passed.',
    version: 4,
  },
  {
    uid: 'ncr-04',
    docNo: 'NCR/26-27/0019',
    source: 'CUSTOMER_RETURN',
    severity: 'MAJOR',
    title: 'Dents on the Metro Retail consignment',
    description: 'Customer reported 34 dented bottles out of 480 received. Cartons showed crush damage on one corner of the pallet.',
    itemCode: 'FG-SS-750-BLK',
    itemName: 'Vacuum Flask 750 ml — Matte Black',
    batchNo: 'FG-2606-D21',
    originDocNo: 'CMP/26-27/0031',
    supplierCode: '',
    quantityAffected: 480,
    quantityScrapped: 34,
    quantityReworked: 0,
    uom: 'NOS',
    containment: 'Replacement despatched within 48 hours. Remaining stock from the same batch inspected at the depot and found sound.',
    containedAt: d(20),
    rootCause: 'Pallet strapping tension was set for the domestic carton, which is stiffer than the retail gift-box carton used on this order.',
    causeCategory: 'METHOD',
    fiveWhys: [
      { level: 1, question: 'Why were the bottles dented?', answer: 'The cartons on one corner of the pallet were crushed.' },
      { level: 2, question: 'Why were the cartons crushed?', answer: 'Strapping tension exceeded what the gift-box carton can carry.' },
      { level: 3, question: 'Why was the tension too high?', answer: 'The strapping machine was set for the plain domestic carton.' },
      { level: 4, question: 'Why was it not changed?', answer: 'The packing instruction does not vary tension by carton type.' },
      { level: 5, question: 'Why not?', answer: 'The gift box was introduced after the packing instruction was last revised.' },
    ],
    status: 'CLOSED',
    raisedBy: 'Priya Menon',
    raisedOn: d(20),
    owner: 'K. Ravi',
    dueOn: d(6),
    closedOn: d(5),
    capaDocNo: 'CAPA/26-27/0012',
    costImpact: 14_008,
    remarks: 'Closed after two shipments packed to the revised instruction arrived undamaged.',
    version: 6,
  },
]

/* ═══════════════════════════ CAPA ═══════════════════════════ */

export const capas: Capa[] = [
  {
    uid: 'cap-01',
    docNo: 'CAPA/26-27/0014',
    title: 'Certificate-to-coil verification at the supplier',
    ncrDocNo: 'NCR/26-27/0021',
    itemCode: 'RM-SS304-050',
    rootCause: 'The supplier’s despatch check matches the coil tag to the purchase order but never to the mill test certificate, so a heat substitution passes unnoticed.',
    causeCategory: 'METHOD',
    correctiveAction:
      'Supplier to re-issue the certificate for heat H4488 or replace the coil. Incoming inspection to verify the heat number stamped on the coil against the certificate on every lot, not by sample.',
    preventiveAction:
      'Add the heat number as a mandatory document characteristic on every steel coil inspection plan. Require the certificate to be uploaded with the ASN before the lot is booked in, so the mismatch is caught before it reaches the gate.',
    owner: 'P. Suresh',
    raisedOn: d(8),
    dueOn: ahead(6),
    status: 'IN_PROGRESS',
    verificationMethod: 'Next three coil lots from this supplier checked 100% against certificate before booking in.',
    verificationResult: '',
    verifiedBy: null,
    verifiedOn: null,
    closedOn: null,
    recurrenceChecked: false,
    effectivenessPct: null,
    version: 2,
  },
  {
    uid: 'cap-02',
    docNo: 'CAPA/26-27/0015',
    title: 'Interlock the vacuum getter activation cycle',
    ncrDocNo: 'NCR/26-27/0023',
    itemCode: 'FG-SS-750-BLK',
    rootCause: 'The vacuum chamber allows an interrupted getter activation cycle to be resumed rather than re-run, and the resume feature was left enabled after commissioning.',
    causeCategory: 'METHOD',
    correctiveAction: 'Resume disabled on the MC-0005 recipe. Any interruption now aborts the cycle and the load must be re-run from the start.',
    preventiveAction:
      'Commissioning checklist to include disabling maintenance-only features before a machine is released to production. Same review carried out on MC-0002 and MC-0007.',
    owner: 'S. Balaji',
    raisedOn: d(2),
    dueOn: ahead(3),
    status: 'VERIFICATION',
    verificationMethod: 'Three consecutive vacuum batches leak-tested 100% with the retention check on a sample of ten from each.',
    verificationResult: 'First two batches passed at 100%; third is running.',
    verifiedBy: null,
    verifiedOn: null,
    closedOn: null,
    recurrenceChecked: false,
    effectivenessPct: null,
    version: 3,
  },
  {
    uid: 'cap-03',
    docNo: 'CAPA/26-27/0012',
    title: 'Strapping tension by carton type',
    ncrDocNo: 'NCR/26-27/0019',
    itemCode: 'FG-SS-750-BLK',
    rootCause: 'The packing instruction sets one strapping tension for all cartons; the gift-box carton was introduced after it was last revised.',
    causeCategory: 'METHOD',
    correctiveAction: 'Strapping tension reduced to 22 N for gift-box pallets. Existing stock at the depot inspected and found sound.',
    preventiveAction: 'Packing instruction WI-PACK-02 revised with a tension table by carton type. Packing operators re-briefed and the setting added to the line changeover checklist.',
    owner: 'K. Ravi',
    raisedOn: d(19),
    dueOn: d(7),
    status: 'CLOSED',
    verificationMethod: 'Two shipments packed to the revised instruction, inspected on arrival at the customer.',
    verificationResult: 'Both arrived with no transit damage. Customer confirmed in writing.',
    verifiedBy: 'S. Meena',
    verifiedOn: d(5),
    closedOn: d(5),
    recurrenceChecked: true,
    effectivenessPct: 100,
    version: 7,
  },
  {
    uid: 'cap-04',
    docNo: 'CAPA/26-27/0011',
    title: 'Barcode verifier calibration interval',
    ncrDocNo: '',
    itemCode: 'FG-SS-750-BLK',
    rootCause: 'Unreadable barcodes were reaching final inspection because the verifier itself had drifted between annual calibrations.',
    causeCategory: 'MEASUREMENT',
    correctiveAction: 'Verifier sent for immediate re-calibration and a reference card check added to the daily start-up routine.',
    preventiveAction: 'Calibration interval shortened from 12 months to 6 for the verifier and the coating thickness gauge.',
    owner: 'S. Meena',
    raisedOn: d(34),
    dueOn: d(4),
    status: 'IN_PROGRESS',
    verificationMethod: 'Barcode reject rate at final inspection tracked for two months after the interval change.',
    verificationResult: '',
    verifiedBy: null,
    verifiedOn: null,
    closedOn: null,
    recurrenceChecked: false,
    effectivenessPct: null,
    version: 2,
  },
]

/* ═══════════════════════════ Supplier quality ═══════════════════════════ */

const period = new Date().toISOString().slice(0, 7)

export const supplierQuality: SupplierQualityRecord[] = [
  { uid: 'sq-01', supplierCode: 'SUP-00001', supplierName: 'Jindal Stainless Limited', period, lotsReceived: 24, lotsAccepted: 24, lotsRejected: 0, qtyReceived: 286_000, qtyRejected: 180, lotsWithValidDocs: 24, ncrsRaised: 0, ncrsClosedOnTime: 0, capaResponseDays: 3, version: 1 },
  { uid: 'sq-02', supplierCode: 'SUP-00002', supplierName: 'Chennai Steel Traders', period, lotsReceived: 14, lotsAccepted: 10, lotsRejected: 4, qtyReceived: 96_400, qtyRejected: 9_240, lotsWithValidDocs: 9, ncrsRaised: 3, ncrsClosedOnTime: 1, capaResponseDays: 16, version: 1 },
  { uid: 'sq-03', supplierCode: 'SUP-00003', supplierName: 'Coatmaster Powder Coatings LLP', period, lotsReceived: 18, lotsAccepted: 17, lotsRejected: 1, qtyReceived: 3_400, qtyRejected: 40, lotsWithValidDocs: 18, ncrsRaised: 1, ncrsClosedOnTime: 1, capaResponseDays: 5, version: 1 },
  { uid: 'sq-04', supplierCode: 'SUP-00004', supplierName: 'Sri Venkateswara Packaging Industries', period, lotsReceived: 31, lotsAccepted: 29, lotsRejected: 2, qtyReceived: 148_000, qtyRejected: 1_460, lotsWithValidDocs: 26, ncrsRaised: 2, ncrsClosedOnTime: 2, capaResponseDays: 8, version: 1 },
  { uid: 'sq-05', supplierCode: 'SUP-00005', supplierName: 'Perfect Polymers Private Limited', period, lotsReceived: 22, lotsAccepted: 21, lotsRejected: 1, qtyReceived: 214_000, qtyRejected: 640, lotsWithValidDocs: 22, ncrsRaised: 1, ncrsClosedOnTime: 1, capaResponseDays: 4, version: 1 },
  { uid: 'sq-06', supplierCode: 'SUP-00006', supplierName: 'Suraj Polymers LLP', period, lotsReceived: 9, lotsAccepted: 6, lotsRejected: 3, qtyReceived: 22_000, qtyRejected: 3_100, lotsWithValidDocs: 5, ncrsRaised: 3, ncrsClosedOnTime: 0, capaResponseDays: 24, version: 1 },
  { uid: 'sq-07', supplierCode: 'SUP-00008', supplierName: 'Kaveri Plastics', period, lotsReceived: 12, lotsAccepted: 12, lotsRejected: 0, qtyReceived: 64_000, qtyRejected: 96, lotsWithValidDocs: 11, ncrsRaised: 0, ncrsClosedOnTime: 0, capaResponseDays: 6, version: 1 },
]

/* ═══════════════════════════ Customer complaints ═══════════════════════════ */

export const complaints: Complaint[] = [
  {
    uid: 'cmp-01',
    docNo: 'CMP/26-27/0031',
    customerName: 'Metro Retail Chain Pvt Ltd',
    complaintType: 'Dent',
    severity: 'MAJOR',
    itemCode: 'FG-SS-750-BLK',
    itemName: 'Vacuum Flask 750 ml — Matte Black',
    batchNo: 'FG-2606-D21',
    productionOrderNo: 'PRD/26-27/0126',
    invoiceNo: 'INV/26-27/01882',
    qtySupplied: 480,
    qtyComplained: 34,
    description: 'Thirty-four bottles dented on arrival. One corner of the pallet showed crushed cartons.',
    loggedOn: d(21),
    loggedBy: 'Priya Menon',
    owner: 'K. Ravi',
    dueOn: d(7),
    status: 'CLOSED',
    resolution: 'REPLACEMENT',
    resolutionValue: 14_008,
    rootCause: 'Strapping tension set for the stiffer domestic carton.',
    causeCategory: 'METHOD',
    ncrDocNo: 'NCR/26-27/0019',
    capaDocNo: 'CAPA/26-27/0012',
    closedOn: d(5),
    remarks: 'Replacement despatched in 48 hours; customer confirmed the next two shipments arrived sound.',
    version: 5,
  },
  {
    uid: 'cmp-02',
    docNo: 'CMP/26-27/0034',
    customerName: 'Nordwind Handels GmbH',
    complaintType: 'Leakage',
    severity: 'CRITICAL',
    itemCode: 'FG-SS-750-BLK',
    itemName: 'Vacuum Flask 750 ml — Matte Black',
    batchNo: 'FG-2607-A08',
    productionOrderNo: 'PRD/26-27/0128',
    invoiceNo: 'INV/26-27/01914',
    qtySupplied: 600,
    qtyComplained: 9,
    description:
      'Nine units leaked from the base seam within a week of retail sale. Customer has quarantined the remaining stock from the same batch pending our finding.',
    loggedOn: d(3),
    loggedBy: 'Priya Menon',
    owner: 'S. Meena',
    dueOn: ahead(4),
    status: 'ROOT_CAUSE_IDENTIFIED',
    resolution: 'PENDING',
    resolutionValue: 0,
    rootCause: 'Same batch as NCR/26-27/0023 — interrupted getter activation on the vacuum chamber.',
    causeCategory: 'METHOD',
    ncrDocNo: 'NCR/26-27/0023',
    capaDocNo: 'CAPA/26-27/0015',
    closedOn: null,
    remarks: 'Batch traced back through FG-2607-A08 to PRD/26-27/0128. Recall of the remaining 591 units under discussion.',
    version: 3,
  },
  {
    uid: 'cmp-03',
    docNo: 'CMP/26-27/0035',
    customerName: 'Bharat E-commerce Ventures',
    complaintType: 'Logo issue',
    severity: 'MINOR',
    itemCode: 'FG-SS-750-BLK',
    itemName: 'Vacuum Flask 750 ml — Matte Black',
    batchNo: 'FG-2606-D21',
    productionOrderNo: 'PRD/26-27/0126',
    invoiceNo: 'INV/26-27/01901',
    qtySupplied: 1_200,
    qtyComplained: 22,
    description: 'Laser logo sits 3 mm low on 22 units. Cosmetic only; the customer will accept a credit rather than a replacement.',
    loggedOn: d(6),
    loggedBy: 'Vignesh Kumar',
    owner: 'S. Meena',
    dueOn: ahead(1),
    status: 'UNDER_INVESTIGATION',
    resolution: 'CREDIT_NOTE',
    resolutionValue: 19_778,
    rootCause: '',
    causeCategory: null,
    ncrDocNo: null,
    capaDocNo: null,
    closedOn: null,
    remarks: 'Marking jig on MC-0008 to be checked against the fixture drawing.',
    version: 1,
  },
  {
    uid: 'cmp-04',
    docNo: 'CMP/26-27/0029',
    customerName: 'Trek Outdoors India',
    complaintType: 'Quantity shortage',
    severity: 'MINOR',
    itemCode: 'FG-SS-1000-STL',
    itemName: 'Vacuum Flask 1000 ml — Brushed Steel',
    batchNo: 'FG-2605-C02',
    productionOrderNo: 'PRD/26-27/0118',
    invoiceNo: 'INV/26-27/01790',
    qtySupplied: 360,
    qtyComplained: 18,
    description: 'One carton short against the packing list.',
    loggedOn: d(40),
    loggedBy: 'Vignesh Kumar',
    owner: 'K. Ravi',
    dueOn: d(26),
    status: 'CLOSED',
    resolution: 'NO_FAULT_FOUND',
    resolutionValue: 0,
    rootCause: 'Carton was recovered at the transporter’s hub and delivered two days later. Packing list and loading photographs matched.',
    causeCategory: 'ENVIRONMENT',
    ncrDocNo: null,
    capaDocNo: null,
    closedOn: d(24),
    remarks: 'Closed as no fault found. Transporter counselled on split deliveries.',
    version: 4,
  },
]

/* ═══════════════════════════ Audits ═══════════════════════════ */

export const audits: QualityAudit[] = [
  {
    uid: 'aud-01',
    docNo: 'AUD/26-27/0007',
    auditType: 'ISO',
    title: 'ISO 9001:2015 surveillance audit',
    scope: 'Clauses 7 to 10 — support, operation, performance evaluation and improvement',
    auditee: 'SSB Industries — Chennai Unit 1',
    auditor: 'TUV SUD South Asia',
    plannedOn: d(30),
    conductedOn: d(30),
    status: 'ACTIONS_OPEN',
    scorePct: 92,
    reportRef: 'TUV/SA/2026/11204',
    remarks: 'Certificate maintained. Two minor non-conformities to close within 60 days.',
    findings: [
      { uid: 'af-01', clause: '7.1.5', area: 'Monitoring and measuring resources', grade: 'MINOR_NC', description: 'Two instruments in use past their calibration due date, with readings recorded against them.', action: 'Recall overdue instruments and add a hard block on approving inspections that use them.', owner: 'S. Meena', dueOn: ahead(10), closedOn: null },
      { uid: 'af-02', clause: '8.5.1', area: 'Production control', grade: 'MINOR_NC', description: 'Packing work instruction not revised when the gift-box carton was introduced.', action: 'Revise WI-PACK-02 with a strapping tension table by carton type.', owner: 'K. Ravi', dueOn: d(7), closedOn: d(5) },
      { uid: 'af-03', clause: '9.1.3', area: 'Analysis and evaluation', grade: 'OBSERVATION', description: 'Supplier quality is reviewed monthly but the grade is not formally communicated to the supplier.', action: 'Issue the scorecard to each supplier with the monthly review.', owner: 'P. Suresh', dueOn: ahead(20), closedOn: null },
      { uid: 'af-04', clause: '8.7', area: 'Control of nonconforming output', grade: 'CONFORMS', description: 'Non-conforming material is quarantined, labelled and traceable to its NCR.', action: '', owner: '', dueOn: '', closedOn: null },
    ],
    version: 3,
  },
  {
    uid: 'aud-02',
    docNo: 'AUD/26-27/0009',
    auditType: 'SUPPLIER',
    title: 'Chennai Steel Traders — supplier audit',
    scope: 'Incoming material control, certification and traceability',
    auditee: 'Chennai Steel Traders',
    auditor: 'S. Meena',
    plannedOn: d(4),
    conductedOn: d(4),
    status: 'REPORTED',
    scorePct: 61,
    reportRef: 'SUP-AUD/2026/0009',
    remarks: 'Triggered by NCR/26-27/0021. Grade held at conditional pending closure of the major finding.',
    findings: [
      { uid: 'af-05', clause: 'SQ-3.2', area: 'Certification', grade: 'MAJOR_NC', description: 'Mill test certificates are generated from the despatch note rather than verified against the coil before loading.', action: 'Introduce a certificate-to-coil check at despatch, with the heat number recorded on the loading sheet.', owner: 'Chennai Steel Traders', dueOn: ahead(14), closedOn: null },
      { uid: 'af-06', clause: 'SQ-4.1', area: 'Traceability', grade: 'MINOR_NC', description: 'Heat numbers are not recorded on the despatch documentation.', action: 'Add the heat number to the despatch note template.', owner: 'Chennai Steel Traders', dueOn: ahead(14), closedOn: null },
    ],
    version: 2,
  },
  {
    uid: 'aud-03',
    docNo: 'AUD/26-27/0011',
    auditType: 'INTERNAL',
    title: 'Internal process audit — vacuum and leak testing',
    scope: 'OP-060 and OP-070, including recipe control and operator certification',
    auditee: 'Production — Line B',
    auditor: 'Sneha Patel',
    plannedOn: ahead(6),
    conductedOn: null,
    status: 'PLANNED',
    scorePct: null,
    reportRef: '',
    remarks: 'Brought forward from the annual plan after NCR/26-27/0023.',
    findings: [],
    version: 1,
  },
  {
    uid: 'aud-04',
    docNo: 'AUD/26-27/0005',
    auditType: 'CUSTOMER',
    title: 'Nordwind Handels — customer audit',
    scope: 'Export product quality, food-contact compliance and packaging',
    auditee: 'SSB Industries — Chennai Unit 1',
    auditor: 'Nordwind Handels GmbH',
    plannedOn: d(75),
    conductedOn: d(75),
    status: 'CLOSED',
    scorePct: 96,
    reportRef: 'NW/AUD/2026/04',
    remarks: 'Approved as a supplier for the European market. One observation closed.',
    findings: [
      { uid: 'af-07', clause: 'CU-2.4', area: 'Labelling', grade: 'OBSERVATION', description: 'German-language care instructions printed in 6 pt; customer prefers 8 pt minimum.', action: 'Artwork revised to 8 pt on the export label.', owner: 'Priya Menon', dueOn: d(60), closedOn: d(58) },
    ],
    version: 4,
  },
]

/* ═══════════════════════════ Dashboard trend ═══════════════════════════ */

/** Monthly quality performance, for the dashboard charts. */
export const qualityTrend = [
  { month: 'Feb', fpyPct: 94.2, incomingAcceptPct: 95.8, internalPpm: 4_200, supplierPpm: 3_100, complaints: 4 },
  { month: 'Mar', fpyPct: 95.1, incomingAcceptPct: 96.4, internalPpm: 3_800, supplierPpm: 2_900, complaints: 3 },
  { month: 'Apr', fpyPct: 93.6, incomingAcceptPct: 94.1, internalPpm: 5_100, supplierPpm: 4_400, complaints: 6 },
  { month: 'May', fpyPct: 95.8, incomingAcceptPct: 96.9, internalPpm: 3_400, supplierPpm: 2_600, complaints: 2 },
  { month: 'Jun', fpyPct: 96.4, incomingAcceptPct: 97.2, internalPpm: 2_900, supplierPpm: 2_400, complaints: 3 },
  { month: 'Jul', fpyPct: 92.8, incomingAcceptPct: 92.6, internalPpm: 6_300, supplierPpm: 5_800, complaints: 5 },
]
