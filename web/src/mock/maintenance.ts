/**
 * Volume 13 seed — a stainless steel bottle plant's maintenance records.
 *
 * The numbers are internally consistent: breakdown downtime drives the MTBF and
 * MTTR the dashboard reports, work order labour and spares drive the cost
 * roll-up, and spare on-hand quantities reconcile with the issue transactions.
 * A seed that does not reconcile teaches the screens to lie.
 */

import type {
  Breakdown, ConditionPoint, ConditionReading, MaintAsset, MaintPermit, MaintWorkOrder,
  PmPlan, PmTask, SparePart, SpareTxn, Technician, UtilityLog, Shutdown,
  WoChecklistLine, WoLabour, WoSpare,
} from '@/types/maintenance'

/** Days ago / ahead, as a local ISO date. Keeps the seed alive relative to today. */
const base = new Date()
const d = (daysAgo: number) => {
  const x = new Date(base)
  x.setDate(x.getDate() - daysAgo)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const ahead = (days: number) => d(-days)
/** A timestamp on a day-offset, at the given hour and minute. */
const t = (daysAgo: number, hh: number, mm = 0) => {
  const x = new Date(base)
  x.setDate(x.getDate() - daysAgo)
  x.setHours(hh, mm, 0, 0)
  return x.toISOString()
}

let n = 0
const id = (p: string) => `${p}-${String(++n).padStart(3, '0')}`

/* ═══════════════════════ Assets ═══════════════════════ */

const asset = (o: Partial<MaintAsset> & Pick<MaintAsset, 'code' | 'name' | 'category'>): MaintAsset => ({
  uid: id('ast'),
  parentCode: null,
  manufacturer: '',
  model: '',
  serialNumber: '',
  plant: 'PLANT-01',
  department: 'Production',
  productionLine: '',
  workCentre: '',
  location: '',
  installedOn: d(900),
  commissionedOn: d(890),
  warrantyUntil: null,
  amcVendor: '',
  amcUntil: null,
  financeAssetCode: null,
  purchaseCost: 0,
  expectedLifeYears: 15,
  criticality: 'B',
  status: 'RUNNING',
  runningHours: 0,
  cycleCount: 0,
  ratedPowerKw: 0,
  requiresCalibration: false,
  photoRef: '',
  documents: [],
  criticalComponents: [],
  remarks: '',
  version: 1,
  ...o,
})

export const assets: MaintAsset[] = [
  // ── Structure ─────────────────────────────────────────
  asset({ code: 'PLANT-01', name: 'Chennai Unit 1', category: 'PRODUCTION_MACHINE', status: 'RUNNING', criticality: 'A', department: 'Plant', expectedLifeYears: 40, remarks: 'Top of the asset hierarchy. Everything below rolls up here.' }),
  asset({ code: 'BLD-PROD', name: 'Production Building', category: 'PRODUCTION_MACHINE', parentCode: 'PLANT-01', criticality: 'A', department: 'Plant', expectedLifeYears: 40 }),
  asset({ code: 'LINE-DD', name: 'Deep Drawing Line', category: 'PRODUCTION_MACHINE', parentCode: 'BLD-PROD', productionLine: 'LINE-DD', criticality: 'A' }),
  asset({ code: 'LINE-FIN', name: 'Finishing & Coating Line', category: 'PRODUCTION_MACHINE', parentCode: 'BLD-PROD', productionLine: 'LINE-FIN', criticality: 'A' }),
  asset({ code: 'LINE-ASY', name: 'Assembly & Packing Line', category: 'PRODUCTION_MACHINE', parentCode: 'BLD-PROD', productionLine: 'LINE-ASY', criticality: 'B' }),
  asset({ code: 'BLD-UTIL', name: 'Utility Block', category: 'UTILITY', parentCode: 'PLANT-01', department: 'Utilities', criticality: 'A', expectedLifeYears: 40 }),

  // ── Deep drawing line ─────────────────────────────────
  asset({
    code: 'MC-SLIT-01', name: 'Coil Slitting Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-DD',
    manufacturer: 'Fabtech Engineering', model: 'FSL-600', serialNumber: 'FSL600-2019-114',
    productionLine: 'LINE-DD', workCentre: 'WC-SLIT', location: 'Bay 1',
    installedOn: d(1420), commissionedOn: d(1405), purchaseCost: 4_850_000, expectedLifeYears: 15,
    criticality: 'A', status: 'RUNNING', runningHours: 11_240, cycleCount: 0, ratedPowerKw: 22,
    financeAssetCode: 'FA-0002', amcVendor: 'Fabtech Service', amcUntil: ahead(210),
    criticalComponents: ['Slitter arbor', 'Recoiler drive', 'Edge trimmer blades'],
    documents: [{ kind: 'MANUAL', title: 'FSL-600 operating manual', ref: 'DOC/FSL600/OM' }, { kind: 'SOP', title: 'Slitting changeover SOP', ref: 'SOP-SLIT-01' }],
  }),
  asset({
    code: 'MC-PRESS-01', name: 'Hydraulic Deep Drawing Press #1', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-DD',
    manufacturer: 'Isgec Heavy Engineering', model: 'HDP-250T', serialNumber: 'HDP250-2018-042',
    productionLine: 'LINE-DD', workCentre: 'WC-DRAW', location: 'Bay 1',
    installedOn: d(1750), commissionedOn: d(1730), purchaseCost: 18_400_000, expectedLifeYears: 20,
    criticality: 'A', status: 'RUNNING', runningHours: 14_880, cycleCount: 2_146_500, ratedPowerKw: 75,
    financeAssetCode: 'FA-0001', warrantyUntil: d(640),
    criticalComponents: ['Main hydraulic pump', 'Ram seal kit', 'Die cushion', 'PLC'],
    documents: [
      { kind: 'MANUAL', title: 'HDP-250T service manual', ref: 'DOC/HDP250/SM' },
      { kind: 'DRAWING', title: 'Hydraulic circuit diagram', ref: 'DRG/HDP250/HYD-01' },
      { kind: 'SOP', title: 'Die change SOP', ref: 'SOP-DRAW-02' },
    ],
    remarks: 'The constraint of the plant. When this stops, the line stops.',
  }),
  asset({
    code: 'SUB-HYD-01', name: 'Hydraulic Power Unit — Press #1', category: 'PRODUCTION_MACHINE', parentCode: 'MC-PRESS-01',
    manufacturer: 'Yuken India', model: 'HPU-90', serialNumber: 'YK-HPU-2018-311',
    productionLine: 'LINE-DD', workCentre: 'WC-DRAW', location: 'Bay 1 mezzanine',
    installedOn: d(1750), purchaseCost: 1_260_000, expectedLifeYears: 12,
    criticality: 'A', status: 'RUNNING', runningHours: 14_880, ratedPowerKw: 30,
    criticalComponents: ['Piston pump', 'Cooler', 'Return filter'],
  }),
  asset({
    code: 'SUB-PUMP-01', name: 'Hydraulic Pump — HPU #1', category: 'PRODUCTION_MACHINE', parentCode: 'SUB-HYD-01',
    manufacturer: 'Yuken India', model: 'A90-FR04', serialNumber: 'YK-A90-2024-887',
    workCentre: 'WC-DRAW', installedOn: d(210), commissionedOn: d(210), purchaseCost: 385_000, expectedLifeYears: 8,
    criticality: 'A', status: 'RUNNING', runningHours: 3_140, ratedPowerKw: 30, warrantyUntil: ahead(155),
    remarks: 'Replaced after the seizure recorded in BRK/26-27/0004.',
  }),
  asset({
    code: 'MC-TRIM-01', name: 'Trimming Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-DD',
    manufacturer: 'Precision Autotech', model: 'PTM-120', serialNumber: 'PTM120-2020-076',
    productionLine: 'LINE-DD', workCentre: 'WC-TRIM', installedOn: d(1180), purchaseCost: 2_950_000,
    criticality: 'B', status: 'RUNNING', runningHours: 9_620, cycleCount: 1_842_000, ratedPowerKw: 15,
    criticalComponents: ['Trim blade set', 'Indexing servo'],
  }),
  asset({
    code: 'MC-NECK-01', name: 'Neck Forming Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-DD',
    manufacturer: 'Precision Autotech', model: 'PNF-80', serialNumber: 'PNF80-2020-031',
    productionLine: 'LINE-DD', workCentre: 'WC-NECK', installedOn: d(1180), purchaseCost: 3_380_000,
    criticality: 'B', status: 'RUNNING', runningHours: 9_410, cycleCount: 1_795_000, ratedPowerKw: 18,
    criticalComponents: ['Forming rollers', 'Spindle bearing'],
  }),

  // ── Finishing line ────────────────────────────────────
  asset({
    code: 'MC-WELD-01', name: 'TIG Welding Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-FIN',
    manufacturer: 'Fronius India', model: 'MagicWave 3000', serialNumber: 'FR-MW3000-2021-208',
    productionLine: 'LINE-FIN', workCentre: 'WC-WELD', installedOn: d(980), purchaseCost: 1_480_000,
    criticality: 'B', status: 'RUNNING', runningHours: 7_260, ratedPowerKw: 12,
    criticalComponents: ['Torch assembly', 'Gas solenoid', 'Cooling unit'],
  }),
  asset({
    code: 'MC-VAC-01', name: 'Vacuum Chamber', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-FIN',
    manufacturer: 'Toshniwal Vacuum', model: 'TVC-1200', serialNumber: 'TVC1200-2019-055',
    productionLine: 'LINE-FIN', workCentre: 'WC-VAC', installedOn: d(1390), purchaseCost: 6_720_000,
    criticality: 'A', status: 'RUNNING', runningHours: 12_050, ratedPowerKw: 25,
    criticalComponents: ['Chamber door seal', 'Vacuum gauge', 'Heater bank'],
    documents: [{ kind: 'SOP', title: 'Vacuum cycle validation SOP', ref: 'SOP-VAC-01' }],
    remarks: 'Vacuum integrity here decides the thermal performance the customer sees.',
  }),
  asset({
    code: 'MC-VPUMP-01', name: 'Vacuum Pump — Chamber #1', category: 'PRODUCTION_MACHINE', parentCode: 'MC-VAC-01',
    manufacturer: 'Leybold', model: 'SOGEVAC SV300', serialNumber: 'LB-SV300-2019-140',
    workCentre: 'WC-VAC', installedOn: d(1390), purchaseCost: 1_940_000,
    criticality: 'A', status: 'RUNNING', runningHours: 12_050, ratedPowerKw: 11,
    criticalComponents: ['Rotor vanes', 'Oil mist filter', 'Shaft seal'],
  }),
  asset({
    code: 'MC-LEAK-01', name: 'Helium Leak Testing Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-FIN',
    manufacturer: 'Pfeiffer Vacuum', model: 'ASM 340', serialNumber: 'PF-ASM340-2022-019',
    productionLine: 'LINE-FIN', workCentre: 'WC-LEAK', installedOn: d(720), purchaseCost: 3_260_000,
    criticality: 'A', status: 'RUNNING', runningHours: 5_840, ratedPowerKw: 4,
    requiresCalibration: true, warrantyUntil: ahead(38),
    criticalComponents: ['Mass spectrometer cell', 'Calibrated leak standard'],
    remarks: 'Requires calibration. Quality blocks leak inspections if the calibration lapses.',
  }),
  asset({
    code: 'MC-POLISH-01', name: 'Polishing Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-FIN',
    manufacturer: 'Grind Master', model: 'GM-PB-8', serialNumber: 'GM-PB8-2020-094',
    productionLine: 'LINE-FIN', workCentre: 'WC-POL', installedOn: d(1150), purchaseCost: 2_140_000,
    criticality: 'C', status: 'RUNNING', runningHours: 8_940, ratedPowerKw: 18,
    criticalComponents: ['Buffing spindle', 'Dust extraction'],
  }),
  asset({
    code: 'MC-COAT-01', name: 'Powder Coating Booth', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-FIN',
    manufacturer: 'Statfield Systems', model: 'SF-PCB-24', serialNumber: 'SF-PCB-2021-063',
    productionLine: 'LINE-FIN', workCentre: 'WC-COAT', installedOn: d(940), purchaseCost: 5_180_000,
    criticality: 'A', status: 'RUNNING', runningHours: 7_820, ratedPowerKw: 32,
    criticalComponents: ['Powder gun', 'Cyclone recovery', 'Filter cartridges'],
  }),
  asset({
    code: 'MC-OVEN-01', name: 'Curing Oven', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-FIN',
    manufacturer: 'Statfield Systems', model: 'SF-CO-180', serialNumber: 'SF-CO-2021-064',
    productionLine: 'LINE-FIN', workCentre: 'WC-CURE', installedOn: d(940), purchaseCost: 4_260_000,
    criticality: 'A', status: 'UNDER_MAINTENANCE', runningHours: 7_780, ratedPowerKw: 96,
    requiresCalibration: true,
    criticalComponents: ['Heating elements', 'Circulation fan', 'Temperature controller'],
    remarks: 'Zone 2 element replacement in progress under WO/26-27/0114.',
  }),
  asset({
    code: 'MC-LASER-01', name: 'Laser Marking Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-FIN',
    manufacturer: 'SIL Laser', model: 'SIL-FM-30', serialNumber: 'SIL-FM30-2022-127',
    productionLine: 'LINE-FIN', workCentre: 'WC-MARK', installedOn: d(680), purchaseCost: 1_620_000,
    criticality: 'C', status: 'RUNNING', runningHours: 4_920, ratedPowerKw: 3,
  }),

  // ── Assembly line ─────────────────────────────────────
  asset({
    code: 'MC-CONV-01', name: 'Assembly Conveyor', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-ASY',
    manufacturer: 'Interroll India', model: 'IR-BC-18', serialNumber: 'IR-BC18-2020-201',
    productionLine: 'LINE-ASY', workCentre: 'WC-ASY', installedOn: d(1120), purchaseCost: 1_840_000,
    criticality: 'B', status: 'RUNNING', runningHours: 9_180, ratedPowerKw: 7,
    criticalComponents: ['Drive motor', 'Belt', 'Take-up bearing'],
  }),
  asset({
    code: 'MC-PACK-01', name: 'Carton Packaging Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-ASY',
    manufacturer: 'Nichrome India', model: 'NC-CP-40', serialNumber: 'NC-CP40-2021-088',
    productionLine: 'LINE-ASY', workCentre: 'WC-PACK', installedOn: d(880), purchaseCost: 2_680_000,
    criticality: 'B', status: 'RUNNING', runningHours: 7_040, cycleCount: 986_000, ratedPowerKw: 9,
  }),
  asset({
    code: 'MC-SHRINK-01', name: 'Shrink Wrapping Machine', category: 'PRODUCTION_MACHINE', parentCode: 'LINE-ASY',
    manufacturer: 'Nichrome India', model: 'NC-SW-20', serialNumber: 'NC-SW20-2021-089',
    productionLine: 'LINE-ASY', workCentre: 'WC-PACK', installedOn: d(880), purchaseCost: 1_260_000,
    criticality: 'C', status: 'IDLE', runningHours: 5_610, ratedPowerKw: 14,
  }),

  // ── Utilities ─────────────────────────────────────────
  asset({
    code: 'UT-COMP-01', name: 'Screw Air Compressor #1', category: 'UTILITY', parentCode: 'BLD-UTIL',
    manufacturer: 'Atlas Copco', model: 'GA-75 VSD+', serialNumber: 'AC-GA75-2019-338',
    department: 'Utilities', location: 'Utility block', installedOn: d(1460), purchaseCost: 4_120_000,
    criticality: 'A', status: 'RUNNING', runningHours: 22_340, ratedPowerKw: 75,
    amcVendor: 'Atlas Copco Service', amcUntil: ahead(120),
    criticalComponents: ['Airend', 'Inlet valve', 'Oil separator', 'VSD drive'],
    remarks: 'Feeds every pneumatic actuator in the plant. No standby capacity above 60%.',
  }),
  asset({
    code: 'UT-CHIL-01', name: 'Process Chiller', category: 'UTILITY', parentCode: 'BLD-UTIL',
    manufacturer: 'Voltas', model: 'VCH-40TR', serialNumber: 'VT-CH40-2020-112',
    department: 'Utilities', location: 'Utility block', installedOn: d(1240), purchaseCost: 3_460_000,
    criticality: 'A', status: 'RUNNING', runningHours: 18_920, ratedPowerKw: 48,
    criticalComponents: ['Compressor', 'Condenser coil', 'Expansion valve'],
  }),
  asset({
    code: 'UT-DG-01', name: 'Diesel Generator 500 kVA', category: 'UTILITY', parentCode: 'BLD-UTIL',
    manufacturer: 'Cummins India', model: 'C500D5', serialNumber: 'CU-C500-2018-076',
    department: 'Utilities', location: 'DG yard', installedOn: d(1810), purchaseCost: 5_940_000,
    criticality: 'A', status: 'IDLE', runningHours: 2_180, ratedPowerKw: 400,
    criticalComponents: ['Alternator', 'Fuel injection pump', 'Radiator', 'Battery bank'],
    remarks: 'Standby only. Load-tested monthly whether or not there is an outage.',
  }),
  asset({
    code: 'UT-RO-01', name: 'RO Water Treatment Plant', category: 'UTILITY', parentCode: 'BLD-UTIL',
    manufacturer: 'Ion Exchange India', model: 'IX-RO-5KL', serialNumber: 'IX-RO5-2020-044',
    department: 'Utilities', location: 'Utility block', installedOn: d(1290), purchaseCost: 1_880_000,
    criticality: 'B', status: 'RUNNING', runningHours: 14_600, ratedPowerKw: 11,
    criticalComponents: ['RO membrane', 'High-pressure pump', 'Dosing pump'],
  }),
  asset({
    code: 'UT-PANEL-01', name: 'Main LT Panel', category: 'UTILITY', parentCode: 'BLD-UTIL',
    manufacturer: 'Schneider Electric', model: 'Prisma-P', serialNumber: 'SE-PP-2018-019',
    department: 'Utilities', location: 'Electrical room', installedOn: d(1810), purchaseCost: 2_240_000,
    criticality: 'A', status: 'RUNNING', runningHours: 43_800, ratedPowerKw: 0,
    criticalComponents: ['ACB', 'Capacitor bank', 'APFC relay'],
  }),

  // ── Material handling & instruments ───────────────────
  asset({
    code: 'MH-FL-01', name: 'Forklift 2.5T', category: 'MATERIAL_HANDLING', parentCode: 'PLANT-01',
    manufacturer: 'Godrej Material Handling', model: 'GX-250', serialNumber: 'GJ-GX250-2021-203',
    department: 'Stores', installedOn: d(920), purchaseCost: 1_460_000, expectedLifeYears: 10,
    criticality: 'C', status: 'RUNNING', runningHours: 4_180, ratedPowerKw: 0,
    criticalComponents: ['Hydraulic mast', 'Traction battery'],
  }),
  asset({
    code: 'QI-TORQUE-01', name: 'Digital Torque Wrench', category: 'QUALITY_INSTRUMENT', parentCode: 'PLANT-01',
    manufacturer: 'Mitutoyo', model: 'MT-DTW-50', serialNumber: 'MTY-DTW-2023-411',
    department: 'Quality', installedOn: d(430), purchaseCost: 86_000, expectedLifeYears: 8,
    criticality: 'B', status: 'RUNNING', requiresCalibration: true, ratedPowerKw: 0,
    remarks: 'Used to verify lid torque. Calibration is mandatory before an FQC inspection.',
  }),
  asset({
    code: 'TL-DIE-750', name: 'Deep Draw Die — 750 ml', category: 'MOULD_DIE', parentCode: 'MC-PRESS-01',
    manufacturer: 'Sharp Tools', model: 'DD-750-R3', serialNumber: 'ST-DD750-2022-007',
    workCentre: 'WC-DRAW', installedOn: d(760), purchaseCost: 940_000, expectedLifeYears: 6,
    criticality: 'A', status: 'RUNNING', cycleCount: 486_000, ratedPowerKw: 0,
    criticalComponents: ['Punch', 'Draw ring', 'Blank holder'],
    remarks: 'Rated for 600,000 cycles between full refurbishments.',
  }),
]

/* ═══════════════════════ Technicians ═══════════════════════ */

export const technicians: Technician[] = [
  { uid: id('tec'), code: 'TEC-01', name: 'R. Manikandan', trade: 'MECHANICAL', skills: ['MECHANICAL', 'HYDRAULIC'], certifications: [{ name: 'Hydraulic systems level 2', validUntil: ahead(300) }], shift: 'A', hourlyRate: 320, shiftHours: 8, isAvailable: true, phone: '98400 11223', version: 1 },
  { uid: id('tec'), code: 'TEC-02', name: 'S. Prabhakaran', trade: 'ELECTRICAL', skills: ['ELECTRICAL', 'ELECTRONIC'], certifications: [{ name: 'Licensed electrician (TN)', validUntil: ahead(420) }, { name: 'LOTO authorised', validUntil: ahead(180) }], shift: 'A', hourlyRate: 340, shiftHours: 8, isAvailable: true, phone: '98400 11224', version: 1 },
  { uid: id('tec'), code: 'TEC-03', name: 'M. Arulmozhi', trade: 'MECHANICAL', skills: ['MECHANICAL', 'PNEUMATIC'], certifications: [], shift: 'B', hourlyRate: 280, shiftHours: 8, isAvailable: true, phone: '98400 11225', version: 1 },
  { uid: id('tec'), code: 'TEC-04', name: 'K. Venkatesh', trade: 'UTILITY', skills: ['UTILITY', 'ELECTRICAL', 'HVAC'], certifications: [{ name: 'Refrigeration handling', validUntil: ahead(95) }], shift: 'GENERAL', hourlyRate: 360, shiftHours: 8, isAvailable: true, phone: '98400 11226', version: 1 },
  { uid: id('tec'), code: 'TEC-05', name: 'A. Dhanasekar', trade: 'ELECTRONIC', skills: ['ELECTRONIC', 'INSTRUMENTATION'], certifications: [{ name: 'PLC programming — Siemens S7', validUntil: ahead(500) }], shift: 'GENERAL', hourlyRate: 420, shiftHours: 8, isAvailable: true, phone: '98400 11227', version: 1 },
  { uid: id('tec'), code: 'TEC-06', name: 'J. Suresh Kumar', trade: 'MECHANICAL', skills: ['MECHANICAL', 'WELDING'], certifications: [{ name: 'Hot work authorised', validUntil: ahead(60) }], shift: 'C', hourlyRate: 300, shiftHours: 8, isAvailable: false, phone: '98400 11228', version: 1 },
]

/* ═══════════════════════ Spares ═══════════════════════ */

const spare = (o: Partial<SparePart> & Pick<SparePart, 'itemCode' | 'itemName' | 'onHand' | 'minStock' | 'maxStock'>): SparePart => ({
  uid: id('spr'),
  category: 'Mechanical',
  uom: 'NOS',
  compatibleAssets: [],
  reorderQty: 0,
  reserved: 0,
  isCritical: false,
  preferredVendor: '',
  leadTimeDays: 14,
  rate: 0,
  binLocation: '',
  version: 1,
  ...o,
})

export const spares: SparePart[] = [
  spare({ itemCode: 'SP-HYD-SEAL', itemName: 'Ram seal kit — HDP-250T', category: 'Hydraulic', onHand: 3, minStock: 2, maxStock: 6, reorderQty: 4, reserved: 1, isCritical: true, compatibleAssets: ['MC-PRESS-01'], preferredVendor: 'Isgec Spares', leadTimeDays: 21, rate: 18_400, binLocation: 'MS-A-01' }),
  spare({ itemCode: 'SP-HYD-PUMP', itemName: 'Piston pump A90-FR04', category: 'Hydraulic', onHand: 1, minStock: 1, maxStock: 2, reorderQty: 1, reserved: 0, isCritical: true, compatibleAssets: ['SUB-HYD-01', 'SUB-PUMP-01'], preferredVendor: 'Yuken India', leadTimeDays: 45, rate: 385_000, binLocation: 'MS-A-02' }),
  spare({ itemCode: 'SP-HYD-FILT', itemName: 'Return line filter element', category: 'Hydraulic', onHand: 12, minStock: 6, maxStock: 24, reorderQty: 12, reserved: 2, compatibleAssets: ['SUB-HYD-01', 'MC-PRESS-01'], preferredVendor: 'Yuken India', leadTimeDays: 10, rate: 2_450, binLocation: 'MS-A-03' }),
  spare({ itemCode: 'SP-VAC-VANE', itemName: 'Rotor vane set — SV300', category: 'Vacuum', onHand: 2, minStock: 2, maxStock: 4, reorderQty: 2, reserved: 0, isCritical: true, compatibleAssets: ['MC-VPUMP-01'], preferredVendor: 'Leybold India', leadTimeDays: 35, rate: 42_600, binLocation: 'MS-B-01' }),
  spare({ itemCode: 'SP-VAC-OIL', itemName: 'Vacuum pump oil — 5 L', category: 'Consumable', uom: 'CAN', onHand: 8, minStock: 4, maxStock: 16, reorderQty: 8, reserved: 0, compatibleAssets: ['MC-VPUMP-01'], preferredVendor: 'Leybold India', leadTimeDays: 12, rate: 4_800, binLocation: 'MS-B-02' }),
  spare({ itemCode: 'SP-VAC-SEAL', itemName: 'Chamber door seal', category: 'Vacuum', onHand: 1, minStock: 2, maxStock: 4, reorderQty: 3, reserved: 1, isCritical: true, compatibleAssets: ['MC-VAC-01'], preferredVendor: 'Toshniwal Vacuum', leadTimeDays: 28, rate: 26_800, binLocation: 'MS-B-03' }),
  spare({ itemCode: 'SP-OVN-ELEM', itemName: 'Oven heating element 6 kW', category: 'Electrical', onHand: 0, minStock: 3, maxStock: 8, reorderQty: 6, reserved: 0, isCritical: true, compatibleAssets: ['MC-OVEN-01'], preferredVendor: 'Statfield Systems', leadTimeDays: 18, rate: 9_600, binLocation: 'MS-C-01' }),
  spare({ itemCode: 'SP-CMP-SEP', itemName: 'Oil separator element — GA75', category: 'Utility', onHand: 2, minStock: 1, maxStock: 3, reorderQty: 2, reserved: 0, isCritical: true, compatibleAssets: ['UT-COMP-01'], preferredVendor: 'Atlas Copco', leadTimeDays: 20, rate: 21_400, binLocation: 'MS-D-01' }),
  spare({ itemCode: 'SP-CMP-FILT', itemName: 'Compressor air filter', category: 'Utility', onHand: 6, minStock: 3, maxStock: 12, reorderQty: 6, reserved: 0, compatibleAssets: ['UT-COMP-01'], preferredVendor: 'Atlas Copco', leadTimeDays: 14, rate: 3_200, binLocation: 'MS-D-02' }),
  spare({ itemCode: 'SP-CMP-OIL', itemName: 'Compressor oil Roto-Xtend — 20 L', category: 'Consumable', uom: 'CAN', onHand: 3, minStock: 2, maxStock: 6, reorderQty: 4, reserved: 1, compatibleAssets: ['UT-COMP-01'], preferredVendor: 'Atlas Copco', leadTimeDays: 14, rate: 12_800, binLocation: 'MS-D-03' }),
  spare({ itemCode: 'SP-BRG-6309', itemName: 'Deep groove bearing 6309', category: 'Mechanical', onHand: 14, minStock: 6, maxStock: 24, reorderQty: 12, reserved: 2, compatibleAssets: ['MC-NECK-01', 'MC-POLISH-01', 'MC-CONV-01'], preferredVendor: 'SKF Authorised', leadTimeDays: 7, rate: 1_840, binLocation: 'MS-E-01' }),
  spare({ itemCode: 'SP-BLT-CONV', itemName: 'Conveyor belt 18 m', category: 'Mechanical', uom: 'MTR', onHand: 22, minStock: 18, maxStock: 40, reorderQty: 20, reserved: 0, compatibleAssets: ['MC-CONV-01'], preferredVendor: 'Interroll India', leadTimeDays: 25, rate: 2_150, binLocation: 'MS-E-02' }),
  spare({ itemCode: 'SP-TRM-BLADE', itemName: 'Trim blade set', category: 'Tooling', onHand: 4, minStock: 2, maxStock: 8, reorderQty: 4, reserved: 1, compatibleAssets: ['MC-TRIM-01'], preferredVendor: 'Sharp Tools', leadTimeDays: 16, rate: 14_200, binLocation: 'MS-F-01' }),
  spare({ itemCode: 'SP-RO-MEMB', itemName: 'RO membrane 4040', category: 'Utility', onHand: 2, minStock: 2, maxStock: 4, reorderQty: 2, compatibleAssets: ['UT-RO-01'], preferredVendor: 'Ion Exchange', leadTimeDays: 22, rate: 18_900, binLocation: 'MS-D-04' }),
  spare({ itemCode: 'SP-WLD-TORCH', itemName: 'TIG torch consumable kit', category: 'Consumable', onHand: 9, minStock: 4, maxStock: 16, reorderQty: 8, compatibleAssets: ['MC-WELD-01'], preferredVendor: 'Fronius India', leadTimeDays: 11, rate: 5_600, binLocation: 'MS-G-01' }),
]

/* ═══════════════════════ PM plans ═══════════════════════ */

const task = (seq: number, description: string, standardMinutes: number, o: Partial<PmTask> = {}): PmTask => ({
  uid: id('tsk'), seq, description, standardMinutes, mandatory: true, capture: 'NONE', uom: '', ...o,
})

export const pmPlans: PmPlan[] = [
  {
    uid: id('pm'), code: 'PM-PRESS-500H', name: 'Deep drawing press — 500 hour service',
    assetCode: 'MC-PRESS-01', assetName: 'Hydraulic Deep Drawing Press #1',
    trigger: 'RUNNING_HOURS', frequency: 'CUSTOM', intervalDays: 0, intervalUnits: 500, leadDays: 3,
    requiredSkill: 'HYDRAULIC', estimatedHours: 6, requiresShutdown: true, requiresPermit: true, permitTypes: ['LOTO'],
    tasks: [
      task(1, 'Isolate the press and verify zero energy state', 20),
      task(2, 'Check hydraulic oil level and condition', 15, { capture: 'PASS_FAIL' }),
      task(3, 'Record hydraulic oil temperature at operating pressure', 10, { capture: 'READING', uom: '°C' }),
      task(4, 'Replace the return line filter element', 30),
      task(5, 'Inspect ram seals for weeping', 25, { capture: 'PASS_FAIL' }),
      task(6, 'Check and record system pressure', 15, { capture: 'READING', uom: 'bar' }),
      task(7, 'Grease the die cushion guides', 20),
      task(8, 'Verify the emergency stop and light curtain', 20, { capture: 'PASS_FAIL' }),
      task(9, 'Clean the machine and the surrounding bay', 30, { mandatory: false }),
      task(10, 'Record the running hour meter', 5, { capture: 'READING', uom: 'hours' }),
    ],
    spares: [
      { itemCode: 'SP-HYD-FILT', itemName: 'Return line filter element', qty: 1, uom: 'NOS' },
    ],
    lastDoneOn: d(28), lastDoneMeter: 14_450, isActive: true,
    remarks: 'The press is the plant constraint; this service is never deferred past its interval.',
    version: 4,
  },
  {
    uid: id('pm'), code: 'PM-PRESS-QTR', name: 'Deep drawing press — quarterly inspection',
    assetCode: 'MC-PRESS-01', assetName: 'Hydraulic Deep Drawing Press #1',
    trigger: 'CALENDAR', frequency: 'QUARTERLY', intervalDays: 90, intervalUnits: 0, leadDays: 7,
    requiredSkill: 'MECHANICAL', estimatedHours: 4, requiresShutdown: true, requiresPermit: true, permitTypes: ['LOTO'],
    tasks: [
      task(1, 'Isolate and lock out', 15),
      task(2, 'Inspect the main frame and tie rods for cracks', 45, { capture: 'PASS_FAIL' }),
      task(3, 'Check ram parallelism', 40, { capture: 'READING', uom: 'mm' }),
      task(4, 'Torque check on the bolster fasteners', 30),
      task(5, 'Inspect the PLC cabinet and cooling fans', 25, { capture: 'PASS_FAIL' }),
      task(6, 'Test all safety interlocks', 35, { capture: 'PASS_FAIL' }),
    ],
    spares: [],
    lastDoneOn: d(94), lastDoneMeter: 14_120, isActive: true,
    remarks: '',
    version: 3,
  },
  {
    uid: id('pm'), code: 'PM-VACPUMP-1000H', name: 'Vacuum pump — 1000 hour overhaul',
    assetCode: 'MC-VPUMP-01', assetName: 'Vacuum Pump — Chamber #1',
    trigger: 'RUNNING_HOURS', frequency: 'CUSTOM', intervalDays: 0, intervalUnits: 1000, leadDays: 5,
    requiredSkill: 'MECHANICAL', estimatedHours: 5, requiresShutdown: true, requiresPermit: true, permitTypes: ['LOTO'],
    tasks: [
      task(1, 'Isolate the pump and vent the chamber', 20),
      task(2, 'Drain and replace the pump oil', 40),
      task(3, 'Replace the oil mist filter', 25),
      task(4, 'Inspect the rotor vanes for wear', 45, { capture: 'PASS_FAIL' }),
      task(5, 'Measure and record the ultimate vacuum reached', 40, { capture: 'READING', uom: 'mbar' }),
      task(6, 'Check the shaft seal for leakage', 20, { capture: 'PASS_FAIL' }),
    ],
    spares: [
      { itemCode: 'SP-VAC-OIL', itemName: 'Vacuum pump oil — 5 L', qty: 1, uom: 'CAN' },
    ],
    lastDoneOn: d(46), lastDoneMeter: 11_400, isActive: true,
    remarks: 'Ultimate vacuum below 0.5 mbar means the vanes need replacing regardless of hours.',
    version: 2,
  },
  {
    uid: id('pm'), code: 'PM-COMP-MTH', name: 'Air compressor — monthly service',
    assetCode: 'UT-COMP-01', assetName: 'Screw Air Compressor #1',
    trigger: 'CALENDAR', frequency: 'MONTHLY', intervalDays: 30, intervalUnits: 0, leadDays: 3,
    requiredSkill: 'UTILITY', estimatedHours: 3, requiresShutdown: true, requiresPermit: false, permitTypes: [],
    tasks: [
      task(1, 'Check and record the oil level', 10, { capture: 'READING', uom: '%' }),
      task(2, 'Clean or replace the air filter', 25),
      task(3, 'Drain the condensate from the receiver', 15),
      task(4, 'Record discharge pressure and temperature', 15, { capture: 'READING', uom: 'bar' }),
      task(5, 'Check for air leaks across the header', 40, { capture: 'PASS_FAIL' }),
      task(6, 'Verify the safety valve operation', 20, { capture: 'PASS_FAIL' }),
    ],
    spares: [
      { itemCode: 'SP-CMP-FILT', itemName: 'Compressor air filter', qty: 1, uom: 'NOS' },
    ],
    lastDoneOn: d(34), lastDoneMeter: 22_100, isActive: true,
    remarks: '',
    version: 6,
  },
  {
    uid: id('pm'), code: 'PM-DG-MTH', name: 'DG set — monthly load test',
    assetCode: 'UT-DG-01', assetName: 'Diesel Generator 500 kVA',
    trigger: 'CALENDAR', frequency: 'MONTHLY', intervalDays: 30, intervalUnits: 0, leadDays: 2,
    requiredSkill: 'UTILITY', estimatedHours: 2, requiresShutdown: false, requiresPermit: false, permitTypes: [],
    tasks: [
      task(1, 'Check the fuel level and top up', 10, { capture: 'READING', uom: '%' }),
      task(2, 'Check the coolant and lubricating oil', 15, { capture: 'PASS_FAIL' }),
      task(3, 'Verify the battery voltage', 10, { capture: 'READING', uom: 'V' }),
      task(4, 'Run on load for 30 minutes', 40),
      task(5, 'Record output voltage and frequency', 15, { capture: 'READING', uom: 'V' }),
      task(6, 'Inspect for fuel and coolant leaks', 20, { capture: 'PASS_FAIL' }),
    ],
    spares: [],
    lastDoneOn: d(12), lastDoneMeter: 2_170, isActive: true,
    remarks: 'A standby set that has never been load-tested is not a standby set.',
    version: 8,
  },
  {
    uid: id('pm'), code: 'PM-DIE-100K', name: 'Draw die — 100,000 cycle inspection',
    assetCode: 'TL-DIE-750', assetName: 'Deep Draw Die — 750 ml',
    trigger: 'CYCLES', frequency: 'CUSTOM', intervalDays: 0, intervalUnits: 100_000, leadDays: 0,
    requiredSkill: 'MECHANICAL', estimatedHours: 3, requiresShutdown: true, requiresPermit: false, permitTypes: [],
    tasks: [
      task(1, 'Remove the die and clean thoroughly', 45),
      task(2, 'Inspect the punch for scoring', 30, { capture: 'PASS_FAIL' }),
      task(3, 'Measure and record the draw ring radius', 25, { capture: 'READING', uom: 'mm' }),
      task(4, 'Check the blank holder surface', 25, { capture: 'PASS_FAIL' }),
      task(5, 'Polish and re-lubricate', 40),
      task(6, 'Record the cycle counter', 5, { capture: 'READING', uom: 'cycles' }),
    ],
    spares: [],
    lastDoneOn: d(64), lastDoneMeter: 420_000, isActive: true,
    remarks: 'Die wear shows as thinning in the bottle wall long before it shows on the die.',
    version: 3,
  },
  {
    uid: id('pm'), code: 'PM-OVEN-QTR', name: 'Curing oven — quarterly service',
    assetCode: 'MC-OVEN-01', assetName: 'Curing Oven',
    trigger: 'CALENDAR', frequency: 'QUARTERLY', intervalDays: 90, intervalUnits: 0, leadDays: 7,
    requiredSkill: 'ELECTRICAL', estimatedHours: 5, requiresShutdown: true, requiresPermit: true, permitTypes: ['LOTO', 'HOT_WORK'],
    tasks: [
      task(1, 'Isolate and lock out the oven', 20),
      task(2, 'Test the resistance of every heating element', 60, { capture: 'READING', uom: 'Ω' }),
      task(3, 'Inspect the circulation fan and bearings', 40, { capture: 'PASS_FAIL' }),
      task(4, 'Verify the temperature controller against a reference', 45, { capture: 'READING', uom: '°C' }),
      task(5, 'Check the door seals and insulation', 30, { capture: 'PASS_FAIL' }),
      task(6, 'Run a temperature uniformity survey', 60, { capture: 'READING', uom: '°C' }),
    ],
    spares: [],
    lastDoneOn: d(112), lastDoneMeter: 0, isActive: true,
    remarks: 'Overdue. Zone 2 failed before this service came round — see BRK/26-27/0007.',
    version: 4,
  },
  {
    uid: id('pm'), code: 'PM-CONV-WK', name: 'Assembly conveyor — weekly check',
    assetCode: 'MC-CONV-01', assetName: 'Assembly Conveyor',
    trigger: 'CALENDAR', frequency: 'WEEKLY', intervalDays: 7, intervalUnits: 0, leadDays: 1,
    requiredSkill: 'MECHANICAL', estimatedHours: 1, requiresShutdown: false, requiresPermit: false, permitTypes: [],
    tasks: [
      task(1, 'Check the belt tracking and tension', 15, { capture: 'PASS_FAIL' }),
      task(2, 'Lubricate the take-up bearings', 15),
      task(3, 'Inspect the drive motor and coupling', 15, { capture: 'PASS_FAIL' }),
      task(4, 'Test the pull-cord emergency stop', 10, { capture: 'PASS_FAIL' }),
    ],
    spares: [],
    lastDoneOn: d(3), lastDoneMeter: 0, isActive: true,
    remarks: '',
    version: 22,
  },
  {
    uid: id('pm'), code: 'PM-CHIL-QTR', name: 'Chiller — quarterly service',
    assetCode: 'UT-CHIL-01', assetName: 'Process Chiller',
    trigger: 'CALENDAR', frequency: 'QUARTERLY', intervalDays: 90, intervalUnits: 0, leadDays: 7,
    requiredSkill: 'UTILITY', estimatedHours: 4, requiresShutdown: true, requiresPermit: false, permitTypes: [],
    tasks: [
      task(1, 'Clean the condenser coil', 60),
      task(2, 'Check the refrigerant pressures', 25, { capture: 'READING', uom: 'psi' }),
      task(3, 'Record the approach temperature', 20, { capture: 'READING', uom: '°C' }),
      task(4, 'Inspect the compressor for noise and vibration', 30, { capture: 'PASS_FAIL' }),
      task(5, 'Check the chilled water flow rate', 25, { capture: 'READING', uom: 'lpm' }),
    ],
    spares: [],
    lastDoneOn: d(52), lastDoneMeter: 0, isActive: true,
    remarks: '',
    version: 5,
  },
  {
    uid: id('pm'), code: 'PM-LEAK-CAL', name: 'Leak tester — calibration support',
    assetCode: 'MC-LEAK-01', assetName: 'Helium Leak Testing Machine',
    trigger: 'CALENDAR', frequency: 'HALF_YEARLY', intervalDays: 180, intervalUnits: 0, leadDays: 14,
    requiredSkill: 'INSTRUMENTATION', estimatedHours: 3, requiresShutdown: true, requiresPermit: false, permitTypes: [],
    tasks: [
      task(1, 'Release the instrument to the calibration agency', 20),
      task(2, 'Verify against the calibrated leak standard on return', 60, { capture: 'READING', uom: 'mbar·l/s' }),
      task(3, 'Update the calibration record in Quality', 20),
      task(4, 'Confirm the instrument is released for inspection use', 20, { capture: 'PASS_FAIL' }),
    ],
    spares: [],
    lastDoneOn: d(158), lastDoneMeter: 0, isActive: true,
    remarks: 'Coordinated with Quality — an overdue calibration blocks leak inspections.',
    version: 2,
  },
]

/* ═══════════════════════ Permits ═══════════════════════ */

export const permits: MaintPermit[] = [
  {
    uid: id('per'), docNo: 'PTW/26-27/0088', permitType: 'LOTO',
    workOrderNo: 'WO/26-27/0114', assetCode: 'MC-OVEN-01', assetName: 'Curing Oven',
    requestedBy: 'S. Prabhakaran', issuedBy: 'V. Ramesh (Maintenance Manager)',
    workers: ['S. Prabhakaran', 'A. Dhanasekar'], contractor: '',
    riskAssessment: 'Live 415 V supply to six heating zones and residual heat above 150 °C. Isolate at the panel, lock the ACB, verify zero volts at each element terminal, and allow the chamber to cool below 40 °C before entry.',
    ppeChecklist: [
      { item: 'Arc-rated coverall', confirmed: true },
      { item: 'Insulated gloves class 0', confirmed: true },
      { item: 'Face shield', confirmed: true },
      { item: 'Heat-resistant gauntlets', confirmed: true },
      { item: 'Safety footwear', confirmed: true },
    ],
    isolationPoints: [
      { point: 'LT panel — Oven feeder ACB-14', locked: true, tagNo: 'TAG-0451' },
      { point: 'Local isolator at oven control panel', locked: true, tagNo: 'TAG-0452' },
      { point: 'Circulation fan starter', locked: true, tagNo: 'TAG-0453' },
    ],
    validFrom: d(1), validUntil: ahead(1), status: 'ACTIVE',
    closedBy: null, closedAt: null,
    remarks: 'Extended by one day — the replacement element arrived late.',
    version: 3,
  },
  {
    uid: id('per'), docNo: 'PTW/26-27/0086', permitType: 'LOTO',
    workOrderNo: 'WO/26-27/0109', assetCode: 'MC-PRESS-01', assetName: 'Hydraulic Deep Drawing Press #1',
    requestedBy: 'R. Manikandan', issuedBy: 'V. Ramesh (Maintenance Manager)',
    workers: ['R. Manikandan', 'M. Arulmozhi'], contractor: '',
    riskAssessment: 'Stored hydraulic energy at 210 bar and a 12-tonne ram able to fall under gravity. Isolate, bleed the accumulator to zero, insert the mechanical ram prop, and confirm zero pressure at the gauge.',
    ppeChecklist: [
      { item: 'Safety helmet', confirmed: true },
      { item: 'Safety footwear', confirmed: true },
      { item: 'Cut-resistant gloves', confirmed: true },
      { item: 'Safety glasses', confirmed: true },
    ],
    isolationPoints: [
      { point: 'Main motor starter MCC-3', locked: true, tagNo: 'TAG-0447' },
      { point: 'Hydraulic accumulator bleed valve', locked: true, tagNo: 'TAG-0448' },
      { point: 'Ram mechanical prop inserted', locked: true, tagNo: 'TAG-0449' },
    ],
    validFrom: d(29), validUntil: d(28), status: 'CLOSED',
    closedBy: 'V. Ramesh (Maintenance Manager)', closedAt: t(28, 17, 40),
    remarks: 'Isolations returned and the press test-run before handover to production.',
    version: 4,
  },
  {
    uid: id('per'), docNo: 'PTW/26-27/0090', permitType: 'HOT_WORK',
    workOrderNo: '', assetCode: 'LINE-FIN', assetName: 'Finishing & Coating Line',
    requestedBy: 'J. Suresh Kumar', issuedBy: null,
    workers: ['J. Suresh Kumar'], contractor: 'Sree Fabrication Works',
    riskAssessment: 'Welding repair to the exhaust duct within 8 m of the powder coating booth. Powder residue is combustible.',
    ppeChecklist: [
      { item: 'Welding helmet', confirmed: true },
      { item: 'Leather apron and gauntlets', confirmed: true },
      { item: 'Fire watch posted', confirmed: false },
      { item: 'Fire extinguisher at hand', confirmed: false },
    ],
    isolationPoints: [
      { point: 'Powder booth shut down and purged', locked: false, tagNo: '' },
    ],
    validFrom: ahead(2), validUntil: ahead(2), status: 'DRAFT',
    closedBy: null, closedAt: null,
    remarks: 'Cannot be issued until the fire watch is posted and the booth purge is confirmed.',
    version: 1,
  },
]

/* ═══════════════════════ Work orders ═══════════════════════ */

const labour = (code: string, name: string, hours: number, rate: number, isOvertime = false): WoLabour => ({
  uid: id('lab'), technicianCode: code, technicianName: name, hours, rate, isOvertime,
})
const usedSpare = (itemCode: string, itemName: string, qtyIssued: number, uom: string, rate: number, qtyReturned = 0): WoSpare => ({
  uid: id('wsp'), itemCode, itemName, qtyIssued, qtyReturned, uom, rate,
})
const cl = (seq: number, description: string, o: Partial<WoChecklistLine> = {}): WoChecklistLine => ({
  uid: id('wcl'), seq, description, mandatory: true, capture: 'NONE', uom: '',
  done: false, reading: null, result: null, remarks: '', ...o,
})

export const workOrders: MaintWorkOrder[] = [
  // ── Closed preventive: the 500-hour press service ─────
  {
    uid: id('wo'), docNo: 'WO/26-27/0109', woType: 'PREVENTIVE', priority: 'HIGH',
    assetCode: 'MC-PRESS-01', assetName: 'Hydraulic Deep Drawing Press #1', sourceDocNo: 'PM-PRESS-500H',
    title: 'Deep drawing press — 500 hour service',
    description: 'Preventive maintenance per plan PM-PRESS-500H at 14,450 running hours.',
    raisedBy: 'System', raisedOn: d(31), supervisor: 'V. Ramesh',
    plannedStart: d(29), plannedFinish: d(28), actualStart: t(29, 6, 30), actualFinish: t(28, 16, 45),
    status: 'CLOSED',
    labour: [labour('TEC-01', 'R. Manikandan', 6.5, 320), labour('TEC-03', 'M. Arulmozhi', 5.0, 280)],
    spares: [usedSpare('SP-HYD-FILT', 'Return line filter element', 1, 'NOS', 2_450)],
    externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Isolate the press and verify zero energy state', { done: true }),
      cl(2, 'Check hydraulic oil level and condition', { done: true, capture: 'PASS_FAIL', result: 'PASS' }),
      cl(3, 'Record hydraulic oil temperature at operating pressure', { done: true, capture: 'READING', uom: '°C', reading: 52 }),
      cl(4, 'Replace the return line filter element', { done: true }),
      cl(5, 'Inspect ram seals for weeping', { done: true, capture: 'PASS_FAIL', result: 'PASS', remarks: 'Slight film on the front seal; watch at the next service.' }),
      cl(6, 'Check and record system pressure', { done: true, capture: 'READING', uom: 'bar', reading: 208 }),
      cl(7, 'Grease the die cushion guides', { done: true }),
      cl(8, 'Verify the emergency stop and light curtain', { done: true, capture: 'PASS_FAIL', result: 'PASS' }),
      cl(9, 'Clean the machine and the surrounding bay', { done: true, mandatory: false }),
      cl(10, 'Record the running hour meter', { done: true, capture: 'READING', uom: 'hours', reading: 14_452 }),
    ],
    permitNo: 'PTW/26-27/0086', requiresPermit: true, downtimeMinutes: 610,
    verifiedBy: 'V. Ramesh', verifiedOn: d(28), closedOn: d(27),
    isRework: false, reworkOfDocNo: null,
    remarks: 'Completed inside the window. Front ram seal flagged for the next service.',
    version: 7,
  },

  // ── Open breakdown work order: the oven ───────────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0114', woType: 'BREAKDOWN', priority: 'CRITICAL',
    assetCode: 'MC-OVEN-01', assetName: 'Curing Oven', sourceDocNo: 'BRK/26-27/0007',
    title: 'Curing oven — zone 2 heating element failure',
    description: 'Zone 2 not reaching setpoint. Element resistance open circuit on two of three elements.',
    raisedBy: 'S. Prabhakaran', raisedOn: d(2), supervisor: 'V. Ramesh',
    plannedStart: d(1), plannedFinish: d(0), actualStart: t(1, 8, 0), actualFinish: null,
    status: 'IN_PROGRESS',
    labour: [labour('TEC-02', 'S. Prabhakaran', 7.0, 340), labour('TEC-05', 'A. Dhanasekar', 3.5, 420)],
    spares: [],
    externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Isolate the oven and lock out', { done: true }),
      cl(2, 'Measure the resistance of each element in zone 2', { done: true, capture: 'READING', uom: 'Ω', reading: 0, remarks: 'Two elements open circuit, one reading 8.4 Ω against a nominal 8.0.' }),
      cl(3, 'Replace the failed heating elements', { done: false }),
      cl(4, 'Verify the temperature controller output to zone 2', { done: false, capture: 'PASS_FAIL' }),
      cl(5, 'Run a temperature uniformity survey across all zones', { done: false, capture: 'READING', uom: '°C' }),
      cl(6, 'Release the oven back to production', { done: false, capture: 'PASS_FAIL' }),
    ],
    permitNo: 'PTW/26-27/0088', requiresPermit: true, downtimeMinutes: 0,
    verifiedBy: null, verifiedOn: null, closedOn: null,
    isRework: false, reworkOfDocNo: null,
    remarks: 'Held on step 3 — no heating elements in the store, purchase order raised.',
    version: 5,
  },

  // ── Closed breakdown: hydraulic pump seizure ──────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0071', woType: 'BREAKDOWN', priority: 'CRITICAL',
    assetCode: 'SUB-HYD-01', assetName: 'Hydraulic Power Unit — Press #1', sourceDocNo: 'BRK/26-27/0004',
    title: 'Hydraulic pump seizure — press #1',
    description: 'Main piston pump seized. Press stopped mid-shift. Pump replaced with the store spare.',
    raisedBy: 'R. Manikandan', raisedOn: d(212), supervisor: 'V. Ramesh',
    plannedStart: d(212), plannedFinish: d(211), actualStart: t(212, 14, 20), actualFinish: t(211, 2, 10),
    status: 'CLOSED',
    labour: [labour('TEC-01', 'R. Manikandan', 8.0, 320), labour('TEC-01', 'R. Manikandan', 3.8, 320, true), labour('TEC-03', 'M. Arulmozhi', 6.0, 280)],
    spares: [usedSpare('SP-HYD-PUMP', 'Piston pump A90-FR04', 1, 'NOS', 385_000), usedSpare('SP-HYD-FILT', 'Return line filter element', 2, 'NOS', 2_450)],
    externalCost: 46_000, externalVendor: 'Yuken India — commissioning engineer',
    checklist: [
      cl(1, 'Isolate and bleed the hydraulic system', { done: true }),
      cl(2, 'Remove the seized pump', { done: true }),
      cl(3, 'Flush the reservoir and replace both filters', { done: true }),
      cl(4, 'Fit and align the replacement pump', { done: true }),
      cl(5, 'Set the relief valve and record the pressure', { done: true, capture: 'READING', uom: 'bar', reading: 210 }),
      cl(6, 'Run for 30 minutes and check for leaks', { done: true, capture: 'PASS_FAIL', result: 'PASS' }),
      cl(7, 'Confirm the oil cooler is working', { done: true, capture: 'PASS_FAIL', result: 'PASS' }),
    ],
    permitNo: null, requiresPermit: false, downtimeMinutes: 710,
    verifiedBy: 'V. Ramesh', verifiedOn: d(211), closedOn: d(210),
    isRework: false, reworkOfDocNo: null,
    remarks: 'Root cause was oil contamination — see the RCA on BRK/26-27/0004.',
    version: 9,
  },

  // ── Overdue preventive: the oven quarterly ────────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0112', woType: 'PREVENTIVE', priority: 'HIGH',
    assetCode: 'MC-OVEN-01', assetName: 'Curing Oven', sourceDocNo: 'PM-OVEN-QTR',
    title: 'Curing oven — quarterly service',
    description: 'Preventive maintenance per plan PM-OVEN-QTR.',
    raisedBy: 'System', raisedOn: d(25), supervisor: 'V. Ramesh',
    plannedStart: d(22), plannedFinish: d(20), actualStart: null, actualFinish: null,
    status: 'ASSIGNED',
    labour: [labour('TEC-02', 'S. Prabhakaran', 0, 340)],
    spares: [], externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Isolate and lock out the oven'),
      cl(2, 'Test the resistance of every heating element', { capture: 'READING', uom: 'Ω' }),
      cl(3, 'Inspect the circulation fan and bearings', { capture: 'PASS_FAIL' }),
      cl(4, 'Verify the temperature controller against a reference', { capture: 'READING', uom: '°C' }),
      cl(5, 'Check the door seals and insulation', { capture: 'PASS_FAIL' }),
      cl(6, 'Run a temperature uniformity survey', { capture: 'READING', uom: '°C' }),
    ],
    permitNo: null, requiresPermit: true, downtimeMinutes: 0,
    verifiedBy: null, verifiedOn: null, closedOn: null,
    isRework: false, reworkOfDocNo: null,
    remarks: 'Deferred twice for production. The zone 2 failure happened before it was done.',
    version: 3,
  },

  // ── Planned preventive: compressor monthly ────────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0118', woType: 'PREVENTIVE', priority: 'MEDIUM',
    assetCode: 'UT-COMP-01', assetName: 'Screw Air Compressor #1', sourceDocNo: 'PM-COMP-MTH',
    title: 'Air compressor — monthly service',
    description: 'Preventive maintenance per plan PM-COMP-MTH.',
    raisedBy: 'System', raisedOn: d(3), supervisor: 'V. Ramesh',
    plannedStart: ahead(1), plannedFinish: ahead(2), actualStart: null, actualFinish: null,
    status: 'PLANNED',
    labour: [], spares: [], externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Check and record the oil level', { capture: 'READING', uom: '%' }),
      cl(2, 'Clean or replace the air filter'),
      cl(3, 'Drain the condensate from the receiver'),
      cl(4, 'Record discharge pressure and temperature', { capture: 'READING', uom: 'bar' }),
      cl(5, 'Check for air leaks across the header', { capture: 'PASS_FAIL' }),
      cl(6, 'Verify the safety valve operation', { capture: 'PASS_FAIL' }),
    ],
    permitNo: null, requiresPermit: false, downtimeMinutes: 0,
    verifiedBy: null, verifiedOn: null, closedOn: null,
    isRework: false, reworkOfDocNo: null, remarks: '', version: 1,
  },

  // ── Corrective, and a rework of it ────────────────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0095', woType: 'CORRECTIVE', priority: 'MEDIUM',
    assetCode: 'MC-CONV-01', assetName: 'Assembly Conveyor', sourceDocNo: '',
    title: 'Conveyor belt tracking correction',
    description: 'Belt drifting to the drive side and fouling the guard.',
    raisedBy: 'Line supervisor', raisedOn: d(74), supervisor: 'V. Ramesh',
    plannedStart: d(73), plannedFinish: d(73), actualStart: t(73, 9, 0), actualFinish: t(73, 12, 30),
    status: 'CLOSED',
    labour: [labour('TEC-03', 'M. Arulmozhi', 3.5, 280)],
    spares: [], externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Adjust the take-up on the drive side', { done: true }),
      cl(2, 'Verify tracking over 20 minutes of running', { done: true, capture: 'PASS_FAIL', result: 'PASS' }),
    ],
    permitNo: null, requiresPermit: false, downtimeMinutes: 210,
    verifiedBy: 'V. Ramesh', verifiedOn: d(73), closedOn: d(72),
    isRework: false, reworkOfDocNo: null,
    remarks: 'Tracking corrected by adjustment alone.',
    version: 4,
  },
  {
    uid: id('wo'), docNo: 'WO/26-27/0101', woType: 'CORRECTIVE', priority: 'MEDIUM',
    assetCode: 'MC-CONV-01', assetName: 'Assembly Conveyor', sourceDocNo: '',
    title: 'Conveyor belt tracking — recurrence',
    description: 'Same drift returned within a fortnight. Take-up bearing found worn.',
    raisedBy: 'Line supervisor', raisedOn: d(60), supervisor: 'V. Ramesh',
    plannedStart: d(59), plannedFinish: d(59), actualStart: t(59, 9, 0), actualFinish: t(59, 15, 20),
    status: 'CLOSED',
    labour: [labour('TEC-03', 'M. Arulmozhi', 6.3, 280)],
    spares: [usedSpare('SP-BRG-6309', 'Deep groove bearing 6309', 2, 'NOS', 1_840)],
    externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Replace the take-up bearings', { done: true }),
      cl(2, 'Re-align the drive pulley', { done: true }),
      cl(3, 'Verify tracking over an hour of running', { done: true, capture: 'PASS_FAIL', result: 'PASS' }),
    ],
    permitNo: null, requiresPermit: false, downtimeMinutes: 380,
    verifiedBy: 'V. Ramesh', verifiedOn: d(59), closedOn: d(58),
    isRework: true, reworkOfDocNo: 'WO/26-27/0095',
    remarks: 'The first visit treated the symptom. This one found the worn bearing behind it.',
    version: 5,
  },

  // ── Utility work order ────────────────────────────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0106', woType: 'UTILITY', priority: 'HIGH',
    assetCode: 'UT-COMP-01', assetName: 'Screw Air Compressor #1', sourceDocNo: '',
    title: 'Compressor oil separator replacement',
    description: 'Differential pressure across the separator above 1 bar. Replaced with the store spare.',
    raisedBy: 'K. Venkatesh', raisedOn: d(41), supervisor: 'V. Ramesh',
    plannedStart: d(40), plannedFinish: d(40), actualStart: t(40, 6, 0), actualFinish: t(40, 11, 30),
    status: 'CLOSED',
    labour: [labour('TEC-04', 'K. Venkatesh', 5.5, 360)],
    spares: [usedSpare('SP-CMP-SEP', 'Oil separator element — GA75', 1, 'NOS', 21_400), usedSpare('SP-CMP-OIL', 'Compressor oil Roto-Xtend — 20 L', 2, 'CAN', 12_800, 1)],
    externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Depressurise and isolate the compressor', { done: true }),
      cl(2, 'Replace the separator element', { done: true }),
      cl(3, 'Top up the oil to the sight glass mark', { done: true, capture: 'READING', uom: '%', reading: 92 }),
      cl(4, 'Run and record the discharge pressure', { done: true, capture: 'READING', uom: 'bar', reading: 7.2 }),
      cl(5, 'Confirm the differential is back to normal', { done: true, capture: 'PASS_FAIL', result: 'PASS' }),
    ],
    permitNo: null, requiresPermit: false, downtimeMinutes: 330,
    verifiedBy: 'V. Ramesh', verifiedOn: d(40), closedOn: d(39),
    isRework: false, reworkOfDocNo: null,
    remarks: 'One can of oil returned to the store unopened.',
    version: 6,
  },

  // ── Predictive, raised off a vibration trend ──────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0119', woType: 'PREDICTIVE', priority: 'HIGH',
    assetCode: 'MC-VPUMP-01', assetName: 'Vacuum Pump — Chamber #1', sourceDocNo: 'CM-VPUMP-VIB',
    title: 'Vacuum pump — vibration trending upward',
    description: 'Vibration has climbed from 2.8 to 4.1 mm/s over five rounds. Inspect the bearing before it trips.',
    raisedBy: 'Condition monitoring', raisedOn: d(1), supervisor: 'V. Ramesh',
    plannedStart: ahead(2), plannedFinish: ahead(3), actualStart: null, actualFinish: null,
    status: 'ASSIGNED',
    labour: [labour('TEC-01', 'R. Manikandan', 0, 320)],
    spares: [], externalCost: 0, externalVendor: '',
    checklist: [
      cl(1, 'Take a vibration spectrum at the drive end', { capture: 'READING', uom: 'mm/s' }),
      cl(2, 'Check the shaft alignment', { capture: 'PASS_FAIL' }),
      cl(3, 'Inspect the bearing condition', { capture: 'PASS_FAIL' }),
      cl(4, 'Sample the pump oil for wear metals', { capture: 'PASS_FAIL' }),
      cl(5, 'Record the ultimate vacuum after the work', { capture: 'READING', uom: 'mbar' }),
    ],
    permitNo: null, requiresPermit: false, downtimeMinutes: 0,
    verifiedBy: null, verifiedOn: null, closedOn: null,
    isRework: false, reworkOfDocNo: null,
    remarks: 'Caught by the trend, not by a failure. This is the module working as intended.',
    version: 2,
  },

  // ── Calibration support ───────────────────────────────
  {
    uid: id('wo'), docNo: 'WO/26-27/0116', woType: 'CALIBRATION', priority: 'MEDIUM',
    assetCode: 'MC-LEAK-01', assetName: 'Helium Leak Testing Machine', sourceDocNo: 'PM-LEAK-CAL',
    title: 'Leak tester — half-yearly calibration',
    description: 'Release to the agency and verify against the calibrated leak standard on return.',
    raisedBy: 'System', raisedOn: d(8), supervisor: 'V. Ramesh',
    plannedStart: d(6), plannedFinish: ahead(4), actualStart: t(6, 10, 0), actualFinish: null,
    status: 'IN_PROGRESS',
    labour: [labour('TEC-05', 'A. Dhanasekar', 1.5, 420)],
    spares: [], externalCost: 24_500, externalVendor: 'Nabl Calibration Services',
    checklist: [
      cl(1, 'Release the instrument to the calibration agency', { done: true }),
      cl(2, 'Verify against the calibrated leak standard on return', { capture: 'READING', uom: 'mbar·l/s' }),
      cl(3, 'Update the calibration record in Quality'),
      cl(4, 'Confirm the instrument is released for inspection use', { capture: 'PASS_FAIL' }),
    ],
    permitNo: null, requiresPermit: false, downtimeMinutes: 0,
    verifiedBy: null, verifiedOn: null, closedOn: null,
    isRework: false, reworkOfDocNo: null,
    remarks: 'Quality has blocked leak inspections until this returns.',
    version: 3,
  },
]

/* ═══════════════════════ Breakdowns ═══════════════════════ */

export const breakdowns: Breakdown[] = [
  {
    uid: id('brk'), docNo: 'BRK/26-27/0007', assetCode: 'MC-OVEN-01', assetName: 'Curing Oven',
    reportedBy: 'Coating line operator', reportedAt: t(2, 7, 15),
    category: 'ELECTRICAL', priority: 'CRITICAL',
    symptoms: 'Zone 2 not reaching the 200 °C setpoint. Coating coming out under-cured and failing the cross-hatch adhesion test.',
    immediateAction: 'Oven stopped, coated stock quarantined, line switched to the single-zone recipe at reduced throughput.',
    productionOrderNo: 'PRD/26-27/0141',
    downtimeStart: t(2, 7, 15), downtimeEnd: null, responseMinutes: 25,
    rootCause: '', causeCategory: null, correctiveAction: '', preventiveAction: '',
    workOrderNo: 'WO/26-27/0114', status: 'UNDER_REPAIR',
    verifiedBy: null, closedOn: null,
    remarks: 'Waiting on heating elements. Store carries none — the minimum was set to three but stock is nil.',
    version: 4,
  },
  {
    uid: id('brk'), docNo: 'BRK/26-27/0004', assetCode: 'SUB-HYD-01', assetName: 'Hydraulic Power Unit — Press #1',
    reportedBy: 'Press operator', reportedAt: t(212, 14, 5),
    category: 'HYDRAULIC', priority: 'CRITICAL',
    symptoms: 'Loud knocking from the power unit followed by a total loss of pressure. Press stopped mid-stroke.',
    immediateAction: 'Press isolated, ram propped, line switched to press #2 for the remainder of the shift.',
    productionOrderNo: 'PRD/26-27/0088',
    downtimeStart: t(212, 14, 5), downtimeEnd: t(211, 2, 0), responseMinutes: 15,
    rootCause: 'Oil contamination. The return filter had been in service 2.5 times its interval because the 500-hour plan was being signed off without the filter actually being changed. Particle count reached ISO 22/20/17 against a 18/16/13 requirement, and the pump wore until it seized.',
    causeCategory: 'HYDRAULIC',
    correctiveAction: 'Pump replaced, reservoir flushed, both filters renewed, oil sampled and confirmed at ISO 17/15/12.',
    preventiveAction: 'Filter change made a mandatory checklist line with the old element photographed as evidence. Oil sampling added to the 500-hour plan.',
    workOrderNo: 'WO/26-27/0071', status: 'CLOSED',
    verifiedBy: 'V. Ramesh', closedOn: d(210),
    remarks: 'The most expensive failure of the year, and entirely preventable.',
    version: 11,
  },
  {
    uid: id('brk'), docNo: 'BRK/26-27/0005', assetCode: 'MC-VAC-01', assetName: 'Vacuum Chamber',
    reportedBy: 'Vacuum line operator', reportedAt: t(96, 11, 30),
    category: 'MECHANICAL', priority: 'HIGH',
    symptoms: 'Chamber failing to hold vacuum below 2 mbar. Cycle time doubled and bottles failing the thermal retention test.',
    immediateAction: 'Chamber taken out of service; production diverted to the second chamber.',
    productionOrderNo: 'PRD/26-27/0112',
    downtimeStart: t(96, 11, 30), downtimeEnd: t(96, 19, 45), responseMinutes: 20,
    rootCause: 'Door seal perished at the hinge side. The seal had been in service 14 months against a 12-month replacement interval.',
    causeCategory: 'MECHANICAL',
    correctiveAction: 'Door seal replaced and the chamber re-validated at 0.08 mbar.',
    preventiveAction: 'Seal replacement added to the annual shutdown task list with the store minimum raised from one to two.',
    workOrderNo: null, status: 'CLOSED',
    verifiedBy: 'V. Ramesh', closedOn: d(94),
    remarks: '',
    version: 7,
  },
  {
    uid: id('brk'), docNo: 'BRK/26-27/0006', assetCode: 'MC-TRIM-01', assetName: 'Trimming Machine',
    reportedBy: 'Trim operator', reportedAt: t(45, 15, 10),
    category: 'TOOLING', priority: 'MEDIUM',
    symptoms: 'Ragged trim edge and burr height above tolerance.',
    immediateAction: 'Machine stopped and the affected batch held for rework.',
    productionOrderNo: 'PRD/26-27/0126',
    downtimeStart: t(45, 15, 10), downtimeEnd: t(45, 18, 20), responseMinutes: 35,
    rootCause: 'Trim blade set worn past its regrind limit. The cycle counter had not been reset after the previous change, so the wear was not visible on the schedule.',
    causeCategory: 'TOOLING',
    correctiveAction: 'Blade set replaced and the cycle counter reset.',
    preventiveAction: 'Counter reset made a mandatory step on the blade change instruction.',
    workOrderNo: null, status: 'CLOSED',
    verifiedBy: 'V. Ramesh', closedOn: d(44),
    remarks: '',
    version: 5,
  },
  {
    uid: id('brk'), docNo: 'BRK/26-27/0008', assetCode: 'UT-COMP-01', assetName: 'Screw Air Compressor #1',
    reportedBy: 'K. Venkatesh', reportedAt: t(18, 4, 40),
    category: 'UTILITY', priority: 'HIGH',
    symptoms: 'Compressor tripping on high discharge temperature. Plant air pressure fell to 5.2 bar and the pneumatic actuators on the assembly line became sluggish.',
    immediateAction: 'Cooler cleaned and the compressor restarted at reduced load while the cause was found.',
    productionOrderNo: '',
    downtimeStart: t(18, 4, 40), downtimeEnd: t(18, 7, 25), responseMinutes: 12,
    rootCause: 'Oil cooler fouled with powder-coating dust drawn in through the utility block louvres.',
    causeCategory: 'UTILITY',
    correctiveAction: 'Cooler cleaned and intake filters replaced.',
    preventiveAction: 'Intake louvre filters added to the monthly plan, and the utility block intake relocated away from the booth exhaust in the annual shutdown scope.',
    workOrderNo: null, status: 'CLOSED',
    verifiedBy: 'V. Ramesh', closedOn: d(17),
    remarks: '',
    version: 6,
  },
  {
    uid: id('brk'), docNo: 'BRK/26-27/0009', assetCode: 'MC-PRESS-01', assetName: 'Hydraulic Deep Drawing Press #1',
    reportedBy: 'Press operator', reportedAt: t(9, 22, 5),
    category: 'ELECTRONIC', priority: 'HIGH',
    symptoms: 'Light curtain fault on the PLC, press refusing to cycle.',
    immediateAction: 'Press stopped. Fault code E-114 logged on the PLC.',
    productionOrderNo: 'PRD/26-27/0138',
    downtimeStart: t(9, 22, 5), downtimeEnd: t(9, 23, 50), responseMinutes: 18,
    rootCause: 'Light curtain receiver connector loose after the die change; vibration finished the job.',
    causeCategory: 'ELECTRONIC',
    correctiveAction: 'Connector re-seated and locked; the interlock chain was function-tested.',
    preventiveAction: 'Interlock function test added to the die change SOP.',
    workOrderNo: null, status: 'CLOSED',
    verifiedBy: 'V. Ramesh', closedOn: d(9),
    remarks: 'Short outage but a safety interlock, so it was treated as critical until proven.',
    version: 4,
  },
]

/* ═══════════════════════ Condition monitoring ═══════════════════════ */

export const conditionPoints: ConditionPoint[] = [
  { uid: 'cp-vpump-vib', assetCode: 'MC-VPUMP-01', assetName: 'Vacuum Pump — Chamber #1', parameter: 'VIBRATION', uom: 'mm/s', warnLow: null, warnHigh: 3.5, tripLow: null, tripHigh: 4.5, isActive: true, version: 1 },
  { uid: 'cp-vpump-temp', assetCode: 'MC-VPUMP-01', assetName: 'Vacuum Pump — Chamber #1', parameter: 'TEMPERATURE', uom: '°C', warnLow: null, warnHigh: 75, tripLow: null, tripHigh: 85, isActive: true, version: 1 },
  { uid: 'cp-press-oil', assetCode: 'MC-PRESS-01', assetName: 'Hydraulic Deep Drawing Press #1', parameter: 'OIL_QUALITY', uom: 'ISO code', warnLow: null, warnHigh: 19, tripLow: null, tripHigh: 21, isActive: true, version: 1 },
  { uid: 'cp-press-temp', assetCode: 'MC-PRESS-01', assetName: 'Hydraulic Deep Drawing Press #1', parameter: 'TEMPERATURE', uom: '°C', warnLow: null, warnHigh: 60, tripLow: null, tripHigh: 70, isActive: true, version: 1 },
  { uid: 'cp-comp-curr', assetCode: 'UT-COMP-01', assetName: 'Screw Air Compressor #1', parameter: 'CURRENT', uom: 'A', warnLow: null, warnHigh: 128, tripLow: null, tripHigh: 140, isActive: true, version: 1 },
  { uid: 'cp-comp-press', assetCode: 'UT-COMP-01', assetName: 'Screw Air Compressor #1', parameter: 'PRESSURE', uom: 'bar', warnLow: 6.2, warnHigh: 7.8, tripLow: 5.5, tripHigh: 8.5, isActive: true, version: 1 },
  { uid: 'cp-chil-temp', assetCode: 'UT-CHIL-01', assetName: 'Process Chiller', parameter: 'TEMPERATURE', uom: '°C', warnLow: 6, warnHigh: 12, tripLow: 4, tripHigh: 15, isActive: true, version: 1 },
  { uid: 'cp-neck-vib', assetCode: 'MC-NECK-01', assetName: 'Neck Forming Machine', parameter: 'VIBRATION', uom: 'mm/s', warnLow: null, warnHigh: 4.0, tripLow: null, tripHigh: 5.5, isActive: true, version: 1 },
]

/** Readings on a weekly round. The vacuum pump trend is the one that matters. */
const reading = (pointUid: string, assetCode: string, parameter: ConditionPoint['parameter'], daysAgo: number, value: number, remarks = ''): ConditionReading => ({
  uid: id('crd'), pointUid, assetCode, parameter, readAt: t(daysAgo, 10, 0), value, readBy: 'K. Venkatesh', remarks, version: 1,
})

export const conditionReadings: ConditionReading[] = [
  // Vacuum pump vibration — a clean upward trend that has crossed the warning.
  reading('cp-vpump-vib', 'MC-VPUMP-01', 'VIBRATION', 29, 2.8),
  reading('cp-vpump-vib', 'MC-VPUMP-01', 'VIBRATION', 22, 3.1),
  reading('cp-vpump-vib', 'MC-VPUMP-01', 'VIBRATION', 15, 3.4),
  reading('cp-vpump-vib', 'MC-VPUMP-01', 'VIBRATION', 8, 3.8, 'Above the warning limit. Work order raised.'),
  reading('cp-vpump-vib', 'MC-VPUMP-01', 'VIBRATION', 1, 4.1, 'Still climbing. Bearing inspection scheduled.'),

  reading('cp-vpump-temp', 'MC-VPUMP-01', 'TEMPERATURE', 29, 62),
  reading('cp-vpump-temp', 'MC-VPUMP-01', 'TEMPERATURE', 22, 64),
  reading('cp-vpump-temp', 'MC-VPUMP-01', 'TEMPERATURE', 15, 65),
  reading('cp-vpump-temp', 'MC-VPUMP-01', 'TEMPERATURE', 8, 67),
  reading('cp-vpump-temp', 'MC-VPUMP-01', 'TEMPERATURE', 1, 68),

  // Press oil cleanliness — improved sharply after the pump failure RCA.
  reading('cp-press-oil', 'MC-PRESS-01', 'OIL_QUALITY', 90, 20, 'Before the filter discipline was fixed.'),
  reading('cp-press-oil', 'MC-PRESS-01', 'OIL_QUALITY', 60, 18),
  reading('cp-press-oil', 'MC-PRESS-01', 'OIL_QUALITY', 30, 17),
  reading('cp-press-oil', 'MC-PRESS-01', 'OIL_QUALITY', 2, 17, 'Holding inside the target band.'),

  reading('cp-press-temp', 'MC-PRESS-01', 'TEMPERATURE', 22, 51),
  reading('cp-press-temp', 'MC-PRESS-01', 'TEMPERATURE', 15, 52),
  reading('cp-press-temp', 'MC-PRESS-01', 'TEMPERATURE', 8, 53),
  reading('cp-press-temp', 'MC-PRESS-01', 'TEMPERATURE', 1, 52),

  // Compressor current — spiked at the trip during the fouled-cooler event.
  reading('cp-comp-curr', 'UT-COMP-01', 'CURRENT', 29, 118),
  reading('cp-comp-curr', 'UT-COMP-01', 'CURRENT', 22, 124),
  reading('cp-comp-curr', 'UT-COMP-01', 'CURRENT', 18, 143, 'Tripped on high discharge temperature — see BRK/26-27/0008.'),
  reading('cp-comp-curr', 'UT-COMP-01', 'CURRENT', 15, 119, 'Back to normal after the cooler was cleaned.'),
  reading('cp-comp-curr', 'UT-COMP-01', 'CURRENT', 8, 117),
  reading('cp-comp-curr', 'UT-COMP-01', 'CURRENT', 1, 116),

  reading('cp-comp-press', 'UT-COMP-01', 'PRESSURE', 15, 7.1),
  reading('cp-comp-press', 'UT-COMP-01', 'PRESSURE', 8, 7.2),
  reading('cp-comp-press', 'UT-COMP-01', 'PRESSURE', 1, 7.2),

  reading('cp-chil-temp', 'UT-CHIL-01', 'TEMPERATURE', 15, 8.5),
  reading('cp-chil-temp', 'UT-CHIL-01', 'TEMPERATURE', 8, 9.0),
  reading('cp-chil-temp', 'UT-CHIL-01', 'TEMPERATURE', 1, 9.2),

  reading('cp-neck-vib', 'MC-NECK-01', 'VIBRATION', 22, 2.2),
  reading('cp-neck-vib', 'MC-NECK-01', 'VIBRATION', 15, 2.3),
  reading('cp-neck-vib', 'MC-NECK-01', 'VIBRATION', 8, 2.2),
  reading('cp-neck-vib', 'MC-NECK-01', 'VIBRATION', 1, 2.4),
]

/* ═══════════════════════ Spare transactions ═══════════════════════ */

export const spareTxns: SpareTxn[] = [
  { uid: id('stx'), docNo: 'SI/26-27/0311', txnType: 'ISSUE', itemCode: 'SP-HYD-FILT', itemName: 'Return line filter element', qty: 1, uom: 'NOS', workOrderNo: 'WO/26-27/0109', assetCode: 'MC-PRESS-01', txnAt: t(29, 7, 0), byWhom: 'Store — Ravi', remarks: '', version: 1 },
  { uid: id('stx'), docNo: 'SI/26-27/0298', txnType: 'ISSUE', itemCode: 'SP-HYD-PUMP', itemName: 'Piston pump A90-FR04', qty: 1, uom: 'NOS', workOrderNo: 'WO/26-27/0071', assetCode: 'SUB-HYD-01', txnAt: t(212, 15, 30), byWhom: 'Store — Ravi', remarks: 'Emergency issue at night. The only pump in stock.', version: 1 },
  { uid: id('stx'), docNo: 'SI/26-27/0299', txnType: 'ISSUE', itemCode: 'SP-HYD-FILT', itemName: 'Return line filter element', qty: 2, uom: 'NOS', workOrderNo: 'WO/26-27/0071', assetCode: 'SUB-HYD-01', txnAt: t(212, 15, 35), byWhom: 'Store — Ravi', remarks: '', version: 1 },
  { uid: id('stx'), docNo: 'SR/26-27/0044', txnType: 'RECEIPT', itemCode: 'SP-HYD-PUMP', itemName: 'Piston pump A90-FR04', qty: 1, uom: 'NOS', workOrderNo: '', assetCode: '', txnAt: t(160, 11, 0), byWhom: 'Store — Ravi', remarks: 'Replenishment against PO/26-27/0412.', version: 1 },
  { uid: id('stx'), docNo: 'SI/26-27/0305', txnType: 'ISSUE', itemCode: 'SP-CMP-SEP', itemName: 'Oil separator element — GA75', qty: 1, uom: 'NOS', workOrderNo: 'WO/26-27/0106', assetCode: 'UT-COMP-01', txnAt: t(40, 6, 15), byWhom: 'Store — Ravi', remarks: '', version: 1 },
  { uid: id('stx'), docNo: 'SI/26-27/0306', txnType: 'ISSUE', itemCode: 'SP-CMP-OIL', itemName: 'Compressor oil Roto-Xtend — 20 L', qty: 2, uom: 'CAN', workOrderNo: 'WO/26-27/0106', assetCode: 'UT-COMP-01', txnAt: t(40, 6, 20), byWhom: 'Store — Ravi', remarks: '', version: 1 },
  { uid: id('stx'), docNo: 'SRT/26-27/0018', txnType: 'RETURN', itemCode: 'SP-CMP-OIL', itemName: 'Compressor oil Roto-Xtend — 20 L', qty: 1, uom: 'CAN', workOrderNo: 'WO/26-27/0106', assetCode: 'UT-COMP-01', txnAt: t(40, 12, 0), byWhom: 'K. Venkatesh', remarks: 'One can unopened, returned to the store.', version: 1 },
  { uid: id('stx'), docNo: 'SI/26-27/0302', txnType: 'ISSUE', itemCode: 'SP-BRG-6309', itemName: 'Deep groove bearing 6309', qty: 2, uom: 'NOS', workOrderNo: 'WO/26-27/0101', assetCode: 'MC-CONV-01', txnAt: t(59, 9, 30), byWhom: 'Store — Ravi', remarks: '', version: 1 },
  { uid: id('stx'), docNo: 'SV/26-27/0071', txnType: 'RESERVE', itemCode: 'SP-HYD-SEAL', itemName: 'Ram seal kit — HDP-250T', qty: 1, uom: 'NOS', workOrderNo: 'WO/26-27/0112', assetCode: 'MC-PRESS-01', txnAt: t(20, 10, 0), byWhom: 'V. Ramesh', remarks: 'Held for the front ram seal flagged at the last service.', version: 1 },
  { uid: id('stx'), docNo: 'SV/26-27/0074', txnType: 'RESERVE', itemCode: 'SP-VAC-SEAL', itemName: 'Chamber door seal', qty: 1, uom: 'NOS', workOrderNo: '', assetCode: 'MC-VAC-01', txnAt: t(10, 10, 0), byWhom: 'V. Ramesh', remarks: 'Reserved for the annual shutdown.', version: 1 },
  { uid: id('stx'), docNo: 'SS/26-27/0009', txnType: 'SCRAP', itemCode: 'SP-TRM-BLADE', itemName: 'Trim blade set', qty: 1, uom: 'NOS', workOrderNo: '', assetCode: 'MC-TRIM-01', txnAt: t(44, 14, 0), byWhom: 'M. Arulmozhi', remarks: 'Worn past the regrind limit — see BRK/26-27/0006.', version: 1 },
]

/* ═══════════════════════ Utility logs ═══════════════════════ */

/**
 * Thirty days of utility readings. The compressor's specific energy worsens
 * around the fouled-cooler event and recovers after it, which is the pattern
 * the efficiency screen is meant to surface.
 */
function buildUtilityLogs(): UtilityLog[] {
  const out: UtilityLog[] = []
  for (let i = 29; i >= 0; i--) {
    const fouling = i >= 15 && i <= 20 ? 1 + (21 - i) * 0.02 : 1
    const compHours = i === 18 ? 21.1 : 23.5
    const compOutput = Math.round((1180 - (i % 5) * 8) * (i === 18 ? 0.86 : 1))
    out.push({
      uid: id('utl'), assetCode: 'UT-COMP-01', assetName: 'Screw Air Compressor #1', logDate: d(i),
      runningHours: compHours,
      energyKwh: Math.round(compHours * 62 * fouling),
      fuelLitres: 0,
      output: compOutput, outputUom: 'm³',
      downtimeMinutes: i === 18 ? 165 : 0,
      remarks: i === 18 ? 'Tripped on high discharge temperature — BRK/26-27/0008.' : '',
      version: 1,
    })
    out.push({
      uid: id('utl'), assetCode: 'UT-CHIL-01', assetName: 'Process Chiller', logDate: d(i),
      runningHours: 20.5,
      energyKwh: Math.round(20.5 * 41 + (i % 4) * 6),
      fuelLitres: 0,
      output: 780 - (i % 3) * 10, outputUom: 'TR·h',
      downtimeMinutes: 0, remarks: '', version: 1,
    })
    // The DG runs only on the monthly load test and during the grid outage.
    const dgRuns = i === 12 || i === 24 || i === 6
    out.push({
      uid: id('utl'), assetCode: 'UT-DG-01', assetName: 'Diesel Generator 500 kVA', logDate: d(i),
      runningHours: dgRuns ? (i === 6 ? 4.2 : 0.5) : 0,
      energyKwh: dgRuns ? Math.round((i === 6 ? 4.2 : 0.5) * 320) : 0,
      fuelLitres: dgRuns ? Math.round((i === 6 ? 4.2 : 0.5) * 92) : 0,
      output: dgRuns ? Math.round((i === 6 ? 4.2 : 0.5) * 320) : 0, outputUom: 'kWh',
      downtimeMinutes: 0,
      remarks: i === 6 ? 'Grid outage — ran on load for four hours.' : dgRuns ? 'Monthly load test.' : '',
      version: 1,
    })
    out.push({
      uid: id('utl'), assetCode: 'UT-RO-01', assetName: 'RO Water Treatment Plant', logDate: d(i),
      runningHours: 12, energyKwh: Math.round(12 * 9.5), fuelLitres: 0,
      output: 4_800 - (i % 6) * 40, outputUom: 'L',
      downtimeMinutes: 0, remarks: '', version: 1,
    })
  }
  return out
}

export const utilityLogs: UtilityLog[] = buildUtilityLogs()

/* ═══════════════════════ Shutdowns ═══════════════════════ */

export const shutdowns: Shutdown[] = [
  {
    uid: id('sd'), docNo: 'SHD/26-27/0002', shutdownType: 'ANNUAL',
    title: 'Annual plant shutdown 2026', plant: 'PLANT-01',
    scope: 'Whole plant. Major overhauls on the press, vacuum chamber and utility block; statutory electrical testing; relocation of the utility block air intake away from the coating booth exhaust.',
    plannedStart: ahead(24), plannedEnd: ahead(31),
    actualStart: null, actualEnd: null, status: 'APPROVED',
    contractors: ['Isgec Service', 'Sree Fabrication Works', 'Voltas Service', 'Chennai Electricals'],
    budgetedCost: 2_840_000, actualCost: 0, coordinator: 'V. Ramesh',
    tasks: [
      { uid: id('sdt'), seq: 1, description: 'Plant-wide electrical isolation and permit issue', assetCode: 'UT-PANEL-01', owner: 'S. Prabhakaran', contractor: '', plannedHours: 6, actualHours: null, dependsOnSeq: [], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 2, description: 'Press #1 — full hydraulic overhaul and seal replacement', assetCode: 'MC-PRESS-01', owner: 'R. Manikandan', contractor: 'Isgec Service', plannedHours: 48, actualHours: null, dependsOnSeq: [1], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 3, description: 'Press #1 — die cushion inspection and re-shim', assetCode: 'MC-PRESS-01', owner: 'M. Arulmozhi', contractor: 'Isgec Service', plannedHours: 16, actualHours: null, dependsOnSeq: [2], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 4, description: 'Vacuum chamber — door seal replacement and re-validation', assetCode: 'MC-VAC-01', owner: 'R. Manikandan', contractor: '', plannedHours: 12, actualHours: null, dependsOnSeq: [1], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 5, description: 'Vacuum pump — rotor vane replacement', assetCode: 'MC-VPUMP-01', owner: 'R. Manikandan', contractor: '', plannedHours: 10, actualHours: null, dependsOnSeq: [4], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 6, description: 'Utility block — relocate the compressor air intake', assetCode: 'UT-COMP-01', owner: 'K. Venkatesh', contractor: 'Sree Fabrication Works', plannedHours: 32, actualHours: null, dependsOnSeq: [1], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 7, description: 'Chiller — condenser descaling and refrigerant top-up', assetCode: 'UT-CHIL-01', owner: 'K. Venkatesh', contractor: 'Voltas Service', plannedHours: 14, actualHours: null, dependsOnSeq: [1], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 8, description: 'LT panel — thermography and statutory testing', assetCode: 'UT-PANEL-01', owner: 'S. Prabhakaran', contractor: 'Chennai Electricals', plannedHours: 20, actualHours: null, dependsOnSeq: [1], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 9, description: 'Curing oven — replace all zone 2 and zone 3 elements', assetCode: 'MC-OVEN-01', owner: 'S. Prabhakaran', contractor: '', plannedHours: 18, actualHours: null, dependsOnSeq: [1], status: 'PENDING', permitNo: null },
      { uid: id('sdt'), seq: 10, description: 'Restore isolations, test run every line, hand back to production', assetCode: 'PLANT-01', owner: 'V. Ramesh', contractor: '', plannedHours: 12, actualHours: null, dependsOnSeq: [3, 5, 6, 7, 8, 9], status: 'PENDING', permitNo: null },
    ],
    remarks: 'Critical path runs through the press overhaul: isolation, overhaul, die cushion, handback.',
    version: 3,
  },
  {
    uid: id('sd'), docNo: 'SHD/26-27/0001', shutdownType: 'LINE',
    title: 'Finishing line — coating booth deep clean', plant: 'PLANT-01',
    scope: 'Coating booth, cyclone recovery and curing oven. Deep clean and filter replacement.',
    plannedStart: d(68), plannedEnd: d(66),
    actualStart: t(68, 6, 0), actualEnd: t(66, 18, 0), status: 'COMPLETED',
    contractors: ['Statfield Systems'],
    budgetedCost: 340_000, actualCost: 386_500, coordinator: 'V. Ramesh',
    tasks: [
      { uid: id('sdt'), seq: 1, description: 'Isolate the booth and the oven', assetCode: 'MC-COAT-01', owner: 'S. Prabhakaran', contractor: '', plannedHours: 3, actualHours: 3.5, dependsOnSeq: [], status: 'DONE', permitNo: null },
      { uid: id('sdt'), seq: 2, description: 'Strip and clean the powder recovery cyclone', assetCode: 'MC-COAT-01', owner: 'M. Arulmozhi', contractor: 'Statfield Systems', plannedHours: 16, actualHours: 21, dependsOnSeq: [1], status: 'DONE', permitNo: null },
      { uid: id('sdt'), seq: 3, description: 'Replace the booth filter cartridges', assetCode: 'MC-COAT-01', owner: 'M. Arulmozhi', contractor: '', plannedHours: 6, actualHours: 6, dependsOnSeq: [2], status: 'DONE', permitNo: null },
      { uid: id('sdt'), seq: 4, description: 'Oven — clean the circulation ducting', assetCode: 'MC-OVEN-01', owner: 'S. Prabhakaran', contractor: '', plannedHours: 8, actualHours: 9.5, dependsOnSeq: [1], status: 'DONE', permitNo: null },
      { uid: id('sdt'), seq: 5, description: 'Restore and run a trial batch', assetCode: 'LINE-FIN', owner: 'V. Ramesh', contractor: '', plannedHours: 4, actualHours: 5, dependsOnSeq: [3, 4], status: 'DONE', permitNo: null },
    ],
    remarks: 'Overran by 14% on cost — the cyclone was fouled far worse than expected, which is what led to the intake relocation being put into the annual scope.',
    version: 8,
  },
]

/* ═══════════════════════ Dashboard trend ═══════════════════════ */

export const maintenanceTrend = [
  { month: 'Feb', downtimeHours: 41.2, mtbfHours: 268, mttrHours: 3.4, pmCompliancePct: 84, cost: 486_000 },
  { month: 'Mar', downtimeHours: 34.8, mtbfHours: 312, mttrHours: 3.1, pmCompliancePct: 88, cost: 452_000 },
  { month: 'Apr', downtimeHours: 52.6, mtbfHours: 214, mttrHours: 4.2, pmCompliancePct: 76, cost: 694_000 },
  { month: 'May', downtimeHours: 28.4, mtbfHours: 386, mttrHours: 2.8, pmCompliancePct: 92, cost: 418_000 },
  { month: 'Jun', downtimeHours: 22.1, mtbfHours: 428, mttrHours: 2.6, pmCompliancePct: 95, cost: 396_000 },
  { month: 'Jul', downtimeHours: 36.9, mtbfHours: 296, mttrHours: 3.5, pmCompliancePct: 81, cost: 574_000 },
]
