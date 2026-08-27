/**
 * Shop-floor demonstration data — the same Chennai bottle plant, one working
 * day in FY 2026-27. The numbers tie together: a work order's produced quantity
 * is the sum of its production entries, scrap on the entries matches the scrap
 * register, and the OEE figures follow from the machine run and down minutes.
 */

import { daysAgo } from './data'
import type {
  DowntimeEvent,
  HourlyOutput,
  Machine,
  OeePoint,
  OperatorStat,
  ProductionEntry,
  ProductionOrder,
  ReworkOrder,
  ScrapRecord,
  ShiftLog,
  TravellerStep,
  WipLot,
  WorkInstruction,
  WorkOrder,
} from '@/types/mes'

const d = (n: number) => daysAgo(n).slice(0, 10)
const at = (n: number, h: number) => daysAgo(n, h)

/* ══════════════════════ The 24-operation bottle route ═════════════════════ */

export const ROUTE_STEPS = [
  'Coil cutting',
  'Deep drawing — inner shell',
  'Deep drawing — outer shell',
  'Trimming',
  'Neck forming',
  'Bottom disc preparation',
  'Bottom welding',
  'Vacuum chamber loading',
  'Vacuum creation & sealing',
  'Leak test',
  'Surface polishing',
  'Powder coating',
  'Oven curing',
  'Laser marking',
  'Logo inspection',
  'Lid assembly',
  'Bottle assembly',
  'Cleaning',
  'Final quality inspection',
  'Packaging',
  'Carton packing',
  'Palletising',
]

/* ═══════════════════════════ Production orders ════════════════════════════ */

export const productionOrders: ProductionOrder[] = [
  {
    uid: 'po-01', docNo: 'PRD/2607/0121', docDate: d(2), status: 'IN_PROGRESS', plant: 'Chennai — Unit 1', line: 'Line 1',
    itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', bomRevision: 'R4', routingRevision: 'R2',
    plannedQty: 8_000, producedQty: 4_860, scrapQty: 184, reworkQty: 96, uom: 'NOS', batchNo: 'B2607031',
    salesOrderNo: 'SO/26-27/00224', customer: 'Gift Bazaar Retail',
    plannedStart: d(2), plannedEnd: d(-3), actualStart: at(2, 6), actualEnd: null, priority: 'HIGH',
    materialReady: true, machineReady: true, toolingReady: true, manpowerReady: true,
    releasedBy: 'A. Lakshmi', releasedAt: at(2, 6), createdBy: 'A. Lakshmi', createdAt: at(3, 10), version: 3,
  },
  {
    uid: 'po-02', docNo: 'PRD/2607/0119', docDate: d(8), status: 'COMPLETED', plant: 'Chennai — Unit 1', line: 'Line 1',
    itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', bomRevision: 'R4', routingRevision: 'R2',
    plannedQty: 5_000, producedQty: 4_860, scrapQty: 140, reworkQty: 0, uom: 'NOS', batchNo: 'B2607021',
    salesOrderNo: 'SO/26-27/00219', customer: 'Metro Retail',
    plannedStart: d(8), plannedEnd: d(3), actualStart: at(8, 6), actualEnd: at(3, 18), priority: 'NORMAL',
    materialReady: true, machineReady: true, toolingReady: true, manpowerReady: true,
    releasedBy: 'A. Lakshmi', releasedAt: at(8, 6), createdBy: 'A. Lakshmi', createdAt: at(9, 11), version: 5,
  },
  {
    uid: 'po-03', docNo: 'PRD/2608/0009', docDate: d(0), status: 'RELEASED', plant: 'Chennai — Unit 1', line: 'Line 2',
    itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', bomRevision: 'R2', routingRevision: 'R2',
    plannedQty: 3_000, producedQty: 0, scrapQty: 0, reworkQty: 0, uom: 'NOS', batchNo: null,
    salesOrderNo: 'SO/26-27/00226', customer: 'Corporate Gifting Co',
    plannedStart: d(-1), plannedEnd: d(-6), actualStart: null, actualEnd: null, priority: 'URGENT',
    materialReady: true, machineReady: true, toolingReady: true, manpowerReady: false,
    releasedBy: 'A. Lakshmi', releasedAt: at(0, 8), createdBy: 'A. Lakshmi', createdAt: at(1, 9), version: 2,
    remarks: 'Two operators short on Line 2 — assembly may run one shift late.',
  },
  {
    uid: 'po-04', docNo: 'PRD/2608/0011', docDate: d(0), status: 'PLANNED', plant: 'Chennai — Unit 1', line: 'Line 2',
    itemCode: 'FG-SS-500-BLU', itemName: 'Vacuum Flask 500 ml — Ocean Blue', bomRevision: 'R1', routingRevision: 'R1',
    plannedQty: 2_400, producedQty: 0, scrapQty: 0, reworkQty: 0, uom: 'NOS', batchNo: null,
    salesOrderNo: null, customer: null,
    plannedStart: d(-4), plannedEnd: d(-9), actualStart: null, actualEnd: null, priority: 'NORMAL',
    materialReady: false, machineReady: true, toolingReady: false, manpowerReady: true,
    releasedBy: null, releasedAt: null, createdBy: 'A. Lakshmi', createdAt: at(0, 9), version: 1,
    remarks: 'SS 316 coil below reorder and the 500 ml draw die is out for regrinding.',
  },
  {
    uid: 'po-05', docNo: 'PRD/2607/0114', docDate: d(14), status: 'CLOSED', plant: 'Chennai — Unit 1', line: 'Line 1',
    itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', bomRevision: 'R3', routingRevision: 'R2',
    plannedQty: 14_000, producedQty: 13_564, scrapQty: 436, reworkQty: 180, uom: 'NOS', batchNo: 'B2607014',
    salesOrderNo: null, customer: null,
    plannedStart: d(14), plannedEnd: d(9), actualStart: at(14, 6), actualEnd: at(9, 17), priority: 'NORMAL',
    materialReady: true, machineReady: true, toolingReady: true, manpowerReady: true,
    releasedBy: 'A. Lakshmi', releasedAt: at(14, 6), createdBy: 'A. Lakshmi', createdAt: at(15, 10), version: 6,
  },
]

/* ════════════════════════════ Work orders ═════════════════════════════════ */

const WO_DEFS: [number, string, string, string, string | null, string | null, WorkOrder['status'], number, number, number][] = [
  [1, 'OP-10', 'Coil cutting', 'Coil Cutting', 'CUT-01', 'Slitter blade set A', 'COMPLETED', 8_120, 8_060, 60],
  [2, 'OP-20', 'Deep drawing — inner shell', 'Press Shop', 'PRESS-02', 'Draw die 750-IN', 'COMPLETED', 8_060, 7_980, 80],
  [3, 'OP-25', 'Deep drawing — outer shell', 'Press Shop', 'PRESS-03', 'Draw die 750-OUT', 'COMPLETED', 7_980, 7_920, 60],
  [4, 'OP-30', 'Trimming', 'Press Shop', 'TRIM-01', 'Trim tool 750', 'COMPLETED', 7_920, 7_890, 30],
  [5, 'OP-35', 'Neck forming', 'Press Shop', 'NECK-01', 'Neck former 68', 'COMPLETED', 7_890, 7_860, 30],
  [6, 'OP-40', 'Bottom welding', 'Welding & Vacuum', 'WELD-02', 'Weld jig 750', 'RUNNING', 7_860, 4_920, 184],
  [7, 'OP-50', 'Vacuum creation & sealing', 'Welding & Vacuum', 'VAC-01', null, 'READY', 4_920, 0, 0],
  [8, 'OP-55', 'Leak test', 'Welding & Vacuum', 'LEAK-01', null, 'QUEUED', 0, 0, 0],
  [9, 'OP-60', 'Surface polishing', 'Polishing', 'POL-02', 'Polishing wheel 6"', 'QUEUED', 0, 0, 0],
  [10, 'OP-70', 'Powder coating', 'Coating & Printing', 'COAT-01', null, 'QUEUED', 0, 0, 0],
  [11, 'OP-75', 'Oven curing', 'Coating & Printing', 'OVEN-01', null, 'QUEUED', 0, 0, 0],
  [12, 'OP-80', 'Laser marking', 'Coating & Printing', 'LASER-01', null, 'QUEUED', 0, 0, 0],
  [13, 'OP-90', 'Bottle assembly', 'Assembly', 'ASM-01', null, 'QUEUED', 0, 0, 0],
  [14, 'OP-95', 'Final quality inspection', 'Quality', null, null, 'QUEUED', 0, 0, 0],
  [15, 'OP-99', 'Carton packing', 'Packing', 'PACK-01', null, 'QUEUED', 0, 0, 0],
]

export const workOrders: WorkOrder[] = WO_DEFS.map(([seq, code, name, wc, machine, tool, status, inputQty, produced, scrap], i) => ({
  uid: `wo-${String(i + 1).padStart(2, '0')}`,
  docNo: `WO/2607/${String(1200 + i + 1)}`,
  productionOrderNo: 'PRD/2607/0121',
  itemName: 'Vacuum Flask 750 ml — Matte Black',
  sequence: seq,
  operationCode: code,
  operationName: name,
  workCentre: wc,
  machine,
  tool,
  operator: status === 'COMPLETED' || status === 'RUNNING' ? ['T. Ganesh', 'N. Selvam', 'J. Mohan', 'Anand P'][i % 4] : null,
  shift: status === 'COMPLETED' || status === 'RUNNING' ? (['A', 'B', 'A', 'C'][i % 4] as WorkOrder['shift']) : null,
  status,
  inputQty,
  plannedQty: 8_000,
  producedQty: produced,
  scrapQty: scrap,
  reworkQty: status === 'RUNNING' ? 96 : 0,
  uom: 'NOS',
  standardMinutes: 240 + seq * 8,
  setupMinutes: 30,
  actualMinutes: status === 'COMPLETED' ? 250 + seq * 9 : status === 'RUNNING' ? 148 : 0,
  plannedStart: d(2 - Math.floor(seq / 4)),
  startedAt: status === 'COMPLETED' || status === 'RUNNING' ? at(2 - Math.floor(seq / 5), 7) : null,
  completedAt: status === 'COMPLETED' ? at(2 - Math.floor(seq / 5), 15) : null,
  qcRequired: ['OP-55', 'OP-95', 'OP-40'].includes(code),
  qcResult: code === 'OP-40' ? 'PENDING' : ['OP-55', 'OP-95'].includes(code) ? 'PENDING' : 'NOT_REQUIRED',
  batchNo: 'B2607031',
}))

/* ══════════════════════════════ Machines ══════════════════════════════════ */

export const machines: Machine[] = [
  { uid: 'mc-01', code: 'CUT-01', name: 'Coil slitting line', workCentre: 'Coil Cutting', line: 'Line 1', state: 'IDLE', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 305, downMinutes: 45, idealCycleSeconds: 2.4, totalPieces: 8_120, goodPieces: 8_060, lastMaintenanceOn: d(21), nextMaintenanceOn: d(-9), calibrationDueOn: d(-40), capacityPerHour: 1_500 },
  { uid: 'mc-02', code: 'PRESS-02', name: '200T hydraulic press — inner', workCentre: 'Press Shop', line: 'Line 1', state: 'RUNNING', currentWorkOrder: 'WO/2607/1202', currentOperator: 'T. Ganesh', plannedMinutes: 480, runMinutes: 402, downMinutes: 38, idealCycleSeconds: 3.0, totalPieces: 8_060, goodPieces: 7_980, lastMaintenanceOn: d(12), nextMaintenanceOn: d(-18), calibrationDueOn: null, capacityPerHour: 1_100 },
  { uid: 'mc-03', code: 'PRESS-03', name: '200T hydraulic press — outer', workCentre: 'Press Shop', line: 'Line 1', state: 'RUNNING', currentWorkOrder: 'WO/2607/1203', currentOperator: 'N. Selvam', plannedMinutes: 480, runMinutes: 388, downMinutes: 52, idealCycleSeconds: 3.1, totalPieces: 7_980, goodPieces: 7_920, lastMaintenanceOn: d(12), nextMaintenanceOn: d(-18), calibrationDueOn: null, capacityPerHour: 1_050 },
  { uid: 'mc-04', code: 'TRIM-01', name: 'CNC trimming machine', workCentre: 'Press Shop', line: 'Line 1', state: 'IDLE', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 356, downMinutes: 24, idealCycleSeconds: 2.6, totalPieces: 7_920, goodPieces: 7_890, lastMaintenanceOn: d(30), nextMaintenanceOn: d(-2), calibrationDueOn: d(-12), capacityPerHour: 1_300 },
  { uid: 'mc-05', code: 'WELD-02', name: 'Bottom seam welder', workCentre: 'Welding & Vacuum', line: 'Line 1', state: 'RUNNING', currentWorkOrder: 'WO/2607/1206', currentOperator: 'J. Mohan', plannedMinutes: 480, runMinutes: 296, downMinutes: 96, idealCycleSeconds: 4.2, totalPieces: 5_104, goodPieces: 4_920, lastMaintenanceOn: d(8), nextMaintenanceOn: d(-22), calibrationDueOn: d(-5), capacityPerHour: 780 },
  { uid: 'mc-06', code: 'VAC-01', name: 'Vacuum chamber 1', workCentre: 'Welding & Vacuum', line: 'Line 1', state: 'SETUP', currentWorkOrder: 'WO/2607/1207', currentOperator: 'Anand P', plannedMinutes: 480, runMinutes: 210, downMinutes: 60, idealCycleSeconds: 9.0, totalPieces: 2_100, goodPieces: 2_080, lastMaintenanceOn: d(15), nextMaintenanceOn: d(-15), calibrationDueOn: d(2), capacityPerHour: 400 },
  { uid: 'mc-07', code: 'LEAK-01', name: 'Helium leak tester', workCentre: 'Welding & Vacuum', line: 'Line 1', state: 'IDLE', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 180, downMinutes: 30, idealCycleSeconds: 6.0, totalPieces: 1_800, goodPieces: 1_764, lastMaintenanceOn: d(20), nextMaintenanceOn: d(-10), calibrationDueOn: d(-3), capacityPerHour: 600 },
  { uid: 'mc-08', code: 'POL-02', name: 'Automatic polishing line', workCentre: 'Polishing', line: 'Line 1', state: 'BREAKDOWN', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 120, downMinutes: 210, idealCycleSeconds: 5.0, totalPieces: 1_440, goodPieces: 1_400, lastMaintenanceOn: d(40), nextMaintenanceOn: d(-1), calibrationDueOn: null, capacityPerHour: 720 },
  { uid: 'mc-09', code: 'COAT-01', name: 'Powder coating booth', workCentre: 'Coating & Printing', line: 'Line 1', state: 'IDLE', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 265, downMinutes: 40, idealCycleSeconds: 7.2, totalPieces: 2_200, goodPieces: 2_160, lastMaintenanceOn: d(18), nextMaintenanceOn: d(-12), calibrationDueOn: null, capacityPerHour: 500 },
  { uid: 'mc-10', code: 'OVEN-01', name: 'Curing oven', workCentre: 'Coating & Printing', line: 'Line 1', state: 'RUNNING', currentWorkOrder: null, currentOperator: 'S. Kumar', plannedMinutes: 480, runMinutes: 430, downMinutes: 10, idealCycleSeconds: 8.0, totalPieces: 3_200, goodPieces: 3_190, lastMaintenanceOn: d(25), nextMaintenanceOn: d(-5), calibrationDueOn: d(-20), capacityPerHour: 450 },
  { uid: 'mc-11', code: 'LASER-01', name: 'Fibre laser marker', workCentre: 'Coating & Printing', line: 'Line 1', state: 'MAINTENANCE', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 0, downMinutes: 240, idealCycleSeconds: 4.0, totalPieces: 0, goodPieces: 0, lastMaintenanceOn: d(0), nextMaintenanceOn: d(-30), calibrationDueOn: d(-60), capacityPerHour: 900 },
  { uid: 'mc-12', code: 'ASM-01', name: 'Assembly conveyor', workCentre: 'Assembly', line: 'Line 1', state: 'IDLE', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 240, downMinutes: 60, idealCycleSeconds: 6.5, totalPieces: 2_400, goodPieces: 2_388, lastMaintenanceOn: d(28), nextMaintenanceOn: d(-2), calibrationDueOn: null, capacityPerHour: 550 },
  { uid: 'mc-13', code: 'PACK-01', name: 'Carton packing station', workCentre: 'Packing', line: 'Line 1', state: 'RUNNING', currentWorkOrder: null, currentOperator: 'R. Anitha', plannedMinutes: 480, runMinutes: 410, downMinutes: 20, idealCycleSeconds: 10.0, totalPieces: 2_600, goodPieces: 2_600, lastMaintenanceOn: d(35), nextMaintenanceOn: d(-25), calibrationDueOn: null, capacityPerHour: 360 },
  { uid: 'mc-14', code: 'PRESS-05', name: '150T press — Line 2', workCentre: 'Press Shop', line: 'Line 2', state: 'OFF', currentWorkOrder: null, currentOperator: null, plannedMinutes: 480, runMinutes: 0, downMinutes: 0, idealCycleSeconds: 3.4, totalPieces: 0, goodPieces: 0, lastMaintenanceOn: d(6), nextMaintenanceOn: d(-24), calibrationDueOn: null, capacityPerHour: 950 },
]

/* ═════════════════════════════ Downtime ═══════════════════════════════════ */

export const downtimeEvents: DowntimeEvent[] = [
  { uid: 'dt-01', docNo: 'DT/2607/0412', machine: 'Automatic polishing line', machineCode: 'POL-02', workCentre: 'Polishing', reason: 'BREAKDOWN', startedAt: at(0, 9), endedAt: null, minutes: 210, shift: 'A', reportedBy: 'J. Mohan', correctiveAction: null, maintenanceRequestNo: 'MWO/26-27/0184', isOpen: true },
  { uid: 'dt-02', docNo: 'DT/2607/0411', machine: 'Fibre laser marker', machineCode: 'LASER-01', workCentre: 'Coating & Printing', reason: 'PLANNED_MAINTENANCE', startedAt: at(0, 6), endedAt: null, minutes: 240, shift: 'A', reportedBy: 'D. Anand', correctiveAction: 'Quarterly optics clean and calibration', maintenanceRequestNo: 'MWO/26-27/0180', isOpen: true },
  { uid: 'dt-03', docNo: 'DT/2607/0410', machine: 'Bottom seam welder', machineCode: 'WELD-02', workCentre: 'Welding & Vacuum', reason: 'TOOL_CHANGE', startedAt: at(0, 11), endedAt: at(0, 12), minutes: 46, shift: 'A', reportedBy: 'J. Mohan', correctiveAction: 'Weld jig changed for the 750 ml profile', maintenanceRequestNo: null, isOpen: false },
  { uid: 'dt-04', docNo: 'DT/2607/0409', machine: 'Bottom seam welder', machineCode: 'WELD-02', workCentre: 'Welding & Vacuum', reason: 'WAITING_FOR_QC', startedAt: at(0, 13), endedAt: at(0, 14), minutes: 50, shift: 'A', reportedBy: 'J. Mohan', correctiveAction: 'First-piece approval delayed — inspector on another line', maintenanceRequestNo: null, isOpen: false },
  { uid: 'dt-05', docNo: 'DT/2607/0408', machine: 'Vacuum chamber 1', machineCode: 'VAC-01', workCentre: 'Welding & Vacuum', reason: 'CHANGEOVER', startedAt: at(0, 8), endedAt: at(0, 9), minutes: 60, shift: 'A', reportedBy: 'Anand P', correctiveAction: 'Chamber changeover from 500 ml to 750 ml fixtures', maintenanceRequestNo: null, isOpen: false },
  { uid: 'dt-06', docNo: 'DT/2607/0402', machine: 'Coil slitting line', machineCode: 'CUT-01', workCentre: 'Coil Cutting', reason: 'MATERIAL_SHORTAGE', startedAt: at(1, 14), endedAt: at(1, 15), minutes: 45, shift: 'B', reportedBy: 'T. Ganesh', correctiveAction: 'Waiting for SS 304 coil put-away from quarantine', maintenanceRequestNo: null, isOpen: false },
  { uid: 'dt-07', docNo: 'DT/2607/0398', machine: 'Assembly conveyor', machineCode: 'ASM-01', workCentre: 'Assembly', reason: 'OPERATOR_UNAVAILABLE', startedAt: at(1, 10), endedAt: at(1, 11), minutes: 60, shift: 'A', reportedBy: 'R. Anitha', correctiveAction: 'Two operators absent, line run at half capacity', maintenanceRequestNo: null, isOpen: false },
  { uid: 'dt-08', docNo: 'DT/2607/0391', machine: 'Powder coating booth', machineCode: 'COAT-01', workCentre: 'Coating & Printing', reason: 'POWER_FAILURE', startedAt: at(2, 16), endedAt: at(2, 17), minutes: 40, shift: 'B', reportedBy: 'J. Mohan', correctiveAction: 'EB supply interruption — DG took 8 minutes to stabilise', maintenanceRequestNo: null, isOpen: false },
]

/* ═══════════════════════════ Production entries ═══════════════════════════ */

export const productionEntries: ProductionEntry[] = [
  { uid: 'pe-01', docNo: 'PE/2607/08841', entryDate: d(0), workOrderNo: 'WO/2607/1206', productionOrderNo: 'PRD/2607/0121', operationName: 'Bottom welding', machine: 'WELD-02', operator: 'J. Mohan', shift: 'A', startedAt: at(0, 7), endedAt: at(0, 11), goodQty: 2_460, scrapQty: 92, reworkQty: 48, uom: 'NOS', batchNo: 'B2607031', cycleSeconds: 4.4, postedBy: 'J. Mohan' },
  { uid: 'pe-02', docNo: 'PE/2607/08840', entryDate: d(0), workOrderNo: 'WO/2607/1206', productionOrderNo: 'PRD/2607/0121', operationName: 'Bottom welding', machine: 'WELD-02', operator: 'J. Mohan', shift: 'A', startedAt: at(0, 12), endedAt: at(0, 15), goodQty: 2_460, scrapQty: 92, reworkQty: 48, uom: 'NOS', batchNo: 'B2607031', cycleSeconds: 4.6, remarks: 'Weld current re-set after the jig change', postedBy: 'J. Mohan' },
  { uid: 'pe-03', docNo: 'PE/2607/08836', entryDate: d(1), workOrderNo: 'WO/2607/1205', productionOrderNo: 'PRD/2607/0121', operationName: 'Neck forming', machine: 'NECK-01', operator: 'N. Selvam', shift: 'B', startedAt: at(1, 14), endedAt: at(1, 21), goodQty: 7_860, scrapQty: 30, reworkQty: 0, uom: 'NOS', batchNo: 'B2607031', cycleSeconds: 3.2, postedBy: 'N. Selvam' },
  { uid: 'pe-04', docNo: 'PE/2607/08830', entryDate: d(1), workOrderNo: 'WO/2607/1204', productionOrderNo: 'PRD/2607/0121', operationName: 'Trimming', machine: 'TRIM-01', operator: 'T. Ganesh', shift: 'A', startedAt: at(1, 7), endedAt: at(1, 13), goodQty: 7_890, scrapQty: 30, reworkQty: 0, uom: 'NOS', batchNo: 'B2607031', cycleSeconds: 2.7, postedBy: 'T. Ganesh' },
  { uid: 'pe-05', docNo: 'PE/2607/08822', entryDate: d(2), workOrderNo: 'WO/2607/1202', productionOrderNo: 'PRD/2607/0121', operationName: 'Deep drawing — inner shell', machine: 'PRESS-02', operator: 'T. Ganesh', shift: 'A', startedAt: at(2, 7), endedAt: at(2, 15), goodQty: 7_980, scrapQty: 80, reworkQty: 0, uom: 'NOS', batchNo: 'B2607031', cycleSeconds: 3.1, postedBy: 'T. Ganesh' },
  { uid: 'pe-06', docNo: 'PE/2607/08815', entryDate: d(2), workOrderNo: 'WO/2607/1201', productionOrderNo: 'PRD/2607/0121', operationName: 'Coil cutting', machine: 'CUT-01', operator: 'S. Kumar', shift: 'A', startedAt: at(2, 6), endedAt: at(2, 12), goodQty: 8_060, scrapQty: 60, reworkQty: 0, uom: 'NOS', batchNo: 'B2607031', cycleSeconds: 2.5, postedBy: 'S. Kumar' },
]

/* ══════════════════════════════ WIP lots ══════════════════════════════════ */

export const wipLots: WipLot[] = [
  { uid: 'wip-01', lotNo: 'WIP/2607/0441', productionOrderNo: 'PRD/2607/0121', itemCode: 'SF-BODY-750', itemName: 'Bottle body — welded', batchNo: 'B2607031', quantity: 4_920, uom: 'NOS', currentOperation: 'Bottom welding', nextOperation: 'Vacuum creation & sealing', workCentre: 'Welding & Vacuum', location: 'WIP-01 · W-01-A', machine: 'WELD-02', operator: 'J. Mohan', state: 'IN_PROCESS', waitingMinutes: 0, enteredAt: at(0, 7), value: 474_288 },
  { uid: 'wip-02', lotNo: 'WIP/2607/0440', productionOrderNo: 'PRD/2607/0121', itemCode: 'SF-BODY-750', itemName: 'Bottle body — necked', batchNo: 'B2607031', quantity: 2_940, uom: 'NOS', currentOperation: 'Neck forming', nextOperation: 'Bottom welding', workCentre: 'Press Shop', location: 'WIP-01 · W-01-B', machine: null, operator: null, state: 'WAITING', waitingMinutes: 185, enteredAt: at(0, 6), value: 283_416 },
  { uid: 'wip-03', lotNo: 'WIP/2607/0438', productionOrderNo: 'PRD/2607/0121', itemCode: 'SF-BODY-750', itemName: 'Bottle body — welded', batchNo: 'B2607031', quantity: 184, uom: 'NOS', currentOperation: 'Bottom welding', nextOperation: 'Rework', workCentre: 'Quality', location: 'QTN-01', machine: null, operator: null, state: 'QUALITY_HOLD', waitingMinutes: 420, enteredAt: at(0, 8), value: 17_737 },
  { uid: 'wip-04', lotNo: 'WIP/2607/0435', productionOrderNo: 'PRD/2607/0121', itemCode: 'SF-BODY-750', itemName: 'Bottle body — vacuum sealed', batchNo: 'B2607031', quantity: 2_080, uom: 'NOS', currentOperation: 'Vacuum creation & sealing', nextOperation: 'Leak test', workCentre: 'Welding & Vacuum', location: 'WIP-01 · W-02-A', machine: 'VAC-01', operator: 'Anand P', state: 'READY', waitingMinutes: 35, enteredAt: at(0, 9), value: 200_512 },
  { uid: 'wip-05', lotNo: 'WIP/2607/0421', productionOrderNo: 'PRD/2607/0119', itemCode: 'FG-SS-750-BLK', itemName: 'Flask 750 ml — coated, unpacked', batchNo: 'B2607021', quantity: 1_440, uom: 'NOS', currentOperation: 'Carton packing', nextOperation: null, workCentre: 'Packing', location: 'WIP-01 · Packing bay', machine: 'PACK-01', operator: 'R. Anitha', state: 'IN_PROCESS', waitingMinutes: 0, enteredAt: at(0, 10), value: 594_432 },
  { uid: 'wip-06', lotNo: 'WIP/2607/0418', productionOrderNo: 'PRD/2607/0119', itemCode: 'FG-SS-750-BLK', itemName: 'Flask 750 ml — packed', batchNo: 'B2607021', quantity: 4_860, uom: 'NOS', currentOperation: 'Carton packing', nextOperation: null, workCentre: 'Packing', location: 'FG-01 · P-A-01', machine: null, operator: null, state: 'TRANSFERRED', waitingMinutes: 0, enteredAt: at(3, 16), value: 2_006_208 },
]

/* ═══════════════════════════════ Scrap ════════════════════════════════════ */

export const scrapRecords: ScrapRecord[] = [
  { uid: 'sc-01', docNo: 'SCR/2607/0331', entryDate: d(0), workOrderNo: 'WO/2607/1206', productionOrderNo: 'PRD/2607/0121', operationName: 'Bottom welding', itemCode: 'SF-BODY-750', itemName: 'Bottle body — welded', batchNo: 'B2607031', quantity: 184, uom: 'NOS', reason: 'WELDING_DEFECT', action: 'REWORK', machine: 'WELD-02', operator: 'J. Mohan', shift: 'A', unitCost: 96.40, detectedBy: 'S. Meena', correctiveAction: 'Weld current re-set; first-piece re-approved', status: 'ACTIONED' },
  { uid: 'sc-02', docNo: 'SCR/2607/0329', entryDate: d(0), workOrderNo: 'WO/2607/1206', productionOrderNo: 'PRD/2607/0121', operationName: 'Bottom welding', itemCode: 'SF-BODY-750', itemName: 'Bottle body — welded', batchNo: 'B2607031', quantity: 42, uom: 'NOS', reason: 'LEAK_FAILURE', action: 'SCRAP', machine: 'WELD-02', operator: 'J. Mohan', shift: 'A', unitCost: 96.40, detectedBy: 'S. Meena', correctiveAction: null, status: 'OPEN' },
  { uid: 'sc-03', docNo: 'SCR/2607/0324', entryDate: d(1), workOrderNo: 'WO/2607/1205', productionOrderNo: 'PRD/2607/0121', operationName: 'Neck forming', itemCode: 'SF-BODY-750', itemName: 'Bottle body — necked', batchNo: 'B2607031', quantity: 30, uom: 'NOS', reason: 'DIMENSION_FAILURE', action: 'SCRAP', machine: 'NECK-01', operator: 'N. Selvam', shift: 'B', unitCost: 92.10, detectedBy: 'QC inline', correctiveAction: 'Former re-shimmed after 2,000 pieces', status: 'CLOSED' },
  { uid: 'sc-04', docNo: 'SCR/2607/0318', entryDate: d(2), workOrderNo: 'WO/2607/1202', productionOrderNo: 'PRD/2607/0121', operationName: 'Deep drawing — inner shell', itemCode: 'SF-BODY-750', itemName: 'Inner shell', batchNo: 'B2607031', quantity: 80, uom: 'NOS', reason: 'MATERIAL_DEFECT', action: 'SCRAP', machine: 'PRESS-02', operator: 'T. Ganesh', shift: 'A', unitCost: 62.40, detectedBy: 'T. Ganesh', correctiveAction: 'Coil edge burr — reported to Jindal against heat 4488', status: 'CLOSED' },
  { uid: 'sc-05', docNo: 'SCR/2607/0311', entryDate: d(3), workOrderNo: 'WO/2607/1194', productionOrderNo: 'PRD/2607/0119', operationName: 'Powder coating', itemCode: 'FG-SS-750-BLK', itemName: 'Flask 750 ml', batchNo: 'B2607021', quantity: 96, uom: 'NOS', reason: 'PAINT_DEFECT', action: 'REWORK', machine: 'COAT-01', operator: 'J. Mohan', shift: 'A', unitCost: 412.80, detectedBy: 'Logo inspection', correctiveAction: 'Stripped and re-coated', status: 'CLOSED' },
  { uid: 'sc-06', docNo: 'SCR/2607/0305', entryDate: d(4), workOrderNo: 'WO/2607/1191', productionOrderNo: 'PRD/2607/0119', operationName: 'Laser marking', itemCode: 'FG-SS-750-BLK', itemName: 'Flask 750 ml', batchNo: 'B2607021', quantity: 44, uom: 'NOS', reason: 'PRINTING_ERROR', action: 'REWORK', machine: 'LASER-01', operator: 'S. Kumar', shift: 'A', unitCost: 412.80, detectedBy: 'Logo inspection', correctiveAction: 'Marking file reloaded with the correct revision', status: 'CLOSED' },
]

/* ══════════════════════════════ Rework ════════════════════════════════════ */

export const reworkOrders: ReworkOrder[] = [
  { uid: 'rw-01', docNo: 'RWK/2607/0088', raisedOn: d(0), sourceWorkOrderNo: 'WO/2607/1206', productionOrderNo: 'PRD/2607/0121', itemCode: 'SF-BODY-750', itemName: 'Bottle body — welded', batchNo: 'B2607031', quantity: 184, repairedQty: 88, scrappedQty: 0, uom: 'NOS', defect: 'WELDING_DEFECT', operation: 'Bottom welding', assignedTo: 'N. Selvam', status: 'IN_REPAIR', raisedBy: 'S. Meena', inspectionNo: 'QC/26-27/00918', costPerUnit: 18.40, remarks: 'Re-weld and re-test; leak test again before vacuum.' },
  { uid: 'rw-02', docNo: 'RWK/2607/0085', raisedOn: d(3), sourceWorkOrderNo: 'WO/2607/1194', productionOrderNo: 'PRD/2607/0119', itemCode: 'FG-SS-750-BLK', itemName: 'Flask 750 ml — Matte Black', batchNo: 'B2607021', quantity: 96, repairedQty: 96, scrappedQty: 0, uom: 'NOS', defect: 'PAINT_DEFECT', operation: 'Powder coating', assignedTo: 'J. Mohan', status: 'ACCEPTED', raisedBy: 'Logo inspection', inspectionNo: 'QC/26-27/00901', costPerUnit: 42.00 },
  { uid: 'rw-03', docNo: 'RWK/2607/0081', raisedOn: d(4), sourceWorkOrderNo: 'WO/2607/1191', productionOrderNo: 'PRD/2607/0119', itemCode: 'FG-SS-750-BLK', itemName: 'Flask 750 ml — Matte Black', batchNo: 'B2607021', quantity: 44, repairedQty: 40, scrappedQty: 4, uom: 'NOS', defect: 'PRINTING_ERROR', operation: 'Laser marking', assignedTo: 'S. Kumar', status: 'ACCEPTED', raisedBy: 'Logo inspection', inspectionNo: 'QC/26-27/00888', costPerUnit: 12.00, remarks: '4 units could not be re-marked cleanly and were scrapped.' },
  { uid: 'rw-04', docNo: 'RWK/2607/0078', raisedOn: d(6), sourceWorkOrderNo: 'WO/2607/1188', productionOrderNo: 'PRD/2607/0114', itemCode: 'SF-BODY-750', itemName: 'Bottle body — polished', batchNo: 'B2607014', quantity: 180, repairedQty: 0, scrappedQty: 0, uom: 'NOS', defect: 'SCRATCH', operation: 'Surface polishing', assignedTo: null, status: 'RAISED', raisedBy: 'QC inline', inspectionNo: null, costPerUnit: 8.60 },
]

/* ═══════════════════════════ Shifts & labour ══════════════════════════════ */

export const shiftLogs: ShiftLog[] = [
  { uid: 'sh-01', logDate: d(0), shift: 'A', line: 'Line 1', supervisor: 'N. Selvam', targetQty: 2_600, actualQty: 2_460, scrapQty: 92, reworkQty: 48, manpowerPlanned: 18, manpowerPresent: 16, runMinutes: 296, downMinutes: 96, handoverNotes: 'Polishing line down since 09:10, maintenance raised MWO/26-27/0184. Welding jig changed at 11:00 — first piece approved 12:05.', status: 'OPEN' },
  { uid: 'sh-02', logDate: d(1), shift: 'C', line: 'Line 1', supervisor: 'T. Ganesh', targetQty: 2_400, actualQty: 2_180, scrapQty: 44, reworkQty: 0, manpowerPlanned: 14, manpowerPresent: 13, runMinutes: 402, downMinutes: 38, handoverNotes: 'Ran short of SS 304 for 45 minutes waiting on put-away from quarantine.', status: 'CLOSED' },
  { uid: 'sh-03', logDate: d(1), shift: 'B', line: 'Line 1', supervisor: 'J. Mohan', targetQty: 2_600, actualQty: 2_640, scrapQty: 30, reworkQty: 0, manpowerPlanned: 18, manpowerPresent: 18, runMinutes: 428, downMinutes: 22, handoverNotes: 'Clean shift. Neck former re-shimmed after 2,000 pieces as planned.', status: 'CLOSED' },
  { uid: 'sh-04', logDate: d(1), shift: 'A', line: 'Line 1', supervisor: 'N. Selvam', targetQty: 2_600, actualQty: 2_520, scrapQty: 30, reworkQty: 0, manpowerPlanned: 18, manpowerPresent: 17, runMinutes: 416, downMinutes: 34, handoverNotes: 'Assembly ran at half capacity for an hour — two operators absent.', status: 'CLOSED' },
  { uid: 'sh-05', logDate: d(2), shift: 'B', line: 'Line 2', supervisor: 'R. Anitha', targetQty: 1_800, actualQty: 1_640, scrapQty: 80, reworkQty: 0, manpowerPlanned: 12, manpowerPresent: 11, runMinutes: 388, downMinutes: 52, handoverNotes: 'Power interruption at 16:20, DG stabilised in 8 minutes.', status: 'CLOSED' },
]

export const operatorStats: OperatorStat[] = [
  { uid: 'op-01', employeeCode: 'EMP0075', name: 'T. Ganesh', skill: 'Press operator — L3', certifiedFor: ['Deep drawing', 'Trimming', 'Coil cutting'], workCentre: 'Press Shop', shift: 'A', present: true, producedQty: 7_980, scrapQty: 80, standardMinutes: 420, actualMinutes: 402, attendanceDays: 24, incentiveEligible: true },
  { uid: 'op-02', employeeCode: 'EMP0130', name: 'J. Mohan', skill: 'Welder — certified', certifiedFor: ['Bottom welding', 'Powder coating'], workCentre: 'Welding & Vacuum', shift: 'A', present: true, producedQty: 4_920, scrapQty: 184, standardMinutes: 300, actualMinutes: 296, attendanceDays: 22, incentiveEligible: false },
  { uid: 'op-03', employeeCode: 'EMP0214', name: 'N. Selvam', skill: 'Press operator — L2', certifiedFor: ['Neck forming', 'Trimming'], workCentre: 'Press Shop', shift: 'B', present: true, producedQty: 7_860, scrapQty: 30, standardMinutes: 430, actualMinutes: 428, attendanceDays: 25, incentiveEligible: true },
  { uid: 'op-04', employeeCode: 'EMP1147', name: 'Anand P', skill: 'Vacuum chamber — L2', certifiedFor: ['Vacuum sealing', 'Leak test'], workCentre: 'Welding & Vacuum', shift: 'A', present: true, producedQty: 2_080, scrapQty: 20, standardMinutes: 240, actualMinutes: 210, attendanceDays: 23, incentiveEligible: true },
  { uid: 'op-05', employeeCode: 'EMP0119', name: 'S. Kumar', skill: 'Coating & marking — L3', certifiedFor: ['Powder coating', 'Oven curing', 'Laser marking'], workCentre: 'Coating & Printing', shift: 'A', present: true, producedQty: 3_190, scrapQty: 44, standardMinutes: 450, actualMinutes: 430, attendanceDays: 21, incentiveEligible: true },
  { uid: 'op-06', employeeCode: 'EMP0186', name: 'R. Anitha', skill: 'Packing — L2', certifiedFor: ['Carton packing', 'Palletising'], workCentre: 'Packing', shift: 'A', present: true, producedQty: 2_600, scrapQty: 0, standardMinutes: 420, actualMinutes: 410, attendanceDays: 26, incentiveEligible: true },
  { uid: 'op-07', employeeCode: 'EMP0201', name: 'M. Karthik', skill: 'Assembly — L1', certifiedFor: ['Lid assembly', 'Bottle assembly'], workCentre: 'Assembly', shift: 'B', present: false, producedQty: 0, scrapQty: 0, standardMinutes: 0, actualMinutes: 0, attendanceDays: 18, incentiveEligible: false },
  { uid: 'op-08', employeeCode: 'EMP0192', name: 'P. Vignesh', skill: 'Assembly — L2', certifiedFor: ['Bottle assembly', 'Cleaning'], workCentre: 'Assembly', shift: 'A', present: true, producedQty: 2_388, scrapQty: 12, standardMinutes: 260, actualMinutes: 240, attendanceDays: 24, incentiveEligible: true },
]

/* ═══════════════════════════════ Analytics ════════════════════════════════ */

export const oeeTrend: OeePoint[] = [
  { period: 'Mon', availability: 88.2, performance: 91.4, quality: 97.8, oee: 78.9 },
  { period: 'Tue', availability: 90.1, performance: 92.8, quality: 98.2, oee: 82.1 },
  { period: 'Wed', availability: 86.4, performance: 90.2, quality: 97.1, oee: 75.7 },
  { period: 'Thu', availability: 91.6, performance: 93.4, quality: 98.6, oee: 84.4 },
  { period: 'Fri', availability: 89.8, performance: 92.1, quality: 98.0, oee: 81.1 },
  { period: 'Sat', availability: 84.2, performance: 88.6, quality: 96.4, oee: 71.9 },
  { period: 'Today', availability: 79.4, performance: 89.8, quality: 96.4, oee: 68.7 },
]

export const hourlyOutput: HourlyOutput[] = [
  { hour: '06:00', planned: 340, actual: 352, scrap: 4 },
  { hour: '07:00', planned: 340, actual: 338, scrap: 6 },
  { hour: '08:00', planned: 340, actual: 344, scrap: 8 },
  { hour: '09:00', planned: 340, actual: 214, scrap: 12 },
  { hour: '10:00', planned: 340, actual: 198, scrap: 18 },
  { hour: '11:00', planned: 340, actual: 120, scrap: 22 },
  { hour: '12:00', planned: 340, actual: 286, scrap: 10 },
  { hour: '13:00', planned: 340, actual: 318, scrap: 6 },
  { hour: '14:00', planned: 340, actual: 290, scrap: 6 },
]

/* ═══════════════════ Traveller card / genealogy chain ═════════════════════ */

export const travellerSteps: TravellerStep[] = [
  { sequence: 1, operationName: 'Coil cutting', workCentre: 'Coil Cutting', machine: 'CUT-01', operator: 'S. Kumar', tool: 'Slitter blade set A', startedAt: at(2, 6), completedAt: at(2, 12), inputQty: 8_120, outputQty: 8_060, scrapQty: 60, qcResult: 'NOT_REQUIRED', inputBatches: ['B2606-H4471'] },
  { sequence: 2, operationName: 'Deep drawing — inner shell', workCentre: 'Press Shop', machine: 'PRESS-02', operator: 'T. Ganesh', tool: 'Draw die 750-IN', startedAt: at(2, 7), completedAt: at(2, 15), inputQty: 8_060, outputQty: 7_980, scrapQty: 80, qcResult: 'NOT_REQUIRED', inputBatches: ['B2606-H4471'] },
  { sequence: 3, operationName: 'Deep drawing — outer shell', workCentre: 'Press Shop', machine: 'PRESS-03', operator: 'N. Selvam', tool: 'Draw die 750-OUT', startedAt: at(2, 8), completedAt: at(2, 16), inputQty: 7_980, outputQty: 7_920, scrapQty: 60, qcResult: 'NOT_REQUIRED', inputBatches: ['B2606-H4471'] },
  { sequence: 4, operationName: 'Trimming', workCentre: 'Press Shop', machine: 'TRIM-01', operator: 'T. Ganesh', tool: 'Trim tool 750', startedAt: at(1, 7), completedAt: at(1, 13), inputQty: 7_920, outputQty: 7_890, scrapQty: 30, qcResult: 'NOT_REQUIRED', inputBatches: [] },
  { sequence: 5, operationName: 'Neck forming', workCentre: 'Press Shop', machine: 'NECK-01', operator: 'N. Selvam', tool: 'Neck former 68', startedAt: at(1, 14), completedAt: at(1, 21), inputQty: 7_890, outputQty: 7_860, scrapQty: 30, qcResult: 'PASSED', inputBatches: [] },
  { sequence: 6, operationName: 'Bottom welding', workCentre: 'Welding & Vacuum', machine: 'WELD-02', operator: 'J. Mohan', tool: 'Weld jig 750', startedAt: at(0, 7), completedAt: null, inputQty: 7_860, outputQty: 4_920, scrapQty: 184, qcResult: 'PENDING', inputBatches: ['B2607-DISC-04'] },
  { sequence: 7, operationName: 'Vacuum creation & sealing', workCentre: 'Welding & Vacuum', machine: 'VAC-01', operator: 'Anand P', tool: null, startedAt: null, completedAt: null, inputQty: 4_920, outputQty: 0, scrapQty: 0, qcResult: 'PENDING', inputBatches: [] },
  { sequence: 8, operationName: 'Leak test', workCentre: 'Welding & Vacuum', machine: 'LEAK-01', operator: null, tool: null, startedAt: null, completedAt: null, inputQty: 0, outputQty: 0, scrapQty: 0, qcResult: 'PENDING', inputBatches: [] },
]

/* ═════════════════════════ Work instructions ══════════════════════════════ */

export const workInstructions: WorkInstruction[] = [
  {
    uid: 'wi-01', code: 'WI-OP40-R3', operationCode: 'OP-40', operationName: 'Bottom welding', itemCode: 'SF-BODY-750',
    revision: 'R3', effectiveFrom: d(30), approvedBy: 'S. Meena', status: 'APPROVED',
    safetyNotes: ['Welding shield and gloves mandatory', 'Do not open the jig while the arc is live', 'Fume extraction must be running'],
    steps: [
      'Load the body shell into the weld jig, neck facing down.',
      'Place the bottom disc from the issued batch and confirm the heat number on the traveller card.',
      'Close the jig; confirm the clamp indicator shows green.',
      'Start the weld cycle. Do not intervene once the arc strikes.',
      'On completion, remove and place on the cooling rack for 90 seconds.',
      'Inspect the seam visually against the boundary sample before placing in the WIP trolley.',
    ],
    machineSettings: [
      { label: 'Weld current', value: '210 A ± 5' },
      { label: 'Rotation speed', value: '18 rpm' },
      { label: 'Shielding gas', value: 'Argon, 12 l/min' },
      { label: 'Cycle time', value: '4.2 s' },
    ],
    qualityCheckpoints: [
      { parameter: 'Seam continuity', specification: 'No visible porosity or undercut', frequency: 'Every piece — visual' },
      { parameter: 'Weld penetration', specification: '0.35–0.45 mm', frequency: 'First piece and every 500' },
      { parameter: 'Leak rate', specification: '< 1 × 10⁻⁶ mbar·l/s', frequency: 'Downstream at leak test' },
    ],
    attachments: [
      { name: 'SOP-WELD-750 rev 3.pdf', kind: 'SOP' },
      { name: 'Weld jig setup drawing.pdf', kind: 'DRAWING' },
      { name: 'Boundary sample — acceptable seam.jpg', kind: 'IMAGE' },
      { name: 'Jig changeover (4 min).mp4', kind: 'VIDEO' },
    ],
  },
  {
    uid: 'wi-02', code: 'WI-OP70-R2', operationCode: 'OP-70', operationName: 'Powder coating', itemCode: 'FG-SS-750-BLK',
    revision: 'R2', effectiveFrom: d(60), approvedBy: 'S. Meena', status: 'APPROVED',
    safetyNotes: ['Respirator mandatory inside the booth', 'Earth the hanger before spraying'],
    steps: [
      'Confirm the powder batch on the traveller card and check it has not expired.',
      'Hang the bottles at 150 mm pitch, neck upwards.',
      'Set gun voltage and powder flow per the settings below.',
      'Spray in two passes; do not exceed 80 µm total build.',
      'Transfer directly to the curing oven within 10 minutes.',
    ],
    machineSettings: [
      { label: 'Gun voltage', value: '60 kV' },
      { label: 'Powder flow', value: '140 g/min' },
      { label: 'Booth extraction', value: '0.5 m/s at the opening' },
      { label: 'Film thickness', value: '60–80 µm' },
    ],
    qualityCheckpoints: [
      { parameter: 'Film thickness', specification: '60–80 µm', frequency: '5 pieces per hour' },
      { parameter: 'Adhesion (cross-hatch)', specification: 'Class 0–1', frequency: 'Once per batch' },
      { parameter: 'Colour match', specification: 'ΔE ≤ 1.0 vs RAL 9005 standard', frequency: 'First piece per batch' },
    ],
    attachments: [
      { name: 'SOP-COAT-BLACK rev 2.pdf', kind: 'SOP' },
      { name: 'Hanging pattern.png', kind: 'IMAGE' },
    ],
  },
  {
    uid: 'wi-03', code: 'WI-OP55-R1', operationCode: 'OP-55', operationName: 'Leak test', itemCode: 'SF-BODY-750',
    revision: 'R1', effectiveFrom: d(120), approvedBy: 'S. Meena', status: 'APPROVED',
    safetyNotes: ['Helium cylinder must be chained', 'Do not bypass the chamber interlock'],
    steps: [
      'Load 12 bodies into the test fixture.',
      'Close the chamber and start the automatic cycle.',
      'Record the leak rate shown for each position.',
      'Any position above the limit goes to the quality hold trolley, not back on the line.',
    ],
    machineSettings: [
      { label: 'Test pressure', value: '2.5 bar' },
      { label: 'Dwell time', value: '20 s' },
      { label: 'Reject limit', value: '1 × 10⁻⁶ mbar·l/s' },
    ],
    qualityCheckpoints: [{ parameter: 'Leak rate', specification: '< 1 × 10⁻⁶ mbar·l/s', frequency: 'Every piece — automatic' }],
    attachments: [{ name: 'SOP-LEAK rev 1.pdf', kind: 'SOP' }],
  },
]
