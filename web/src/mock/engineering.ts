/**
 * Product engineering seed data.
 *
 * The structures here are deliberately joined up rather than illustrative: the
 * 750 ml flask is built from a body shell and a lid assembly, each of which has
 * its own bill of material and its own routing. Exploding the flask therefore
 * reaches the steel coil three levels down, and rolling its cost up picks up
 * labour from all three routings. Every component code is a real row in the
 * item master, and every work centre code is one the machine master points at.
 */

import { daysAgo, daysAhead } from './data'
import type {
  Bom,
  BomLine,
  EngChange,
  EngDocument,
  EngProduct,
  EngWorkCentre,
  Operation,
  ProductSpec,
  Routing,
  RoutingOperation,
  Tool,
} from '@/types/engineering'

const d = (n: number) => daysAgo(n).slice(0, 10)
const ahead = (n: number) => daysAhead(n).slice(0, 10)

/* ═══════════════════════════ Work centres ═══════════════════════════ */

const wc = (
  uid: string,
  code: string,
  name: string,
  machineRatePerHour: number,
  labourRatePerHour: number,
  overheadPct: number,
  machineCodes: string[],
  o: Partial<EngWorkCentre> = {},
): EngWorkCentre => ({
  uid,
  code,
  name,
  plant: 'Chennai — Unit 1',
  machineRatePerHour,
  labourRatePerHour,
  overheadPct,
  shiftPattern: 'A + B (16 h)',
  hoursPerDay: 16,
  oeeTargetPct: 85,
  machineCodes,
  isActive: true,
  createdAt: daysAgo(700),
  version: 1,
  ...o,
})

export const workCentres: EngWorkCentre[] = [
  wc('ewc-01', 'WC-01', 'Coil Cutting & Blanking', 520, 210, 12, ['MC-0001']),
  wc('ewc-02', 'WC-02', 'Deep Drawing Press', 890, 210, 14, ['MC-0002']),
  wc('ewc-03', 'WC-03', 'Neck Forming & Thread Rolling', 410, 195, 12, ['MC-0003']),
  wc('ewc-04', 'WC-04', 'Bottom Welding (TIG)', 1120, 240, 15, ['MC-0004']),
  wc('ewc-05', 'WC-05', 'Vacuum Insulation', 1480, 230, 16, ['MC-0005'], { shiftPattern: 'A + B + C (24 h)', hoursPerDay: 22, oeeTargetPct: 88 }),
  wc('ewc-06', 'WC-06', 'Leak Testing', 320, 205, 10, ['MC-0006'], { oeeTargetPct: 90 }),
  wc('ewc-07', 'WC-07', 'Powder Coating & Curing', 720, 190, 13, ['MC-0007']),
  wc('ewc-08', 'WC-08', 'Laser Logo Marking', 340, 185, 10, ['MC-0008']),
  wc('ewc-09', 'WC-09', 'Cartoning & Sealing', 180, 165, 8, ['MC-0009'], { shiftPattern: 'A (8 h)', hoursPerDay: 8, oeeTargetPct: 80 }),
  wc('ewc-10', 'WC-10', 'Manual Assembly Bay', 60, 175, 9, [], { oeeTargetPct: 78 }),
]

/* ═══════════════════════════ Standard operations ═══════════════════════════ */

const op = (
  uid: string,
  code: string,
  name: string,
  defaultWorkCentre: string,
  setupMinutes: number,
  cycleSeconds: number,
  operators: number,
  skill: string,
  qcCheckpoint: boolean,
  instructions: string,
): Operation => ({
  uid,
  code,
  name,
  defaultWorkCentre,
  setupMinutes,
  cycleSeconds,
  operators,
  skill,
  qcCheckpoint,
  instructions,
  isActive: true,
  createdAt: daysAgo(700),
  version: 1,
})

export const operations: Operation[] = [
  op('eop-01', 'OP-010', 'Coil Cutting', 'WC-01', 30, 4, 1, 'Machine Operator', false, 'Set slitter to blank width per drawing. Check burr height under 0.05 mm on the first three pieces.'),
  op('eop-02', 'OP-020', 'Deep Drawing', 'WC-02', 45, 8.5, 2, 'Press Operator', true, 'Verify die alignment and lubrication. First-article dimensional check before running the lot.'),
  op('eop-03', 'OP-030', 'Trimming', 'WC-02', 15, 5, 1, 'Press Operator', false, 'Trim to drawn height. Collect trim scrap in the marked bin for weighment.'),
  op('eop-04', 'OP-040', 'Neck Forming & Thread Rolling', 'WC-03', 20, 7.5, 1, 'Machine Operator', false, 'Roll thread to M44 × 3. Gauge every 50th piece with the go / no-go ring.'),
  op('eop-05', 'OP-050', 'Bottom Welding', 'WC-04', 18, 10, 1, 'Certified Welder', true, 'TIG weld the bottom disc under argon. 100% visual, dye-penetrant on the first and last piece.'),
  op('eop-06', 'OP-060', 'Vacuum Insulation', 'WC-05', 35, 12, 1, 'Machine Operator', false, 'Evacuate to 5 × 10⁻³ mbar, activate the getter, seal the pinch-off.'),
  op('eop-07', 'OP-070', 'Leak Testing', 'WC-06', 5, 7.5, 1, 'QC Inspector', true, 'Helium leak test. Reject anything above 1 × 10⁻⁶ mbar·L/s.'),
  op('eop-08', 'OP-080', 'Polishing', 'WC-10', 10, 18, 2, 'Skilled Operator', false, 'Buff to the specified finish. No circumferential scratches visible at arm’s length.'),
  op('eop-09', 'OP-090', 'Powder Coating', 'WC-07', 25, 9, 3, 'Coating Operator', false, 'Degrease, coat to 60–80 µm, cure at 180 °C for 12 minutes. Log oven chart.'),
  op('eop-10', 'OP-100', 'Logo Marking', 'WC-08', 12, 6, 1, 'Machine Operator', false, 'Laser mark per the artwork revision on the drawing. Verify position against the jig.'),
  op('eop-11', 'OP-110', 'Lid Assembly', 'WC-10', 10, 14, 2, 'Assembly Operator', true, 'Fit the seal and thread insert, torque the cap to 1.2 Nm, sample-check with the torque gauge.'),
  op('eop-12', 'OP-120', 'Final Assembly', 'WC-10', 8, 22, 2, 'Assembly Operator', true, 'Fit the lid, check thread engagement, wipe down and inspect the finish.'),
  op('eop-13', 'OP-130', 'Cartoning & Packing', 'WC-09', 6, 15, 2, 'Packing Operator', false, 'Insert the manual, apply the barcode label, seal the carton and scan it into the pack list.'),
]

/* ═══════════════════════════ Tools ═══════════════════════════ */

const tool = (
  uid: string,
  code: string,
  name: string,
  toolType: Tool['toolType'],
  machineCode: string,
  lifeStrokes: number,
  usedStrokes: number,
  replacementCost: number,
  o: Partial<Tool> = {},
): Tool => ({
  uid,
  code,
  name,
  toolType,
  machineCode,
  lifeStrokes,
  usedStrokes,
  lastMaintenanceOn: d(45),
  nextCalibrationOn: ahead(120),
  replacementCost,
  location: 'Tool Room — Rack A',
  status: 'IN_USE',
  createdAt: daysAgo(900),
  version: 1,
  ...o,
})

export const tools: Tool[] = [
  tool('tol-01', 'TL-0001', 'Deep Draw Die — 750 ml Body', 'DIE', 'MC-0002', 250_000, 214_800, 480_000, { nextCalibrationOn: ahead(18) }),
  tool('tol-02', 'TL-0002', 'Deep Draw Die — 1000 ml Body', 'DIE', 'MC-0002', 250_000, 68_400, 512_000),
  tool('tol-03', 'TL-0003', 'Neck Forming Punch Set', 'PUNCH', 'MC-0003', 400_000, 186_200, 96_000),
  tool('tol-04', 'TL-0004', 'Bottom Weld Fixture — 73 mm', 'FIXTURE', 'MC-0004', 600_000, 341_000, 74_000),
  tool('tol-05', 'TL-0005', 'Powder Coating Hanging Jig', 'JIG', 'MC-0007', 300_000, 122_500, 38_000),
  tool('tol-06', 'TL-0006', 'Lid Assembly Torque Fixture', 'FIXTURE', 'MC-0010', 500_000, 96_800, 42_000, { location: 'Assembly Bay' }),
  tool('tol-07', 'TL-0007', 'Trim Die — 73 mm', 'DIE', 'MC-0002', 350_000, 318_600, 128_000, { status: 'MAINTENANCE', lastMaintenanceOn: d(4), nextCalibrationOn: ahead(6) }),
  tool('tol-08', 'TL-0008', 'Sipper Cap Injection Mould', 'MOULD', 'MC-0002', 800_000, 42_000, 1_240_000, { status: 'AVAILABLE', location: 'Tool Room — Rack C' }),
  tool('tol-09', 'TL-0009', 'Polishing Wheel Set — Mirror', 'WHEEL', 'MC-0010', 60_000, 58_200, 18_000, { status: 'AVAILABLE', nextCalibrationOn: null }),
  tool('tol-10', 'TL-0010', 'Neck Thread Go / No-Go Gauge', 'GAUGE', 'MC-0003', 0, 0, 22_000, { status: 'CALIBRATION', nextCalibrationOn: ahead(9), location: 'Quality Lab' }),
]

/* ═══════════════════════════ Products ═══════════════════════════ */

const spec = (o: Partial<ProductSpec> = {}): ProductSpec => ({
  materialGrade: 'SS 304',
  thicknessMm: 0.5,
  diameterMm: 73,
  heightMm: 248,
  neckDiameterMm: 44,
  baseDiameterMm: 73,
  capacityMl: 750,
  wallThicknessMm: 0.5,
  vacuumType: 'Double wall, high vacuum',
  insulationType: 'Vacuum + copper getter',
  coatingType: 'Powder coating',
  paintSpec: 'RAL 9005 matte, 60–80 µm',
  surfaceFinish: 'Matte',
  logoSpec: 'Laser etched, 28 × 8 mm, front centre',
  printingMethod: 'Fibre laser marking',
  packagingStandard: 'Gift box, 24 per carton, ISTA 1A',
  ...o,
})

const product = (
  uid: string,
  code: string,
  name: string,
  productType: EngProduct['productType'],
  lifecycle: EngProduct['lifecycle'],
  o: Partial<EngProduct> = {},
): EngProduct => ({
  uid,
  code,
  name,
  productType,
  family: 'Vacuum Flask',
  capacityMl: 750,
  colour: '—',
  brand: 'AquaSteel',
  baseUom: 'NOS',
  netWeightG: null,
  lifecycle,
  revision: 1,
  effectiveFrom: d(400),
  spec: spec(),
  standardCost: 0,
  costRolledAt: null,
  createdBy: 'Rahul Iyer',
  createdAt: daysAgo(400),
  modifiedAt: daysAgo(30),
  version: 1,
  remarks: '',
  ...o,
})

export const products: EngProduct[] = [
  product('epr-01', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 'FINISHED', 'PRODUCTION', {
    colour: 'Matte Black',
    netWeightG: 385,
    revision: 4,
    effectiveFrom: d(850),
    createdAt: daysAgo(850),
    modifiedAt: daysAgo(7),
    // Deliberately stale: the standard was published before ECN/26-27/0003 added
    // the second barcode label, so the roll-up now reads a few rupees higher.
    // This is the drift the dashboard is meant to surface.
    standardCost: 199.9,
    costRolledAt: daysAgo(70),
    remarks: 'Highest volume SKU. Any change here needs sales sign-off on the retail pack.',
  }),
  product('epr-02', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 'FINISHED', 'PRODUCTION', {
    colour: 'Brushed Steel',
    capacityMl: 1000,
    netWeightG: 512,
    revision: 2,
    effectiveFrom: d(640),
    createdAt: daysAgo(640),
    modifiedAt: daysAgo(35),
    standardCost: 297.48,
    costRolledAt: daysAgo(35),
    spec: spec({
      materialGrade: 'SS 316',
      thicknessMm: 0.6,
      wallThicknessMm: 0.6,
      diameterMm: 84,
      heightMm: 268,
      capacityMl: 1000,
      coatingType: 'None — brushed',
      paintSpec: '—',
      surfaceFinish: 'Brushed No. 4',
      packagingStandard: 'Gift box, 18 per carton, ISTA 1A',
    }),
  }),
  product('epr-03', 'FG-SS-500-BLU', 'Vacuum Flask 500 ml — Ocean Blue', 'FINISHED', 'TESTING', {
    colour: 'Ocean Blue',
    capacityMl: 500,
    netWeightG: 296,
    effectiveFrom: d(3),
    createdAt: daysAgo(3),
    modifiedAt: daysAgo(0),
    spec: spec({
      capacityMl: 500,
      heightMm: 206,
      diameterMm: 68,
      paintSpec: 'RAL 5020 gloss, 60–80 µm',
      surfaceFinish: 'Gloss',
      packagingStandard: 'Gift box, 24 per carton, ISTA 1A',
    }),
    remarks: 'Festive range SKU. Drop test and retention test pending before release.',
  }),
  product('epr-04', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', 'SEMI_FINISHED', 'PRODUCTION', {
    netWeightG: 182,
    revision: 3,
    effectiveFrom: d(900),
    createdAt: daysAgo(900),
    modifiedAt: daysAgo(18),
    standardCost: 104.29,
    costRolledAt: daysAgo(21),
    spec: spec({ coatingType: 'None', paintSpec: '—', surfaceFinish: '2B mill', logoSpec: '—', printingMethod: '—', packagingStandard: 'Returnable plastic crate, 60 per crate' }),
  }),
  product('epr-05', 'SF-BODY-1000', 'Bottle Body Shell — 1000 ml', 'SEMI_FINISHED', 'PRODUCTION', {
    capacityMl: 1000,
    netWeightG: 246,
    revision: 2,
    effectiveFrom: d(600),
    createdAt: daysAgo(600),
    modifiedAt: daysAgo(50),
    standardCost: 199.23,
    costRolledAt: daysAgo(50),
    spec: spec({ materialGrade: 'SS 316', thicknessMm: 0.6, wallThicknessMm: 0.6, capacityMl: 1000, diameterMm: 84, heightMm: 268, coatingType: 'None', paintSpec: '—', surfaceFinish: '2B mill', logoSpec: '—', printingMethod: '—', packagingStandard: 'Returnable plastic crate, 40 per crate' }),
  }),
  product('epr-06', 'SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 'SEMI_FINISHED', 'PRODUCTION', {
    family: 'Lids & Caps',
    capacityMl: null,
    netWeightG: 62,
    revision: 2,
    effectiveFrom: d(600),
    createdAt: daysAgo(600),
    modifiedAt: daysAgo(60),
    standardCost: 46.45,
    costRolledAt: daysAgo(21),
    spec: spec({ capacityMl: null, diameterMm: 48, heightMm: 34, neckDiameterMm: 44, baseDiameterMm: 48, thicknessMm: null, wallThicknessMm: null, vacuumType: '—', insulationType: '—', coatingType: 'None', paintSpec: '—', surfaceFinish: 'Mirror', logoSpec: 'Embossed brand mark on the cap top', printingMethod: 'Embossing', packagingStandard: 'Polybag, 200 per bag' }),
  }),
  product('epr-07', 'FG-SS-750-CPR', 'Vacuum Flask 750 ml — Copper Coated', 'FINISHED', 'DESIGN', {
    colour: 'Antique Copper',
    netWeightG: 392,
    effectiveFrom: d(12),
    createdAt: daysAgo(12),
    modifiedAt: daysAgo(2),
    spec: spec({ coatingType: 'Copper electroplate + clear lacquer', paintSpec: 'Antique copper, 25 µm plate', surfaceFinish: 'Antique' }),
    remarks: 'Concept for the FY27 premium range. Plating is a job-work operation; no in-house work centre yet.',
  }),
]

/* ═══════════════════════════ Bills of material ═══════════════════════════ */

let bomLineSeq = 0
const bl = (
  itemCode: string,
  itemName: string,
  uom: string,
  qtyPer: number,
  scrapPct: number,
  o: Partial<BomLine> = {},
): BomLine => ({
  uid: `boml-${++bomLineSeq}`,
  seq: 0, // assigned by bom() below
  itemCode,
  itemName,
  uom,
  qtyPer,
  scrapPct,
  isPhantom: false,
  operationSeq: null,
  notes: '',
  ...o,
})

const bom = (
  uid: string,
  docNo: string,
  productCode: string,
  productName: string,
  revision: number,
  status: Bom['status'],
  lines: BomLine[],
  o: Partial<Bom> = {},
): Bom => ({
  uid,
  docNo,
  productCode,
  productName,
  bomType: 'MANUFACTURING',
  revision,
  status,
  baseQty: 1,
  uom: 'NOS',
  effectiveFrom: d(200),
  effectiveTo: null,
  isDefault: true,
  alternateFor: '',
  lines: lines.map((l, i) => ({ ...l, seq: i + 1 })),
  createdBy: 'Rahul Iyer',
  createdAt: daysAgo(200),
  approvedBy: status === 'DRAFT' || status === 'PENDING_APPROVAL' ? null : 'Meera Rajan',
  approvedAt: status === 'DRAFT' || status === 'PENDING_APPROVAL' ? null : daysAgo(198),
  sourceEcn: null,
  changeReason: '',
  version: revision,
  ...o,
})

export const boms: Bom[] = [
  /* ── 750 ml flask — the flagship structure, three levels deep ─────────── */
  bom('bom-01', 'BOM/26-27/0001', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 3, 'ACTIVE', [
    bl('SF-BODY-750', 'Bottle Body Shell — 750 ml', 'NOS', 1, 1.5, { operationSeq: 30, notes: 'Drawn from the body line; issued against the assembly operation.' }),
    bl('SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 'NOS', 1, 1.0, { operationSeq: 30 }),
    bl('CON-PWD-BLK', 'Powder Coating — Matte Black RAL 9005', 'KG', 0.045, 8, { operationSeq: 10, notes: 'Includes overspray not recovered by the cyclone.' }),
    bl('PKG-BOX-IND', 'Individual Gift Box — Printed', 'NOS', 1, 1.5, { operationSeq: 50 }),
    bl('PKG-LBL-BAR', 'Barcode Label — EAN-13', 'NOS', 2, 2, { operationSeq: 50, notes: 'One on the bottle base, one on the gift box.' }),
    bl('PKG-MAN-USR', 'User Manual & Warranty Card', 'NOS', 1, 1, { operationSeq: 50 }),
    bl('PKG-CTN-24', 'Corrugated Carton — 24 units', 'NOS', 0.042, 1, { operationSeq: 50, notes: '1/24 of a carton per bottle.' }),
  ], { effectiveFrom: d(60), createdAt: daysAgo(60), approvedAt: daysAgo(58), sourceEcn: 'ECN/26-27/0003', changeReason: 'Second barcode label added for export traceability.' }),

  bom('bom-02', 'BOM/26-27/0001', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 2, 'SUPERSEDED', [
    bl('SF-BODY-750', 'Bottle Body Shell — 750 ml', 'NOS', 1, 1.5),
    bl('SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 'NOS', 1, 1.0),
    bl('CON-PWD-BLK', 'Powder Coating — Matte Black RAL 9005', 'KG', 0.045, 8),
    bl('PKG-BOX-IND', 'Individual Gift Box — Printed', 'NOS', 1, 1.5),
    bl('PKG-LBL-BAR', 'Barcode Label — EAN-13', 'NOS', 1, 2),
    bl('PKG-MAN-USR', 'User Manual & Warranty Card', 'NOS', 1, 1),
    bl('PKG-CTN-24', 'Corrugated Carton — 24 units', 'NOS', 0.042, 1),
  ], { effectiveFrom: d(320), effectiveTo: d(61), createdAt: daysAgo(320), approvedAt: daysAgo(318) }),

  /* ── Body shell — consumes the coil, so the coil is level 3 of the flask ─ */
  bom('bom-03', 'BOM/26-27/0002', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', 2, 'ACTIVE', [
    bl('RM-SS304-050', 'SS 304 Coil 0.50 mm × 400 mm', 'KG', 0.268, 4.5, { operationSeq: 10, notes: 'Blank weight including the skeleton returned as scrap.' }),
    bl('CMP-DISC-BOT-73', 'Bottom Disc — SS 304, 73 mm', 'NOS', 1, 1, { operationSeq: 50 }),
    bl('CON-GAS-ARG', 'Argon Gas — Welding Grade', 'M3', 0.012, 5, { operationSeq: 50 }),
  ], { effectiveFrom: d(180), createdAt: daysAgo(180), approvedAt: daysAgo(178), sourceEcn: 'ECN/26-27/0003', changeReason: 'Bottom disc separated from the drawn shell after the welding line was commissioned.' }),

  bom('bom-04', 'BOM/26-27/0002', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', 1, 'SUPERSEDED', [
    bl('RM-SS304-050', 'SS 304 Coil 0.50 mm × 400 mm', 'KG', 0.302, 6),
    bl('CON-GAS-ARG', 'Argon Gas — Welding Grade', 'M3', 0.012, 5),
  ], { effectiveFrom: d(900), effectiveTo: d(181), createdAt: daysAgo(900), approvedAt: daysAgo(898) }),

  /* ── Lid assembly ─────────────────────────────────────────────────────── */
  bom('bom-05', 'BOM/26-27/0003', 'SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 2, 'ACTIVE', [
    bl('CMP-LID-SCR-SS', 'Screw Cap — Stainless with Silicone Seal', 'NOS', 1, 0.5, { operationSeq: 10 }),
    bl('CMP-SEAL-SIL', 'Silicone Seal Ring — Food Grade', 'NOS', 1, 2, { operationSeq: 10 }),
    bl('CMP-INS-THRD', 'Thread Insert — Polypropylene', 'NOS', 1, 1.5, { operationSeq: 10 }),
  ], { effectiveFrom: d(150), createdAt: daysAgo(150), approvedAt: daysAgo(148) }),

  /* ── 1000 ml range ────────────────────────────────────────────────────── */
  bom('bom-06', 'BOM/26-27/0004', 'SF-BODY-1000', 'Bottle Body Shell — 1000 ml', 1, 'ACTIVE', [
    bl('RM-SS316-060', 'SS 316 Coil 0.60 mm × 400 mm', 'KG', 0.362, 4.5, { operationSeq: 10 }),
    bl('CMP-DISC-BOT-73', 'Bottom Disc — SS 304, 73 mm', 'NOS', 1, 1, { operationSeq: 50 }),
    bl('CON-GAS-ARG', 'Argon Gas — Welding Grade', 'M3', 0.015, 5, { operationSeq: 50 }),
  ], { effectiveFrom: d(600), createdAt: daysAgo(600), approvedAt: daysAgo(598) }),

  bom('bom-07', 'BOM/26-27/0005', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 1, 'ACTIVE', [
    bl('SF-BODY-1000', 'Bottle Body Shell — 1000 ml', 'NOS', 1, 1.5, { operationSeq: 30 }),
    bl('CMP-LID-SIPPER', 'Sipper Cap Assembly — Trek', 'NOS', 1, 1, { operationSeq: 30 }),
    bl('PKG-BOX-IND', 'Individual Gift Box — Printed', 'NOS', 1, 1.5, { operationSeq: 50 }),
    bl('PKG-LBL-BAR', 'Barcode Label — EAN-13', 'NOS', 2, 2, { operationSeq: 50 }),
    bl('PKG-MAN-USR', 'User Manual & Warranty Card', 'NOS', 1, 1, { operationSeq: 50 }),
    bl('PKG-CTN-24', 'Corrugated Carton — 24 units', 'NOS', 0.056, 1, { operationSeq: 50, notes: '1/18 of a carton — the 1000 ml packs 18 to a case.' }),
  ], { effectiveFrom: d(600), createdAt: daysAgo(600), approvedAt: daysAgo(598) }),

  /* ── Alternate structure for the same product (Ch 9) ──────────────────── */
  bom('bom-08', 'BOM/26-27/0006', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 1, 'ACTIVE', [
    bl('SF-BODY-750', 'Bottle Body Shell — 750 ml', 'NOS', 1, 1.5, { operationSeq: 30 }),
    bl('SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 'NOS', 1, 1.0, { operationSeq: 30 }),
    bl('CON-PWD-BLK', 'Powder Coating — Matte Black RAL 9005', 'KG', 0.045, 8, { operationSeq: 10 }),
    bl('PKG-LBL-BAR', 'Barcode Label — EAN-13', 'NOS', 1, 2, { operationSeq: 50 }),
    bl('PKG-CTN-24', 'Corrugated Carton — 24 units', 'NOS', 0.042, 1, { operationSeq: 50 }),
  ], {
    bomType: 'ALTERNATE',
    isDefault: false,
    alternateFor: 'OEM bulk pack — no gift box, no manual',
    effectiveFrom: d(90),
    createdAt: daysAgo(90),
    approvedAt: daysAgo(88),
    changeReason: 'Raised for the Bharat E-commerce OEM order, which ships in bulk cartons.',
  }),

  /* ── New SKU still in draft ───────────────────────────────────────────── */
  bom('bom-09', 'BOM/26-27/0007', 'FG-SS-500-BLU', 'Vacuum Flask 500 ml — Ocean Blue', 1, 'DRAFT', [
    bl('SF-BODY-750', 'Bottle Body Shell — 750 ml', 'NOS', 1, 1.5, { notes: 'Placeholder — the 500 ml shell has not been drawn yet.' }),
    bl('SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 'NOS', 1, 1.0),
    bl('CON-PWD-BLU', 'Powder Coating — Ocean Blue RAL 5020', 'KG', 0.038, 8),
    bl('PKG-BOX-IND', 'Individual Gift Box — Printed', 'NOS', 1, 1.5),
    bl('PKG-LBL-BAR', 'Barcode Label — EAN-13', 'NOS', 2, 2),
    bl('PKG-MAN-USR', 'User Manual & Warranty Card', 'NOS', 1, 1),
  ], { effectiveFrom: d(2), createdAt: daysAgo(2), changeReason: 'Initial structure for the festive SKU.' }),
]

/* ═══════════════════════════ Routings ═══════════════════════════ */

let rtgOpSeq = 0
const ro = (
  seq: number,
  operationCode: string,
  operationName: string,
  workCentreCode: string,
  machineCode: string,
  setupMinutes: number,
  cycleSeconds: number,
  operators: number,
  o: Partial<RoutingOperation> = {},
): RoutingOperation => ({
  uid: `rop-${++rtgOpSeq}`,
  seq,
  operationCode,
  operationName,
  workCentreCode,
  machineCode,
  setupMinutes,
  cycleSeconds,
  operators,
  skill: 'Machine Operator',
  toolCode: null,
  qcCheckpoint: false,
  instructions: '',
  ...o,
})

const routing = (
  uid: string,
  docNo: string,
  productCode: string,
  productName: string,
  revision: number,
  status: Routing['status'],
  costingLotSize: number,
  ops: RoutingOperation[],
  o: Partial<Routing> = {},
): Routing => ({
  uid,
  docNo,
  productCode,
  productName,
  revision,
  status,
  effectiveFrom: d(200),
  effectiveTo: null,
  isDefault: true,
  costingLotSize,
  operations: ops,
  createdBy: 'Rahul Iyer',
  createdAt: daysAgo(200),
  approvedBy: status === 'DRAFT' || status === 'PENDING_APPROVAL' ? null : 'Meera Rajan',
  approvedAt: status === 'DRAFT' || status === 'PENDING_APPROVAL' ? null : daysAgo(198),
  sourceEcn: null,
  changeReason: '',
  version: revision,
  ...o,
})

export const routings: Routing[] = [
  routing('rtg-01', 'RTG/26-27/0001', 'FG-SS-750-BLK', 'Vacuum Flask 750 ml — Matte Black', 3, 'ACTIVE', 500, [
    ro(10, 'OP-090', 'Powder Coating', 'WC-07', 'MC-0007', 25, 9, 3, { skill: 'Coating Operator', toolCode: 'TL-0005', instructions: 'Degrease, coat to 60–80 µm, cure at 180 °C for 12 minutes.' }),
    ro(20, 'OP-100', 'Logo Marking', 'WC-08', 'MC-0008', 12, 6, 1, { instructions: 'Laser mark per artwork DRG-FG-750-BLK-R4.' }),
    ro(30, 'OP-120', 'Final Assembly', 'WC-10', '', 8, 22, 2, { skill: 'Assembly Operator', toolCode: 'TL-0006', qcCheckpoint: true, instructions: 'Fit the lid, check thread engagement, wipe down and inspect the finish.' }),
    ro(40, 'OP-070', 'Leak Testing', 'WC-06', 'MC-0006', 5, 7.5, 1, { skill: 'QC Inspector', qcCheckpoint: true, instructions: 'Final helium leak test on 100% of production.' }),
    ro(50, 'OP-130', 'Cartoning & Packing', 'WC-09', 'MC-0009', 6, 15, 2, { skill: 'Packing Operator' }),
  ], { effectiveFrom: d(60), createdAt: daysAgo(60), approvedAt: daysAgo(58), changeReason: 'Final leak test moved after assembly, so a lid fault is caught before packing.' }),

  routing('rtg-02', 'RTG/26-27/0002', 'SF-BODY-750', 'Bottle Body Shell — 750 ml', 2, 'ACTIVE', 1000, [
    ro(10, 'OP-010', 'Coil Cutting', 'WC-01', 'MC-0001', 30, 4, 1),
    ro(20, 'OP-020', 'Deep Drawing', 'WC-02', 'MC-0002', 45, 8.5, 2, { skill: 'Press Operator', toolCode: 'TL-0001', qcCheckpoint: true, instructions: 'First-article dimensional check before running the lot.' }),
    ro(30, 'OP-030', 'Trimming', 'WC-02', 'MC-0002', 15, 5, 1, { skill: 'Press Operator', toolCode: 'TL-0007' }),
    ro(40, 'OP-040', 'Neck Forming & Thread Rolling', 'WC-03', 'MC-0003', 20, 7.5, 1, { toolCode: 'TL-0003' }),
    ro(50, 'OP-050', 'Bottom Welding', 'WC-04', 'MC-0004', 18, 10, 1, { skill: 'Certified Welder', toolCode: 'TL-0004', qcCheckpoint: true, instructions: 'TIG weld the bottom disc under argon.' }),
    ro(60, 'OP-060', 'Vacuum Insulation', 'WC-05', 'MC-0005', 35, 12, 1, { instructions: 'Evacuate to 5 × 10⁻³ mbar, activate the getter, seal the pinch-off.' }),
    ro(70, 'OP-070', 'Leak Testing', 'WC-06', 'MC-0006', 5, 7.5, 1, { skill: 'QC Inspector', qcCheckpoint: true }),
  ], { effectiveFrom: d(180), createdAt: daysAgo(180), approvedAt: daysAgo(178), changeReason: 'Bottom welding added when the disc was separated from the drawn shell.' }),

  routing('rtg-03', 'RTG/26-27/0003', 'SF-LID-ASSY-SS', 'Lid Assembly — Stainless Screw Cap', 1, 'ACTIVE', 2000, [
    ro(10, 'OP-110', 'Lid Assembly', 'WC-10', '', 10, 14, 2, { skill: 'Assembly Operator', toolCode: 'TL-0006', qcCheckpoint: true, instructions: 'Fit the seal and thread insert, torque the cap to 1.2 Nm.' }),
  ], { effectiveFrom: d(150), createdAt: daysAgo(150), approvedAt: daysAgo(148) }),

  routing('rtg-04', 'RTG/26-27/0004', 'SF-BODY-1000', 'Bottle Body Shell — 1000 ml', 1, 'ACTIVE', 800, [
    ro(10, 'OP-010', 'Coil Cutting', 'WC-01', 'MC-0001', 30, 5, 1),
    ro(20, 'OP-020', 'Deep Drawing', 'WC-02', 'MC-0002', 50, 10.5, 2, { skill: 'Press Operator', toolCode: 'TL-0002', qcCheckpoint: true }),
    ro(30, 'OP-030', 'Trimming', 'WC-02', 'MC-0002', 15, 6, 1, { skill: 'Press Operator', toolCode: 'TL-0007' }),
    ro(40, 'OP-040', 'Neck Forming & Thread Rolling', 'WC-03', 'MC-0003', 20, 8.5, 1, { toolCode: 'TL-0003' }),
    ro(50, 'OP-050', 'Bottom Welding', 'WC-04', 'MC-0004', 18, 12, 1, { skill: 'Certified Welder', toolCode: 'TL-0004', qcCheckpoint: true }),
    ro(60, 'OP-060', 'Vacuum Insulation', 'WC-05', 'MC-0005', 35, 15, 1),
    ro(70, 'OP-070', 'Leak Testing', 'WC-06', 'MC-0006', 5, 8, 1, { skill: 'QC Inspector', qcCheckpoint: true }),
  ], { effectiveFrom: d(600), createdAt: daysAgo(600), approvedAt: daysAgo(598) }),

  routing('rtg-05', 'RTG/26-27/0005', 'FG-SS-1000-STL', 'Vacuum Flask 1000 ml — Brushed Steel', 1, 'ACTIVE', 300, [
    ro(10, 'OP-080', 'Polishing', 'WC-10', '', 10, 18, 2, { skill: 'Skilled Operator', toolCode: 'TL-0009', instructions: 'Brush to No. 4 finish, grain running vertically.' }),
    ro(20, 'OP-100', 'Logo Marking', 'WC-08', 'MC-0008', 12, 6, 1),
    ro(30, 'OP-120', 'Final Assembly', 'WC-10', '', 8, 24, 2, { skill: 'Assembly Operator', toolCode: 'TL-0006', qcCheckpoint: true }),
    ro(40, 'OP-070', 'Leak Testing', 'WC-06', 'MC-0006', 5, 8, 1, { skill: 'QC Inspector', qcCheckpoint: true }),
    ro(50, 'OP-130', 'Cartoning & Packing', 'WC-09', 'MC-0009', 6, 16, 2, { skill: 'Packing Operator' }),
  ], { effectiveFrom: d(600), createdAt: daysAgo(600), approvedAt: daysAgo(598) }),

  routing('rtg-06', 'RTG/26-27/0006', 'FG-SS-500-BLU', 'Vacuum Flask 500 ml — Ocean Blue', 1, 'DRAFT', 400, [
    ro(10, 'OP-090', 'Powder Coating', 'WC-07', 'MC-0007', 25, 8, 3, { skill: 'Coating Operator', toolCode: 'TL-0005' }),
    ro(20, 'OP-100', 'Logo Marking', 'WC-08', 'MC-0008', 12, 6, 1),
    ro(30, 'OP-120', 'Final Assembly', 'WC-10', '', 8, 20, 2, { skill: 'Assembly Operator', toolCode: 'TL-0006', qcCheckpoint: true }),
    ro(40, 'OP-130', 'Cartoning & Packing', 'WC-09', 'MC-0009', 6, 14, 2, { skill: 'Packing Operator' }),
  ], { effectiveFrom: d(2), createdAt: daysAgo(2), changeReason: 'First cut — cycle times copied from the 750 ml line and not yet time-studied.' }),
]

/* ═══════════════════════════ Engineering changes ═══════════════════════════ */

export const engChanges: EngChange[] = [
  {
    uid: 'ecn-01',
    docNo: 'ECN/26-27/0002',
    changeType: 'ECN',
    title: 'Move the 750 ml body to SS 316 for the export range',
    reason:
      'The European distributor requires marine-grade steel for the coastal market. The 304 shell passes salt spray at 96 hours; the contract calls for 240.',
    category: 'CUSTOMER',
    priority: 'HIGH',
    requestedBy: 'Priya Menon',
    requestedOn: d(9),
    productCode: 'SF-BODY-750',
    productName: 'Bottle Body Shell — 750 ml',
    changeLines: [
      {
        uid: 'chl-01',
        bomDocNo: 'BOM/26-27/0002',
        action: 'REPLACE',
        itemCode: 'RM-SS304-050',
        itemName: 'SS 304 Coil 0.50 mm × 400 mm',
        newItemCode: 'RM-SS316-060',
        newItemName: 'SS 316 Coil 0.60 mm × 400 mm',
        newQtyPer: 0.315,
        newScrapPct: 4.5,
        note: 'Heavier gauge, so the blank weight rises from 0.268 to 0.315 kg.',
      },
    ],
    impactNote:
      'Deep draw die TL-0001 handles 0.6 mm without modification. Cycle time is expected to rise about 8%; a time study is scheduled once the first lot runs.',
    effectiveFrom: ahead(21),
    status: 'PENDING_APPROVAL',
    sourceEcr: 'ECR/26-27/0001',
    resultingBom: null,
    approvals: [
      { level: 1, role: 'Engineering Head', approver: 'Rahul Iyer', status: 'APPROVED', actedAt: daysAgo(6), remarks: 'Drawing and die clearance confirmed.' },
      { level: 2, role: 'Quality Head', approver: 'S. Meena', status: 'PENDING' },
      { level: 3, role: 'Works Head', approver: 'S. Balaji', status: 'PENDING' },
    ],
    createdAt: daysAgo(9),
    version: 1,
  },
  {
    uid: 'ecr-01',
    docNo: 'ECR/26-27/0001',
    changeType: 'ECR',
    title: 'Reduce powder coating consumption on the 750 ml',
    reason:
      'The cyclone recovery upgrade cut overspray. Standard consumption still assumes the old booth, so every bottle is costed with material that is no longer used.',
    category: 'COST_REDUCTION',
    priority: 'NORMAL',
    requestedBy: 'S. Balaji',
    requestedOn: d(5),
    productCode: 'FG-SS-750-BLK',
    productName: 'Vacuum Flask 750 ml — Matte Black',
    changeLines: [
      {
        uid: 'chl-02',
        bomDocNo: 'BOM/26-27/0001',
        action: 'QTY_CHANGE',
        itemCode: 'CON-PWD-BLK',
        itemName: 'Powder Coating — Matte Black RAL 9005',
        newItemCode: '',
        newItemName: '',
        newQtyPer: 0.038,
        newScrapPct: 5,
        note: 'Measured over four weeks of booth logs after the cyclone upgrade.',
      },
    ],
    impactNote: 'No tooling, drawing or quality impact. Coating thickness stays within the 60–80 µm specification.',
    effectiveFrom: ahead(10),
    status: 'UNDER_REVIEW',
    sourceEcr: null,
    resultingBom: null,
    approvals: [{ level: 1, role: 'Engineering Head', approver: 'Rahul Iyer', status: 'PENDING' }],
    createdAt: daysAgo(5),
    version: 1,
  },
  {
    uid: 'ecn-02',
    docNo: 'ECN/26-27/0003',
    changeType: 'ECN',
    title: 'Second barcode label for export traceability',
    reason: 'Export cartons are opened at customs. A label on the bottle base keeps the unit traceable once the gift box is discarded.',
    category: 'STATUTORY',
    priority: 'NORMAL',
    requestedBy: 'Priya Menon',
    requestedOn: d(66),
    productCode: 'FG-SS-750-BLK',
    productName: 'Vacuum Flask 750 ml — Matte Black',
    changeLines: [
      {
        uid: 'chl-03',
        bomDocNo: 'BOM/26-27/0001',
        action: 'QTY_CHANGE',
        itemCode: 'PKG-LBL-BAR',
        itemName: 'Barcode Label — EAN-13',
        newItemCode: '',
        newItemName: '',
        newQtyPer: 2,
        newScrapPct: 2,
        note: 'One on the bottle base, one on the gift box.',
      },
    ],
    impactNote: 'Packing cycle time rises by roughly one second per bottle. Absorbed within the existing standard.',
    effectiveFrom: d(60),
    status: 'IMPLEMENTED',
    sourceEcr: null,
    resultingBom: 'BOM/26-27/0001 rev 3',
    approvals: [
      { level: 1, role: 'Engineering Head', approver: 'Rahul Iyer', status: 'APPROVED', actedAt: daysAgo(64) },
      { level: 2, role: 'Quality Head', approver: 'S. Meena', status: 'APPROVED', actedAt: daysAgo(62) },
      { level: 3, role: 'Works Head', approver: 'S. Balaji', status: 'APPROVED', actedAt: daysAgo(61), remarks: 'Effective from the next production lot.' },
    ],
    createdAt: daysAgo(66),
    version: 2,
  },
  {
    uid: 'ecr-02',
    docNo: 'ECR/26-27/0004',
    changeType: 'ECR',
    title: 'Replace the printed manual with a QR code',
    reason: 'Paper inserts are 1.9 rupees a unit and are discarded unread. A QR code on the gift box reaches the same content.',
    category: 'COST_REDUCTION',
    priority: 'LOW',
    requestedBy: 'Rahul Iyer',
    requestedOn: d(3),
    productCode: 'FG-SS-750-BLK',
    productName: 'Vacuum Flask 750 ml — Matte Black',
    changeLines: [
      {
        uid: 'chl-04',
        bomDocNo: 'BOM/26-27/0001',
        action: 'REMOVE',
        itemCode: 'PKG-MAN-USR',
        itemName: 'User Manual & Warranty Card',
        newItemCode: '',
        newItemName: '',
        newQtyPer: 0,
        newScrapPct: 0,
        note: 'Warranty terms move to the QR landing page; legal have not signed off yet.',
      },
    ],
    impactNote: 'Legal Metrology requires the declarations to remain legible on the pack. Confirm the QR alone satisfies the rule before approving.',
    effectiveFrom: ahead(45),
    status: 'DRAFT',
    sourceEcr: null,
    resultingBom: null,
    approvals: [],
    createdAt: daysAgo(3),
    version: 1,
  },
  {
    uid: 'ecn-03',
    docNo: 'ECN/26-27/0005',
    changeType: 'ECN',
    title: 'Drop the silicone seal to a lower durometer',
    reason: 'A cheaper Shore A 45 seal was offered by an alternate supplier.',
    category: 'COST_REDUCTION',
    priority: 'LOW',
    requestedBy: 'S. Balaji',
    requestedOn: d(40),
    productCode: 'SF-LID-ASSY-SS',
    productName: 'Lid Assembly — Stainless Screw Cap',
    changeLines: [],
    impactNote: 'Leak rate rose in the trial lot. The softer seal extrudes past the thread at 1.2 Nm.',
    effectiveFrom: d(30),
    status: 'REJECTED',
    sourceEcr: null,
    resultingBom: null,
    approvals: [
      { level: 1, role: 'Engineering Head', approver: 'Rahul Iyer', status: 'APPROVED', actedAt: daysAgo(38) },
      { level: 2, role: 'Quality Head', approver: 'S. Meena', status: 'REJECTED', actedAt: daysAgo(36), remarks: 'Trial lot failed the leak test at 3.2%. Not acceptable against a 0.5% target.' },
    ],
    createdAt: daysAgo(40),
    version: 1,
  },
]

/* ═══════════════════════════ Engineering documents ═══════════════════════════ */

const doc = (
  uid: string,
  code: string,
  title: string,
  docType: EngDocument['docType'],
  productCode: string,
  revision: number,
  fileName: string,
  sizeKb: number,
  status: EngDocument['status'],
  o: Partial<EngDocument> = {},
): EngDocument => ({
  uid,
  code,
  title,
  docType,
  productCode,
  revision,
  fileName,
  sizeKb,
  status,
  uploadedBy: 'Rahul Iyer',
  uploadedOn: d(60),
  approvedBy: status === 'ACTIVE' || status === 'APPROVED' ? 'Meera Rajan' : null,
  approvedOn: status === 'ACTIVE' || status === 'APPROVED' ? d(58) : null,
  remarks: '',
  version: revision,
  ...o,
})

export const engDocuments: EngDocument[] = [
  doc('edoc-01', 'DRG-FG-750-BLK-R4', 'General Assembly — 750 ml Matte Black', 'PDF_DRAWING', 'FG-SS-750-BLK', 4, 'DRG-FG-750-BLK-R4.pdf', 1840, 'ACTIVE', { uploadedOn: d(7), approvedOn: d(6) }),
  doc('edoc-02', 'DRG-BODY-750-R3', 'Body Shell — 750 ml', 'CAD_DRAWING', 'SF-BODY-750', 3, 'DRG-BODY-750-R3.dwg', 4210, 'ACTIVE', { uploadedOn: d(18), approvedOn: d(17) }),
  doc('edoc-03', 'DRG-BODY-750-R2', 'Body Shell — 750 ml (superseded)', 'CAD_DRAWING', 'SF-BODY-750', 2, 'DRG-BODY-750-R2.dwg', 4108, 'SUPERSEDED', { uploadedOn: d(300), approvedOn: d(299) }),
  doc('edoc-04', 'DRG-LID-ASSY-R2', 'Lid Assembly — Exploded View', 'CAD_DRAWING', 'SF-LID-ASSY-SS', 2, 'DRG-LID-ASSY-R2.dwg', 2260, 'ACTIVE', { uploadedOn: d(150), approvedOn: d(148) }),
  doc('edoc-05', 'MDL-750-STEP', '3D Model — 750 ml Flask', 'MODEL_3D', 'FG-SS-750-BLK', 4, 'FLASK-750-BLK-R4.step', 18_640, 'ACTIVE', { uploadedOn: d(7), approvedOn: d(6) }),
  doc('edoc-06', 'SOP-COAT-01', 'SOP — Powder Coating & Curing', 'SOP', 'FG-SS-750-BLK', 2, 'SOP-COAT-01-R2.pdf', 620, 'ACTIVE', { uploadedBy: 'S. Balaji', uploadedOn: d(120), approvedOn: d(118) }),
  doc('edoc-07', 'WI-ASSY-01', 'Work Instruction — Final Assembly', 'WORK_INSTRUCTION', 'FG-SS-750-BLK', 1, 'WI-ASSY-01.pdf', 380, 'ACTIVE', { uploadedBy: 'S. Balaji', uploadedOn: d(90), approvedOn: d(89) }),
  doc('edoc-08', 'CERT-FSSAI-750', 'Food Contact Certificate — 750 ml', 'CERTIFICATE', 'FG-SS-750-BLK', 1, 'FSSAI-FC-750.pdf', 940, 'ACTIVE', { uploadedBy: 'S. Meena', uploadedOn: d(220), approvedOn: d(218) }),
  doc('edoc-09', 'SPEC-CUST-A', 'Customer Specification — European Distributor', 'CUSTOMER_SPEC', 'SF-BODY-750', 1, 'CUST-A-SPEC-2026.pdf', 1120, 'ACTIVE', { uploadedBy: 'Priya Menon', uploadedOn: d(30), approvedOn: d(28) }),
  doc('edoc-10', 'DRG-FG-500-BLU-R1', 'General Assembly — 500 ml Ocean Blue', 'PDF_DRAWING', 'FG-SS-500-BLU', 1, 'DRG-FG-500-BLU-R1.pdf', 1560, 'PENDING_APPROVAL', { uploadedOn: d(3) }),
  doc('edoc-11', 'DS-SS304-COIL', 'Material Datasheet — SS 304 Coil', 'DATASHEET', 'SF-BODY-750', 1, 'ASTM-A240-304.pdf', 480, 'ACTIVE', { uploadedOn: d(400), approvedOn: d(398) }),
  doc('edoc-12', 'IMG-750-RENDER', 'Product Render — 750 ml Matte Black', 'IMAGE', 'FG-SS-750-BLK', 2, 'flask-750-blk-render.png', 3240, 'ACTIVE', { uploadedBy: 'Priya Menon', uploadedOn: d(40), approvedOn: d(39) }),
]

/* ═══════════════════════════ Dashboard trends ═══════════════════════════ */

/** Engineering throughput by month — new products, revisions and changes closed. */
export const engTrend = [
  { month: 'Feb', products: 2, bomRevisions: 5, routingRevisions: 3, changesClosed: 4 },
  { month: 'Mar', products: 1, bomRevisions: 7, routingRevisions: 2, changesClosed: 6 },
  { month: 'Apr', products: 3, bomRevisions: 4, routingRevisions: 4, changesClosed: 3 },
  { month: 'May', products: 2, bomRevisions: 8, routingRevisions: 5, changesClosed: 7 },
  { month: 'Jun', products: 4, bomRevisions: 6, routingRevisions: 3, changesClosed: 5 },
  { month: 'Jul', products: 2, bomRevisions: 9, routingRevisions: 6, changesClosed: 8 },
]
