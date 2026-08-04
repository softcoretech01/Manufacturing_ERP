/**
 * Inventory demonstration data — the same Chennai bottle plant as the
 * procurement dataset, mid FY 2026-27.
 *
 * The numbers are internally consistent on purpose: a batch's remaining
 * quantity equals the sum of its location balances, the ledger's running
 * balance ends at the balance shown in the stock enquiry, and the valuation
 * movement's closing equals opening + receipts − issues ± adjustments. A demo
 * where the figures do not reconcile teaches the wrong thing about the module.
 */

import { daysAgo, daysAhead } from './data'
import type {
  AccuracyPoint,
  AgeingRow,
  Batch,
  BinSlot,
  CountDoc,
  GoodsReceipt,
  JobworkChallan,
  LabelTemplate,
  Rack,
  Shelf,
  Zone,
  LedgerEntry,
  MaterialIssue,
  MaterialRequisition,
  MaterialReturn,
  MovementDay,
  NonMovingItem,
  PutawayDoc,
  QuarantineLot,
  ReorderRow,
  Reservation,
  ScrapNote,
  SerialUnit,
  ShortageRow,
  StockAdjustment,
  StockBalance,
  StockPosition,
  StockTransfer,
  ValuationRow,
  ValueTrendPoint,
  WarehouseSummary,
} from '@/types/inventory'

const d = (n: number) => daysAgo(n).slice(0, 10)
const f = (n: number) => daysAhead(n).slice(0, 10)

/* ═══════════════════════════ Warehouses ═══════════════════════════════ */

export const warehouseSummaries: WarehouseSummary[] = [
  { uid: 'wh-01', code: 'RM-01', name: 'Raw Material Store', warehouseType: 'RAW_MATERIAL', plant: 'Chennai — Unit 1', isBinManaged: true, batchMandatory: true, allowNegative: false, putawayStrategy: 'BULK_FIRST', pickStrategy: 'FIFO', storekeeper: 'K. Ravi', valuationMethod: 'Weighted average', binCount: 708, binsOccupied: 511, stockValue: 24_180_000, openMovements: 7, includeInAtp: true },
  { uid: 'wh-02', code: 'WIP-01', name: 'Work in Progress Store', warehouseType: 'WIP', plant: 'Chennai — Unit 1', isBinManaged: true, batchMandatory: true, allowNegative: false, putawayStrategy: 'NEAREST_EMPTY', pickStrategy: 'FIFO', storekeeper: 'M. Devi', valuationMethod: 'Weighted average', binCount: 96, binsOccupied: 61, stockValue: 8_940_000, openMovements: 3, includeInAtp: false },
  { uid: 'wh-03', code: 'FG-01', name: 'Finished Goods Store', warehouseType: 'FINISHED_GOODS', plant: 'Chennai — Unit 1', isBinManaged: true, batchMandatory: true, allowNegative: false, putawayStrategy: 'CONSOLIDATE', pickStrategy: 'FIFO', storekeeper: 'P. Suresh', valuationMethod: 'Standard cost', binCount: 240, binsOccupied: 146, stockValue: 41_620_000, openMovements: 5, includeInAtp: true },
  { uid: 'wh-04', code: 'PKG-01', name: 'Packing Material Store', warehouseType: 'PACKING_MATERIAL', plant: 'Chennai — Unit 1', isBinManaged: true, batchMandatory: false, allowNegative: false, putawayStrategy: 'FIXED_BIN', pickStrategy: 'FIXED_BIN', storekeeper: 'K. Ravi', valuationMethod: 'Weighted average', binCount: 120, binsOccupied: 101, stockValue: 3_210_000, openMovements: 2, includeInAtp: true },
  { uid: 'wh-05', code: 'QTN-01', name: 'Quarantine Store', warehouseType: 'QUARANTINE', plant: 'Chennai — Unit 1', isBinManaged: false, batchMandatory: true, allowNegative: false, putawayStrategy: 'MANUAL', pickStrategy: 'FIFO', storekeeper: 'S. Meena', valuationMethod: 'Weighted average', binCount: 0, binsOccupied: 0, stockValue: 1_480_000, openMovements: 4, includeInAtp: false },
  { uid: 'wh-06', code: 'REJ-01', name: 'Reject Store', warehouseType: 'REJECT', plant: 'Chennai — Unit 1', isBinManaged: false, batchMandatory: true, allowNegative: false, putawayStrategy: 'MANUAL', pickStrategy: 'FIFO', storekeeper: 'S. Meena', valuationMethod: 'Weighted average', binCount: 0, binsOccupied: 0, stockValue: 312_000, openMovements: 1, includeInAtp: false },
  { uid: 'wh-07', code: 'SCR-01', name: 'Scrap Yard', warehouseType: 'SCRAP', plant: 'Chennai — Unit 1', isBinManaged: false, batchMandatory: false, allowNegative: false, putawayStrategy: 'MANUAL', pickStrategy: 'FIFO', storekeeper: 'K. Ravi', valuationMethod: 'Weighted average', binCount: 0, binsOccupied: 0, stockValue: 890_000, openMovements: 0, includeInAtp: false },
  { uid: 'wh-08', code: 'SUB-01', name: 'Job-work — Coat Tech Industries', warehouseType: 'SUBCONTRACTOR', plant: '—', isBinManaged: false, batchMandatory: true, allowNegative: false, putawayStrategy: 'MANUAL', pickStrategy: 'FIFO', storekeeper: '—', valuationMethod: 'Weighted average', binCount: 0, binsOccupied: 0, stockValue: 2_140_000, openMovements: 6, includeInAtp: false },
  { uid: 'wh-09', code: 'TRN-01', name: 'Goods in Transit', warehouseType: 'TRANSIT', plant: '—', isBinManaged: false, batchMandatory: false, allowNegative: false, putawayStrategy: 'MANUAL', pickStrategy: 'FIFO', storekeeper: '—', valuationMethod: 'Weighted average', binCount: 0, binsOccupied: 0, stockValue: 1_720_000, openMovements: 2, includeInAtp: false },
  { uid: 'wh-10', code: 'FG-02', name: 'Coimbatore Depot Store', warehouseType: 'DEPOT', plant: 'Coimbatore Depot', isBinManaged: false, batchMandatory: true, allowNegative: false, putawayStrategy: 'MANUAL', pickStrategy: 'FIFO', storekeeper: 'M. Karthik', valuationMethod: 'Standard cost', binCount: 0, binsOccupied: 0, stockValue: 6_450_000, openMovements: 1, includeInAtp: true },
]

/* ═══════════════ Storage structure — zone / rack / shelf ══════════════ */

export const zones: Zone[] = [
  { uid: 'zn-01', code: 'CY', name: 'Coil Yard', warehouseCode: 'RM-01', zoneType: 'Bulk / heavy', temperatureControlled: false, rackCount: 0, isActive: true },
  { uid: 'zn-02', code: 'RA-A', name: 'Rack Area A', warehouseCode: 'RM-01', zoneType: 'Small parts', temperatureControlled: false, rackCount: 10, isActive: true },
  { uid: 'zn-03', code: 'RA-B', name: 'Rack Area B', warehouseCode: 'RM-01', zoneType: 'Small parts', temperatureControlled: false, rackCount: 8, isActive: true },
  { uid: 'zn-04', code: 'BLK', name: 'Bulk Zone', warehouseCode: 'RM-01', zoneType: 'Chemicals', temperatureControlled: true, rackCount: 0, isActive: true },
  { uid: 'zn-05', code: 'PZ', name: 'Pallet Zone', warehouseCode: 'FG-01', zoneType: 'Pallet storage', temperatureControlled: false, rackCount: 6, isActive: true },
  { uid: 'zn-06', code: 'STG', name: 'Dispatch Staging', warehouseCode: 'FG-01', zoneType: 'Staging', temperatureControlled: false, rackCount: 0, isActive: true },
  { uid: 'zn-07', code: 'CTN', name: 'Carton Zone', warehouseCode: 'PKG-01', zoneType: 'Bulk / light', temperatureControlled: false, rackCount: 4, isActive: true },
  { uid: 'zn-08', code: 'L1', name: 'Line 1 WIP', warehouseCode: 'WIP-01', zoneType: 'Shop floor', temperatureControlled: false, rackCount: 0, isActive: true },
]

export const racks: Rack[] = [
  { uid: 'rk-01', code: 'A-01', warehouseCode: 'RM-01', zoneCode: 'RA-A', rackType: 'Selective pallet', levels: 3, maxWeightKg: 1_500, shelfCount: 3, isActive: true },
  { uid: 'rk-02', code: 'A-02', warehouseCode: 'RM-01', zoneCode: 'RA-A', rackType: 'Selective pallet', levels: 3, maxWeightKg: 1_500, shelfCount: 3, isActive: true },
  { uid: 'rk-03', code: 'A-04', warehouseCode: 'RM-01', zoneCode: 'RA-A', rackType: 'Shelving', levels: 2, maxWeightKg: 800, shelfCount: 2, isActive: true },
  { uid: 'rk-04', code: 'B-04', warehouseCode: 'RM-01', zoneCode: 'RA-B', rackType: 'Shelving', levels: 3, maxWeightKg: 800, shelfCount: 3, isActive: true },
  { uid: 'rk-05', code: 'P-A', warehouseCode: 'FG-01', zoneCode: 'PZ', rackType: 'Pallet floor', levels: 1, maxWeightKg: 1_200, shelfCount: 1, isActive: true },
  { uid: 'rk-06', code: 'C-01', warehouseCode: 'PKG-01', zoneCode: 'CTN', rackType: 'Bulk floor', levels: 1, maxWeightKg: 800, shelfCount: 1, isActive: true },
]

export const shelves: Shelf[] = [
  { uid: 'sf-01', code: 'A-01-1', warehouseCode: 'RM-01', rackCode: 'A-01', level: 1, maxWeightKg: 500, binCount: 3, isActive: true },
  { uid: 'sf-02', code: 'A-01-2', warehouseCode: 'RM-01', rackCode: 'A-01', level: 2, maxWeightKg: 500, binCount: 2, isActive: true },
  { uid: 'sf-03', code: 'A-04-2', warehouseCode: 'RM-01', rackCode: 'A-04', level: 2, maxWeightKg: 400, binCount: 1, isActive: true },
  { uid: 'sf-04', code: 'B-04-2', warehouseCode: 'RM-01', rackCode: 'B-04', level: 2, maxWeightKg: 400, binCount: 2, isActive: true },
  { uid: 'sf-05', code: 'P-A-1', warehouseCode: 'FG-01', rackCode: 'P-A', level: 1, maxWeightKg: 1_200, binCount: 4, isActive: true },
  { uid: 'sf-06', code: 'C-01-1', warehouseCode: 'PKG-01', rackCode: 'C-01', level: 1, maxWeightKg: 800, binCount: 2, isActive: true },
]

/* ═══════════════════════════════ Bins ═════════════════════════════════ */

export const binSlots: BinSlot[] = [
  { uid: 'bin-01', warehouseCode: 'RM-01', zone: 'Coil Yard', code: 'CY-01', binType: 'COIL_STAND', status: 'FULL', utilisationPct: 89, maxWeightKg: 10_000, pickSequence: 100, fixedItem: null, mixingAllowed: false, contents: 'SS 304 coil · heat 4471', itemCode: 'RM-SS304-050', batchNo: 'B2606-H4471', quantity: 8_900, lastCountedOn: d(31) },
  { uid: 'bin-02', warehouseCode: 'RM-01', zone: 'Coil Yard', code: 'CY-02', binType: 'COIL_STAND', status: 'AVAILABLE', utilisationPct: 65, maxWeightKg: 10_000, pickSequence: 110, fixedItem: null, mixingAllowed: false, contents: 'SS 201 coil · heat 4402', itemCode: 'RM-SS201-045', batchNo: 'B2605-H4402', quantity: 3_240, lastCountedOn: d(31) },
  { uid: 'bin-03', warehouseCode: 'RM-01', zone: 'Coil Yard', code: 'CY-03', binType: 'COIL_STAND', status: 'FULL', utilisationPct: 94, maxWeightKg: 10_000, pickSequence: 120, fixedItem: null, mixingAllowed: false, contents: 'SS 304 coil · heat 4488', itemCode: 'RM-SS304-050', batchNo: 'B2607-H4488', quantity: 2_040, lastCountedOn: d(4) },
  { uid: 'bin-04', warehouseCode: 'RM-01', zone: 'Coil Yard', code: 'CY-04', binType: 'COIL_STAND', status: 'AVAILABLE', utilisationPct: 0, maxWeightKg: 10_000, pickSequence: 130, fixedItem: null, mixingAllowed: false, contents: '—', itemCode: null, batchNo: null, quantity: 0, lastCountedOn: d(31) },
  { uid: 'bin-05', warehouseCode: 'RM-01', zone: 'Coil Yard', code: 'CY-05', binType: 'COIL_STAND', status: 'AVAILABLE', utilisationPct: 71, maxWeightKg: 10_000, pickSequence: 140, fixedItem: null, mixingAllowed: false, contents: 'SS 316 coil · heat 2214', itemCode: 'RM-SS316-060', batchNo: 'B2606-H2214', quantity: 3_420, lastCountedOn: d(31) },
  { uid: 'bin-06', warehouseCode: 'RM-01', zone: 'Coil Yard', code: 'CY-06', binType: 'COIL_STAND', status: 'BLOCKED', utilisationPct: 0, maxWeightKg: 10_000, pickSequence: 150, fixedItem: null, mixingAllowed: false, contents: 'Stand bent — under repair', itemCode: null, batchNo: null, quantity: 0, blockReason: 'Coil stand bent, welding scheduled 02-Aug', lastCountedOn: d(60) },
  { uid: 'bin-07', warehouseCode: 'RM-01', zone: 'Rack Area A', code: 'A-01-1-1', binType: 'RACK', status: 'AVAILABLE', utilisationPct: 42, maxWeightKg: 500, pickSequence: 1000, fixedItem: 'CMP-SEAL-68', mixingAllowed: false, contents: 'Silicone ring 68 mm', itemCode: 'CMP-SEAL-68', batchNo: 'B2607014', quantity: 12_380, lastCountedOn: d(0) },
  { uid: 'bin-08', warehouseCode: 'RM-01', zone: 'Rack Area A', code: 'A-01-1-3', binType: 'RACK', status: 'AVAILABLE', utilisationPct: 31, maxWeightKg: 500, pickSequence: 1020, fixedItem: null, mixingAllowed: true, contents: 'PP lid insert 750 ml', itemCode: 'CMP-INS-PP-750', batchNo: 'B2606018', quantity: 8_900, lastCountedOn: d(0) },
  { uid: 'bin-09', warehouseCode: 'RM-01', zone: 'Rack Area A', code: 'A-01-2-1', binType: 'RACK', status: 'BLOCKED', utilisationPct: 0, maxWeightKg: 500, pickSequence: 1030, fixedItem: null, mixingAllowed: true, contents: 'Rack damaged — under repair', itemCode: null, batchNo: null, quantity: 0, blockReason: 'Rack upright damaged by forklift 26-Jul', lastCountedOn: d(45) },
  { uid: 'bin-10', warehouseCode: 'RM-01', zone: 'Rack Area A', code: 'A-04-2-1', binType: 'RACK', status: 'AVAILABLE', utilisationPct: 92, maxWeightKg: 500, pickSequence: 1400, fixedItem: null, mixingAllowed: false, contents: 'SS screw cap with seal', itemCode: 'CMP-LID-SCR-SS', batchNo: 'B2607021', quantity: 38_300, lastCountedOn: d(12) },
  { uid: 'bin-11', warehouseCode: 'RM-01', zone: 'Bulk Zone', code: 'BLK-01', binType: 'BULK', status: 'AVAILABLE', utilisationPct: 52, maxWeightKg: 12_000, pickSequence: 50, fixedItem: null, mixingAllowed: false, contents: 'Powder coat — Matte Black', itemCode: 'CON-PWD-BLK', batchNo: 'B2604011', quantity: 1_090, lastCountedOn: d(18) },
  { uid: 'bin-12', warehouseCode: 'RM-01', zone: 'Bulk Zone', code: 'BLK-02', binType: 'BULK', status: 'FULL', utilisationPct: 94, maxWeightKg: 12_000, pickSequence: 60, fixedItem: null, mixingAllowed: false, contents: 'Powder coat — Ocean Blue', itemCode: 'CON-PWD-BLU', batchNo: 'B2606020', quantity: 2_180, lastCountedOn: d(18) },
  { uid: 'bin-13', warehouseCode: 'RM-01', zone: 'Bulk Zone', code: 'BLK-03', binType: 'BULK', status: 'AVAILABLE', utilisationPct: 12, maxWeightKg: 12_000, pickSequence: 70, fixedItem: null, mixingAllowed: false, contents: '—', itemCode: null, batchNo: null, quantity: 0, lastCountedOn: d(18) },
  { uid: 'bin-14', warehouseCode: 'FG-01', zone: 'Pallet Zone', code: 'P-A-01', binType: 'PALLET', status: 'FULL', utilisationPct: 96, maxWeightKg: 1_200, pickSequence: 100, fixedItem: null, mixingAllowed: false, contents: 'VF750 Black · 48 cartons', itemCode: 'FG-SS-750-BLK', batchNo: 'B2607021', quantity: 1_152, lastCountedOn: d(9) },
  { uid: 'bin-15', warehouseCode: 'FG-01', zone: 'Pallet Zone', code: 'P-A-04', binType: 'PALLET', status: 'AVAILABLE', utilisationPct: 58, maxWeightKg: 1_200, pickSequence: 130, fixedItem: null, mixingAllowed: false, contents: 'VF1000 Steel · 27 cartons', itemCode: 'FG-SS-1000-STL', batchNo: 'B2607008', quantity: 640, lastCountedOn: d(9) },
  { uid: 'bin-16', warehouseCode: 'PKG-01', zone: 'Carton Zone', code: 'C-01-1', binType: 'BULK', status: 'AVAILABLE', utilisationPct: 22, maxWeightKg: 800, pickSequence: 100, fixedItem: 'PKG-CTN-24', mixingAllowed: false, contents: 'Corrugated carton 24s', itemCode: 'PKG-CTN-24', batchNo: null, quantity: 1_240, lastCountedOn: d(21) },
  { uid: 'bin-17', warehouseCode: 'WIP-01', zone: 'Line 1', code: 'W-01-A', binType: 'FLOOR', status: 'AVAILABLE', utilisationPct: 64, maxWeightKg: 2_000, pickSequence: 100, fixedItem: null, mixingAllowed: true, contents: 'Body shells 750 ml', itemCode: 'SF-BODY-750', batchNo: 'B2607014', quantity: 4_980, lastCountedOn: d(6) },
]

/* ═════════════════════════ Stock balances ═════════════════════════════ */

export const stockBalances: StockBalance[] = [
  { uid: 'sb-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', supplierBatchNo: '4471', expiresOn: null, status: 'AVAILABLE', quantity: 8_900, reserved: 3_000, allocated: 0, rate: 243.02, ageDays: 57, lastMovementAt: daysAgo(5, 11) },
  { uid: 'sb-02', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'CY-03', batchNo: 'B2607-H4488', supplierBatchNo: '4488', expiresOn: null, status: 'AVAILABLE', quantity: 2_040, reserved: 0, allocated: 0, rate: 247.10, ageDays: 17, lastMovementAt: daysAgo(2, 9) },
  { uid: 'sb-03', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', warehouse: 'Quarantine Store', warehouseCode: 'QTN-01', bin: null, batchNo: 'B2607-H4501', supplierBatchNo: '4501', expiresOn: null, status: 'QUARANTINE', quantity: 1_200, reserved: 0, allocated: 0, rate: 248.40, ageDays: 2, lastMovementAt: daysAgo(2, 14) },
  { uid: 'sb-04', itemCode: 'RM-SS316-060', itemName: 'SS 316 Coil 0.60 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'CY-05', batchNo: 'B2606-H2214', supplierBatchNo: '2214', expiresOn: null, status: 'AVAILABLE', quantity: 3_420, reserved: 0, allocated: 0, rate: 412.00, ageDays: 44, lastMovementAt: daysAgo(9, 10) },
  { uid: 'sb-05', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless with Silicone Seal', itemClass: 'COMPONENT', uom: 'NOS', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'A-04-2-1', batchNo: 'B2607021', supplierBatchNo: 'LOT-9921', expiresOn: null, status: 'AVAILABLE', quantity: 38_300, reserved: 4_500, allocated: 0, rate: 38.50, ageDays: 21, lastMovementAt: daysAgo(1, 15) },
  { uid: 'sb-06', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm — food grade', itemClass: 'COMPONENT', uom: 'NOS', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'A-01-1-1', batchNo: 'B2607014', supplierBatchNo: 'EP-4412', expiresOn: f(420), status: 'AVAILABLE', quantity: 12_380, reserved: 0, allocated: 0, rate: 3.20, ageDays: 24, lastMovementAt: daysAgo(0, 10) },
  { uid: 'sb-07', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', itemClass: 'COMPONENT', uom: 'NOS', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'A-01-1-3', batchNo: 'B2606018', supplierBatchNo: 'PP-8841', expiresOn: null, status: 'AVAILABLE', quantity: 8_900, reserved: 0, allocated: 0, rate: 7.40, ageDays: 41, lastMovementAt: daysAgo(3, 12) },
  { uid: 'sb-08', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black RAL 9005', itemClass: 'CONSUMABLE', uom: 'KG', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'BLK-01', batchNo: 'B2604011', supplierBatchNo: 'AK-2611', expiresOn: f(20), status: 'AVAILABLE', quantity: 1_090, reserved: 150, allocated: 0, rate: 312.00, ageDays: 118, lastMovementAt: daysAgo(1, 11) },
  { uid: 'sb-09', itemCode: 'CON-PWD-BLU', itemName: 'Powder Coating — Ocean Blue RAL 5015', itemClass: 'CONSUMABLE', uom: 'KG', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'BLK-02', batchNo: 'B2606020', supplierBatchNo: 'AK-2704', expiresOn: f(196), status: 'AVAILABLE', quantity: 2_180, reserved: 0, allocated: 0, rate: 318.00, ageDays: 38, lastMovementAt: daysAgo(6, 14) },
  { uid: 'sb-10', itemCode: 'PKG-CTN-24', itemName: 'Corrugated Carton — 24 units', itemClass: 'PACKING', uom: 'NOS', warehouse: 'Packing Material Store', warehouseCode: 'PKG-01', bin: 'C-01-1', batchNo: null, supplierBatchNo: null, expiresOn: null, status: 'AVAILABLE', quantity: 1_240, reserved: 0, allocated: 0, rate: 46.00, ageDays: 63, lastMovementAt: daysAgo(2, 16) },
  { uid: 'sb-11', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', itemClass: 'SEMI_FINISHED', uom: 'NOS', warehouse: 'Work in Progress Store', warehouseCode: 'WIP-01', bin: 'W-01-A', batchNo: 'B2607014', supplierBatchNo: null, expiresOn: null, status: 'AVAILABLE', quantity: 4_980, reserved: 0, allocated: 0, rate: 96.40, ageDays: 11, lastMovementAt: daysAgo(1, 9) },
  { uid: 'sb-12', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', itemClass: 'SEMI_FINISHED', uom: 'NOS', warehouse: 'Job-work — Coat Tech Industries', warehouseCode: 'SUB-01', bin: null, batchNo: 'B2607014', supplierBatchNo: null, expiresOn: null, status: 'AT_SUBCONTRACTOR', quantity: 8_400, reserved: 0, allocated: 0, rate: 96.40, ageDays: 11, lastMovementAt: daysAgo(4, 10) },
  { uid: 'sb-13', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', itemClass: 'FINISHED', uom: 'NOS', warehouse: 'Finished Goods Store', warehouseCode: 'FG-01', bin: 'P-A-01', batchNo: 'B2607021', supplierBatchNo: null, expiresOn: null, status: 'AVAILABLE', quantity: 1_152, reserved: 1_152, allocated: 1_152, rate: 412.80, ageDays: 8, lastMovementAt: daysAgo(1, 13) },
  { uid: 'sb-14', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', itemClass: 'FINISHED', uom: 'NOS', warehouse: 'Finished Goods Store', warehouseCode: 'FG-01', bin: 'P-A-02', batchNo: 'B2607031', supplierBatchNo: null, expiresOn: null, status: 'AVAILABLE', quantity: 3_708, reserved: 2_556, allocated: 0, rate: 412.80, ageDays: 3, lastMovementAt: daysAgo(0, 12) },
  { uid: 'sb-15', itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', itemClass: 'FINISHED', uom: 'NOS', warehouse: 'Finished Goods Store', warehouseCode: 'FG-01', bin: 'P-A-04', batchNo: 'B2607008', supplierBatchNo: null, expiresOn: null, status: 'AVAILABLE', quantity: 640, reserved: 160, allocated: 0, rate: 596.20, ageDays: 19, lastMovementAt: daysAgo(3, 15) },
  { uid: 'sb-16', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', itemClass: 'FINISHED', uom: 'NOS', warehouse: 'Coimbatore Depot Store', warehouseCode: 'FG-02', bin: null, batchNo: 'B2606033', supplierBatchNo: null, expiresOn: null, status: 'AVAILABLE', quantity: 2_880, reserved: 0, allocated: 0, rate: 412.80, ageDays: 36, lastMovementAt: daysAgo(8, 11) },
  { uid: 'sb-17', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', itemClass: 'FINISHED', uom: 'NOS', warehouse: 'Goods in Transit', warehouseCode: 'TRN-01', bin: null, batchNo: 'B2606033', supplierBatchNo: null, expiresOn: null, status: 'IN_TRANSIT', quantity: 1_152, reserved: 0, allocated: 0, rate: 412.80, ageDays: 36, lastMovementAt: daysAgo(2, 8) },
  { uid: 'sb-18', itemCode: 'SF-BODY-500', itemName: 'Bottle Body Shell — 500 ml', itemClass: 'SEMI_FINISHED', uom: 'NOS', warehouse: 'Reject Store', warehouseCode: 'REJ-01', bin: null, batchNo: 'B2606022', supplierBatchNo: null, expiresOn: null, status: 'REJECTED', quantity: 184, reserved: 0, allocated: 0, rate: 78.20, ageDays: 34, lastMovementAt: daysAgo(11, 16) },
  { uid: 'sb-19', itemCode: 'PKG-CTN-MTR-24', itemName: 'Carton — Metro Retail 2024 artwork', itemClass: 'PACKING', uom: 'NOS', warehouse: 'Packing Material Store', warehouseCode: 'PKG-01', bin: 'C-04-2', batchNo: null, supplierBatchNo: null, expiresOn: null, status: 'BLOCKED', quantity: 9_340, reserved: 0, allocated: 0, rate: 46.00, ageDays: 412, lastMovementAt: daysAgo(214, 10) },
  { uid: 'sb-20', itemCode: 'RM-SS201-045', itemName: 'SS 201 Coil 0.45 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', warehouse: 'Raw Material Store', warehouseCode: 'RM-01', bin: 'CY-02', batchNo: 'B2605-H4402', supplierBatchNo: '4402', expiresOn: null, status: 'AVAILABLE', quantity: 3_240, reserved: 0, allocated: 0, rate: 168.40, ageDays: 74, lastMovementAt: daysAgo(14, 11) },
]

/* ══════════════════════ Item-level stock position ═════════════════════ */

export const stockPositions: StockPosition[] = [
  { uid: 'sp-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', abcClass: 'A', xyzClass: 'X', onHand: 12_140, available: 10_940, reserved: 3_000, quarantine: 1_200, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 20_000, wip: 2_450, rate: 243.02, reorderLevel: 8_000, minLevel: 4_000, maxLevel: 26_000, safetyStock: 3_200, avgDailyDemand: 820, leadTimeDays: 21, lastIssueOn: d(5), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-02', itemCode: 'RM-SS316-060', itemName: 'SS 316 Coil 0.60 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', abcClass: 'A', xyzClass: 'X', onHand: 3_420, available: 3_420, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 412.00, reorderLevel: 3_000, minLevel: 1_500, maxLevel: 9_000, safetyStock: 1_200, avgDailyDemand: 570, leadTimeDays: 21, lastIssueOn: d(9), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-03', itemCode: 'RM-SS201-045', itemName: 'SS 201 Coil 0.45 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', abcClass: 'B', xyzClass: 'Y', onHand: 3_240, available: 3_240, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 6_000, wip: 0, rate: 168.40, reorderLevel: 2_500, minLevel: 1_200, maxLevel: 8_000, safetyStock: 900, avgDailyDemand: 240, leadTimeDays: 18, lastIssueOn: d(14), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-04', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless with Silicone Seal', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'B', xyzClass: 'Y', onHand: 38_300, available: 38_300, reserved: 4_500, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 30_000, wip: 5_000, rate: 38.50, reorderLevel: 20_000, minLevel: 10_000, maxLevel: 70_000, safetyStock: 8_000, avgDailyDemand: 1_580, leadTimeDays: 14, lastIssueOn: d(1), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-05', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm — food grade', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'C', xyzClass: 'X', onHand: 12_380, available: 12_380, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 50_000, wip: 0, rate: 3.20, reorderLevel: 15_000, minLevel: 8_000, maxLevel: 60_000, safetyStock: 6_000, avgDailyDemand: 1_620, leadTimeDays: 14, lastIssueOn: d(0), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-06', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'C', xyzClass: 'Y', onHand: 8_900, available: 8_900, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 7.40, reorderLevel: 6_000, minLevel: 3_000, maxLevel: 24_000, safetyStock: 2_400, avgDailyDemand: 640, leadTimeDays: 12, lastIssueOn: d(3), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-07', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black RAL 9005', itemClass: 'CONSUMABLE', uom: 'KG', abcClass: 'B', xyzClass: 'X', onHand: 1_090, available: 1_090, reserved: 150, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 400, wip: 0, rate: 312.00, reorderLevel: 900, minLevel: 400, maxLevel: 2_400, safetyStock: 300, avgDailyDemand: 62, leadTimeDays: 10, lastIssueOn: d(1), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-08', itemCode: 'CON-PWD-BLU', itemName: 'Powder Coating — Ocean Blue RAL 5015', itemClass: 'CONSUMABLE', uom: 'KG', abcClass: 'C', xyzClass: 'Z', onHand: 2_180, available: 2_180, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 318.00, reorderLevel: 600, minLevel: 250, maxLevel: 1_800, safetyStock: 200, avgDailyDemand: 18, leadTimeDays: 10, lastIssueOn: d(6), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-09', itemCode: 'PKG-CTN-24', itemName: 'Corrugated Carton — 24 units', itemClass: 'PACKING', uom: 'NOS', abcClass: 'C', xyzClass: 'Z', onHand: 1_240, available: 1_240, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 46.00, reorderLevel: 2_000, minLevel: 1_000, maxLevel: 9_000, safetyStock: 800, avgDailyDemand: 310, leadTimeDays: 9, lastIssueOn: d(2), isBatchTracked: false, isSerialTracked: false },
  { uid: 'sp-10', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', itemClass: 'SEMI_FINISHED', uom: 'NOS', abcClass: 'A', xyzClass: 'X', onHand: 13_380, available: 4_980, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 8_400, onOrder: 0, wip: 4_980, rate: 96.40, reorderLevel: 2_000, minLevel: 1_000, maxLevel: 20_000, safetyStock: 1_500, avgDailyDemand: 940, leadTimeDays: 4, lastIssueOn: d(1), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-11', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', itemClass: 'FINISHED', uom: 'NOS', abcClass: 'A', xyzClass: 'Y', onHand: 8_892, available: 4_860, reserved: 3_708, quarantine: 0, blocked: 0, inTransit: 1_152, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 412.80, reorderLevel: 1_500, minLevel: 800, maxLevel: 12_000, safetyStock: 1_200, avgDailyDemand: 640, leadTimeDays: 6, lastIssueOn: d(0), isBatchTracked: true, isSerialTracked: true },
  { uid: 'sp-12', itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', itemClass: 'FINISHED', uom: 'NOS', abcClass: 'B', xyzClass: 'Y', onHand: 640, available: 480, reserved: 160, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 1_200, rate: 596.20, reorderLevel: 800, minLevel: 400, maxLevel: 5_000, safetyStock: 500, avgDailyDemand: 210, leadTimeDays: 6, lastIssueOn: d(3), isBatchTracked: true, isSerialTracked: true },
  { uid: 'sp-13', itemCode: 'PKG-CTN-MTR-24', itemName: 'Carton — Metro Retail 2024 artwork', itemClass: 'PACKING', uom: 'NOS', abcClass: 'C', xyzClass: 'Z', onHand: 9_340, available: 0, reserved: 0, quarantine: 0, blocked: 9_340, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 46.00, reorderLevel: 0, minLevel: 0, maxLevel: 0, safetyStock: 0, avgDailyDemand: 0, leadTimeDays: 9, lastIssueOn: d(214), isBatchTracked: false, isSerialTracked: false },
  /* Components and sub-assemblies introduced with the engineering BOMs. */
  { uid: 'sp-14', itemCode: 'SF-LID-ASSY-SS', itemName: 'Lid Assembly — Stainless Screw Cap', itemClass: 'SEMI_FINISHED', uom: 'NOS', abcClass: 'B', xyzClass: 'X', onHand: 6_240, available: 6_240, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 2_000, rate: 46.45, reorderLevel: 3_000, minLevel: 1_500, maxLevel: 18_000, safetyStock: 2_000, avgDailyDemand: 640, leadTimeDays: 2, lastIssueOn: d(1), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-15', itemCode: 'SF-BODY-1000', itemName: 'Bottle Body Shell — 1000 ml', itemClass: 'SEMI_FINISHED', uom: 'NOS', abcClass: 'B', xyzClass: 'Y', onHand: 1_860, available: 1_860, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 800, rate: 199.23, reorderLevel: 1_000, minLevel: 500, maxLevel: 6_000, safetyStock: 600, avgDailyDemand: 210, leadTimeDays: 3, lastIssueOn: d(4), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-16', itemCode: 'CMP-DISC-BOT-73', itemName: 'Bottom Disc — SS 304, 73 mm', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'C', xyzClass: 'X', onHand: 24_600, available: 24_600, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 20_000, wip: 0, rate: 9.40, reorderLevel: 15_000, minLevel: 8_000, maxLevel: 60_000, safetyStock: 6_000, avgDailyDemand: 1_150, leadTimeDays: 14, lastIssueOn: d(1), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-17', itemCode: 'CMP-SEAL-SIL', itemName: 'Silicone Seal Ring — Food Grade', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'C', xyzClass: 'X', onHand: 9_400, available: 9_400, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 3.20, reorderLevel: 12_000, minLevel: 6_000, maxLevel: 50_000, safetyStock: 5_000, avgDailyDemand: 640, leadTimeDays: 14, lastIssueOn: d(0), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-18', itemCode: 'CMP-INS-THRD', itemName: 'Thread Insert — Polypropylene', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'C', xyzClass: 'Y', onHand: 18_700, available: 18_700, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 2.60, reorderLevel: 10_000, minLevel: 5_000, maxLevel: 45_000, safetyStock: 4_000, avgDailyDemand: 640, leadTimeDays: 12, lastIssueOn: d(2), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-19', itemCode: 'CMP-LID-SIPPER', itemName: 'Sipper Cap Assembly — Trek', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'B', xyzClass: 'Y', onHand: 2_140, available: 2_140, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 5_000, wip: 0, rate: 62.50, reorderLevel: 3_000, minLevel: 1_500, maxLevel: 12_000, safetyStock: 1_200, avgDailyDemand: 210, leadTimeDays: 21, lastIssueOn: d(3), isBatchTracked: true, isSerialTracked: false },
  { uid: 'sp-20', itemCode: 'CON-GAS-ARG', itemName: 'Argon Gas — Welding Grade', itemClass: 'CONSUMABLE', uom: 'M3', abcClass: 'C', xyzClass: 'X', onHand: 148, available: 148, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 148.00, reorderLevel: 120, minLevel: 60, maxLevel: 400, safetyStock: 50, avgDailyDemand: 13, leadTimeDays: 7, lastIssueOn: d(1), isBatchTracked: false, isSerialTracked: false },
  { uid: 'sp-21', itemCode: 'PKG-BOX-IND', itemName: 'Individual Gift Box — Printed', itemClass: 'PACKING', uom: 'NOS', abcClass: 'B', xyzClass: 'Y', onHand: 14_800, available: 14_800, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 14.20, reorderLevel: 12_000, minLevel: 6_000, maxLevel: 50_000, safetyStock: 5_000, avgDailyDemand: 850, leadTimeDays: 12, lastIssueOn: d(0), isBatchTracked: false, isSerialTracked: false },
  { uid: 'sp-22', itemCode: 'PKG-LBL-BAR', itemName: 'Barcode Label — EAN-13', itemClass: 'PACKING', uom: 'NOS', abcClass: 'C', xyzClass: 'X', onHand: 41_200, available: 41_200, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 0.85, reorderLevel: 25_000, minLevel: 12_000, maxLevel: 120_000, safetyStock: 10_000, avgDailyDemand: 1_700, leadTimeDays: 7, lastIssueOn: d(0), isBatchTracked: false, isSerialTracked: false },
  { uid: 'sp-23', itemCode: 'PKG-MAN-USR', itemName: 'User Manual & Warranty Card', itemClass: 'PACKING', uom: 'NOS', abcClass: 'C', xyzClass: 'Y', onHand: 7_600, available: 7_600, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 1.90, reorderLevel: 10_000, minLevel: 5_000, maxLevel: 40_000, safetyStock: 4_000, avgDailyDemand: 850, leadTimeDays: 10, lastIssueOn: d(0), isBatchTracked: false, isSerialTracked: false },
  { uid: 'sp-24', itemCode: 'FG-SS-500-BLU', itemName: 'Vacuum Flask 500 ml — Ocean Blue', itemClass: 'FINISHED', uom: 'NOS', abcClass: 'C', xyzClass: 'Z', onHand: 0, available: 0, reserved: 0, quarantine: 0, blocked: 0, inTransit: 0, atSubcontractor: 0, onOrder: 0, wip: 0, rate: 348.00, reorderLevel: 500, minLevel: 200, maxLevel: 4_000, safetyStock: 300, avgDailyDemand: 0, leadTimeDays: 7, lastIssueOn: null, isBatchTracked: true, isSerialTracked: true },
]

/* ═════════════════════════ Stock ledger ═══════════════════════════════ */

export const ledger: LedgerEntry[] = [
  { uid: 'lg-01', postedAt: daysAgo(57, 11), businessDate: d(57), movementType: '101', movementName: 'Goods receipt against PO', direction: 'IN', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'QTN-01', bin: null, batchNo: 'B2606-H4471', quantity: 9_600, rate: 244.20, value: 2_344_320, runningQty: 9_600, docType: 'GRN', docNo: 'P1/GRN/26-27/00318', postedBy: 'K. Ravi' },
  { uid: 'lg-02', postedAt: daysAgo(56, 10), businessDate: d(56), movementType: '501', movementName: 'QC release', direction: 'STATUS', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: null, batchNo: 'B2606-H4471', quantity: 9_600, rate: 244.20, value: 0, runningQty: 9_600, docType: 'INSPECTION', docNo: 'IQC/26-27/00196', postedBy: 'S. Meena', reason: 'Accepted — MTC verified' },
  { uid: 'lg-03', postedAt: daysAgo(56, 12), businessDate: d(56), movementType: '301', movementName: 'Put-away', direction: 'STATUS', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', quantity: 9_600, rate: 244.20, value: 0, runningQty: 9_600, docType: 'PUTAWAY', docNo: 'PUT/26-27/00792', postedBy: 'S. Kumar' },
  { uid: 'lg-04', postedAt: daysAgo(53, 9), businessDate: d(53), movementType: '201', movementName: 'Issue to production order', direction: 'OUT', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', quantity: 2_400, rate: 244.20, value: 586_080, runningQty: 7_200, docType: 'MATERIAL_ISSUE', docNo: 'P1/MI/26-27/004102', postedBy: 'S. Kumar' },
  { uid: 'lg-05', postedAt: daysAgo(50, 15), businessDate: d(50), movementType: '201', movementName: 'Material return (residual)', direction: 'IN', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', quantity: 180, rate: 244.20, value: 43_956, runningQty: 7_380, docType: 'MATERIAL_RETURN', docNo: 'P1/MR/26-27/00841', postedBy: 'T. Ganesh', reason: 'Residual coil, weighbridge WB/26/8102' },
  { uid: 'lg-06', postedAt: daysAgo(31, 16), businessDate: d(31), movementType: '404', movementName: 'Count variance decrease', direction: 'OUT', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', quantity: 12, rate: 244.20, value: 2_930, runningQty: 7_368, docType: 'CYCLE_COUNT', docNo: 'CC/26-27/0042', postedBy: 'M. Lakshmi', reason: 'Weighment difference' },
  { uid: 'lg-07', postedAt: daysAgo(17, 10), businessDate: d(17), movementType: '101', movementName: 'Goods receipt against PO', direction: 'IN', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-03', batchNo: 'B2607-H4488', quantity: 2_640, rate: 247.10, value: 652_344, runningQty: 10_008, docType: 'GRN', docNo: 'P1/GRN/26-27/00341', postedBy: 'K. Ravi' },
  { uid: 'lg-08', postedAt: daysAgo(5, 11), businessDate: d(5), movementType: '201', movementName: 'Issue to production order', direction: 'OUT', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', quantity: 1_250, rate: 243.02, value: 303_775, runningQty: 8_758, docType: 'MATERIAL_ISSUE', docNo: 'P1/MI/26-27/004418', postedBy: 'S. Kumar' },
  { uid: 'lg-09', postedAt: daysAgo(2, 9), businessDate: d(2), movementType: '402', movementName: 'Adjustment decrease', direction: 'OUT', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', quantity: 32, rate: 243.02, value: 7_777, runningQty: 8_726, docType: 'ADJUSTMENT', docNo: 'ADJ/26-27/0114', postedBy: 'M. Lakshmi', reason: 'Weighment difference' },
  { uid: 'lg-10', postedAt: daysAgo(2, 14), businessDate: d(2), movementType: '101', movementName: 'Goods receipt against PO', direction: 'IN', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'QTN-01', bin: null, batchNo: 'B2607-H4501', quantity: 1_200, rate: 248.40, value: 298_080, runningQty: 1_200, docType: 'GRN', docNo: 'P1/GRN/26-27/00352', postedBy: 'K. Ravi', reason: 'Quarantined pending IQC/26-27/00214' },
  { uid: 'lg-11', postedAt: daysAgo(1, 15), businessDate: d(1), movementType: '201', movementName: 'Issue to production order', direction: 'OUT', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless', uom: 'NOS', warehouseCode: 'RM-01', bin: 'A-04-2-1', batchNo: 'B2607021', quantity: 5_000, rate: 38.50, value: 192_500, runningQty: 38_300, docType: 'MATERIAL_ISSUE', docNo: 'P1/MI/26-27/004421', postedBy: 'S. Kumar' },
  { uid: 'lg-12', postedAt: daysAgo(1, 11), businessDate: d(1), movementType: '201', movementName: 'Issue to production order', direction: 'OUT', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black', uom: 'KG', warehouseCode: 'RM-01', bin: 'BLK-01', batchNo: 'B2604011', quantity: 140, rate: 312.00, value: 43_680, runningQty: 1_090, docType: 'MATERIAL_ISSUE', docNo: 'P1/MI/26-27/004421', postedBy: 'S. Kumar', reason: 'Over-issue 16.7% — trial run, new nozzle' },
  { uid: 'lg-13', postedAt: daysAgo(4, 10), businessDate: d(4), movementType: '203', movementName: 'Issue to job worker', direction: 'OUT', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', uom: 'NOS', warehouseCode: 'WIP-01', bin: 'W-01-A', batchNo: 'B2607014', quantity: 8_400, rate: 96.40, value: 809_760, runningQty: 4_980, docType: 'JOBWORK_CHALLAN', docNo: 'P1/JW/26-27/0121', postedBy: 'M. Devi' },
  { uid: 'lg-14', postedAt: daysAgo(3, 12), businessDate: d(3), movementType: '103', movementName: 'Receipt from production', direction: 'IN', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', warehouseCode: 'FG-01', bin: 'P-A-02', batchNo: 'B2607031', quantity: 3_708, rate: 412.80, value: 1_530_662, runningQty: 3_708, docType: 'PRODUCTION_RECEIPT', docNo: 'P1/PRC/26-27/00612', postedBy: 'P. Suresh' },
  { uid: 'lg-15', postedAt: daysAgo(2, 8), businessDate: d(2), movementType: '303', movementName: 'Inter-plant transfer — dispatch', direction: 'OUT', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', warehouseCode: 'FG-01', bin: 'P-A-01', batchNo: 'B2606033', quantity: 1_152, rate: 412.80, value: 475_546, runningQty: 0, docType: 'STOCK_TRANSFER', docNo: 'ST/26-27/00412', postedBy: 'P. Suresh' },
  { uid: 'lg-16', postedAt: daysAgo(11, 16), businessDate: d(11), movementType: '405', movementName: 'Scrap', direction: 'OUT', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', uom: 'NOS', warehouseCode: 'WIP-01', bin: 'W-01-A', batchNo: 'B2607014', quantity: 184, rate: 96.40, value: 17_737, runningQty: 4_980, docType: 'SCRAP_NOTE', docNo: 'P1/SCR/26-27/0088', postedBy: 'M. Devi', reason: 'Weld porosity' },
  { uid: 'lg-17', postedAt: daysAgo(0, 10), businessDate: d(0), movementType: '201', movementName: 'Issue to production order', direction: 'OUT', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm', uom: 'NOS', warehouseCode: 'RM-01', bin: 'A-01-1-1', batchNo: 'B2607014', quantity: 20, rate: 3.20, value: 64, runningQty: 12_380, docType: 'MATERIAL_ISSUE', docNo: 'P1/MI/26-27/004424', postedBy: 'S. Kumar' },
  { uid: 'lg-18', postedAt: daysAgo(0, 12), businessDate: d(0), movementType: '301', movementName: 'Bin transfer', direction: 'STATUS', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', warehouseCode: 'FG-01', bin: 'P-A-02', batchNo: 'B2607031', quantity: 480, rate: 412.80, value: 0, runningQty: 3_708, docType: 'STOCK_TRANSFER', docNo: 'ST/26-27/00419', postedBy: 'P. Suresh' },
]

/* ════════════════════════ Put-away & receipts ═════════════════════════ */

export const putaways: PutawayDoc[] = [
  {
    uid: 'pa-01', docNo: 'PUT/26-27/00881', docDate: d(0), status: 'IN_PROGRESS', plant: 'Chennai — Unit 1',
    sourceType: 'PURCHASE', sourceDocNo: 'P1/GRN/26-27/00352', sourceParty: 'Jindal Stainless Ltd',
    warehouse: 'Raw Material Store', strategy: 'BULK_FIRST', receivedAt: daysAgo(0, 9), ageHours: 3.2,
    totalReceived: 4_240, totalBinned: 0,
    createdBy: 'K. Ravi', createdAt: daysAgo(0, 9), version: 1, attachments: 2, comments: 0,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING' }],
    lines: [
      { uid: 'pal-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', batchNo: 'B2607-H4501', expiresOn: null, receivedQty: 1_200, binnedQty: 0, toBin: null, proposedBin: 'CY-04', proposalReason: 'Nearest empty coil stand', stockStatus: 'QUARANTINE', mtcNo: '4501/2607', labelsPrinted: 0 },
      { uid: 'pal-02', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless', uom: 'NOS', batchNo: 'B2607034', expiresOn: null, receivedQty: 30_000, binnedQty: 0, toBin: null, proposedBin: 'A-04-2-1', proposalReason: 'Consolidate — same item already in bin', stockStatus: 'AVAILABLE', labelsPrinted: 0 },
      { uid: 'pal-03', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black', uom: 'KG', batchNo: 'B2607035', expiresOn: f(168), receivedQty: 400, binnedQty: 0, toBin: null, proposedBin: 'BLK-03', proposalReason: 'Zone rule — chemicals', stockStatus: 'QUARANTINE', labelsPrinted: 0 },
    ],
  },
  {
    uid: 'pa-02', docNo: 'PUT/26-27/00880', docDate: d(0), status: 'IN_PROGRESS', plant: 'Chennai — Unit 1',
    sourceType: 'PRODUCTION', sourceDocNo: 'P1/PRC/26-27/00614', sourceParty: 'Line 1 — Assembly',
    warehouse: 'Finished Goods Store', strategy: 'CONSOLIDATE', receivedAt: daysAgo(0, 7), ageHours: 5.4,
    totalReceived: 1_440, totalBinned: 480,
    createdBy: 'P. Suresh', createdAt: daysAgo(0, 7), version: 2, attachments: 0, comments: 1,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING' }],
    lines: [
      { uid: 'pal-04', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', batchNo: 'B2607031', expiresOn: null, receivedQty: 1_440, binnedQty: 480, toBin: 'P-A-02', proposedBin: 'P-A-02', proposalReason: 'Consolidate — same batch', stockStatus: 'AVAILABLE', labelsPrinted: 20 },
    ],
  },
  {
    uid: 'pa-03', docNo: 'PUT/26-27/00879', docDate: d(1), status: 'COMPLETED', plant: 'Chennai — Unit 1',
    sourceType: 'JOB_WORK', sourceDocNo: 'P1/JW/26-27/0118', sourceParty: 'Coat Tech Industries',
    warehouse: 'Work in Progress Store', strategy: 'NEAREST_EMPTY', receivedAt: daysAgo(1, 14), ageHours: 1.1,
    totalReceived: 4_860, totalBinned: 4_860,
    createdBy: 'M. Devi', createdAt: daysAgo(1, 14), version: 3, attachments: 1, comments: 0,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(1, 15) }],
    lines: [
      { uid: 'pal-05', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml (coated)', uom: 'NOS', batchNo: 'B2607014', expiresOn: null, receivedQty: 4_860, binnedQty: 4_860, toBin: 'W-01-A', proposedBin: 'W-01-B', proposalReason: 'Nearest empty', overrideReason: 'Line 1 staging — consumed same shift', stockStatus: 'AVAILABLE', labelsPrinted: 4 },
    ],
  },
  {
    uid: 'pa-04', docNo: 'PUT/26-27/00878', docDate: d(2), status: 'COMPLETED', plant: 'Chennai — Unit 1',
    sourceType: 'SALES_RETURN', sourceDocNo: 'SR/26-27/0041', sourceParty: 'Gift Bazaar Retail',
    warehouse: 'Quarantine Store', strategy: 'MANUAL', receivedAt: daysAgo(2, 11), ageHours: 2.0,
    totalReceived: 96, totalBinned: 96,
    createdBy: 'S. Meena', createdAt: daysAgo(2, 11), version: 2, attachments: 3, comments: 2,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(2, 13) }],
    lines: [
      { uid: 'pal-06', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', batchNo: 'B2606033', expiresOn: null, receivedQty: 96, binnedQty: 96, toBin: null, proposedBin: null, proposalReason: 'Quarantine — returns are always inspected', stockStatus: 'QUARANTINE', labelsPrinted: 1 },
    ],
  },
]

/* ═══════════════════════════ Goods receipts ═══════════════════════════ */

export const goodsReceipts: GoodsReceipt[] = [
  {
    uid: 'gr-01', docNo: 'GR/26-27/00412', docDate: d(0), status: 'PENDING_APPROVAL', plant: 'Chennai — Unit 1',
    sourceType: 'PURCHASE', sourceDocNo: 'P1/GRN/26-27/00352', sourceParty: 'Jindal Stainless Ltd',
    warehouse: 'Quarantine Store', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', uom: 'KG',
    quantity: 1_200, acceptedQty: 0, rejectedQty: 0, batchNo: 'B2607-H4501', expiresOn: null, bin: null,
    rate: 248.40, value: 298_080, qcRequired: true, qcStatus: 'PENDING', receivedBy: 'K. Ravi', labelsPrinted: 1,
    createdBy: 'K. Ravi', createdAt: daysAgo(0, 9), version: 1, attachments: 2, comments: 0,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING' }],
  },
  {
    uid: 'gr-02', docNo: 'GR/26-27/00411', docDate: d(0), status: 'COMPLETED', plant: 'Chennai — Unit 1',
    sourceType: 'PRODUCTION', sourceDocNo: 'PRD/2607/0119', sourceParty: 'Line 1 — Assembly',
    warehouse: 'Finished Goods Store', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS',
    quantity: 1_440, acceptedQty: 1_440, rejectedQty: 0, batchNo: 'B2607031', expiresOn: null, bin: 'P-A-02',
    rate: 412.80, value: 594_432, qcRequired: false, qcStatus: 'NOT_REQUIRED', receivedBy: 'P. Suresh', labelsPrinted: 60,
    createdBy: 'P. Suresh', createdAt: daysAgo(0, 7), version: 2, attachments: 0, comments: 1,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(0, 8) }],
  },
  {
    uid: 'gr-03', docNo: 'GR/26-27/00410', docDate: d(1), status: 'COMPLETED', plant: 'Chennai — Unit 1',
    sourceType: 'JOB_WORK', sourceDocNo: 'P1/JW/26-27/0118', sourceParty: 'Coat Tech Industries',
    warehouse: 'Work in Progress Store', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml (coated)', uom: 'NOS',
    quantity: 4_860, acceptedQty: 4_860, rejectedQty: 0, batchNo: 'B2607014', expiresOn: null, bin: 'W-01-A',
    rate: 96.40, value: 468_504, qcRequired: false, qcStatus: 'NOT_REQUIRED', receivedBy: 'M. Devi', labelsPrinted: 4,
    createdBy: 'M. Devi', createdAt: daysAgo(1, 14), version: 3, attachments: 1, comments: 0,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(1, 15) }],
  },
  {
    uid: 'gr-04', docNo: 'GR/26-27/00409', docDate: d(2), status: 'IN_PROGRESS', plant: 'Chennai — Unit 1',
    sourceType: 'SALES_RETURN', sourceDocNo: 'SR/26-27/0041', sourceParty: 'Gift Bazaar Retail',
    warehouse: 'Quarantine Store', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS',
    quantity: 96, acceptedQty: 0, rejectedQty: 0, batchNo: 'B2606033', expiresOn: null, bin: null,
    rate: 412.80, value: 39_629, qcRequired: true, qcStatus: 'PENDING', receivedBy: 'S. Meena', labelsPrinted: 1,
    createdBy: 'S. Meena', createdAt: daysAgo(2, 11), version: 2, attachments: 3, comments: 2,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(2, 13) }],
  },
  {
    uid: 'gr-05', docNo: 'GR/26-27/00404', docDate: d(9), status: 'COMPLETED', plant: 'Chennai — Unit 1',
    sourceType: 'PURCHASE', sourceDocNo: 'P1/GRN/26-27/00344', sourceParty: 'Precision Polymers',
    warehouse: 'Raw Material Store', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS',
    quantity: 12_000, acceptedQty: 11_640, rejectedQty: 360, batchNo: 'B2607028', expiresOn: null, bin: 'A-01-1-3',
    rate: 7.40, value: 88_800, qcRequired: true, qcStatus: 'DEVIATION_ACCEPTED', receivedBy: 'K. Ravi', labelsPrinted: 2,
    createdBy: 'K. Ravi', createdAt: daysAgo(9, 10), version: 4, attachments: 2, comments: 3,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(9, 12) }],
  },
]

/* ═══════════════════════════ Label templates ══════════════════════════ */

export const labelTemplates: LabelTemplate[] = [
  { uid: 'lb-01', code: 'LBL-BATCH', name: 'Batch / lot label — 100 × 50 mm', objectType: 'BATCH', symbology: 'CODE128', sizeMm: '100 × 50', pattern: 'v1|RM|{ITEM}|{BATCH}|{HEAT}', fields: ['Item code', 'Item name', 'Batch', 'Heat / supplier lot', 'Quantity', 'Received date', 'MTC number'], printer: 'Store Zebra ZT411', printedCount: 1_842, isActive: true },
  { uid: 'lb-02', code: 'LBL-BIN', name: 'Bin location label — 75 × 25 mm', objectType: 'BIN', symbology: 'CODE128', sizeMm: '75 × 25', pattern: 'v1|LOC|{WH}|{ZONE}|{BIN}', fields: ['Warehouse', 'Zone', 'Bin code', 'Pick sequence'], printer: 'Store Zebra ZT411', printedCount: 936, isActive: true },
  { uid: 'lb-03', code: 'LBL-FG-QR', name: 'Finished bottle QR — 30 × 30 mm', objectType: 'SERIAL', symbology: 'QR', sizeMm: '30 × 30', pattern: 'v1|FG|{SKU}|{SERIAL}', fields: ['SKU', 'Serial', 'Batch', 'Manufactured', 'Warranty months'], printer: 'Packing TSC TE310', printedCount: 42_180, isActive: true },
  { uid: 'lb-04', code: 'LBL-CTN', name: 'Carton label — 100 × 100 mm', objectType: 'CARTON', symbology: 'QR', sizeMm: '100 × 100', pattern: 'v1|IB|{SKU}|{CARTON}|{QTY}', fields: ['SKU', 'Carton number', 'Quantity', 'Batch', 'Customer', 'Packed on'], printer: 'Packing TSC TE310', printedCount: 8_940, isActive: true },
  { uid: 'lb-05', code: 'LBL-PLT', name: 'Pallet label — 150 × 100 mm', objectType: 'PALLET', symbology: 'QR', sizeMm: '150 × 100', pattern: 'v1|PLT|{PALLET}|{CARTONS}', fields: ['Pallet number', 'Cartons', 'Total quantity', 'Destination', 'Built on'], printer: 'Dispatch Zebra ZT230', printedCount: 612, isActive: true },
  { uid: 'lb-06', code: 'LBL-ITEM', name: 'Item shelf label — 50 × 25 mm', objectType: 'ITEM', symbology: 'EAN13', sizeMm: '50 × 25', pattern: 'v1|ITM|{ITEM}', fields: ['Item code', 'Description', 'UOM', 'Reorder level'], printer: 'Store Zebra ZT411', printedCount: 214, isActive: true },
]

export const quarantineLots: QuarantineLot[] = [
  { uid: 'ql-01', docNo: 'QTN/26-27/00214', receivedOn: d(2), itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', batchNo: 'B2607-H4501', supplierBatchNo: '4501', supplier: 'Jindal Stainless Ltd', sourceDocNo: 'P1/GRN/26-27/00352', quantity: 1_200, acceptedQty: 0, rejectedQty: 0, warehouse: 'Quarantine Store', inspectionNo: 'IQC/26-27/00214', decision: 'PENDING', ageDays: 2, mtcReceived: true, value: 298_080 },
  { uid: 'ql-02', docNo: 'QTN/26-27/00213', receivedOn: d(2), itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black', uom: 'KG', batchNo: 'B2607035', supplierBatchNo: 'AK-2811', supplier: 'Akzo Nobel India', sourceDocNo: 'P1/GRN/26-27/00352', quantity: 400, acceptedQty: 0, rejectedQty: 0, warehouse: 'Quarantine Store', inspectionNo: 'IQC/26-27/00215', decision: 'PENDING', ageDays: 2, mtcReceived: true, value: 124_800 },
  { uid: 'ql-03', docNo: 'QTN/26-27/00212', receivedOn: d(5), itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm', uom: 'NOS', batchNo: 'B2607033', supplierBatchNo: 'EP-4488', supplier: 'Elasto Poly Products', sourceDocNo: 'P1/GRN/26-27/00348', quantity: 50_000, acceptedQty: 0, rejectedQty: 0, warehouse: 'Quarantine Store', inspectionNo: 'IQC/26-27/00211', decision: 'PENDING', ageDays: 5, mtcReceived: false, value: 160_000 },
  { uid: 'ql-04', docNo: 'QTN/26-27/00211', receivedOn: d(2), itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', batchNo: 'B2606033', supplierBatchNo: null, supplier: 'Gift Bazaar Retail (return)', sourceDocNo: 'SR/26-27/0041', quantity: 96, acceptedQty: 0, rejectedQty: 0, warehouse: 'Quarantine Store', inspectionNo: null, decision: 'PENDING', ageDays: 2, mtcReceived: false, value: 39_629 },
  { uid: 'ql-05', docNo: 'QTN/26-27/00208', receivedOn: d(9), itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS', batchNo: 'B2607028', supplierBatchNo: 'PP-9014', supplier: 'Precision Polymers', sourceDocNo: 'P1/GRN/26-27/00344', quantity: 12_000, acceptedQty: 11_640, rejectedQty: 360, warehouse: 'Quarantine Store', inspectionNo: 'IQC/26-27/00208', decision: 'DEVIATION_ACCEPTED', ageDays: 9, mtcReceived: true, value: 88_800 },
]

/* ═══════════════════ Requisitions, issues, returns ════════════════════ */

export const requisitions: MaterialRequisition[] = [
  {
    uid: 'mrq-01', docNo: 'P1/MRQ/26-27/004418', docDate: d(0), status: 'PENDING_APPROVAL', plant: 'Chennai — Unit 1',
    department: 'Press Shop', costCentre: 'CC-PRD-01', productionOrderNo: 'PRD/2607/0121', requiredOn: f(1), shift: 'A',
    priority: 'HIGH', requestedBy: 'T. Ganesh', fromWarehouse: 'Raw Material Store', estimatedValue: 1_082_400,
    createdBy: 'T. Ganesh', createdAt: daysAgo(0, 8), version: 1, attachments: 0, comments: 1,
    approvals: [{ level: 1, role: 'Shift Supervisor', approver: 'N. Selvam', status: 'PENDING' }],
    lines: [
      { uid: 'mrql-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', bomStandardQty: 4_200, quantity: 4_200, issuedQty: 0, available: 10_940, shortage: false },
      { uid: 'mrql-02', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless', uom: 'NOS', bomStandardQty: 8_000, quantity: 8_000, issuedQty: 0, available: 38_300, shortage: false },
    ],
  },
  {
    uid: 'mrq-02', docNo: 'P1/MRQ/26-27/004417', docDate: d(0), status: 'APPROVED', plant: 'Chennai — Unit 1',
    department: 'Coating & Printing', costCentre: 'CC-PRD-03', productionOrderNo: 'PRD/2607/0119', requiredOn: d(0), shift: 'A',
    priority: 'URGENT', requestedBy: 'J. Mohan', fromWarehouse: 'Raw Material Store', estimatedValue: 43_680,
    createdBy: 'J. Mohan', createdAt: daysAgo(0, 7), version: 2, attachments: 0, comments: 0,
    approvals: [{ level: 1, role: 'Shift Supervisor', approver: 'N. Selvam', status: 'APPROVED', actedAt: daysAgo(0, 8) }],
    lines: [
      { uid: 'mrql-03', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black', uom: 'KG', bomStandardQty: 120, quantity: 140, issuedQty: 140, available: 1_090, shortage: false },
    ],
  },
  {
    uid: 'mrq-03', docNo: 'P1/MRQ/26-27/004416', docDate: d(1), status: 'ON_HOLD', plant: 'Chennai — Unit 1',
    department: 'Packing', costCentre: 'CC-PKG', productionOrderNo: null, requiredOn: f(2), shift: 'B',
    priority: 'HIGH', requestedBy: 'R. Anitha', fromWarehouse: 'Packing Material Store', estimatedValue: 92_000,
    createdBy: 'R. Anitha', createdAt: daysAgo(1, 14), version: 1, attachments: 0, comments: 3,
    remarks: 'Blocked by shortage — 2,000 cartons required, 1,240 free. PR raised.',
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(1, 15) }],
    lines: [
      { uid: 'mrql-04', itemCode: 'PKG-CTN-24', itemName: 'Corrugated Carton — 24 units', uom: 'NOS', bomStandardQty: null, quantity: 2_000, issuedQty: 0, available: 1_240, shortage: true },
    ],
  },
]

export const materialIssues: MaterialIssue[] = [
  {
    uid: 'mi-01', docNo: 'P1/MI/26-27/004421', docDate: d(1), status: 'ISSUED', plant: 'Chennai — Unit 1',
    chargeType: 'PRODUCTION_ORDER', chargeRef: 'PRD/2607/0119', chargeName: 'VF750 Black · 5,000 nos', operation: 'OP-40 Coating',
    costCentre: 'CC-PRD-03', requisitionNo: 'P1/MRQ/26-27/004417', issuedTo: 'J. Mohan', fromWarehouse: 'Raw Material Store',
    shift: 'A', totalQty: 5_140, totalValue: 236_180, overIssueCount: 1,
    createdBy: 'S. Kumar', createdAt: daysAgo(1, 11), version: 1, attachments: 0, comments: 1,
    approvals: [{ level: 1, role: 'Shift Supervisor', approver: 'N. Selvam', status: 'APPROVED', actedAt: daysAgo(1, 11) }],
    lines: [
      { uid: 'mil-01', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black', uom: 'KG', bomStandardQty: 120, alreadyIssued: 0, quantity: 140, bin: 'BLK-01', batchNo: 'B2604011', rate: 312.00, value: 43_680, returnedQty: 0, overIssueReason: 'Trial run — new nozzle, higher overspray on the first 500 pcs', strategy: 'FEFO' },
      { uid: 'mil-02', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless', uom: 'NOS', bomStandardQty: 5_000, alreadyIssued: 0, quantity: 5_000, bin: 'A-04-2-1', batchNo: 'B2607021', rate: 38.50, value: 192_500, returnedQty: 0, strategy: 'FIFO' },
    ],
  },
  {
    uid: 'mi-02', docNo: 'P1/MI/26-27/004418', docDate: d(5), status: 'ISSUED', plant: 'Chennai — Unit 1',
    chargeType: 'PRODUCTION_ORDER', chargeRef: 'PRD/2607/0114', chargeName: 'VF750 Black · 5,000 nos', operation: 'OP-20 Deep draw',
    costCentre: 'CC-PRD-01', requisitionNo: 'P1/MRQ/26-27/004412', issuedTo: 'T. Ganesh', fromWarehouse: 'Raw Material Store',
    shift: 'A', totalQty: 1_250, totalValue: 303_775, overIssueCount: 0,
    createdBy: 'S. Kumar', createdAt: daysAgo(5, 11), version: 1, attachments: 1, comments: 0,
    approvals: [{ level: 1, role: 'Shift Supervisor', approver: 'N. Selvam', status: 'APPROVED', actedAt: daysAgo(5, 10) }],
    lines: [
      { uid: 'mil-03', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', bomStandardQty: 2_450, alreadyIssued: 1_200, quantity: 1_250, bin: 'CY-01', batchNo: 'B2606-H4471', rate: 243.02, value: 303_775, returnedQty: 0, strategy: 'FIFO' },
    ],
  },
  {
    uid: 'mi-03', docNo: 'P1/MI/26-27/004424', docDate: d(0), status: 'PARTIALLY_ISSUED', plant: 'Chennai — Unit 1',
    chargeType: 'PRODUCTION_ORDER', chargeRef: 'PRD/2607/0121', chargeName: 'VF750 Black · 8,000 nos', operation: 'OP-50 Assembly',
    costCentre: 'CC-PRD-01', requisitionNo: 'P1/MRQ/26-27/004418', issuedTo: 'T. Ganesh', fromWarehouse: 'Raw Material Store',
    shift: 'A', totalQty: 20, totalValue: 64, overIssueCount: 0,
    createdBy: 'S. Kumar', createdAt: daysAgo(0, 10), version: 1, attachments: 0, comments: 0,
    approvals: [{ level: 1, role: 'Shift Supervisor', approver: 'N. Selvam', status: 'APPROVED', actedAt: daysAgo(0, 10) }],
    lines: [
      { uid: 'mil-04', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm', uom: 'NOS', bomStandardQty: 8_000, alreadyIssued: 0, quantity: 20, bin: 'A-01-1-1', batchNo: 'B2607014', rate: 3.20, value: 64, returnedQty: 0, strategy: 'FEFO' },
    ],
  },
  {
    uid: 'mi-04', docNo: 'P1/MI/26-27/004410', docDate: d(8), status: 'ISSUED', plant: 'Chennai — Unit 1',
    chargeType: 'COST_CENTRE', chargeRef: 'CC-MNT', chargeName: 'Maintenance — press shop',
    costCentre: 'CC-MNT', requisitionNo: 'P1/MRQ/26-27/004401', issuedTo: 'D. Anand', fromWarehouse: 'Raw Material Store',
    shift: 'B', totalQty: 12, totalValue: 18_400, overIssueCount: 0,
    createdBy: 'S. Kumar', createdAt: daysAgo(8, 15), version: 1, attachments: 0, comments: 0,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(8, 15) }],
    lines: [
      { uid: 'mil-05', itemCode: 'SPR-DIE-750', itemName: 'Draw die insert — 750 ml', uom: 'NOS', bomStandardQty: null, alreadyIssued: 0, quantity: 12, bin: 'A-06-1-2', batchNo: null, rate: 1_533.33, value: 18_400, returnedQty: 0, strategy: 'NEAREST_BIN' },
    ],
  },
]

export const materialReturns: MaterialReturn[] = [
  { uid: 'mr-01', docNo: 'P1/MR/26-27/00871', docDate: d(1), status: 'POSTED', plant: 'Chennai — Unit 1', issueNo: 'P1/MI/26-27/004418', returnedBy: 'T. Ganesh', toWarehouse: 'Raw Material Store', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', batchNo: 'B2606-H4471', quantity: 180, condition: 'GOOD', weighmentRef: 'WB/26/8841', toBin: 'CY-01', value: 43_744, createdBy: 'T. Ganesh', createdAt: daysAgo(1, 16), version: 1, attachments: 1, comments: 0, approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(1, 16) }] },
  { uid: 'mr-02', docNo: 'P1/MR/26-27/00870', docDate: d(3), status: 'POSTED', plant: 'Chennai — Unit 1', issueNo: 'P1/MI/26-27/004415', returnedBy: 'J. Mohan', toWarehouse: 'Quarantine Store', itemCode: 'CON-PWD-BLU', itemName: 'Powder Coating — Ocean Blue', uom: 'KG', batchNo: 'B2606020', quantity: 18, condition: 'SUSPECT', toBin: null, value: 5_724, remarks: 'Bag left open overnight — re-test before reuse.', createdBy: 'J. Mohan', createdAt: daysAgo(3, 17), version: 1, attachments: 0, comments: 2, approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(3, 17) }] },
  { uid: 'mr-03', docNo: 'P1/MR/26-27/00869', docDate: d(6), status: 'POSTED', plant: 'Chennai — Unit 1', issueNo: 'P1/MI/26-27/004408', returnedBy: 'N. Selvam', toWarehouse: 'Reject Store', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS', batchNo: 'B2606018', quantity: 240, condition: 'DAMAGED', toBin: null, value: 1_776, remarks: 'Crushed in handling — routed to scrap review.', createdBy: 'N. Selvam', createdAt: daysAgo(6, 12), version: 1, attachments: 1, comments: 0, approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(6, 13) }] },
]

/* ═══════════════════ Transfers & job work ═════════════════════════════ */

export const transfers: StockTransfer[] = [
  {
    uid: 'tr-01', docNo: 'ST/26-27/00412', docDate: d(2), status: 'IN_TRANSIT', plant: 'Chennai — Unit 1',
    transferType: 'INTER_PLANT', fromWarehouse: 'Finished Goods Store', toWarehouse: 'Coimbatore Depot Store', toPlant: 'Coimbatore Depot',
    reason: 'Depot replenishment', vehicleNo: 'TN 38 BQ 4471', transporter: 'SRT Roadways', lrNo: 'SRT/26/119284',
    ewayBillNo: '3412 8877 4415', expectedOn: d(0), dispatchedAt: daysAgo(2, 8), isDistinctPerson: false, transitDays: 2,
    totalQty: 1_152, totalValue: 475_546,
    createdBy: 'P. Suresh', createdAt: daysAgo(3, 10), version: 3, attachments: 2, comments: 1,
    approvals: [
      { level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(2, 16) },
      { level: 2, role: 'Materials Manager', approver: 'K. Ravi', status: 'APPROVED', actedAt: daysAgo(2, 18) },
    ],
    lines: [
      { uid: 'trl-01', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', batchNo: 'B2606033', fromBin: 'P-A-01', toBin: null, quantity: 1_152, receivedQty: 0, shortQty: 0, damageQty: 0, value: 475_546 },
    ],
  },
  {
    uid: 'tr-02', docNo: 'ST/26-27/00411', docDate: d(6), status: 'PARTIALLY_RECEIVED', plant: 'Chennai — Unit 1',
    transferType: 'INTER_PLANT', fromWarehouse: 'Finished Goods Store', toWarehouse: 'Coimbatore Depot Store', toPlant: 'Coimbatore Depot',
    reason: 'Depot replenishment', vehicleNo: 'TN 45 CQ 2218', transporter: 'SRT Roadways', lrNo: 'SRT/26/118902',
    ewayBillNo: '3412 8811 9024', expectedOn: d(4), dispatchedAt: daysAgo(6, 9), receivedAt: daysAgo(4, 15), isDistinctPerson: false, transitDays: 2,
    totalQty: 1_600, totalValue: 660_480,
    createdBy: 'P. Suresh', createdAt: daysAgo(7, 11), version: 4, attachments: 3, comments: 4,
    remarks: '32 units short on arrival — claim raised with the transporter.',
    approvals: [
      { level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(6, 8) },
      { level: 2, role: 'Materials Manager', approver: 'K. Ravi', status: 'APPROVED', actedAt: daysAgo(6, 9) },
    ],
    lines: [
      { uid: 'trl-02', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', batchNo: 'B2606033', fromBin: 'P-A-01', toBin: null, quantity: 1_600, receivedQty: 1_568, shortQty: 32, damageQty: 0, varianceReason: 'Short on arrival — transporter claim TC/26/0118', value: 660_480 },
    ],
  },
  {
    uid: 'tr-03', docNo: 'ST/26-27/00419', docDate: d(0), status: 'COMPLETED', plant: 'Chennai — Unit 1',
    transferType: 'BIN', fromWarehouse: 'Finished Goods Store', toWarehouse: 'Finished Goods Store', toPlant: 'Chennai — Unit 1',
    reason: 'Consolidation for dispatch staging', isDistinctPerson: false, transitDays: 0,
    totalQty: 480, totalValue: 198_144,
    createdBy: 'P. Suresh', createdAt: daysAgo(0, 12), version: 1, attachments: 0, comments: 0,
    approvals: [],
    lines: [
      { uid: 'trl-03', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', batchNo: 'B2607031', fromBin: 'P-A-03', toBin: 'P-A-02', quantity: 480, receivedQty: 480, shortQty: 0, damageQty: 0, value: 198_144 },
    ],
  },
  {
    uid: 'tr-04', docNo: 'ST/26-27/00418', docDate: d(0), status: 'PENDING_APPROVAL', plant: 'Chennai — Unit 1',
    transferType: 'WAREHOUSE', fromWarehouse: 'Raw Material Store', toWarehouse: 'Reject Store', toPlant: 'Chennai — Unit 1',
    reason: 'QC rejection — moved out of the production store', isDistinctPerson: false, transitDays: 0,
    totalQty: 360, totalValue: 2_664,
    createdBy: 'S. Meena', createdAt: daysAgo(0, 11), version: 1, attachments: 1, comments: 1,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING' }],
    lines: [
      { uid: 'trl-04', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS', batchNo: 'B2607028', fromBin: 'A-01-1-3', toBin: null, quantity: 360, receivedQty: 0, shortQty: 0, damageQty: 0, value: 2_664 },
    ],
  },
]

export const jobworkChallans: JobworkChallan[] = [
  { uid: 'jw-01', docNo: 'P1/JW/26-27/0121', docDate: d(4), status: 'IN_PROGRESS', plant: 'Chennai — Unit 1', vendor: 'Coat Tech Industries', subcontractPoNo: 'PO/26-27/00214', process: 'Powder coating — Matte Black', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', uom: 'NOS', batchNo: 'B2607014', issuedQty: 8_400, expectedReturnQty: 8_232, returnedQty: 0, scrapReturnedQty: 0, balanceQty: 8_400, agreedLossPct: 2.0, actualLossPct: 0, expectedReturnOn: f(3), statutoryDueOn: f(361), daysOutstanding: 4, value: 809_760, createdBy: 'M. Devi', createdAt: daysAgo(4, 10), version: 1, attachments: 1, comments: 0, approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(4, 10) }] },
  { uid: 'jw-02', docNo: 'P1/JW/26-27/0118', docDate: d(18), status: 'COMPLETED', plant: 'Chennai — Unit 1', vendor: 'Coat Tech Industries', subcontractPoNo: 'PO/26-27/00201', process: 'Powder coating — Matte Black', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', uom: 'NOS', batchNo: 'B2607014', issuedQty: 5_000, expectedReturnQty: 4_900, returnedQty: 4_860, scrapReturnedQty: 100, balanceQty: 40, agreedLossPct: 2.0, actualLossPct: 2.0, expectedReturnOn: d(2), statutoryDueOn: f(347), daysOutstanding: 18, value: 482_000, createdBy: 'M. Devi', createdAt: daysAgo(18, 9), version: 3, attachments: 2, comments: 1, approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(18, 10) }] },
  { uid: 'jw-03', docNo: 'P1/JW/26-27/0102', docDate: d(72), status: 'IN_PROGRESS', plant: 'Chennai — Unit 1', vendor: 'Coat Tech Industries', subcontractPoNo: 'PO/26-27/00164', process: 'Powder coating — Ocean Blue', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', uom: 'NOS', batchNo: 'B2605011', issuedQty: 8_000, expectedReturnQty: 7_880, returnedQty: 7_600, scrapReturnedQty: 120, balanceQty: 280, agreedLossPct: 1.5, actualLossPct: 3.5, expectedReturnOn: d(48), statutoryDueOn: f(293), daysOutstanding: 72, value: 771_200, remarks: 'Loss 3.5% against 1.5% agreed — 160 nos unexplained, approval pending.', createdBy: 'M. Devi', createdAt: daysAgo(72, 10), version: 2, attachments: 1, comments: 5, approvals: [{ level: 1, role: 'Purchase Head', approver: 'P. Suresh', status: 'PENDING' }] },
  { uid: 'jw-04', docNo: 'P1/JW/25-26/0388', docDate: d(341), status: 'IN_PROGRESS', plant: 'Chennai — Unit 1', vendor: 'Precision Print Works', subcontractPoNo: 'PO/25-26/00891', process: 'Laser marking', itemCode: 'SF-BODY-500', itemName: 'Bottle Body Shell — 500 ml', uom: 'NOS', batchNo: 'B2508022', issuedQty: 6_000, expectedReturnQty: 5_940, returnedQty: 5_100, scrapReturnedQty: 90, balanceQty: 810, agreedLossPct: 1.0, actualLossPct: 1.5, expectedReturnOn: d(311), statutoryDueOn: f(24), daysOutstanding: 341, value: 469_200, remarks: 'Statutory window closes in 24 days — escalated to Purchase and Finance.', createdBy: 'M. Devi', createdAt: daysAgo(341, 11), version: 4, attachments: 2, comments: 8, approvals: [{ level: 1, role: 'Purchase Head', approver: 'P. Suresh', status: 'APPROVED', actedAt: daysAgo(340, 10) }] },
]

/* ══════════════════ Adjustments, scrap, write-off ═════════════════════ */

export const adjustments: StockAdjustment[] = [
  {
    uid: 'adj-01', docNo: 'ADJ/26-27/0116', docDate: d(0), status: 'PENDING_APPROVAL', plant: 'Chennai — Unit 1',
    category: 'QUANTITY_CORRECTION', warehouse: 'Raw Material Store', reference: 'Weighbridge slip WB/26/8841',
    netValueImpact: -10_273, raisedBy: 'K. Ravi',
    createdBy: 'K. Ravi', createdAt: daysAgo(0, 11), version: 1, attachments: 2, comments: 1,
    approvals: [{ level: 1, role: 'Materials Manager', approver: 'S. Balaji', status: 'PENDING' }],
    lines: [
      { uid: 'adjl-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', systemQty: 8_900, physicalQty: 8_868, deltaQty: -32, reasonCode: 'Weighment difference', note: 'Coil re-weighed at despatch, −0.36%', valueImpact: -7_777 },
      { uid: 'adjl-02', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black', uom: 'KG', warehouseCode: 'RM-01', bin: 'BLK-01', batchNo: 'B2604011', systemQty: 1_090, physicalQty: 1_082, deltaQty: -8, reasonCode: 'Spillage', note: 'Bag torn during handling on 27-Jul', valueImpact: -2_496 },
    ],
  },
  {
    uid: 'adj-02', docNo: 'ADJ/26-27/0114', docDate: d(2), status: 'POSTED', plant: 'Chennai — Unit 1',
    category: 'QUANTITY_CORRECTION', warehouse: 'Raw Material Store', reference: 'Weighbridge slip WB/26/8802',
    netValueImpact: -7_777, raisedBy: 'M. Lakshmi',
    createdBy: 'M. Lakshmi', createdAt: daysAgo(2, 9), version: 2, attachments: 1, comments: 0,
    approvals: [{ level: 1, role: 'Materials Manager', approver: 'K. Ravi', status: 'APPROVED', actedAt: daysAgo(2, 11), remarks: 'Within the weighment tolerance for a full coil.' }],
    lines: [
      { uid: 'adjl-03', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', warehouseCode: 'RM-01', bin: 'CY-01', batchNo: 'B2606-H4471', systemQty: 8_932, physicalQty: 8_900, deltaQty: -32, reasonCode: 'Weighment difference', note: 'Re-weighment at issue', valueImpact: -7_777 },
    ],
  },
  {
    uid: 'adj-03', docNo: 'ADJ/26-27/0111', docDate: d(12), status: 'POSTED', plant: 'Chennai — Unit 1',
    category: 'PILFERAGE', warehouse: 'Packing Material Store', reference: 'Security report SEC/26/0042',
    netValueImpact: -18_400, raisedBy: 'K. Ravi',
    createdBy: 'K. Ravi', createdAt: daysAgo(12, 15), version: 3, attachments: 4, comments: 6,
    approvals: [
      { level: 1, role: 'Materials Manager', approver: 'K. Ravi', status: 'SKIPPED', remarks: 'Raiser — escalated (SoD sod-05).' },
      { level: 2, role: 'Factory Head', approver: 'S. Balaji', status: 'APPROVED', actedAt: daysAgo(11, 10), remarks: 'Security review opened; CCTV coverage extended to the carton bay.' },
    ],
    lines: [
      { uid: 'adjl-04', itemCode: 'PKG-CTN-24', itemName: 'Corrugated Carton — 24 units', uom: 'NOS', warehouseCode: 'PKG-01', bin: 'C-01-1', batchNo: null, systemQty: 1_640, physicalQty: 1_240, deltaQty: -400, reasonCode: 'Pilferage', note: 'Unexplained shortfall confirmed by recount on 18-Jul', valueImpact: -18_400 },
    ],
  },
  {
    uid: 'adj-04', docNo: 'ADJ/26-27/0108', docDate: d(21), status: 'REJECTED', plant: 'Chennai — Unit 1',
    category: 'DAMAGE', warehouse: 'Raw Material Store', reference: 'Forklift incident 08-Jul',
    netValueImpact: -3_552, raisedBy: 'S. Kumar',
    createdBy: 'S. Kumar', createdAt: daysAgo(21, 13), version: 1, attachments: 1, comments: 2,
    remarks: 'Rejected — damage belongs on a scrap note with a defect code, not a quantity adjustment.',
    approvals: [{ level: 1, role: 'Materials Manager', approver: 'K. Ravi', status: 'REJECTED', actedAt: daysAgo(20, 9), remarks: 'Raise a scrap note instead so the cost lands on the right cost centre.' }],
    lines: [
      { uid: 'adjl-05', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS', warehouseCode: 'RM-01', bin: 'A-01-1-3', batchNo: 'B2606018', systemQty: 9_380, physicalQty: 8_900, deltaQty: -480, reasonCode: 'Damage in handling', note: 'Crushed by forklift', valueImpact: -3_552 },
    ],
  },
]

export const scrapNotes: ScrapNote[] = [
  { uid: 'sc-01', docNo: 'P1/SCR/26-27/0091', docDate: d(0), status: 'PENDING_APPROVAL', plant: 'Chennai — Unit 1', source: 'PRODUCTION_REJECTION', productionOrderNo: 'PRD/2607/0119', operation: 'OP-30 Welding', defectCode: 'WELD-POROSITY', costCentre: 'CC-PRD-02', responsibleShift: 'Shift A', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', uom: 'NOS', batchNo: 'B2607014', quantity: 184, bookValue: 17_737, scrapItem: 'SCR-SS304', scrapQty: 41.4, recoveryValue: 3_809, tolerancePct: 2.0, actualPct: 3.7, createdBy: 'M. Devi', createdAt: daysAgo(0, 14), version: 1, attachments: 2, comments: 1, approvals: [{ level: 1, role: 'Production Manager', approver: 'S. Balaji', status: 'PENDING' }, { level: 2, role: 'Factory Head', approver: 'V. Ramanathan', status: 'PENDING' }] },
  { uid: 'sc-02', docNo: 'P1/SCR/26-27/0088', docDate: d(11), status: 'POSTED', plant: 'Chennai — Unit 1', source: 'PRODUCTION_REJECTION', productionOrderNo: 'PRD/2606/0098', operation: 'OP-30 Welding', defectCode: 'WELD-POROSITY', costCentre: 'CC-PRD-02', responsibleShift: 'Shift B', itemCode: 'SF-BODY-500', itemName: 'Bottle Body Shell — 500 ml', uom: 'NOS', batchNo: 'B2606022', quantity: 184, bookValue: 14_389, scrapItem: 'SCR-SS304', scrapQty: 33.1, recoveryValue: 3_045, tolerancePct: 2.0, actualPct: 1.4, createdBy: 'M. Devi', createdAt: daysAgo(11, 16), version: 2, attachments: 1, comments: 0, approvals: [{ level: 1, role: 'Production Manager', approver: 'S. Balaji', status: 'APPROVED', actedAt: daysAgo(11, 17) }] },
  { uid: 'sc-03', docNo: 'P1/SCR/26-27/0084', docDate: d(24), status: 'POSTED', plant: 'Chennai — Unit 1', source: 'HANDLING_DAMAGE', productionOrderNo: null, operation: undefined, defectCode: null, costCentre: 'CC-STR', responsibleShift: 'Shift A', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS', batchNo: 'B2606018', quantity: 480, bookValue: 3_552, scrapItem: null, scrapQty: 0, recoveryValue: 0, tolerancePct: 0, actualPct: 0, createdBy: 'S. Kumar', createdAt: daysAgo(24, 11), version: 1, attachments: 1, comments: 1, approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(24, 12) }] },
]

/* ═══════════════════════════ Counting ═════════════════════════════════ */

export const counts: CountDoc[] = [
  {
    uid: 'cc-01', docNo: 'CC/26-27/0051', countType: 'CYCLE', status: 'RECOUNT_REQUIRED',
    warehouse: 'Raw Material Store', scope: 'Rack Area A · A-class monthly', abcClass: 'A',
    counter: 'S. Kumar', assignedOn: d(1), dueOn: f(1), countedOn: d(0),
    binsPlanned: 24, binsCounted: 24, linesWithVariance: 3, accuracyPct: 87.5, netVarianceValue: -18_412,
    isFrozen: true, version: 2, attachments: 0, comments: 2,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING' }],
    lines: [
      { uid: 'ccl-01', bin: 'A-01-1-1', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm', uom: 'NOS', batchNo: 'B2607014', systemQty: 12_400, countedQty: 12_380, varianceQty: -20, variancePct: -0.16, valueImpact: -64, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, reasonCode: 'Issue error', rootCause: 'ISSUE_ERROR', isFoundStock: false },
      { uid: 'ccl-02', bin: 'A-01-1-3', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS', batchNo: 'B2606018', systemQty: 9_150, countedQty: 8_900, varianceQty: -250, variancePct: -2.73, valueImpact: -1_850, tolerancePct: 0.5, withinTolerance: false, recountRequired: true, recountBy: 'M. Devi', isFoundStock: false },
      { uid: 'ccl-03', bin: 'A-01-2-2', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm (found)', uom: 'NOS', batchNo: null, systemQty: 0, countedQty: 1_240, varianceQty: 1_240, variancePct: null, valueImpact: 3_968, tolerancePct: 0.5, withinTolerance: false, recountRequired: false, reasonCode: 'Put-away error', rootCause: 'PUT_AWAY_ERROR', isFoundStock: true },
      { uid: 'ccl-04', bin: 'A-04-2-1', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless', uom: 'NOS', batchNo: 'B2607021', systemQty: 38_300, countedQty: 38_300, varianceQty: 0, variancePct: 0, valueImpact: 0, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, isFoundStock: false },
    ],
  },
  {
    uid: 'cc-02', docNo: 'CC/26-27/0050', countType: 'CYCLE', status: 'ASSIGNED',
    warehouse: 'Finished Goods Store', scope: 'Pallet Zone · A-class monthly', abcClass: 'A',
    counter: 'P. Suresh', assignedOn: d(0), dueOn: f(2),
    binsPlanned: 18, binsCounted: 0, linesWithVariance: 0, accuracyPct: 0, netVarianceValue: 0,
    isFrozen: false, version: 1, attachments: 0, comments: 0,
    approvals: [],
    lines: [
      { uid: 'ccl-05', bin: 'P-A-01', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', batchNo: 'B2607021', systemQty: null, countedQty: null, varianceQty: null, variancePct: null, valueImpact: 0, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, isFoundStock: false },
      { uid: 'ccl-06', bin: 'P-A-04', itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', uom: 'NOS', batchNo: 'B2607008', systemQty: null, countedQty: null, varianceQty: null, variancePct: null, valueImpact: 0, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, isFoundStock: false },
    ],
  },
  {
    uid: 'cc-03', docNo: 'CC/26-27/0049', countType: 'EVENT', status: 'POSTED',
    warehouse: 'Raw Material Store', scope: 'CY-01 · triggered by repeated adjustments', abcClass: 'A',
    counter: 'M. Devi', assignedOn: d(4), dueOn: d(3), countedOn: d(3), postedOn: d(3),
    binsPlanned: 1, binsCounted: 1, linesWithVariance: 0, accuracyPct: 100, netVarianceValue: 0,
    isFrozen: false, version: 3, attachments: 0, comments: 1,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(3, 16) }],
    lines: [
      { uid: 'ccl-07', bin: 'CY-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', batchNo: 'B2606-H4471', systemQty: 8_900, countedQty: 8_900, varianceQty: 0, variancePct: 0, valueImpact: 0, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, isFoundStock: false },
    ],
  },
  {
    uid: 'cc-04', docNo: 'CC/26-27/0042', countType: 'CYCLE', status: 'POSTED',
    warehouse: 'Raw Material Store', scope: 'Coil Yard · A-class monthly', abcClass: 'A',
    counter: 'S. Kumar', assignedOn: d(33), dueOn: d(31), countedOn: d(31), postedOn: d(31),
    binsPlanned: 12, binsCounted: 12, linesWithVariance: 1, accuracyPct: 91.7, netVarianceValue: -2_930,
    isFrozen: false, version: 3, attachments: 1, comments: 2,
    approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: daysAgo(31, 17) }],
    lines: [
      { uid: 'ccl-08', bin: 'CY-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm', uom: 'KG', batchNo: 'B2606-H4471', systemQty: 7_380, countedQty: 7_368, varianceQty: -12, variancePct: -0.16, valueImpact: -2_930, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, reasonCode: 'Weighment difference', rootCause: 'WEIGHMENT', isFoundStock: false },
    ],
  },
]

/* ═══════════════════════ Batch & serial ═══════════════════════════════ */

export const batches: Batch[] = [
  {
    uid: 'bt-01', batchNo: 'B2606-H4471', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', uom: 'KG',
    supplierBatchNo: '4471', supplier: 'Jindal Stainless Ltd', manufacturedOn: d(72), receivedOn: d(57), expiresOn: null,
    quantityReceived: 9_600, quantityRemaining: 8_900, status: 'ACTIVE', qcStatus: 'ACCEPTED', qcInspectionNo: 'IQC/26-27/00196',
    sourceDocNo: 'P1/GRN/26-27/00318', steelGrade: 'SS 304', thicknessMm: 0.5, widthMm: 400, coilWeightKg: 9_600,
    mtcNo: '4471/2606', mtcVerified: true, rate: 243.02,
    parents: [],
    children: [
      { batchNo: 'B2607014', itemName: 'Bottle Body Shell — 750 ml', quantity: 1_250, docNo: 'P1/MI/26-27/004418' },
      { batchNo: 'B2606022', itemName: 'Bottle Body Shell — 500 ml', quantity: 2_400, docNo: 'P1/MI/26-27/004102' },
    ],
    locations: [{ warehouseCode: 'RM-01', bin: 'CY-01', quantity: 8_900, status: 'AVAILABLE' }],
  },
  {
    uid: 'bt-02', batchNo: 'B2607-H4488', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', uom: 'KG',
    supplierBatchNo: '4488', supplier: 'Jindal Stainless Ltd', manufacturedOn: d(30), receivedOn: d(17), expiresOn: null,
    quantityReceived: 2_640, quantityRemaining: 2_040, status: 'ACTIVE', qcStatus: 'ACCEPTED', qcInspectionNo: 'IQC/26-27/00204',
    sourceDocNo: 'P1/GRN/26-27/00341', steelGrade: 'SS 304', thicknessMm: 0.5, widthMm: 400, coilWeightKg: 2_640,
    mtcNo: '4488/2607', mtcVerified: true, rate: 247.10,
    parents: [],
    children: [{ batchNo: 'B2607031', itemName: 'Bottle Body Shell — 750 ml', quantity: 600, docNo: 'P1/MI/26-27/004420' }],
    locations: [{ warehouseCode: 'RM-01', bin: 'CY-03', quantity: 2_040, status: 'AVAILABLE' }],
  },
  {
    uid: 'bt-03', batchNo: 'B2607-H4501', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', uom: 'KG',
    supplierBatchNo: '4501', supplier: 'Jindal Stainless Ltd', manufacturedOn: d(14), receivedOn: d(2), expiresOn: null,
    quantityReceived: 1_200, quantityRemaining: 1_200, status: 'QUARANTINE', qcStatus: 'PENDING', qcInspectionNo: 'IQC/26-27/00214',
    sourceDocNo: 'P1/GRN/26-27/00352', steelGrade: 'SS 304', thicknessMm: 0.5, widthMm: 400, coilWeightKg: 1_200,
    mtcNo: '4501/2607', mtcVerified: false, rate: 248.40,
    parents: [], children: [],
    locations: [{ warehouseCode: 'QTN-01', bin: null, quantity: 1_200, status: 'QUARANTINE' }],
  },
  {
    uid: 'bt-04', batchNo: 'B2604011', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black RAL 9005', uom: 'KG',
    supplierBatchNo: 'AK-2611', supplier: 'Akzo Nobel India', manufacturedOn: d(140), receivedOn: d(118), expiresOn: f(20),
    quantityReceived: 2_000, quantityRemaining: 1_090, status: 'ACTIVE', qcStatus: 'ACCEPTED', qcInspectionNo: 'IQC/26-27/00121',
    sourceDocNo: 'P1/GRN/26-27/00288', rate: 312.00,
    parents: [],
    children: [{ batchNo: 'B2607021', itemName: 'Vacuum Flask 750 ml — Matte Black', quantity: 140, docNo: 'P1/MI/26-27/004421' }],
    locations: [{ warehouseCode: 'RM-01', bin: 'BLK-01', quantity: 1_090, status: 'AVAILABLE' }],
  },
  {
    uid: 'bt-05', batchNo: 'B2607014', itemCode: 'SF-BODY-750', itemName: 'Bottle Body Shell — 750 ml', uom: 'NOS',
    supplierBatchNo: null, supplier: null, manufacturedOn: d(11), receivedOn: d(11), expiresOn: null,
    quantityReceived: 13_564, quantityRemaining: 13_380, status: 'ACTIVE', qcStatus: 'ACCEPTED', qcInspectionNo: 'QC/26-27/00812',
    sourceDocNo: 'PRD/2607/0114', rate: 96.40,
    parents: [{ batchNo: 'B2606-H4471', itemName: 'SS 304 Coil 0.50 mm', quantity: 1_250, docNo: 'P1/MI/26-27/004418' }],
    children: [{ batchNo: 'B2607021', itemName: 'Vacuum Flask 750 ml — Matte Black', quantity: 4_860, docNo: 'P1/PRC/26-27/00612' }],
    locations: [
      { warehouseCode: 'WIP-01', bin: 'W-01-A', quantity: 4_980, status: 'AVAILABLE' },
      { warehouseCode: 'SUB-01', bin: null, quantity: 8_400, status: 'AT_SUBCONTRACTOR' },
    ],
  },
  {
    uid: 'bt-06', batchNo: 'B2607021', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS',
    supplierBatchNo: null, supplier: null, manufacturedOn: d(8), receivedOn: d(8), expiresOn: null,
    quantityReceived: 4_860, quantityRemaining: 1_152, status: 'ACTIVE', qcStatus: 'ACCEPTED', qcInspectionNo: 'QC/26-27/00841',
    sourceDocNo: 'P1/PRC/26-27/00612', rate: 412.80,
    parents: [
      { batchNo: 'B2607014', itemName: 'Bottle Body Shell — 750 ml', quantity: 4_860, docNo: 'P1/PRC/26-27/00612' },
      { batchNo: 'B2604011', itemName: 'Powder Coating — Matte Black', quantity: 140, docNo: 'P1/MI/26-27/004421' },
      { batchNo: 'B2607021', itemName: 'Screw Cap — Stainless', quantity: 4_860, docNo: 'P1/MI/26-27/004421' },
    ],
    children: [],
    locations: [{ warehouseCode: 'FG-01', bin: 'P-A-01', quantity: 1_152, status: 'AVAILABLE' }],
  },
  {
    uid: 'bt-07', batchNo: 'B2606033', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS',
    supplierBatchNo: null, supplier: null, manufacturedOn: d(36), receivedOn: d(36), expiresOn: null,
    quantityReceived: 6_240, quantityRemaining: 4_128, status: 'ACTIVE', qcStatus: 'ACCEPTED', qcInspectionNo: 'QC/26-27/00788',
    sourceDocNo: 'P1/PRC/26-27/00588', rate: 412.80,
    parents: [{ batchNo: 'B2606022', itemName: 'Bottle Body Shell — 500 ml', quantity: 6_240, docNo: 'P1/PRC/26-27/00588' }],
    children: [],
    locations: [
      { warehouseCode: 'FG-02', bin: null, quantity: 2_880, status: 'AVAILABLE' },
      { warehouseCode: 'TRN-01', bin: null, quantity: 1_152, status: 'IN_TRANSIT' },
      { warehouseCode: 'QTN-01', bin: null, quantity: 96, status: 'QUARANTINE' },
    ],
  },
  {
    uid: 'bt-08', batchNo: 'B2604002', itemCode: 'CON-PWD-BLU', itemName: 'Powder Coating — Ocean Blue RAL 5015', uom: 'KG',
    supplierBatchNo: 'AK-2508', supplier: 'Akzo Nobel India', manufacturedOn: d(210), receivedOn: d(188), expiresOn: d(4),
    quantityReceived: 800, quantityRemaining: 62, status: 'EXPIRED', qcStatus: 'ACCEPTED', qcInspectionNo: 'IQC/26-27/00098',
    sourceDocNo: 'P1/GRN/26-27/00241', rate: 306.00,
    parents: [], children: [],
    locations: [{ warehouseCode: 'RM-01', bin: 'BLK-02', quantity: 62, status: 'EXPIRED' }],
  },
]

export const serials: SerialUnit[] = [
  { uid: 'sn-01', serialNo: '750BLK260700001', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', batchNo: 'B2607021', status: 'ALLOCATED', warehouseCode: 'FG-01', bin: 'P-A-01', productionOrderNo: 'PRD/2607/0119', manufacturedOn: d(8), cartonNo: 'CTN260011284', salesDocNo: 'SO/26-27/00219', customer: 'Metro Retail', dispatchedOn: null, warrantyTo: null },
  { uid: 'sn-02', serialNo: '750BLK260700002', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', batchNo: 'B2607021', status: 'ALLOCATED', warehouseCode: 'FG-01', bin: 'P-A-01', productionOrderNo: 'PRD/2607/0119', manufacturedOn: d(8), cartonNo: 'CTN260011284', salesDocNo: 'SO/26-27/00219', customer: 'Metro Retail', dispatchedOn: null, warrantyTo: null },
  { uid: 'sn-03', serialNo: '750BLK260600418', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', batchNo: 'B2606033', status: 'DISPATCHED', warehouseCode: null, bin: null, productionOrderNo: 'PRD/2606/0098', manufacturedOn: d(36), cartonNo: 'CTN260010914', salesDocNo: 'CHN/INV/26-27/00918', customer: 'Metro Retail', dispatchedOn: d(21), warrantyTo: f(709) },
  { uid: 'sn-04', serialNo: '750BLK260600419', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', batchNo: 'B2606033', status: 'RETURNED', warehouseCode: 'QTN-01', bin: null, productionOrderNo: 'PRD/2606/0098', manufacturedOn: d(36), cartonNo: 'CTN260010914', salesDocNo: 'SR/26-27/0041', customer: 'Gift Bazaar Retail', dispatchedOn: d(21), warrantyTo: f(709) },
  { uid: 'sn-05', serialNo: '1000STL260700114', itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', batchNo: 'B2607008', status: 'IN_STOCK', warehouseCode: 'FG-01', bin: 'P-A-04', productionOrderNo: 'PRD/2607/0108', manufacturedOn: d(19), cartonNo: null, salesDocNo: null, customer: null, dispatchedOn: null, warrantyTo: null },
  { uid: 'sn-06', serialNo: '750BLK260600091', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', batchNo: 'B2606033', status: 'IN_SERVICE', warehouseCode: null, bin: null, productionOrderNo: 'PRD/2606/0098', manufacturedOn: d(36), cartonNo: 'CTN260010902', salesDocNo: 'CHN/INV/26-27/00901', customer: 'Corporate Gifting Co', dispatchedOn: d(28), warrantyTo: f(702) },
]

/* ══════════════════════ Valuation & ageing ════════════════════════════ */

export const valuationRows: ValuationRow[] = [
  { uid: 'vr-01', group: 'Raw material', itemClass: 'RAW_MATERIAL', opening: 24_180_000, receipts: 18_420_000, issues: -16_240_000, adjustments: -10_273, closing: 26_349_727, quantity: 21_940, method: 'Weighted average' },
  { uid: 'vr-02', group: 'Components', itemClass: 'COMPONENT', opening: 6_240_000, receipts: 4_110_000, issues: -3_890_000, adjustments: -3_552, closing: 6_456_448, quantity: 59_580, method: 'Weighted average' },
  { uid: 'vr-03', group: 'Consumables', itemClass: 'CONSUMABLE', opening: 1_890_000, receipts: 1_240_000, issues: -1_180_000, adjustments: -2_496, closing: 1_947_504, quantity: 3_332, method: 'Weighted average' },
  { uid: 'vr-04', group: 'Packing', itemClass: 'PACKING', opening: 3_210_000, receipts: 2_260_000, issues: -2_410_000, adjustments: -18_400, closing: 3_041_600, quantity: 10_580, method: 'Weighted average' },
  { uid: 'vr-05', group: 'Work in progress', itemClass: 'SEMI_FINISHED', opening: 8_940_000, receipts: 16_240_000, issues: -17_120_000, adjustments: -17_737, closing: 8_042_263, quantity: 13_380, method: 'Weighted average' },
  { uid: 'vr-06', group: 'Finished goods', itemClass: 'FINISHED', opening: 41_620_000, receipts: 17_120_000, issues: -15_860_000, adjustments: 0, closing: 42_880_000, quantity: 9_532, method: 'Standard cost' },
  { uid: 'vr-07', group: 'At subcontractor', itemClass: 'SEMI_FINISHED', opening: 2_140_000, receipts: 1_480_000, issues: -1_260_000, adjustments: 0, closing: 2_360_000, quantity: 8_400, method: 'Weighted average' },
  { uid: 'vr-08', group: 'Goods in transit', itemClass: 'FINISHED', opening: 1_720_000, receipts: 760_000, issues: -760_000, adjustments: 0, closing: 1_720_000, quantity: 1_152, method: 'Standard cost' },
  { uid: 'vr-09', group: 'Quarantine & rejected', itemClass: 'RAW_MATERIAL', opening: 1_480_000, receipts: 920_000, issues: -840_000, adjustments: 0, closing: 1_560_000, quantity: 1_480, method: 'Weighted average' },
]

export const ageingRows: AgeingRow[] = [
  { uid: 'ag-01', group: 'Raw material', itemClass: 'RAW_MATERIAL', b0_30: 14_820_000, b31_60: 6_240_000, b61_90: 3_120_000, b91_180: 1_840_000, b181_365: 330_000, b365plus: 0, provision: 82_500 },
  { uid: 'ag-02', group: 'Components', itemClass: 'COMPONENT', b0_30: 2_840_000, b31_60: 1_820_000, b61_90: 1_110_000, b91_180: 520_000, b181_365: 140_000, b365plus: 26_000, provision: 61_000 },
  { uid: 'ag-03', group: 'Consumables', itemClass: 'CONSUMABLE', b0_30: 1_120_000, b31_60: 480_000, b61_90: 210_000, b91_180: 90_000, b181_365: 48_000, b365plus: 0, provision: 12_000 },
  { uid: 'ag-04', group: 'Packing', itemClass: 'PACKING', b0_30: 1_240_000, b31_60: 620_000, b61_90: 410_000, b91_180: 360_000, b181_365: 290_000, b365plus: 430_000, provision: 502_500, note: '₹4.30 L is artwork-obsolete (Metro Retail 2024 design) — 100% provision proposed' },
  { uid: 'ag-05', group: 'Finished goods', itemClass: 'FINISHED', b0_30: 21_460_000, b31_60: 11_840_000, b61_90: 6_210_000, b91_180: 2_840_000, b181_365: 530_000, b365plus: 0, provision: 132_500 },
]

export const nonMoving: NonMovingItem[] = [
  { uid: 'nm-01', itemCode: 'PKG-CTN-MTR-24', itemName: 'Carton — Metro Retail 2024 artwork', itemClass: 'PACKING', uom: 'NOS', quantity: 9_340, value: 429_640, lastMovementOn: d(214), daysIdle: 214, reason: 'Artwork superseded — customer rebranded in Jan 2026', recommendation: 'Write off or sell as plain carton stock', provisionPct: 100 },
  { uid: 'nm-02', itemCode: 'CMP-LID-OLD', itemName: 'Screw Cap — legacy 62 mm thread', itemClass: 'COMPONENT', uom: 'NOS', quantity: 6_100, value: 218_380, lastMovementOn: d(288), daysIdle: 288, reason: 'Model discontinued — 62 mm neck replaced by 68 mm', recommendation: 'Offer to the spares channel, then write off', provisionPct: 100 },
  { uid: 'nm-03', itemCode: 'RM-SS201-045', itemName: 'SS 201 Coil 0.45 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', quantity: 1_960, value: 330_064, lastMovementOn: d(196), daysIdle: 196, reason: 'Over-purchase against a cancelled export order', recommendation: 'Consume in the economy range or sell to a converter', provisionPct: 25 },
  { uid: 'nm-04', itemCode: 'CON-PWD-BLU', itemName: 'Powder Coating — Ocean Blue RAL 5015', itemClass: 'CONSUMABLE', uom: 'KG', quantity: 62, value: 18_972, lastMovementOn: d(188), daysIdle: 188, reason: 'Batch expired 25-Jul-2026', recommendation: 'Write off — expired, disposal through the approved vendor', provisionPct: 100 },
  { uid: 'nm-05', itemCode: 'CMP-INS-PP-500', itemName: 'PP Lid Insert — 500 ml', itemClass: 'COMPONENT', uom: 'NOS', quantity: 3_400, value: 22_100, lastMovementOn: d(122), daysIdle: 122, reason: 'Slow-moving — 500 ml line runs one week a month', recommendation: 'Reduce reorder level; no provision yet', provisionPct: 0 },
]

/* ══════════════════ Replenishment & reservation ═══════════════════════ */

export const reorderRows: ReorderRow[] = [
  { uid: 'ro-01', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', abcClass: 'A', xyzClass: 'X', free: 7_940, onOrder: 20_000, reorderLevel: 8_000, minLevel: 4_000, maxLevel: 26_000, safetyStock: 3_200, avgDailyDemand: 820, leadTimeDays: 21, coverageDays: 11, suggestedQty: 0, moq: 3_000, lastRate: 247.10, preferredSupplier: 'Jindal Stainless Ltd', action: 'COVERED', note: 'PO/26-27/00118 covers 20,000 KG due in 12 days' },
  { uid: 'ro-02', itemCode: 'RM-SS316-060', itemName: 'SS 316 Coil 0.60 mm × 400 mm', itemClass: 'RAW_MATERIAL', uom: 'KG', abcClass: 'A', xyzClass: 'X', free: 3_420, onOrder: 0, reorderLevel: 3_000, minLevel: 1_500, maxLevel: 9_000, safetyStock: 1_200, avgDailyDemand: 570, leadTimeDays: 21, coverageDays: 6, suggestedQty: 6_000, moq: 3_000, lastRate: 412.00, preferredSupplier: 'Bhansali Steel', action: 'RAISE_PR', note: 'Actual lead time averaging 24 d against 21 d quoted · EOQ 5,840 rounded to MOQ multiple' },
  { uid: 'ro-03', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless with Silicone Seal', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'B', xyzClass: 'Y', free: 33_800, onOrder: 30_000, reorderLevel: 20_000, minLevel: 10_000, maxLevel: 70_000, safetyStock: 8_000, avgDailyDemand: 1_580, leadTimeDays: 14, coverageDays: 24, suggestedQty: 0, moq: 10_000, lastRate: 38.50, preferredSupplier: 'Sundar Metal Forms', action: 'OK' },
  { uid: 'ro-04', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm — food grade', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'C', xyzClass: 'X', free: 12_380, onOrder: 50_000, reorderLevel: 15_000, minLevel: 8_000, maxLevel: 60_000, safetyStock: 6_000, avgDailyDemand: 1_620, leadTimeDays: 14, coverageDays: 8, suggestedQty: 0, moq: 25_000, lastRate: 3.20, preferredSupplier: 'Elasto Poly Products', action: 'COVERED', note: '50,000 in quarantine awaiting IQC/26-27/00211 — releases coverage to 38 days' },
  { uid: 'ro-05', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black RAL 9005', itemClass: 'CONSUMABLE', uom: 'KG', abcClass: 'B', xyzClass: 'X', free: 940, onOrder: 400, reorderLevel: 900, minLevel: 400, maxLevel: 2_400, safetyStock: 300, avgDailyDemand: 62, leadTimeDays: 10, coverageDays: 15, suggestedQty: 0, moq: 200, lastRate: 312.00, preferredSupplier: 'Akzo Nobel India', action: 'OK', note: '90 KG expires in 20 days — effective cover 14 days' },
  { uid: 'ro-06', itemCode: 'PKG-CTN-24', itemName: 'Corrugated Carton — 24 units', itemClass: 'PACKING', uom: 'NOS', abcClass: 'C', xyzClass: 'Z', free: 1_240, onOrder: 0, reorderLevel: 2_000, minLevel: 1_000, maxLevel: 9_000, safetyStock: 800, avgDailyDemand: 310, leadTimeDays: 9, coverageDays: 4, suggestedQty: 8_000, moq: 2_000, lastRate: 46.00, preferredSupplier: 'Sri Packaging Works', transferAlternative: { plant: 'Hosur — Unit 2', quantity: 6_400 }, action: 'TRANSFER', note: 'Hosur holds 6,400 above its maximum — transfer beats a purchase on cost and lead time' },
  { uid: 'ro-07', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', itemClass: 'COMPONENT', uom: 'NOS', abcClass: 'C', xyzClass: 'Y', free: 8_900, onOrder: 0, reorderLevel: 6_000, minLevel: 3_000, maxLevel: 24_000, safetyStock: 2_400, avgDailyDemand: 640, leadTimeDays: 12, coverageDays: 14, suggestedQty: 0, moq: 5_000, lastRate: 7.40, preferredSupplier: 'Precision Polymers', action: 'OK' },
  { uid: 'ro-08', itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', itemClass: 'FINISHED', uom: 'NOS', abcClass: 'B', xyzClass: 'Y', free: 480, onOrder: 0, reorderLevel: 800, minLevel: 400, maxLevel: 5_000, safetyStock: 500, avgDailyDemand: 210, leadTimeDays: 6, coverageDays: 2, suggestedQty: 3_000, moq: 500, lastRate: 596.20, preferredSupplier: '(made in-house)', action: 'URGENT', note: 'Below minimum — production order PRD/2608/0011 required this week' },
]

export const reservations: Reservation[] = [
  { uid: 'rsv-01', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', warehouseCode: 'FG-01', batchNo: 'B2607021', quantity: 1_152, state: 'ALLOCATED', priority: 'HIGH', demandType: 'SALES_ORDER', demandDocNo: 'SO/26-27/00219', party: 'Metro Retail', requiredOn: f(2), expiresOn: f(4) },
  { uid: 'rsv-02', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', warehouseCode: 'FG-01', batchNo: null, quantity: 2_400, state: 'RESERVED', priority: 'NORMAL', demandType: 'SALES_ORDER', demandDocNo: 'SO/26-27/00224', party: 'Gift Bazaar Retail', requiredOn: f(6), expiresOn: f(8) },
  { uid: 'rsv-03', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', warehouseCode: 'FG-01', batchNo: null, quantity: 1_156, state: 'RESERVED', priority: 'NORMAL', demandType: 'TRANSFER', demandDocNo: 'ST/26-27/00420', party: 'Coimbatore Depot', requiredOn: f(4), expiresOn: f(7) },
  { uid: 'rsv-04', itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', uom: 'NOS', warehouseCode: 'FG-01', batchNo: 'B2607008', quantity: 160, state: 'RESERVED', priority: 'NORMAL', demandType: 'SALES_ORDER', demandDocNo: 'SO/26-27/00219', party: 'Metro Retail', requiredOn: f(2), expiresOn: f(4) },
  { uid: 'rsv-05', itemCode: 'RM-SS304-050', itemName: 'SS 304 Coil 0.50 mm × 400 mm', uom: 'KG', warehouseCode: 'RM-01', batchNo: 'B2606-H4471', quantity: 3_000, state: 'RESERVED', priority: 'HIGH', demandType: 'PRODUCTION_ORDER', demandDocNo: 'PRD/2607/0121', party: 'Press Shop', requiredOn: f(1), expiresOn: f(3) },
  { uid: 'rsv-06', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless', uom: 'NOS', warehouseCode: 'RM-01', batchNo: 'B2607021', quantity: 4_500, state: 'RESERVED', priority: 'NORMAL', demandType: 'PRODUCTION_ORDER', demandDocNo: 'PRD/2607/0121', party: 'Assembly', requiredOn: f(1), expiresOn: f(3) },
  { uid: 'rsv-07', itemCode: 'CON-PWD-BLK', itemName: 'Powder Coating — Matte Black', uom: 'KG', warehouseCode: 'RM-01', batchNo: 'B2604011', quantity: 150, state: 'RESERVED', priority: 'LOW', demandType: 'PRODUCTION_ORDER', demandDocNo: 'PRD/2608/0009', party: 'Coating', requiredOn: f(8), expiresOn: f(10) },
  { uid: 'rsv-08', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', warehouseCode: 'FG-01', batchNo: null, quantity: 480, state: 'EXPIRED', priority: 'LOW', demandType: 'SAMPLE', demandDocNo: 'SMP/26-27/0018', party: 'Marketing — trade show', requiredOn: d(6), expiresOn: d(2) },
]

export const shortages: ShortageRow[] = [
  { uid: 'sh-01', itemCode: 'PKG-CTN-24', itemName: 'Corrugated Carton — 24 units', uom: 'NOS', demandDocNo: 'P1/MRQ/26-27/004416', demandType: 'Requisition', party: 'Packing', requiredQty: 2_000, availableQty: 1_240, gap: 760, requiredOn: f(2), earliestCoverOn: f(9), coverSource: 'PR/26-27/00191 (draft)', daysLate: 7 },
  { uid: 'sh-02', itemCode: 'FG-SS-1000-STL', itemName: 'Vacuum Flask 1000 ml — Brushed Steel', uom: 'NOS', demandDocNo: 'SO/26-27/00226', demandType: 'Sales order', party: 'Corporate Gifting Co', requiredQty: 1_200, availableQty: 480, gap: 720, requiredOn: f(5), earliestCoverOn: f(8), coverSource: 'PRD/2608/0011 (planned)', daysLate: 3 },
  { uid: 'sh-03', itemCode: 'FG-SS-750-BLK', itemName: 'Vacuum Flask 750 ml — Matte Black', uom: 'NOS', demandDocNo: 'SO/26-27/00227', demandType: 'Sales order', party: 'Metro Retail', requiredQty: 2_400, availableQty: 0, gap: 2_400, requiredOn: f(7), earliestCoverOn: f(8), coverSource: 'PRD/2608/0009 (released)', daysLate: 1 },
  { uid: 'sh-04', itemCode: 'RM-SS316-060', itemName: 'SS 316 Coil 0.60 mm × 400 mm', uom: 'KG', demandDocNo: 'PRD/2608/0014', demandType: 'Production order', party: 'Press Shop', requiredQty: 4_800, availableQty: 3_420, gap: 1_380, requiredOn: f(11), earliestCoverOn: null, coverSource: null, daysLate: 99 },
]

/* ═══════════════════════ Dashboard series ═════════════════════════════ */

export const movementDays: MovementDay[] = [
  { day: '16 Jul', receipts: 18, issues: 34, transfers: 9 },
  { day: '17 Jul', receipts: 22, issues: 41, transfers: 11 },
  { day: '18 Jul', receipts: 14, issues: 38, transfers: 7 },
  { day: '19 Jul', receipts: 9, issues: 12, transfers: 4 },
  { day: '20 Jul', receipts: 26, issues: 44, transfers: 14 },
  { day: '21 Jul', receipts: 19, issues: 39, transfers: 10 },
  { day: '22 Jul', receipts: 24, issues: 46, transfers: 12 },
  { day: '23 Jul', receipts: 21, issues: 42, transfers: 8 },
  { day: '24 Jul', receipts: 17, issues: 37, transfers: 13 },
  { day: '25 Jul', receipts: 28, issues: 48, transfers: 15 },
  { day: '26 Jul', receipts: 11, issues: 14, transfers: 5 },
  { day: '27 Jul', receipts: 23, issues: 43, transfers: 11 },
  { day: '28 Jul', receipts: 20, issues: 40, transfers: 9 },
  { day: '29 Jul', receipts: 16, issues: 23, transfers: 6 },
]

export const valueTrend: ValueTrendPoint[] = [
  { month: 'Feb', rawMaterial: 21.4, wip: 7.8, finishedGoods: 36.2, other: 6.1 },
  { month: 'Mar', rawMaterial: 22.8, wip: 8.1, finishedGoods: 38.4, other: 6.4 },
  { month: 'Apr', rawMaterial: 23.6, wip: 8.6, finishedGoods: 39.8, other: 6.8 },
  { month: 'May', rawMaterial: 24.1, wip: 9.2, finishedGoods: 40.6, other: 7.1 },
  { month: 'Jun', rawMaterial: 24.2, wip: 8.9, finishedGoods: 41.6, other: 7.3 },
  { month: 'Jul', rawMaterial: 26.3, wip: 8.0, finishedGoods: 42.9, other: 7.6 },
]

export const accuracyTrend: AccuracyPoint[] = [
  { month: 'Feb', accuracyPct: 96.1, variancePct: 0.82 },
  { month: 'Mar', accuracyPct: 96.8, variancePct: 0.71 },
  { month: 'Apr', accuracyPct: 97.2, variancePct: 0.64 },
  { month: 'May', accuracyPct: 97.6, variancePct: 0.58 },
  { month: 'Jun', accuracyPct: 97.8, variancePct: 0.49 },
  { month: 'Jul', accuracyPct: 98.2, variancePct: 0.41 },
]
