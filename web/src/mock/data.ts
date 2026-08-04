import type {
  AccountingPeriod,
  ApiKey,
  ApprovalRule,
  ApprovalTask,
  Attachment,
  AuditEntry,
  BackgroundJob,
  BackupRecord,
  Bin,
  Branch,
  Comment,
  Company,
  CostCentre,
  Currency,
  Delegation,
  Department,
  ExchangeRate,
  FinancialYear,
  InAppNotification,
  IntegrationConfig,
  LabelTemplate,
  LicenseInfo,
  LoginActivity,
  MasterDefinition,
  NotificationLog,
  NotificationRule,
  NotificationTemplate,
  NumberAllocation,
  NumberSeries,
  Plant,
  ProductionLine,
  Registration,
  ReportDefinition,
  Role,
  Session,
  SodRule,
  SystemParameter,
  User,
  Warehouse,
  WorkCentre,
  WorkflowDefinition,
} from '@/types'
import { PERMISSIONS } from './permissions'

const daysAgo = (n: number, h = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  if (h) d.setHours(h, Math.floor(Math.random() * 59), 0, 0)
  return d.toISOString()
}
const daysAhead = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

/* ═══════════════════════════ COMPANIES ═══════════════════════════════════ */

export const companies: Company[] = [
  {
    uid: 'cmp-01',
    code: 'SSB',
    legalName: 'SSB Industries Private Limited',
    tradeName: 'SteelSip Bottles',
    entityType: 'PVT_LTD',
    cin: 'U28999TN2014PTC097431',
    pan: 'AABCS1234K',
    tan: 'CHES04471B',
    baseCurrency: 'INR',
    fyStartMonth: 4,
    timezone: 'Asia/Kolkata',
    addressLine1: 'Plot 47, SIPCOT Industrial Park, Sriperumbudur',
    city: 'Kancheepuram',
    state: 'Tamil Nadu',
    stateCode: '33',
    pincode: '602105',
    phone: '+91 44 6712 8800',
    email: 'info@ssbindustries.co.in',
    website: 'www.steelsip.in',
    isActive: true,
    logoInitials: 'SSB',
  },
  {
    uid: 'cmp-02',
    code: 'SSBX',
    legalName: 'SSB Exports LLP',
    tradeName: 'SteelSip Global',
    entityType: 'LLP',
    cin: 'AAG-4471',
    pan: 'AAKFS7781M',
    tan: 'CHES09912D',
    baseCurrency: 'INR',
    fyStartMonth: 4,
    timezone: 'Asia/Kolkata',
    addressLine1: 'Unit 12, MEPZ SEZ, Tambaram',
    city: 'Chennai',
    state: 'Tamil Nadu',
    stateCode: '33',
    pincode: '600045',
    phone: '+91 44 6712 8899',
    email: 'exports@ssbindustries.co.in',
    website: 'www.steelsip.global',
    isActive: true,
    logoInitials: 'SX',
  },
]

export const registrations: Registration[] = [
  { uid: 'reg-01', companyUid: 'cmp-01', branchUid: 'brn-01', type: 'GSTIN', number: '33AABCS1234K1ZP', authority: 'GST Council — Tamil Nadu', validFrom: '2017-07-01', validTo: null },
  { uid: 'reg-02', companyUid: 'cmp-01', branchUid: 'brn-03', type: 'GSTIN', number: '07AABCS1234K1ZL', authority: 'GST Council — Delhi', validFrom: '2019-04-01', validTo: null },
  { uid: 'reg-03', companyUid: 'cmp-01', type: 'FACTORY_LICENCE', number: 'TN/FAC/2019/4471', authority: 'Directorate of Industrial Safety & Health, TN', validFrom: '2019-01-15', validTo: '2027-12-31' },
  { uid: 'reg-04', companyUid: 'cmp-01', type: 'PCB_CONSENT', number: 'TNPCB/CTO/2024/8812', authority: 'Tamil Nadu Pollution Control Board', validFrom: '2024-04-01', validTo: daysAhead(48) },
  { uid: 'reg-05', companyUid: 'cmp-01', type: 'IEC', number: 'AABCS1234K', authority: 'DGFT', validFrom: '2018-06-10', validTo: null },
  { uid: 'reg-06', companyUid: 'cmp-01', type: 'EPF', number: 'TNMAS0044718000', authority: 'EPFO', validFrom: '2016-08-01', validTo: null },
  { uid: 'reg-07', companyUid: 'cmp-01', type: 'ESI', number: '51000447180000401', authority: 'ESIC', validFrom: '2016-08-01', validTo: null },
  { uid: 'reg-08', companyUid: 'cmp-01', type: 'ISO_9001', number: 'IND/QMS/2023/11204', authority: 'TUV SUD South Asia', validFrom: '2023-03-01', validTo: daysAhead(212) },
  { uid: 'reg-09', companyUid: 'cmp-01', type: 'BIS', number: 'CM/L-7712045', authority: 'Bureau of Indian Standards', validFrom: '2022-09-01', validTo: daysAhead(24) },
  { uid: 'reg-10', companyUid: 'cmp-01', type: 'FSSAI', number: '12421011000897', authority: 'FSSAI', validFrom: '2021-11-01', validTo: daysAhead(88) },
  { uid: 'reg-11', companyUid: 'cmp-01', type: 'LEGAL_METROLOGY', number: 'TN/LM/PC/2023/0912', authority: 'Legal Metrology Dept, TN', validFrom: '2023-01-01', validTo: daysAhead(5) },
  { uid: 'reg-12', companyUid: 'cmp-01', type: 'UDYAM', number: 'UDYAM-TN-02-0044718', authority: 'MSME Ministry', validFrom: '2020-07-01', validTo: null },
]

/* ═══════════════════════════ BRANCHES ════════════════════════════════════ */

export const branches: Branch[] = [
  { uid: 'brn-01', companyUid: 'cmp-01', code: 'CHN', name: 'Chennai (Head Office)', branchType: 'HEAD_OFFICE', gstin: '33AABCS1234K1ZP', hasSeparateGstin: true, city: 'Kancheepuram', state: 'Tamil Nadu', stateCode: '33', pincode: '602105', contactPerson: 'S. Balaji', phone: '+91 44 6712 8800', isActive: true },
  { uid: 'brn-02', companyUid: 'cmp-01', code: 'CBE', name: 'Coimbatore Depot', branchType: 'DEPOT', gstin: null, hasSeparateGstin: false, city: 'Coimbatore', state: 'Tamil Nadu', stateCode: '33', pincode: '641014', contactPerson: 'M. Karthik', phone: '+91 422 245 1180', isActive: true },
  { uid: 'brn-03', companyUid: 'cmp-01', code: 'DEL', name: 'Delhi Sales Office', branchType: 'SALES_OFFICE', gstin: '07AABCS1234K1ZL', hasSeparateGstin: true, city: 'New Delhi', state: 'Delhi', stateCode: '07', pincode: '110020', contactPerson: 'A. Chopra', phone: '+91 11 4108 2210', isActive: true },
  { uid: 'brn-04', companyUid: 'cmp-01', code: 'HSR', name: 'Hosur Factory', branchType: 'FACTORY', gstin: null, hasSeparateGstin: false, city: 'Hosur', state: 'Tamil Nadu', stateCode: '33', pincode: '635109', contactPerson: 'R. Prakash', phone: '+91 4344 260 118', isActive: true },
  { uid: 'brn-05', companyUid: 'cmp-02', code: 'SEZ', name: 'MEPZ SEZ Unit', branchType: 'FACTORY', gstin: '33AAKFS7781M1ZQ', hasSeparateGstin: true, city: 'Chennai', state: 'Tamil Nadu', stateCode: '33', pincode: '600045', contactPerson: 'V. Nandhini', phone: '+91 44 6712 8899', isActive: true },
]

/* ═══════════════════════════ PLANTS / LINES / WORK CENTRES ═══════════════ */

export const plants: Plant[] = [
  { uid: 'plt-01', companyUid: 'cmp-01', branchUid: 'brn-01', code: 'P1', name: 'Plant 1 — Sriperumbudur', plantHead: 'S. Balaji', factoryLicence: 'TN/FAC/2019/4471', factoryLicenceValidTo: '2027-12-31', city: 'Kancheepuram', state: 'Tamil Nadu', installedCapacityPerDay: 22000, capacityUom: 'bottles', shiftPattern: '3-shift (A/B/C)', linesCount: 3, workCentresCount: 18, isActive: true },
  { uid: 'plt-02', companyUid: 'cmp-01', branchUid: 'brn-04', code: 'P2', name: 'Plant 2 — Hosur', plantHead: 'R. Prakash', factoryLicence: 'TN/FAC/2021/6612', factoryLicenceValidTo: '2028-06-30', city: 'Hosur', state: 'Tamil Nadu', installedCapacityPerDay: 14000, capacityUom: 'bottles', shiftPattern: '2-shift (A/B)', linesCount: 2, workCentresCount: 11, isActive: true },
]

export const productionLines: ProductionLine[] = [
  { uid: 'lin-01', plantUid: 'plt-01', code: 'LA', name: 'Line A — 500ml / 750ml', lineType: 'FORMING', minCapacityMl: 350, maxCapacityMl: 750, cycleTimeSec: 4.2, ratedOutputPerHour: 780, status: 'RUNNING' },
  { uid: 'lin-02', plantUid: 'plt-01', code: 'LB', name: 'Line B — 1L / 1.5L', lineType: 'FORMING', minCapacityMl: 900, maxCapacityMl: 1500, cycleTimeSec: 5.8, ratedOutputPerHour: 560, status: 'RUNNING' },
  { uid: 'lin-03', plantUid: 'plt-01', code: 'LC', name: 'Line C — Coating & Printing', lineType: 'COATING', minCapacityMl: 350, maxCapacityMl: 1500, cycleTimeSec: 3.1, ratedOutputPerHour: 1050, status: 'MAINTENANCE' },
  { uid: 'lin-04', plantUid: 'plt-02', code: 'LD', name: 'Line D — Assembly & Packing', lineType: 'ASSEMBLY', minCapacityMl: 350, maxCapacityMl: 1500, cycleTimeSec: 2.4, ratedOutputPerHour: 1400, status: 'RUNNING' },
  { uid: 'lin-05', plantUid: 'plt-02', code: 'LE', name: 'Line E — Vacuum & Leak Test', lineType: 'VACUUM', minCapacityMl: 350, maxCapacityMl: 1500, cycleTimeSec: 6.5, ratedOutputPerHour: 480, status: 'IDLE' },
]

export const workCentres: WorkCentre[] = [
  { uid: 'wc-01', plantUid: 'plt-01', lineUid: 'lin-01', code: 'DDP-01', name: 'Deep Draw Press 1 (160T)', type: 'MACHINE', capacityPerHour: 820, efficiencyPct: 92, machineHourRate: 640, isBottleneck: false },
  { uid: 'wc-02', plantUid: 'plt-01', lineUid: 'lin-01', code: 'DDP-02', name: 'Deep Draw Press 2 (160T)', type: 'MACHINE', capacityPerHour: 800, efficiencyPct: 88, machineHourRate: 640, isBottleneck: false },
  { uid: 'wc-03', plantUid: 'plt-01', lineUid: 'lin-01', code: 'NCK-01', name: 'Necking Machine 1', type: 'MACHINE', capacityPerHour: 760, efficiencyPct: 90, machineHourRate: 410, isBottleneck: false },
  { uid: 'wc-04', plantUid: 'plt-01', lineUid: 'lin-01', code: 'THR-01', name: 'Thread Roller 1', type: 'MACHINE', capacityPerHour: 740, efficiencyPct: 94, machineHourRate: 380, isBottleneck: false },
  { uid: 'wc-05', plantUid: 'plt-01', lineUid: 'lin-02', code: 'DDP-03', name: 'Deep Draw Press 3 (250T)', type: 'MACHINE', capacityPerHour: 580, efficiencyPct: 86, machineHourRate: 890, isBottleneck: true },
  { uid: 'wc-06', plantUid: 'plt-01', lineUid: null, code: 'WLD-01', name: 'Laser Bottom Welder 1', type: 'MACHINE', capacityPerHour: 640, efficiencyPct: 91, machineHourRate: 1120, isBottleneck: false },
  { uid: 'wc-07', plantUid: 'plt-01', lineUid: null, code: 'VAC-01', name: 'Vacuum Station 1', type: 'MACHINE', capacityPerHour: 460, efficiencyPct: 84, machineHourRate: 1480, isBottleneck: true },
  { uid: 'wc-08', plantUid: 'plt-01', lineUid: 'lin-03', code: 'CTB-01', name: 'Powder Coating Booth 1', type: 'MACHINE', capacityPerHour: 1050, efficiencyPct: 89, machineHourRate: 720, isBottleneck: false },
  { uid: 'wc-09', plantUid: 'plt-01', lineUid: 'lin-03', code: 'PRT-01', name: 'Pad Printing Station 1', type: 'MACHINE', capacityPerHour: 900, efficiencyPct: 93, machineHourRate: 340, isBottleneck: false },
  { uid: 'wc-10', plantUid: 'plt-01', lineUid: null, code: 'QCI-01', name: 'Final Inspection Bay', type: 'INSPECTION', capacityPerHour: 1200, efficiencyPct: 95, machineHourRate: 160, isBottleneck: false },
]

/* ═══════════════════════════ WAREHOUSES / BINS ═══════════════════════════ */

export const warehouses: Warehouse[] = [
  { uid: 'wh-01', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: 'plt-01', code: 'RM-01', name: 'Raw Material Store', warehouseType: 'RAW_MATERIAL', isBinManaged: true, isBatchMandatory: true, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'K. Ravi', valuationMethod: 'WEIGHTED_AVG', binCount: 708, stockValue: 24_180_000, isActive: true },
  { uid: 'wh-02', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: 'plt-01', code: 'WIP-01', name: 'Work in Progress Store', warehouseType: 'WIP', isBinManaged: true, isBatchMandatory: true, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'M. Devi', valuationMethod: 'WEIGHTED_AVG', binCount: 96, stockValue: 8_940_000, isActive: true },
  { uid: 'wh-03', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: 'plt-01', code: 'FG-01', name: 'Finished Goods Store', warehouseType: 'FINISHED_GOODS', isBinManaged: true, isBatchMandatory: true, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'P. Suresh', valuationMethod: 'STANDARD', binCount: 240, stockValue: 41_620_000, isActive: true },
  { uid: 'wh-04', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: 'plt-01', code: 'PKG-01', name: 'Packing Material Store', warehouseType: 'PACKING_MATERIAL', isBinManaged: true, isBatchMandatory: false, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'K. Ravi', valuationMethod: 'WEIGHTED_AVG', binCount: 120, stockValue: 3_210_000, isActive: true },
  { uid: 'wh-05', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: 'plt-01', code: 'QTN-01', name: 'Quarantine Store', warehouseType: 'QUARANTINE', isBinManaged: false, isBatchMandatory: true, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'S. Meena', valuationMethod: 'WEIGHTED_AVG', binCount: 0, stockValue: 1_480_000, isActive: true },
  { uid: 'wh-06', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: 'plt-01', code: 'REJ-01', name: 'Reject Store', warehouseType: 'REJECT', isBinManaged: false, isBatchMandatory: true, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'S. Meena', valuationMethod: 'WEIGHTED_AVG', binCount: 0, stockValue: 312_000, isActive: true },
  { uid: 'wh-07', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: 'plt-01', code: 'SCR-01', name: 'Scrap Yard', warehouseType: 'SCRAP', isBinManaged: false, isBatchMandatory: false, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'K. Ravi', valuationMethod: 'WEIGHTED_AVG', binCount: 0, stockValue: 890_000, isActive: true },
  { uid: 'wh-08', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: null, code: 'SUB-01', name: 'Job-work — Coat Tech Industries', warehouseType: 'SUBCONTRACTOR', isBinManaged: false, isBatchMandatory: true, allowNegativeStock: false, isSystemManaged: true, storekeeper: '—', valuationMethod: 'WEIGHTED_AVG', binCount: 0, stockValue: 2_140_000, isActive: true },
  { uid: 'wh-09', companyUid: 'cmp-01', branchUid: 'brn-01', plantUid: null, code: 'TRN-01', name: 'Goods in Transit', warehouseType: 'TRANSIT', isBinManaged: false, isBatchMandatory: false, allowNegativeStock: false, isSystemManaged: true, storekeeper: '—', valuationMethod: 'WEIGHTED_AVG', binCount: 0, stockValue: 1_720_000, isActive: true },
  { uid: 'wh-10', companyUid: 'cmp-01', branchUid: 'brn-02', plantUid: null, code: 'FG-02', name: 'Coimbatore Depot Store', warehouseType: 'FINISHED_GOODS', isBinManaged: false, isBatchMandatory: true, allowNegativeStock: false, isSystemManaged: false, storekeeper: 'M. Karthik', valuationMethod: 'STANDARD', binCount: 0, stockValue: 6_450_000, isActive: true },
]

export const bins: Bin[] = [
  { uid: 'bin-01', warehouseUid: 'wh-01', zone: 'Coil Yard', code: 'CY-01', binType: 'COIL_STAND', maxWeightKg: 5000, pickSequence: 100, status: 'FULL', currentStock: '4 coils · SS304 · 8,900 kg', utilisationPct: 89 },
  { uid: 'bin-02', warehouseUid: 'wh-01', zone: 'Coil Yard', code: 'CY-02', binType: 'COIL_STAND', maxWeightKg: 5000, pickSequence: 110, status: 'AVAILABLE', currentStock: '2 coils · SS201 · 3,240 kg', utilisationPct: 65 },
  { uid: 'bin-03', warehouseUid: 'wh-01', zone: 'Rack Area A', code: 'A-01-1-1', binType: 'RACK', maxWeightKg: 500, pickSequence: 1000, status: 'AVAILABLE', currentStock: 'Silicone ring 68mm · 12,400 nos', utilisationPct: 42 },
  { uid: 'bin-04', warehouseUid: 'wh-01', zone: 'Rack Area A', code: 'A-01-1-2', binType: 'RACK', maxWeightKg: 500, pickSequence: 1010, status: 'AVAILABLE', currentStock: '—', utilisationPct: 0 },
  { uid: 'bin-05', warehouseUid: 'wh-01', zone: 'Rack Area A', code: 'A-01-1-3', binType: 'RACK', maxWeightKg: 500, pickSequence: 1020, status: 'AVAILABLE', currentStock: 'PP lid insert · 8,900 nos', utilisationPct: 31 },
  { uid: 'bin-06', warehouseUid: 'wh-01', zone: 'Rack Area A', code: 'A-01-2-1', binType: 'RACK', maxWeightKg: 500, pickSequence: 1030, status: 'BLOCKED', currentStock: 'Damaged rack — under repair', utilisationPct: 0 },
  { uid: 'bin-07', warehouseUid: 'wh-01', zone: 'Rack Area B', code: 'B-04-2-2', binType: 'RACK', maxWeightKg: 500, pickSequence: 2200, status: 'AVAILABLE', currentStock: 'Getter pellets · 44,000 nos', utilisationPct: 18 },
  { uid: 'bin-08', warehouseUid: 'wh-01', zone: 'Bulk Zone', code: 'BLK-01', binType: 'BULK', maxWeightKg: 12000, pickSequence: 50, status: 'AVAILABLE', currentStock: 'Powder coat — Matte Black · 1,240 kg', utilisationPct: 52 },
  { uid: 'bin-09', warehouseUid: 'wh-01', zone: 'Bulk Zone', code: 'BLK-02', binType: 'BULK', maxWeightKg: 12000, pickSequence: 60, status: 'FULL', currentStock: 'Powder coat — Ocean Blue · 2,180 kg', utilisationPct: 94 },
  { uid: 'bin-10', warehouseUid: 'wh-03', zone: 'Pallet Zone', code: 'P-A-01', binType: 'PALLET', maxWeightKg: 1200, pickSequence: 100, status: 'FULL', currentStock: 'SKU SS-750-BLK · 48 cartons', utilisationPct: 96 },
]

/* ═══════════════════════════ DEPARTMENTS / COST CENTRES ══════════════════ */

export const departments: Department[] = [
  { uid: 'dep-01', companyUid: 'cmp-01', parentUid: null, code: 'MFG', name: 'Manufacturing', departmentType: 'PRODUCTION', head: 'S. Balaji', costCentre: 'CC-PRD', isActive: true },
  { uid: 'dep-02', companyUid: 'cmp-01', parentUid: 'dep-01', code: 'PRESS', name: 'Press Shop', departmentType: 'PRODUCTION', head: 'T. Ganesh', costCentre: 'CC-PRD-01', isActive: true },
  { uid: 'dep-03', companyUid: 'cmp-01', parentUid: 'dep-01', code: 'WELD', name: 'Welding & Vacuum', departmentType: 'PRODUCTION', head: 'N. Selvam', costCentre: 'CC-PRD-02', isActive: true },
  { uid: 'dep-04', companyUid: 'cmp-01', parentUid: 'dep-01', code: 'COAT', name: 'Coating & Printing', departmentType: 'PRODUCTION', head: 'J. Mohan', costCentre: 'CC-PRD-03', isActive: true },
  { uid: 'dep-05', companyUid: 'cmp-01', parentUid: null, code: 'QC', name: 'Quality Assurance', departmentType: 'QUALITY', head: 'S. Meena', costCentre: 'CC-QC', isActive: true },
  { uid: 'dep-06', companyUid: 'cmp-01', parentUid: null, code: 'STORE', name: 'Stores & Warehouse', departmentType: 'STORES', head: 'K. Ravi', costCentre: 'CC-STR', isActive: true },
  { uid: 'dep-07', companyUid: 'cmp-01', parentUid: null, code: 'PUR', name: 'Purchase', departmentType: 'PURCHASE', head: 'Ravi Kumar', costCentre: 'CC-PUR', isActive: true },
  { uid: 'dep-08', companyUid: 'cmp-01', parentUid: null, code: 'PPC', name: 'Production Planning & Control', departmentType: 'PPC', head: 'A. Lakshmi', costCentre: 'CC-PPC', isActive: true },
  { uid: 'dep-09', companyUid: 'cmp-01', parentUid: null, code: 'SALES', name: 'Sales & Marketing', departmentType: 'SALES', head: 'A. Kumar', costCentre: 'CC-SAL', isActive: true },
  { uid: 'dep-10', companyUid: 'cmp-01', parentUid: null, code: 'FIN', name: 'Finance & Accounts', departmentType: 'FINANCE', head: 'K. Raman', costCentre: 'CC-FIN', isActive: true },
  { uid: 'dep-11', companyUid: 'cmp-01', parentUid: null, code: 'HR', name: 'Human Resources', departmentType: 'HR', head: 'P. Vidya', costCentre: 'CC-HR', isActive: true },
  { uid: 'dep-12', companyUid: 'cmp-01', parentUid: null, code: 'MAINT', name: 'Maintenance', departmentType: 'MAINTENANCE', head: 'D. Anand', costCentre: 'CC-MNT', isActive: true },
]

export const costCentres: CostCentre[] = [
  { uid: 'cc-01', companyUid: 'cmp-01', parentUid: null, code: 'CC-PRD', name: 'Production', type: 'PRODUCTION', owner: 'S. Balaji', budget: 84_000_000, actual: 61_240_000, isPostable: false, isActive: true },
  { uid: 'cc-02', companyUid: 'cmp-01', parentUid: 'cc-01', code: 'CC-PRD-01', name: 'Press Shop', type: 'PRODUCTION', owner: 'T. Ganesh', budget: 32_000_000, actual: 24_180_000, isPostable: true, isActive: true },
  { uid: 'cc-03', companyUid: 'cmp-01', parentUid: 'cc-01', code: 'CC-PRD-02', name: 'Welding & Vacuum', type: 'PRODUCTION', owner: 'N. Selvam', budget: 28_000_000, actual: 21_060_000, isPostable: true, isActive: true },
  { uid: 'cc-04', companyUid: 'cmp-01', parentUid: 'cc-01', code: 'CC-PRD-03', name: 'Coating & Printing', type: 'PRODUCTION', owner: 'J. Mohan', budget: 24_000_000, actual: 16_000_000, isPostable: true, isActive: true },
  { uid: 'cc-05', companyUid: 'cmp-01', parentUid: null, code: 'CC-PUR', name: 'Purchase', type: 'ADMIN', owner: 'Ravi Kumar', budget: 24_000_000, actual: 18_040_000, isPostable: true, isActive: true },
  { uid: 'cc-06', companyUid: 'cmp-01', parentUid: null, code: 'CC-QC', name: 'Quality', type: 'QUALITY', owner: 'S. Meena', budget: 9_600_000, actual: 6_120_000, isPostable: true, isActive: true },
  { uid: 'cc-07', companyUid: 'cmp-01', parentUid: null, code: 'CC-MNT', name: 'Maintenance', type: 'MAINTENANCE', owner: 'D. Anand', budget: 12_000_000, actual: 9_840_000, isPostable: true, isActive: true },
  { uid: 'cc-08', companyUid: 'cmp-01', parentUid: null, code: 'CC-STR', name: 'Stores', type: 'SERVICE', owner: 'K. Ravi', budget: 4_800_000, actual: 3_120_000, isPostable: true, isActive: true },
  { uid: 'cc-09', companyUid: 'cmp-01', parentUid: null, code: 'CC-SAL', name: 'Sales & Marketing', type: 'SALES', owner: 'A. Kumar', budget: 18_000_000, actual: 14_620_000, isPostable: true, isActive: true },
  { uid: 'cc-10', companyUid: 'cmp-01', parentUid: null, code: 'CC-FIN', name: 'Finance', type: 'ADMIN', owner: 'K. Raman', budget: 7_200_000, actual: 5_010_000, isPostable: true, isActive: true },
  { uid: 'cc-11', companyUid: 'cmp-01', parentUid: null, code: 'CC-HR', name: 'Human Resources', type: 'ADMIN', owner: 'P. Vidya', budget: 6_000_000, actual: 4_380_000, isPostable: true, isActive: true },
  { uid: 'cc-12', companyUid: 'cmp-01', parentUid: null, code: 'CC-UTL', name: 'Utilities', type: 'UTILITY', owner: 'D. Anand', budget: 15_600_000, actual: 12_940_000, isPostable: true, isActive: true },
]

/* ═══════════════════════════ FINANCIAL YEAR / PERIODS ════════════════════ */

export const financialYears: FinancialYear[] = [
  { uid: 'fy-01', companyUid: 'cmp-01', code: 'FY24-25', startDate: '2024-04-01', endDate: '2025-03-31', status: 'CLOSED', isCurrent: false },
  { uid: 'fy-02', companyUid: 'cmp-01', code: 'FY25-26', startDate: '2025-04-01', endDate: '2026-03-31', status: 'OPEN', isCurrent: false },
  { uid: 'fy-03', companyUid: 'cmp-01', code: 'FY26-27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'OPEN', isCurrent: true },
  { uid: 'fy-04', companyUid: 'cmp-01', code: 'FY27-28', startDate: '2027-04-01', endDate: '2028-03-31', status: 'FUTURE', isCurrent: false },
]

const MONTH_NAMES = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']

export const accountingPeriods: AccountingPeriod[] = MONTH_NAMES.map((name, i) => {
  const year = i < 9 ? 2026 : 2027
  const month = i < 9 ? i + 4 : i - 8
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 0))
  const closed = i < 3
  const closing = i === 3
  return {
    uid: `per-${i + 1}`,
    fyUid: 'fy-03',
    periodNo: i + 1,
    name: `${name} ${year}`,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    moduleStatus: {
      INVENTORY: closed ? 'CLOSED' : 'OPEN',
      PURCHASE: closed ? 'CLOSED' : 'OPEN',
      SALES: closed ? 'CLOSED' : 'OPEN',
      PRODUCTION: closed ? 'CLOSED' : closing ? 'CLOSING' : 'OPEN',
      PAYROLL: closed ? 'CLOSED' : 'OPEN',
      FINANCE: i < 2 ? 'CLOSED' : closing ? 'CLOSING' : 'OPEN',
    },
  } as AccountingPeriod
})

export const currencies: Currency[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2, isBase: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, isBase: false },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, isBase: false },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', decimals: 2, isBase: false },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2, isBase: false },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, isBase: false },
]

export const exchangeRates: ExchangeRate[] = [
  { uid: 'xr-01', from: 'USD', to: 'INR', rateType: 'AVERAGE', rate: 88.4200, effectiveDate: daysAgo(0).slice(0, 10), source: 'RBI reference' },
  { uid: 'xr-02', from: 'USD', to: 'INR', rateType: 'BUYING', rate: 88.1000, effectiveDate: daysAgo(0).slice(0, 10), source: 'HDFC Bank' },
  { uid: 'xr-03', from: 'USD', to: 'INR', rateType: 'SELLING', rate: 88.7400, effectiveDate: daysAgo(0).slice(0, 10), source: 'HDFC Bank' },
  { uid: 'xr-04', from: 'USD', to: 'INR', rateType: 'CUSTOMS', rate: 88.0000, effectiveDate: daysAgo(3).slice(0, 10), source: 'CBIC notification' },
  { uid: 'xr-05', from: 'EUR', to: 'INR', rateType: 'AVERAGE', rate: 95.1800, effectiveDate: daysAgo(0).slice(0, 10), source: 'RBI reference' },
  { uid: 'xr-06', from: 'AED', to: 'INR', rateType: 'AVERAGE', rate: 24.0700, effectiveDate: daysAgo(0).slice(0, 10), source: 'RBI reference' },
  { uid: 'xr-07', from: 'GBP', to: 'INR', rateType: 'AVERAGE', rate: 112.4400, effectiveDate: daysAgo(1).slice(0, 10), source: 'RBI reference' },
  { uid: 'xr-08', from: 'USD', to: 'INR', rateType: 'AVERAGE', rate: 88.1900, effectiveDate: daysAgo(1).slice(0, 10), source: 'RBI reference' },
  { uid: 'xr-09', from: 'USD', to: 'INR', rateType: 'AVERAGE', rate: 87.9400, effectiveDate: daysAgo(2).slice(0, 10), source: 'RBI reference' },
]

/* ═══════════════════════════ ROLES ═══════════════════════════════════════ */

const p = (...codes: string[]) => codes
const allFor = (module: string, ...entities: string[]) =>
  PERMISSIONS.filter((x) => x.module === module && entities.includes(x.entity)).map((x) => x.code)
const viewOnly = (...modules: string[]) =>
  PERMISSIONS.filter((x) => modules.includes(x.module) && ['VIEW', 'EXPORT', 'PRINT'].includes(x.action)).map((x) => x.code)

export const roles: Role[] = [
  {
    uid: 'rol-01', code: 'SYS_ADMIN', name: 'System Administrator',
    description: 'Full configuration authority. No transactional posting rights by default.',
    roleType: 'SYSTEM', isSystem: true, isActive: true, userCount: 2,
    permissions: PERMISSIONS.filter((x) => x.module === 'SYSTEM').map((x) => x.code),
    deniedPermissions: p('FINANCE.PAYMENT.RELEASE', 'FINANCE.VOUCHER.APPROVE'),
    fieldPolicies: [{ entity: 'hrm_employee', field: 'salary_ctc', access: 'HIDDEN' }],
  },
  {
    uid: 'rol-02', code: 'MD', name: 'Managing Director',
    description: 'Group-wide read access, top-tier approvals, MIS dashboards.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 1,
    permissions: [...viewOnly('PROCUREMENT', 'INVENTORY', 'PRODUCTION', 'QUALITY', 'SALES', 'DISPATCH', 'FINANCE', 'HRMS', 'MASTER'),
      // Analytics in full — the MD is the one role that sees money and people together.
      ...allFor('BI', 'DASHBOARD', 'FINANCIAL', 'PEOPLE', 'KPI', 'INSIGHT', 'FORECAST', 'ALERT', 'REPORT', 'DATA_SOURCE', 'GOVERNANCE'),
      ...p('PROCUREMENT.PO.APPROVE', 'PROCUREMENT.PO.REJECT', 'SALES.SO.APPROVE', 'FINANCE.PAYMENT.APPROVE', 'FINANCE.PAYMENT.RELEASE', 'SYSTEM.CROSS_COMPANY_READ.VIEW', 'SYSTEM.DASHBOARD.VIEW', 'INVENTORY.STOCK.VIEW_VALUE', 'INVENTORY.REPORT.VIEW_VALUE', 'INVENTORY.DASHBOARD.VIEW_ALL_PLANTS')],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-03', code: 'CFO', name: 'Chief Financial Officer',
    description: 'Finance full authority, budget approval, payment release.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 1,
    permissions: [...allFor('FINANCE', 'VOUCHER', 'PAYMENT', 'PERIOD'), ...viewOnly('PROCUREMENT', 'SALES', 'INVENTORY'),
      // Financial analytics, but not the workforce screens — headcount cost is
      // visible through finance, individual attrition is HR's to share.
      ...allFor('BI', 'DASHBOARD', 'FINANCIAL', 'KPI', 'INSIGHT', 'FORECAST', 'ALERT', 'REPORT'),
      ...p('BI.GOVERNANCE.VIEW', 'PROCUREMENT.PO.APPROVE', 'PROCUREMENT.PO.REJECT', 'SYSTEM.AUDIT.VIEW', 'SYSTEM.AUDIT.VIEW_ALL', 'SYSTEM.FINANCIAL_YEAR.CLOSE', 'SYSTEM.DASHBOARD.VIEW', 'INVENTORY.STOCK.VIEW_VALUE', 'INVENTORY.REPORT.VIEW_VALUE', 'INVENTORY.VALUATION.APPROVE_REVALUATION', 'INVENTORY.WRITE_OFF.APPROVE')],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-04', code: 'FACTORY_HEAD', name: 'Factory / Works Head',
    description: 'Plant-wide oversight of production, quality, maintenance and stores.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 2,
    permissions: [...allFor('PRODUCTION', 'PRODUCTION_ORDER', 'WORK_ORDER', 'ENTRY', 'DOWNTIME'),
      ...viewOnly('QUALITY', 'INVENTORY', 'PROCUREMENT'),
      // Quantity analytics without money: OEE, scrap, downtime and delivery,
      // but no margin and no pay. The same split the shop floor screens use.
      ...p('BI.DASHBOARD.VIEW', 'BI.DASHBOARD.EXPORT', 'BI.KPI.VIEW', 'BI.INSIGHT.VIEW', 'BI.INSIGHT.ASSIGN', 'BI.INSIGHT.CLOSE',
        'BI.FORECAST.VIEW', 'BI.ALERT.VIEW', 'BI.ALERT.EDIT', 'BI.REPORT.VIEW', 'BI.REPORT.EXPORT', 'BI.DATA_SOURCE.VIEW'),
      ...p('PROCUREMENT.PO.APPROVE', 'PROCUREMENT.PO.REJECT', 'PROCUREMENT.PR.APPROVE', 'INVENTORY.STOCK_ADJUSTMENT.APPROVE', 'INVENTORY.SCRAP.APPROVE', 'INVENTORY.WRITE_OFF.APPROVE', 'INVENTORY.CYCLE_COUNT.APPROVE_VARIANCE', 'INVENTORY.CYCLE_COUNT.FREEZE', 'INVENTORY.STOCK.VIEW_VALUE', 'INVENTORY.RESERVATION.OVERRIDE', 'SYSTEM.DASHBOARD.VIEW')],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-05', code: 'PURCH_HEAD', name: 'Purchase Head',
    description: 'Full procurement authority including PO approval up to ₹50 lakh.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 4,
    permissions: [...allFor('PROCUREMENT', 'PR', 'RFQ', 'QUOTATION', 'PO', 'RETURN'),
      ...p('PROCUREMENT.GRN.VIEW', 'PROCUREMENT.GRN.PRINT', 'PROCUREMENT.GRN.EXPORT',
        'MASTER.SUPPLIER.VIEW', 'MASTER.SUPPLIER.CREATE', 'MASTER.SUPPLIER.EDIT', 'MASTER.SUPPLIER.APPROVE',
        'MASTER.ITEM.VIEW', 'INVENTORY.STOCK.VIEW', 'SYSTEM.DASHBOARD.VIEW')],
    deniedPermissions: p('FINANCE.PAYMENT.RELEASE'),
    fieldPolicies: [{ entity: 'mst_supplier', field: 'bank_account_no', access: 'HIDDEN' }, { entity: 'hrm_employee', field: 'salary_ctc', access: 'HIDDEN' }],
  },
  {
    uid: 'rol-06', code: 'PURCH_EXEC', name: 'Purchase Executive',
    description: 'Raise RFQ, capture supplier quotations, prepare PO drafts.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 5,
    permissions: p('PROCUREMENT.PR.VIEW', 'PROCUREMENT.PR.CREATE', 'PROCUREMENT.PR.EDIT', 'PROCUREMENT.PR.SUBMIT',
      'PROCUREMENT.RFQ.VIEW', 'PROCUREMENT.RFQ.CREATE', 'PROCUREMENT.RFQ.EDIT', 'PROCUREMENT.RFQ.SUBMIT',
      'PROCUREMENT.QUOTATION.VIEW', 'PROCUREMENT.QUOTATION.CREATE', 'PROCUREMENT.QUOTATION.EDIT',
      'PROCUREMENT.PO.VIEW', 'PROCUREMENT.PO.CREATE', 'PROCUREMENT.PO.EDIT', 'PROCUREMENT.PO.SUBMIT', 'PROCUREMENT.PO.PRINT',
      'MASTER.SUPPLIER.VIEW', 'MASTER.ITEM.VIEW', 'INVENTORY.STOCK.VIEW'),
    deniedPermissions: p('PROCUREMENT.PO.APPROVE'), fieldPolicies: [],
  },
  {
    uid: 'rol-07', code: 'STORE_HEAD', name: 'Stores In-charge',
    description: 'GRN, issues, transfers, adjustment approval, cycle count.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 3,
    permissions: [
      ...allFor('INVENTORY', 'DASHBOARD', 'STOCK', 'LEDGER', 'PUTAWAY', 'RECEIPT', 'REQUISITION', 'MATERIAL_ISSUE',
        'MATERIAL_RETURN', 'TRANSFER', 'SUBCONTRACT', 'CYCLE_COUNT', 'BATCH', 'SERIAL', 'REORDER', 'RESERVATION', 'REPORT'),
      // Raises adjustments and scrap, but approval sits with the Materials Manager
      // and Finance — the raiser can never be the approver (SoD sod-05).
      ...p('INVENTORY.STOCK_ADJUSTMENT.VIEW', 'INVENTORY.STOCK_ADJUSTMENT.CREATE', 'INVENTORY.STOCK_ADJUSTMENT.SUBMIT',
        'INVENTORY.SCRAP.VIEW', 'INVENTORY.SCRAP.CREATE', 'INVENTORY.SCRAP.APPROVE',
        'INVENTORY.WRITE_OFF.VIEW', 'INVENTORY.WRITE_OFF.CREATE', 'INVENTORY.QC_HOLD.VIEW', 'INVENTORY.SETTINGS.VIEW'),
      ...allFor('PROCUREMENT', 'GRN'), ...p('MASTER.ITEM.VIEW', 'SYSTEM.WAREHOUSE.VIEW', 'SYSTEM.LABEL.PRINT')],
    deniedPermissions: p('INVENTORY.STOCK_ADJUSTMENT.APPROVE'),
    fieldPolicies: [{ entity: 'prc_purchase_order', field: 'rate', access: 'HIDDEN' }, { entity: 'prc_purchase_order', field: 'total_amount', access: 'HIDDEN' }],
  },
  {
    uid: 'rol-08', code: 'STORE_OPR', name: 'Store Operator',
    description: 'Scan-driven GRN entry, material issue and receipt, bin transfer.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 8,
    // Works the bins all day and never sees what the material cost —
    // INVENTORY.STOCK.VIEW_VALUE is deliberately absent (V4-INV-BR-004).
    permissions: p('PROCUREMENT.GRN.VIEW', 'PROCUREMENT.GRN.CREATE', 'PROCUREMENT.GRN.EDIT', 'PROCUREMENT.GRN.SUBMIT',
      'INVENTORY.DASHBOARD.VIEW', 'INVENTORY.STOCK.VIEW', 'INVENTORY.LEDGER.VIEW',
      'INVENTORY.PUTAWAY.VIEW', 'INVENTORY.PUTAWAY.CREATE', 'INVENTORY.PUTAWAY.CONFIRM',
      'INVENTORY.RECEIPT.VIEW', 'INVENTORY.RECEIPT.POST', 'INVENTORY.QC_HOLD.VIEW',
      'INVENTORY.REQUISITION.VIEW', 'INVENTORY.REQUISITION.CREATE',
      'INVENTORY.MATERIAL_ISSUE.VIEW', 'INVENTORY.MATERIAL_ISSUE.CREATE', 'INVENTORY.MATERIAL_ISSUE.SUBMIT', 'INVENTORY.MATERIAL_ISSUE.POST',
      'INVENTORY.MATERIAL_RETURN.VIEW', 'INVENTORY.MATERIAL_RETURN.CREATE', 'INVENTORY.MATERIAL_RETURN.POST',
      'INVENTORY.TRANSFER.VIEW', 'INVENTORY.TRANSFER.CREATE', 'INVENTORY.TRANSFER.DISPATCH', 'INVENTORY.TRANSFER.RECEIVE',
      'INVENTORY.CYCLE_COUNT.VIEW', 'INVENTORY.CYCLE_COUNT.COUNT', 'INVENTORY.CYCLE_COUNT.RECOUNT',
      'INVENTORY.BATCH.VIEW', 'INVENTORY.BATCH.TRACE', 'INVENTORY.SERIAL.VIEW', 'INVENTORY.SERIAL.GENERATE',
      'INVENTORY.SCRAP.VIEW', 'INVENTORY.SCRAP.CREATE', 'INVENTORY.REPORT.VIEW',
      'MASTER.ITEM.VIEW', 'SYSTEM.LABEL.PRINT'),
    deniedPermissions: p('INVENTORY.STOCK.VIEW_VALUE', 'INVENTORY.REPORT.VIEW_VALUE'),
    fieldPolicies: [
      { entity: 'prc_purchase_order', field: 'rate', access: 'HIDDEN' },
      { entity: 'prc_purchase_order', field: 'amount', access: 'HIDDEN' },
      { entity: 'inv_stock_balance', field: 'value', access: 'HIDDEN' },
      { entity: 'inv_material_issue', field: 'total_value', access: 'HIDDEN' },
    ],
  },
  {
    uid: 'rol-09', code: 'PPC', name: 'Production Planning & Control',
    description: 'Forecast, MPS, MRP, production order release and scheduling.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 3,
    permissions: [...allFor('PRODUCTION', 'PRODUCTION_ORDER', 'WORK_ORDER'), ...viewOnly('INVENTORY', 'QUALITY'),
      ...p('PROCUREMENT.PR.VIEW', 'PROCUREMENT.PR.CREATE', 'PROCUREMENT.PR.SUBMIT', 'MASTER.ITEM.VIEW', 'SYSTEM.DASHBOARD.VIEW', 'INVENTORY.REORDER.VIEW', 'INVENTORY.REORDER.EDIT', 'INVENTORY.REORDER.RECALCULATE', 'INVENTORY.RESERVATION.VIEW', 'INVENTORY.RESERVATION.CREATE', 'INVENTORY.RESERVATION.RELEASE', 'INVENTORY.RESERVATION.OVERRIDE', 'INVENTORY.BATCH.TRACE')],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-10', code: 'PROD_MGR', name: 'Production Manager',
    description: 'Work order execution, allocation, confirmation, rework and scrap approval.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 4,
    permissions: [
      ...allFor('PRODUCTION', 'WORK_ORDER', 'ENTRY', 'DOWNTIME', 'MACHINE', 'WIP', 'OEE', 'SCRAP',
        'REWORK', 'SHIFT', 'LABOUR', 'INSTRUCTION', 'TRACEABILITY', 'REPORT', 'DASHBOARD'),
      ...p('PRODUCTION.PRODUCTION_ORDER.VIEW', 'PRODUCTION.PRODUCTION_ORDER.RELEASE', 'PRODUCTION.PRODUCTION_ORDER.CLOSE',
        'INVENTORY.MATERIAL_ISSUE.VIEW', 'INVENTORY.MATERIAL_ISSUE.CREATE', 'QUALITY.INSPECTION.VIEW', 'MASTER.ITEM.VIEW'),
    ],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-11', code: 'SHIFT_SUP', name: 'Shift Supervisor',
    description: 'Shop-floor production entry, downtime capture, manpower allocation and shift handover.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 9,
    // Quantity visibility without cost visibility — the same split inventory uses.
    permissions: p('PRODUCTION.DASHBOARD.VIEW',
      'PRODUCTION.ENTRY.VIEW', 'PRODUCTION.ENTRY.CREATE', 'PRODUCTION.ENTRY.EDIT',
      'PRODUCTION.DOWNTIME.VIEW', 'PRODUCTION.DOWNTIME.CREATE', 'PRODUCTION.DOWNTIME.CLOSE',
      'PRODUCTION.PRODUCTION_ORDER.VIEW', 'PRODUCTION.WORK_ORDER.VIEW', 'PRODUCTION.WORK_ORDER.ASSIGN', 'PRODUCTION.WORK_ORDER.RELEASE',
      'PRODUCTION.MACHINE.VIEW', 'PRODUCTION.MACHINE.ASSIGN', 'PRODUCTION.OEE.VIEW', 'PRODUCTION.WIP.VIEW',
      'PRODUCTION.SCRAP.VIEW', 'PRODUCTION.SCRAP.CREATE', 'PRODUCTION.REWORK.VIEW', 'PRODUCTION.REWORK.CREATE', 'PRODUCTION.REWORK.ASSIGN',
      'PRODUCTION.SHIFT.VIEW', 'PRODUCTION.SHIFT.CREATE', 'PRODUCTION.SHIFT.EDIT', 'PRODUCTION.SHIFT.CLOSE',
      'PRODUCTION.LABOUR.VIEW', 'PRODUCTION.LABOUR.EDIT', 'PRODUCTION.LABOUR.ASSIGN',
      'PRODUCTION.INSTRUCTION.VIEW', 'PRODUCTION.INSTRUCTION.PRINT',
      'PRODUCTION.TRACEABILITY.VIEW', 'PRODUCTION.TRACEABILITY.TRACE', 'PRODUCTION.TRACEABILITY.PRINT', 'PRODUCTION.REPORT.VIEW',
      'INVENTORY.MATERIAL_ISSUE.VIEW', 'INVENTORY.MATERIAL_ISSUE.CREATE', 'MASTER.ITEM.VIEW'),
    deniedPermissions: p('PRODUCTION.SCRAP.VIEW_VALUE', 'PRODUCTION.REPORT.VIEW_VALUE', 'PRODUCTION.WIP.VIEW_VALUE'),
    fieldPolicies: [],
  },
  {
    uid: 'rol-12', code: 'OPERATOR', name: 'Machine Operator',
    description: 'Mobile production entry, downtime report, work instructions, material request. PIN/badge login.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 46,
    permissions: p('PRODUCTION.ENTRY.VIEW', 'PRODUCTION.ENTRY.CREATE', 'PRODUCTION.DOWNTIME.CREATE',
      'PRODUCTION.WORK_ORDER.VIEW', 'PRODUCTION.MACHINE.VIEW', 'PRODUCTION.WIP.VIEW',
      'PRODUCTION.SCRAP.CREATE', 'PRODUCTION.INSTRUCTION.VIEW'),
    deniedPermissions: p('PRODUCTION.SCRAP.VIEW_VALUE', 'PRODUCTION.WIP.VIEW_VALUE'),
    fieldPolicies: [],
  },
  {
    uid: 'rol-13', code: 'QC_HEAD', name: 'Quality Head',
    description: 'QC approval, NCR/CAPA closure, certificate release, inspection plans.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 1,
    permissions: [...allFor('QUALITY', 'INSPECTION', 'NCR', 'CAPA'), ...viewOnly('PRODUCTION', 'INVENTORY'),
      ...p('MASTER.DEFECT.VIEW', 'MASTER.DEFECT.CREATE', 'MASTER.DEFECT.EDIT', 'MASTER.SUPPLIER.APPROVE', 'SYSTEM.DASHBOARD.VIEW', 'INVENTORY.QC_HOLD.VIEW', 'INVENTORY.QC_HOLD.RELEASE', 'INVENTORY.QC_HOLD.BLOCK', 'INVENTORY.BATCH.VIEW', 'INVENTORY.BATCH.BLOCK', 'INVENTORY.BATCH.EXTEND_EXPIRY', 'INVENTORY.BATCH.TRACE', 'INVENTORY.MATERIAL_ISSUE.OVERRIDE_FEFO')],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-14', code: 'QC_INSP', name: 'Quality Inspector',
    description: 'Incoming, in-process and final inspection entry with defect capture.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 6,
    permissions: p('QUALITY.INSPECTION.VIEW', 'QUALITY.INSPECTION.CREATE', 'QUALITY.INSPECTION.EDIT', 'QUALITY.INSPECTION.SUBMIT',
      'QUALITY.NCR.VIEW', 'QUALITY.NCR.CREATE', 'MASTER.DEFECT.VIEW', 'MASTER.ITEM.VIEW', 'INVENTORY.STOCK.VIEW',
      'INVENTORY.QC_HOLD.VIEW', 'INVENTORY.QC_HOLD.RELEASE', 'INVENTORY.QC_HOLD.BLOCK',
      'INVENTORY.BATCH.VIEW', 'INVENTORY.BATCH.TRACE', 'INVENTORY.SERIAL.VIEW'),
    deniedPermissions: p('QUALITY.INSPECTION.APPROVE', 'INVENTORY.BATCH.EXTEND_EXPIRY'), fieldPolicies: [],
  },
  {
    uid: 'rol-15', code: 'SALES_HEAD', name: 'Sales Head',
    description: 'CRM and sales full authority, quotation and discount approval.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 1,
    permissions: [...allFor('SALES', 'LEAD', 'QUOTATION', 'SO', 'INVOICE'), ...viewOnly('DISPATCH', 'INVENTORY'),
      ...p('MASTER.CUSTOMER.VIEW', 'MASTER.CUSTOMER.CREATE', 'MASTER.CUSTOMER.EDIT', 'MASTER.CUSTOMER.APPROVE', 'SYSTEM.DASHBOARD.VIEW')],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-16', code: 'SALES_EXEC', name: 'Sales Executive',
    description: 'Own customers only — leads, visits, quotations and sales-order drafts.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 7,
    permissions: p('SALES.LEAD.VIEW', 'SALES.LEAD.CREATE', 'SALES.LEAD.EDIT',
      'SALES.QUOTATION.VIEW', 'SALES.QUOTATION.CREATE', 'SALES.QUOTATION.EDIT', 'SALES.QUOTATION.SUBMIT',
      'SALES.SO.VIEW', 'SALES.SO.CREATE', 'SALES.SO.EDIT', 'SALES.SO.SUBMIT', 'MASTER.CUSTOMER.VIEW', 'MASTER.ITEM.VIEW'),
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-17', code: 'ACCOUNTS', name: 'Accounts Executive',
    description: 'Vouchers, invoices, receipts, payments, reconciliation.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 4,
    permissions: [...allFor('FINANCE', 'VOUCHER'), ...p('FINANCE.PAYMENT.VIEW', 'FINANCE.PAYMENT.CREATE', 'FINANCE.PAYMENT.EDIT', 'FINANCE.PAYMENT.SUBMIT',
      'SALES.INVOICE.VIEW', 'SALES.INVOICE.CREATE', 'SALES.INVOICE.PRINT', 'PROCUREMENT.GRN.VIEW', 'FINANCE.PERIOD.VIEW',
      // Costing side of inventory: sees value, proposes revaluation, reconciles to the GL.
      'INVENTORY.DASHBOARD.VIEW', 'INVENTORY.STOCK.VIEW', 'INVENTORY.STOCK.VIEW_VALUE', 'INVENTORY.STOCK.EXPORT',
      'INVENTORY.LEDGER.VIEW', 'INVENTORY.VALUATION.VIEW', 'INVENTORY.VALUATION.REVALUE', 'INVENTORY.VALUATION.RECONCILE_GL',
      'INVENTORY.STOCK_ADJUSTMENT.VIEW', 'INVENTORY.STOCK_ADJUSTMENT.APPROVE', 'INVENTORY.WRITE_OFF.VIEW', 'INVENTORY.WRITE_OFF.APPROVE',
      'INVENTORY.SUBCONTRACT.VIEW', 'INVENTORY.SUBCONTRACT.RECONCILE', 'INVENTORY.REPORT.VIEW', 'INVENTORY.REPORT.VIEW_VALUE')],
    deniedPermissions: p('FINANCE.PAYMENT.RELEASE', 'FINANCE.PERIOD.REOPEN'), fieldPolicies: [],
  },
  {
    uid: 'rol-18', code: 'HR', name: 'HR Executive',
    description: 'The full HR and payroll function — employees, attendance, leave, payroll, statutory and appraisals.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 2,
    permissions: [
      ...allFor('HRMS', 'DASHBOARD', 'EMPLOYEE', 'ORG_UNIT', 'REQUISITION', 'CANDIDATE', 'ATTENDANCE', 'OVERTIME',
        'SHIFT', 'LEAVE', 'LEAVE_POLICY', 'PAYROLL', 'SALARY', 'PAYSLIP', 'STATUTORY', 'INCENTIVE', 'LABOUR_COST',
        'SKILL', 'CONTRACTOR', 'APPRAISAL', 'KPI', 'TRAINING', 'SELF_SERVICE', 'TEAM', 'REPORT'),
      // Workforce analytics — the people permission is HR's to hold.
      ...p('BI.DASHBOARD.VIEW', 'BI.PEOPLE.VIEW', 'BI.KPI.VIEW', 'BI.INSIGHT.VIEW', 'BI.FORECAST.VIEW',
        'BI.ALERT.VIEW', 'BI.REPORT.VIEW', 'BI.REPORT.EXPORT'),
      ...p('SYSTEM.DASHBOARD.VIEW', 'MASTER.EMPLOYEE.VIEW', 'MASTER.EMPLOYEE.CREATE', 'MASTER.EMPLOYEE.EDIT'),
    ],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-25', code: 'HR_TIME', name: 'Time Office Clerk',
    description: 'Attendance, regularisation, leave and shift roster. Sees hours and days, never salary or ratings.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 3,
    // Quantity without money — the same split inventory and the shop floor use.
    permissions: p('HRMS.DASHBOARD.VIEW',
      'HRMS.EMPLOYEE.VIEW',
      'HRMS.ATTENDANCE.VIEW', 'HRMS.ATTENDANCE.CREATE', 'HRMS.ATTENDANCE.EDIT', 'HRMS.ATTENDANCE.OVERRIDE', 'HRMS.ATTENDANCE.EXPORT',
      'HRMS.OVERTIME.VIEW', 'HRMS.OVERTIME.CREATE', 'HRMS.OVERTIME.EDIT',
      'HRMS.SHIFT.VIEW', 'HRMS.SHIFT.CREATE', 'HRMS.SHIFT.EDIT', 'HRMS.SHIFT.ASSIGN',
      'HRMS.LEAVE.VIEW', 'HRMS.LEAVE.CREATE', 'HRMS.LEAVE.EDIT', 'HRMS.LEAVE_POLICY.VIEW',
      'HRMS.SKILL.VIEW', 'HRMS.TRAINING.VIEW', 'HRMS.SELF_SERVICE.VIEW', 'HRMS.REPORT.VIEW',
      'HRMS.CONTRACTOR.VIEW'),
    deniedPermissions: p('HRMS.PAYROLL.VIEW', 'HRMS.SALARY.VIEW', 'HRMS.PAYSLIP.VIEW_ALL',
      'HRMS.APPRAISAL.VIEW', 'HRMS.LABOUR_COST.VIEW', 'HRMS.INCENTIVE.VIEW', 'HRMS.REPORT.VIEW_VALUE',
      'BI.FINANCIAL.VIEW', 'BI.PEOPLE.VIEW', 'BI.REPORT.VIEW_VALUE'),
    fieldPolicies: [
      { entity: 'hr_employee', field: 'monthly_ctc', access: 'HIDDEN' },
      { entity: 'hr_payslip', field: 'net_pay', access: 'HIDDEN' },
    ],
  },
  {
    uid: 'rol-19', code: 'MAINT_HEAD', name: 'Maintenance Head',
    description: 'Preventive schedule, breakdown closure, spares approval.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 1,
    permissions: [...viewOnly('PRODUCTION', 'INVENTORY'), ...p('PRODUCTION.DOWNTIME.VIEW', 'PRODUCTION.DOWNTIME.CREATE', 'PRODUCTION.DOWNTIME.EDIT', 'PRODUCTION.DOWNTIME.APPROVE',
      'MASTER.MACHINE.VIEW', 'MASTER.MACHINE.CREATE', 'MASTER.MACHINE.EDIT', 'PROCUREMENT.PR.VIEW', 'PROCUREMENT.PR.CREATE')],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-23', code: 'DISPATCH_MGR', name: 'Dispatch Manager',
    description: 'Dispatch planning, vehicle allocation, loading release, shipments, exports and freight approval.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 2,
    permissions: [
      ...allFor('DISPATCH', 'DASHBOARD', 'PACKING_ORDER', 'PACK_MATERIAL', 'CARTON', 'PALLET', 'LABEL', 'PLAN',
        'PICK_LIST', 'LOADING', 'VEHICLE', 'CHALLAN', 'SHIPMENT', 'TRACKING', 'POD', 'RETURN', 'FREIGHT',
        'EXPORT', 'EXPORT_DOC', 'REPORT'),
      ...p('SALES.SO.VIEW', 'SALES.INVOICE.VIEW', 'INVENTORY.STOCK.VIEW', 'INVENTORY.BATCH.TRACE',
        'PRODUCTION.PRODUCTION_ORDER.VIEW', 'MASTER.CUSTOMER.VIEW', 'MASTER.ITEM.VIEW', 'SYSTEM.DASHBOARD.VIEW'),
    ],
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-24', code: 'PACKING_SUP', name: 'Packing Supervisor',
    description: 'Packing orders, material issue, cartons, pallets and labels. Sees quantities, not freight or invoice value.',
    roleType: 'INTERNAL', isSystem: true, isActive: true, userCount: 4,
    // The same quantity-without-value split inventory and the shop floor use.
    permissions: p('DISPATCH.DASHBOARD.VIEW',
      'DISPATCH.PACKING_ORDER.VIEW', 'DISPATCH.PACKING_ORDER.CREATE', 'DISPATCH.PACKING_ORDER.EDIT', 'DISPATCH.PACKING_ORDER.SUBMIT',
      'DISPATCH.PACK_MATERIAL.VIEW', 'DISPATCH.PACK_MATERIAL.ISSUE', 'DISPATCH.PACK_MATERIAL.CONFIRM',
      'DISPATCH.CARTON.VIEW', 'DISPATCH.CARTON.CREATE', 'DISPATCH.CARTON.EDIT', 'DISPATCH.CARTON.CONFIRM', 'DISPATCH.CARTON.PRINT',
      'DISPATCH.PALLET.VIEW', 'DISPATCH.PALLET.CREATE', 'DISPATCH.PALLET.EDIT', 'DISPATCH.PALLET.CLOSE', 'DISPATCH.PALLET.PRINT',
      'DISPATCH.LABEL.VIEW', 'DISPATCH.LABEL.PRINT',
      'DISPATCH.PLAN.VIEW', 'DISPATCH.PICK_LIST.VIEW', 'DISPATCH.LOADING.VIEW', 'DISPATCH.LOADING.CONFIRM',
      'DISPATCH.SHIPMENT.VIEW', 'DISPATCH.TRACKING.VIEW', 'DISPATCH.POD.VIEW', 'DISPATCH.REPORT.VIEW',
      'INVENTORY.STOCK.VIEW', 'MASTER.ITEM.VIEW'),
    deniedPermissions: p('DISPATCH.FREIGHT.VIEW', 'DISPATCH.REPORT.VIEW_VALUE', 'DISPATCH.SHIPMENT.VIEW_VALUE',
      'DISPATCH.PACK_MATERIAL.VIEW_VALUE', 'DISPATCH.EXPORT.VIEW_VALUE'),
    fieldPolicies: [
      { entity: 'dsp_shipment', field: 'invoice_value', access: 'HIDDEN' },
      { entity: 'dsp_freight_charge', field: 'amount', access: 'HIDDEN' },
    ],
  },
  {
    uid: 'rol-20', code: 'AUDITOR', name: 'Internal Auditor',
    description: 'Read-only across every module, plus full audit-log access. No write anywhere.',
    roleType: 'AUDIT', isSystem: true, isActive: true, userCount: 1,
    permissions: [...PERMISSIONS.filter((x) => ['VIEW', 'EXPORT', 'PRINT'].includes(x.action)).map((x) => x.code)],
    deniedPermissions: PERMISSIONS.filter((x) => ['CREATE', 'EDIT', 'DELETE', 'SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'POST', 'REVERSE', 'AMEND'].includes(x.action)).map((x) => x.code),
    fieldPolicies: [],
  },
  {
    uid: 'rol-21', code: 'SUPPLIER_PORTAL', name: 'Supplier (Portal)',
    description: 'External supplier — own records only. RFQ response, PO acknowledgement, ASN.',
    roleType: 'PORTAL', isSystem: true, isActive: true, userCount: 14,
    permissions: p('PROCUREMENT.RFQ.VIEW', 'PROCUREMENT.QUOTATION.VIEW', 'PROCUREMENT.QUOTATION.CREATE', 'PROCUREMENT.PO.VIEW', 'PROCUREMENT.PO.PRINT'),
    deniedPermissions: [], fieldPolicies: [],
  },
  {
    uid: 'rol-22', code: 'CUSTOMER_PORTAL', name: 'Customer (Portal)',
    description: 'External customer — own records only. Order status, dispatch, ledger, complaints.',
    roleType: 'PORTAL', isSystem: true, isActive: true, userCount: 22,
    permissions: p('SALES.SO.VIEW', 'SALES.INVOICE.VIEW', 'SALES.INVOICE.PRINT', 'DISPATCH.SHIPMENT.VIEW'),
    deniedPermissions: [], fieldPolicies: [],
  },
]

/* ═══════════════════════════ USERS ═══════════════════════════════════════ */

const baseScope = {
  companies: ['cmp-01'],
  branches: ['brn-01'],
  plants: ['plt-01'],
  warehouses: ['wh-01', 'wh-02', 'wh-03'],
  costCentres: [] as string[],
}

export const users: User[] = [
  { uid: 'usr-01', loginId: 'rkumar', fullName: 'Ravi Kumar', email: 'ravi.kumar@ssbindustries.co.in', mobile: '+91 98400 12345', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0142', department: 'Purchase', designation: 'Purchase Head', reportsTo: 'S. Balaji', roles: ['PURCH_HEAD', 'PPC'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, costCentres: ['cc-05'] }, rowRule: 'ALL', mfaEnabled: true, lastLoginAt: daysAgo(0, 9), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-02', loginId: 'sbalaji', fullName: 'S. Balaji', email: 's.balaji@ssbindustries.co.in', mobile: '+91 98400 22110', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0018', department: 'Manufacturing', designation: 'Works Head', reportsTo: 'R. Krishnan', roles: ['FACTORY_HEAD'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { companies: ['cmp-01'], branches: ['brn-01', 'brn-04'], plants: ['plt-01', 'plt-02'], warehouses: ['wh-01', 'wh-02', 'wh-03', 'wh-04', 'wh-05'], costCentres: ['cc-01'] }, rowRule: 'ALL', mfaEnabled: true, lastLoginAt: daysAgo(0, 8), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-03', loginId: 'rkrishnan', fullName: 'R. Krishnan', email: 'md@ssbindustries.co.in', mobile: '+91 98400 00001', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0001', department: 'Management', designation: 'Managing Director', reportsTo: '—', roles: ['MD'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: null, scope: { companies: ['cmp-01', 'cmp-02'], branches: [], plants: [], warehouses: [], costCentres: [] }, rowRule: 'ALL', mfaEnabled: true, lastLoginAt: daysAgo(1, 20), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-04', loginId: 'kraman', fullName: 'K. Raman', email: 'k.raman@ssbindustries.co.in', mobile: '+91 98400 33221', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0031', department: 'Finance & Accounts', designation: 'Chief Financial Officer', reportsTo: 'R. Krishnan', roles: ['CFO'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: null, scope: { companies: ['cmp-01', 'cmp-02'], branches: ['brn-01', 'brn-02', 'brn-03', 'brn-04'], plants: [], warehouses: [], costCentres: ['cc-10'] }, rowRule: 'ALL', mfaEnabled: true, lastLoginAt: daysAgo(0, 10), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-05', loginId: 'smeena', fullName: 'S. Meena', email: 's.meena@ssbindustries.co.in', mobile: '+91 98400 44118', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0067', department: 'Quality Assurance', designation: 'Quality Head', reportsTo: 'S. Balaji', roles: ['QC_HEAD'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, warehouses: ['wh-05', 'wh-06'], costCentres: ['cc-06'] }, rowRule: 'ALL', mfaEnabled: false, lastLoginAt: daysAgo(0, 8), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-06', loginId: 'kravi', fullName: 'K. Ravi', email: 'k.ravi@ssbindustries.co.in', mobile: '+91 98400 55009', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0088', department: 'Stores & Warehouse', designation: 'Stores In-charge', reportsTo: 'S. Balaji', roles: ['STORE_HEAD'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, warehouses: ['wh-01', 'wh-02', 'wh-03', 'wh-04', 'wh-07'], costCentres: ['cc-08'] }, rowRule: 'ALL', mfaEnabled: false, lastLoginAt: daysAgo(0, 7), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-07', loginId: 'psuresh', fullName: 'P. Suresh', email: 'p.suresh@ssbindustries.co.in', mobile: '+91 98400 66120', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0104', department: 'Purchase', designation: 'Purchase Executive', reportsTo: 'Ravi Kumar', roles: ['PURCH_EXEC'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: baseScope, rowRule: 'OWN', mfaEnabled: false, lastLoginAt: daysAgo(0, 9), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-08', loginId: 'mdevi', fullName: 'M. Devi', email: 'm.devi@ssbindustries.co.in', mobile: '+91 98400 77231', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0119', department: 'Stores & Warehouse', designation: 'Store Operator', reportsTo: 'K. Ravi', roles: ['STORE_OPR'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, warehouses: ['wh-02'] }, rowRule: 'ALL', mfaEnabled: false, lastLoginAt: daysAgo(0, 6), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-09', loginId: 'alakshmi', fullName: 'A. Lakshmi', email: 'a.lakshmi@ssbindustries.co.in', mobile: '+91 98400 88342', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0056', department: 'Production Planning & Control', designation: 'PPC Manager', reportsTo: 'S. Balaji', roles: ['PPC'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, plants: ['plt-01', 'plt-02'] }, rowRule: 'ALL', mfaEnabled: false, lastLoginAt: daysAgo(0, 9), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-10', loginId: 'akumar', fullName: 'A. Kumar', email: 'a.kumar@ssbindustries.co.in', mobile: '+91 98400 99453', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0022', department: 'Sales & Marketing', designation: 'Sales Head', reportsTo: 'R. Krishnan', roles: ['SALES_HEAD'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: null, scope: { companies: ['cmp-01'], branches: ['brn-01', 'brn-02', 'brn-03'], plants: [], warehouses: ['wh-03', 'wh-10'], costCentres: ['cc-09'] }, rowRule: 'ALL', mfaEnabled: false, lastLoginAt: daysAgo(0, 10), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-11', loginId: 'tganesh', fullName: 'T. Ganesh', email: 't.ganesh@ssbindustries.co.in', mobile: '+91 98401 10564', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0075', department: 'Press Shop', designation: 'Production Manager', reportsTo: 'S. Balaji', roles: ['PROD_MGR'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, costCentres: ['cc-02'] }, rowRule: 'DEPARTMENT', mfaEnabled: false, lastLoginAt: daysAgo(0, 7), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-12', loginId: 'op_1147', fullName: 'Anand P', email: 'anand.p@ssbindustries.co.in', mobile: '+91 98401 21675', userType: 'SHOPFLOOR', status: 'ACTIVE', employeeCode: 'EMP1147', department: 'Press Shop', designation: 'Machine Operator', reportsTo: 'T. Ganesh', roles: ['OPERATOR'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, warehouses: [] }, rowRule: 'OWN', mfaEnabled: false, lastLoginAt: daysAgo(0, 6), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-13', loginId: 'danand', fullName: 'D. Anand', email: 'd.anand@ssbindustries.co.in', mobile: '+91 98401 32786', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0093', department: 'Maintenance', designation: 'Maintenance Head', reportsTo: 'S. Balaji', roles: ['MAINT_HEAD'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { ...baseScope, costCentres: ['cc-07'] }, rowRule: 'ALL', mfaEnabled: false, lastLoginAt: daysAgo(1, 14), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-14', loginId: 'pvidya', fullName: 'P. Vidya', email: 'p.vidya@ssbindustries.co.in', mobile: '+91 98401 43897', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0044', department: 'Human Resources', designation: 'HR Manager', reportsTo: 'R. Krishnan', roles: ['HR'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: null, scope: { companies: ['cmp-01'], branches: ['brn-01', 'brn-02', 'brn-04'], plants: [], warehouses: [], costCentres: ['cc-11'] }, rowRule: 'ALL', mfaEnabled: true, lastLoginAt: daysAgo(0, 9), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-15', loginId: 'nvasanth', fullName: 'N. Vasanth', email: 'audit@ssbindustries.co.in', mobile: '+91 98401 54908', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0201', department: 'Finance & Accounts', designation: 'Internal Auditor', reportsTo: 'K. Raman', roles: ['AUDITOR'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: null, scope: { companies: ['cmp-01', 'cmp-02'], branches: [], plants: [], warehouses: [], costCentres: [] }, rowRule: 'ALL', mfaEnabled: true, lastLoginAt: daysAgo(2, 11), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-16', loginId: 'sysadmin', fullName: 'System Administrator', email: 'it@ssbindustries.co.in', mobile: '+91 98401 65019', userType: 'INTERNAL', status: 'ACTIVE', employeeCode: 'EMP0002', department: 'IT', designation: 'IT Manager', reportsTo: 'K. Raman', roles: ['SYS_ADMIN'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: { companies: ['cmp-01', 'cmp-02'], branches: ['brn-01', 'brn-02', 'brn-03', 'brn-04', 'brn-05'], plants: ['plt-01', 'plt-02'], warehouses: warehouses.map((w) => w.uid), costCentres: costCentres.map((c) => c.uid) }, rowRule: 'ALL', mfaEnabled: true, lastLoginAt: daysAgo(0, 8), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-17', loginId: 'jindal_portal', fullName: 'Jindal Steel — A. Sharma', email: 'a.sharma@jindalsteel.example', mobile: '+91 98110 44221', userType: 'PORTAL_SUPPLIER', status: 'ACTIVE', employeeCode: null, department: '—', designation: 'Supplier contact', reportsTo: '—', roles: ['SUPPLIER_PORTAL'], defaultCompanyUid: 'cmp-01', defaultBranchUid: null, defaultPlantUid: null, scope: { companies: ['cmp-01'], branches: [], plants: [], warehouses: [], costCentres: [] }, rowRule: 'OWN', mfaEnabled: false, lastLoginAt: daysAgo(2, 15), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-18', loginId: 'metro_portal', fullName: 'Metro Cash & Carry — R. Iyer', email: 'r.iyer@metro.example', mobile: '+91 99400 11223', userType: 'PORTAL_CUSTOMER', status: 'ACTIVE', employeeCode: null, department: '—', designation: 'Customer contact', reportsTo: '—', roles: ['CUSTOMER_PORTAL'], defaultCompanyUid: 'cmp-01', defaultBranchUid: null, defaultPlantUid: null, scope: { companies: ['cmp-01'], branches: [], plants: [], warehouses: [], costCentres: [] }, rowRule: 'OWN', mfaEnabled: false, lastLoginAt: daysAgo(4, 12), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-19', loginId: 'jmohan', fullName: 'J. Mohan', email: 'j.mohan@ssbindustries.co.in', mobile: '+91 98401 76130', userType: 'INTERNAL', status: 'SUSPENDED', employeeCode: 'EMP0130', department: 'Coating & Printing', designation: 'Shift Supervisor', reportsTo: 'T. Ganesh', roles: ['SHIFT_SUP'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: baseScope, rowRule: 'DEPARTMENT', mfaEnabled: false, lastLoginAt: daysAgo(56, 11), language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
  { uid: 'usr-20', loginId: 'nselvam', fullName: 'N. Selvam', email: 'n.selvam@ssbindustries.co.in', mobile: '+91 98401 87241', userType: 'INTERNAL', status: 'PENDING_ACTIVATION', employeeCode: 'EMP0214', department: 'Welding & Vacuum', designation: 'Production Manager', reportsTo: 'S. Balaji', roles: ['PROD_MGR'], defaultCompanyUid: 'cmp-01', defaultBranchUid: 'brn-01', defaultPlantUid: 'plt-01', scope: baseScope, rowRule: 'DEPARTMENT', mfaEnabled: false, lastLoginAt: null, language: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'dd-MMM-yyyy', numberFormat: 'IN' },
]

/* ═══════════════════════════ DELEGATION / SESSIONS / KEYS ════════════════ */

export const delegations: Delegation[] = [
  { uid: 'dlg-01', fromUserUid: 'usr-04', fromUserName: 'K. Raman', toUserUid: 'usr-02', toUserName: 'S. Balaji', documentTypes: ['PURCHASE_ORDER', 'PURCHASE_REQUISITION'], validFrom: daysAgo(2).slice(0, 10), validTo: daysAhead(5).slice(0, 10), reason: 'Statutory audit travel — Mumbai', status: 'ACTIVE' },
  { uid: 'dlg-02', fromUserUid: 'usr-01', fromUserName: 'Ravi Kumar', toUserUid: 'usr-07', toUserName: 'P. Suresh', documentTypes: ['PURCHASE_REQUISITION'], validFrom: daysAhead(4).slice(0, 10), validTo: daysAhead(14).slice(0, 10), reason: 'Annual leave', status: 'ACTIVE' },
  { uid: 'dlg-03', fromUserUid: 'usr-05', fromUserName: 'S. Meena', toUserUid: 'usr-02', toUserName: 'S. Balaji', documentTypes: [], validFrom: daysAgo(40).slice(0, 10), validTo: daysAgo(30).slice(0, 10), reason: 'Medical leave', status: 'EXPIRED' },
]

export const sessions: Session[] = [
  { uid: 'ses-01', userUid: 'usr-01', userName: 'Ravi Kumar', device: 'Chrome 131 / Windows 11', channel: 'WEB', ipAddress: '10.2.14.88', location: 'Plant 1 LAN', startedAt: daysAgo(0, 9), lastActivityAt: new Date().toISOString(), isCurrent: true },
  { uid: 'ses-02', userUid: 'usr-01', userName: 'Ravi Kumar', device: 'ERP App 1.2 / Android 14', channel: 'MOBILE', ipAddress: '10.2.30.11', location: 'Plant 1 Wi-Fi', startedAt: daysAgo(1, 7), lastActivityAt: daysAgo(0, 8), isCurrent: false },
  { uid: 'ses-03', userUid: 'usr-06', userName: 'K. Ravi', device: 'Zebra TC26 / Android 13', channel: 'MOBILE', ipAddress: '10.2.31.44', location: 'RM Store', startedAt: daysAgo(0, 6), lastActivityAt: daysAgo(0, 11), isCurrent: false },
  { uid: 'ses-04', userUid: 'usr-12', userName: 'Anand P', device: 'Kiosk HH-014 / Android 12', channel: 'KIOSK', ipAddress: '10.2.40.14', location: 'Line A terminal', startedAt: daysAgo(0, 6), lastActivityAt: daysAgo(0, 10), isCurrent: false },
  { uid: 'ses-05', userUid: 'usr-17', userName: 'Jindal Steel — A. Sharma', device: 'Edge 130 / Windows 10', channel: 'PORTAL', ipAddress: '49.37.182.44', location: 'External', startedAt: daysAgo(2, 15), lastActivityAt: daysAgo(2, 16), isCurrent: false },
  { uid: 'ses-06', userUid: 'usr-03', userName: 'R. Krishnan', device: 'Safari / iPadOS 18', channel: 'WEB', ipAddress: '106.51.22.180', location: 'External', startedAt: daysAgo(1, 20), lastActivityAt: daysAgo(1, 21), isCurrent: false },
]

export const apiKeys: ApiKey[] = [
  { uid: 'key-01', name: 'GSP e-invoice connector (ClearTax)', keyPrefix: 'ssb_live_a4f', roleCode: 'SYS_ADMIN', ipAllowlist: ['52.66.14.0/24'], rateLimitPerMin: 300, expiresAt: daysAhead(180), lastUsedAt: daysAgo(0, 11), callCount: 48219, status: 'ACTIVE' },
  { uid: 'key-02', name: 'E-way bill (NIC via GSP)', keyPrefix: 'ssb_live_9k2', roleCode: 'SYS_ADMIN', ipAllowlist: ['52.66.14.0/24'], rateLimitPerMin: 200, expiresAt: daysAhead(180), lastUsedAt: daysAgo(0, 14), callCount: 12844, status: 'ACTIVE' },
  { uid: 'key-03', name: 'Biometric attendance puller', keyPrefix: 'ssb_live_c81', roleCode: 'HR', ipAllowlist: ['10.2.0.0/16'], rateLimitPerMin: 60, expiresAt: daysAhead(21), lastUsedAt: daysAgo(0, 6), callCount: 8940, status: 'ACTIVE' },
  { uid: 'key-04', name: 'Weighbridge integration', keyPrefix: 'ssb_live_7d0', roleCode: 'STORE_HEAD', ipAllowlist: ['10.2.50.12'], rateLimitPerMin: 120, expiresAt: null, lastUsedAt: daysAgo(0, 10), callCount: 3128, status: 'ACTIVE' },
  { uid: 'key-05', name: 'Legacy Tally export (retired)', keyPrefix: 'ssb_live_2b5', roleCode: 'ACCOUNTS', ipAllowlist: [], rateLimitPerMin: 60, expiresAt: daysAgo(30), lastUsedAt: daysAgo(64), callCount: 20114, status: 'REVOKED' },
]

export const sodRules: SodRule[] = [
  { uid: 'sod-01', name: 'PO creation vs PO approval', permissionA: 'PROCUREMENT.PO.CREATE', permissionB: 'PROCUREMENT.PO.APPROVE', severity: 'WARN', violations: 1, isActive: true },
  { uid: 'sod-02', name: 'Supplier creation vs supplier approval', permissionA: 'MASTER.SUPPLIER.CREATE', permissionB: 'MASTER.SUPPLIER.APPROVE', severity: 'BLOCK', violations: 0, isActive: true },
  { uid: 'sod-03', name: 'GRN entry vs QC approval', permissionA: 'PROCUREMENT.GRN.CREATE', permissionB: 'QUALITY.INSPECTION.APPROVE', severity: 'BLOCK', violations: 0, isActive: true },
  { uid: 'sod-04', name: 'Payment entry vs payment release', permissionA: 'FINANCE.PAYMENT.CREATE', permissionB: 'FINANCE.PAYMENT.RELEASE', severity: 'BLOCK', violations: 0, isActive: true },
  { uid: 'sod-05', name: 'Stock adjustment entry vs approval', permissionA: 'INVENTORY.STOCK_ADJUSTMENT.CREATE', permissionB: 'INVENTORY.STOCK_ADJUSTMENT.APPROVE', severity: 'BLOCK', violations: 0, isActive: true },
  { uid: 'sod-06', name: 'Employee master edit vs payroll approval', permissionA: 'HRMS.EMPLOYEE.EDIT', permissionB: 'HRMS.PAYROLL.APPROVE', severity: 'WARN', violations: 1, isActive: true },
]

export const loginActivity: LoginActivity[] = [
  { uid: 'la-01', loginId: 'rkumar', userName: 'Ravi Kumar', result: 'SUCCESS', ipAddress: '10.2.14.88', channel: 'WEB', userAgent: 'Chrome 131 / Windows', at: daysAgo(0, 9) },
  { uid: 'la-02', loginId: 'smeena', userName: 'S. Meena', result: 'SUCCESS', ipAddress: '10.2.14.102', channel: 'WEB', userAgent: 'Edge 130 / Windows', at: daysAgo(0, 8) },
  { uid: 'la-03', loginId: 'kraman', userName: 'K. Raman', result: 'FAILED', reason: 'Incorrect password', ipAddress: '10.2.14.66', channel: 'WEB', userAgent: 'Chrome 131 / Windows', at: daysAgo(0, 10) },
  { uid: 'la-04', loginId: 'kraman', userName: 'K. Raman', result: 'SUCCESS', ipAddress: '10.2.14.66', channel: 'WEB', userAgent: 'Chrome 131 / Windows', at: daysAgo(0, 10) },
  { uid: 'la-05', loginId: 'unknown_user', userName: '—', result: 'FAILED', reason: 'Account not found', ipAddress: '203.0.113.77', channel: 'WEB', userAgent: 'python-requests/2.31', at: daysAgo(0, 3) },
  { uid: 'la-06', loginId: 'sysadmin', userName: 'System Administrator', result: 'LOCKED_OUT', reason: '5 failed attempts in 15 minutes', ipAddress: '203.0.113.77', channel: 'WEB', userAgent: 'python-requests/2.31', at: daysAgo(0, 3) },
  { uid: 'la-07', loginId: 'op_1147', userName: 'Anand P', result: 'SUCCESS', ipAddress: '10.2.40.14', channel: 'KIOSK', userAgent: 'Kiosk HH-014', at: daysAgo(0, 6) },
  { uid: 'la-08', loginId: 'jindal_portal', userName: 'Jindal Steel — A. Sharma', result: 'SUCCESS', ipAddress: '49.37.182.44', channel: 'PORTAL', userAgent: 'Edge 130 / Windows', at: daysAgo(2, 15) },
  { uid: 'la-09', loginId: 'jmohan', userName: 'J. Mohan', result: 'FAILED', reason: 'Account suspended', ipAddress: '10.2.14.201', channel: 'WEB', userAgent: 'Chrome 130 / Windows', at: daysAgo(3, 9) },
  { uid: 'la-10', loginId: 'kravi', userName: 'K. Ravi', result: 'SUCCESS', ipAddress: '10.2.31.44', channel: 'MOBILE', userAgent: 'Zebra TC26 / Android', at: daysAgo(0, 6) },
]

export { daysAgo, daysAhead }
