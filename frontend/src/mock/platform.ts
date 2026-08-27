/**
 * Volume 15 seed — the platform records the existing admin screens did not have.
 *
 * Deliberately includes things that are wrong, because the screens exist to
 * find them: a delegation cycle, a gap in the approval matrix, an expired
 * certificate, an overdue approval, and a recurring integration error.
 */

import type {
  EndpointMetric, HealthCheck, ImportRun, ImportSpec, ManagedDocument,
  SecurityPolicy, SystemLog,
} from '@/types/platform'

const base = new Date()
const d = (daysAgo: number) => {
  const x = new Date(base)
  x.setDate(x.getDate() - daysAgo)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const ahead = (days: number) => d(-days)
const t = (hoursAgo: number) => new Date(base.getTime() - hoursAgo * 3_600_000).toISOString()

let n = 0
const id = (p: string) => `${p}-${String(++n).padStart(3, '0')}`

/* ═══════════════════════ Documents ═══════════════════════ */

export const managedDocuments: ManagedDocument[] = [
  {
    uid: id('doc'), docNo: 'DOC/DRG/0114', title: 'Deep draw die — 750 ml, general assembly',
    category: 'DRAWING', folder: 'Engineering/Drawings/750ml',
    description: 'General assembly of the 750 ml deep draw die, including punch, draw ring and blank holder.',
    owner: 'S. Anand', department: 'Engineering',
    currentRevision: 'C',
    revisions: [
      { uid: id('rev'), revision: 'A', fileName: 'DD-750-GA-revA.dwg', sizeBytes: 2_418_000, mimeType: 'application/acad', uploadedBy: 'S. Anand', uploadedAt: t(9_600), changeNote: 'First issue.', approvedBy: 'V. Ramesh', approvedAt: t(9_500), supersededAt: t(4_200) },
      { uid: id('rev'), revision: 'B', fileName: 'DD-750-GA-revB.dwg', sizeBytes: 2_461_000, mimeType: 'application/acad', uploadedBy: 'S. Anand', uploadedAt: t(4_200), changeNote: 'Draw ring radius increased from 6 mm to 8 mm after wall thinning was found at FQC.', approvedBy: 'V. Ramesh', approvedAt: t(4_100), supersededAt: t(720) },
      { uid: id('rev'), revision: 'C', fileName: 'DD-750-GA-revC.dwg', sizeBytes: 2_502_400, mimeType: 'application/acad', uploadedBy: 'S. Anand', uploadedAt: t(720), changeNote: 'Blank holder pressure ports relocated; ECN/26-27/0031.', approvedBy: 'V. Ramesh', approvedAt: t(700), supersededAt: null },
    ],
    status: 'APPROVED', checkedOutBy: null, checkedOutAt: null,
    expiresOn: null, reviewLeadDays: 0, isConfidential: false,
    links: [{ entityType: 'ASSET', entityCode: 'TL-DIE-750', entityName: 'Deep Draw Die — 750 ml' }, { entityType: 'ITEM', entityCode: 'FG-SS-750-BLK', entityName: 'Vacuum Flask 750 ml' }],
    tags: ['die', '750ml', 'tooling'], downloadCount: 84, version: 3,
  },
  {
    uid: id('doc'), docNo: 'DOC/SOP/0022', title: 'Vacuum cycle validation',
    category: 'SOP', folder: 'Quality/SOPs',
    description: 'How a vacuum chamber cycle is validated before a batch is released, including the hold test and the acceptance limit.',
    owner: 'S. Meena', department: 'Quality',
    currentRevision: '4',
    revisions: [
      { uid: id('rev'), revision: '3', fileName: 'SOP-VAC-01-r3.pdf', sizeBytes: 486_000, mimeType: 'application/pdf', uploadedBy: 'S. Meena', uploadedAt: t(7_200), changeNote: 'Hold time extended to 30 minutes.', approvedBy: 'V. Ramesh', approvedAt: t(7_100), supersededAt: t(1_450) },
      { uid: id('rev'), revision: '4', fileName: 'SOP-VAC-01-r4.pdf', sizeBytes: 502_100, mimeType: 'application/pdf', uploadedBy: 'S. Meena', uploadedAt: t(1_450), changeNote: 'Acceptance limit tightened to 0.5 mbar after the chamber seal failure.', approvedBy: 'V. Ramesh', approvedAt: t(1_400), supersededAt: null },
    ],
    status: 'APPROVED', checkedOutBy: null, checkedOutAt: null,
    expiresOn: ahead(240), reviewLeadDays: 60, isConfidential: false,
    links: [{ entityType: 'ASSET', entityCode: 'MC-VAC-01', entityName: 'Vacuum Chamber' }],
    tags: ['vacuum', 'validation'], downloadCount: 212, version: 4,
  },
  {
    uid: id('doc'), docNo: 'DOC/CERT/0301', title: 'ISO 9001:2015 certificate',
    category: 'STATUTORY', folder: 'Compliance/Certificates',
    description: 'Certification to ISO 9001:2015 issued by TUV SUD South Asia. Customers ask for this at onboarding.',
    owner: 'S. Meena', department: 'Quality',
    currentRevision: '2',
    revisions: [
      { uid: id('rev'), revision: '1', fileName: 'ISO9001-2023.pdf', sizeBytes: 1_240_000, mimeType: 'application/pdf', uploadedBy: 'S. Meena', uploadedAt: t(26_000), changeNote: 'Initial certification.', approvedBy: 'V. Ramesh', approvedAt: t(25_900), supersededAt: t(9_000) },
      { uid: id('rev'), revision: '2', fileName: 'ISO9001-2026.pdf', sizeBytes: 1_268_000, mimeType: 'application/pdf', uploadedBy: 'S. Meena', uploadedAt: t(9_000), changeNote: 'Recertification after the surveillance audit.', approvedBy: 'V. Ramesh', approvedAt: t(8_900), supersededAt: null },
    ],
    status: 'APPROVED', checkedOutBy: null, checkedOutAt: null,
    expiresOn: ahead(41), reviewLeadDays: 90, isConfidential: false,
    links: [], tags: ['iso', 'certificate', 'customer-facing'], downloadCount: 156, version: 2,
  },
  {
    uid: id('doc'), docNo: 'DOC/CERT/0288', title: 'Factory licence — Tamil Nadu',
    category: 'STATUTORY', folder: 'Compliance/Licences',
    description: 'Factory licence under the Factories Act. Renewal is annual and the plant cannot operate without it.',
    owner: 'P. Suresh', department: 'Administration',
    currentRevision: '1',
    revisions: [
      { uid: id('rev'), revision: '1', fileName: 'factory-licence-2025.pdf', sizeBytes: 640_000, mimeType: 'application/pdf', uploadedBy: 'P. Suresh', uploadedAt: t(12_000), changeNote: 'Renewal for the year.', approvedBy: 'V. Ramesh', approvedAt: t(11_900), supersededAt: null },
    ],
    status: 'EXPIRED', checkedOutBy: null, checkedOutAt: null,
    expiresOn: d(18), reviewLeadDays: 60, isConfidential: false,
    links: [], tags: ['statutory', 'licence'], downloadCount: 41, version: 1,
  },
  {
    uid: id('doc'), docNo: 'DOC/WI/0077', title: 'Packing and strapping — gift box',
    category: 'WORK_INSTRUCTION', folder: 'Production/Work Instructions',
    description: 'Strapping tension by carton type. Revised after the Metro Retail dent complaint.',
    owner: 'K. Ravi', department: 'Production',
    currentRevision: '3',
    revisions: [
      { uid: id('rev'), revision: '2', fileName: 'WI-PACK-02-r2.pdf', sizeBytes: 318_000, mimeType: 'application/pdf', uploadedBy: 'K. Ravi', uploadedAt: t(5_400), changeNote: 'Added the gift-box carton.', approvedBy: 'V. Ramesh', approvedAt: t(5_300), supersededAt: t(600) },
      { uid: id('rev'), revision: '3', fileName: 'WI-PACK-02-r3.pdf', sizeBytes: 341_000, mimeType: 'application/pdf', uploadedBy: 'K. Ravi', uploadedAt: t(600), changeNote: 'Strapping tension table by carton type, from CAPA/26-27/0012.', approvedBy: null, approvedAt: null, supersededAt: null },
    ],
    status: 'PENDING_APPROVAL', checkedOutBy: 'K. Ravi', checkedOutAt: t(580),
    expiresOn: null, reviewLeadDays: 0, isConfidential: false,
    links: [{ entityType: 'CAPA', entityCode: 'CAPA/26-27/0012', entityName: 'Carton strapping tension' }],
    tags: ['packing', 'capa'], downloadCount: 63, version: 3,
  },
  {
    uid: id('doc'), docNo: 'DOC/CON/0045', title: 'Jindal Stainless — annual supply agreement',
    category: 'CONTRACT', folder: 'Procurement/Contracts',
    description: 'Rate contract for 304-grade coil. Price revision clause is quarterly against the LME index.',
    owner: 'P. Suresh', department: 'Procurement',
    currentRevision: '1',
    revisions: [
      { uid: id('rev'), revision: '1', fileName: 'jindal-supply-2026.pdf', sizeBytes: 890_000, mimeType: 'application/pdf', uploadedBy: 'P. Suresh', uploadedAt: t(3_600), changeNote: 'Executed copy.', approvedBy: 'V. Ramesh', approvedAt: t(3_500), supersededAt: null },
    ],
    status: 'APPROVED', checkedOutBy: null, checkedOutAt: null,
    expiresOn: ahead(128), reviewLeadDays: 60, isConfidential: true,
    links: [{ entityType: 'SUPPLIER', entityCode: 'SUP-JINDAL', entityName: 'Jindal Stainless Limited' }],
    tags: ['contract', 'confidential'], downloadCount: 12, version: 1,
  },
  {
    uid: id('doc'), docNo: 'DOC/MAN/0019', title: 'HDP-250T press — service manual',
    category: 'MACHINE_MANUAL', folder: 'Maintenance/Manuals',
    description: 'OEM service manual for the 250-tonne hydraulic deep drawing press.',
    owner: 'R. Manikandan', department: 'Maintenance',
    currentRevision: '1',
    revisions: [
      { uid: id('rev'), revision: '1', fileName: 'HDP250-service.pdf', sizeBytes: 18_400_000, mimeType: 'application/pdf', uploadedBy: 'R. Manikandan', uploadedAt: t(30_000), changeNote: 'As supplied by Isgec.', approvedBy: 'V. Ramesh', approvedAt: t(29_900), supersededAt: null },
    ],
    status: 'APPROVED', checkedOutBy: null, checkedOutAt: null,
    expiresOn: null, reviewLeadDays: 0, isConfidential: false,
    links: [{ entityType: 'ASSET', entityCode: 'MC-PRESS-01', entityName: 'Hydraulic Deep Drawing Press #1' }],
    tags: ['manual', 'press'], downloadCount: 97, version: 1,
  },
  {
    uid: id('doc'), docNo: 'DOC/QC/0512', title: 'Mill test certificate — heat 2406118',
    category: 'QUALITY_CERTIFICATE', folder: 'Quality/Certificates/Incoming',
    description: 'Mill test certificate for the 304 coil heat used on production orders 0126 to 0131.',
    owner: 'S. Meena', department: 'Quality',
    currentRevision: '1',
    revisions: [
      { uid: id('rev'), revision: '1', fileName: 'mtc-2406118.pdf', sizeBytes: 214_000, mimeType: 'application/pdf', uploadedBy: 'S. Meena', uploadedAt: t(2_100), changeNote: 'Received with the coil.', approvedBy: 'S. Meena', approvedAt: t(2_090), supersededAt: null },
    ],
    status: 'APPROVED', checkedOutBy: null, checkedOutAt: null,
    expiresOn: null, reviewLeadDays: 0, isConfidential: false,
    links: [{ entityType: 'SUPPLIER', entityCode: 'SUP-JINDAL', entityName: 'Jindal Stainless Limited' }],
    tags: ['mtc', 'traceability'], downloadCount: 28, version: 1,
  },
]

/* ═══════════════════════ Import specifications ═══════════════════════ */

export const importSpecs: ImportSpec[] = [
  {
    uid: id('imp'), code: 'IMP-CUSTOMER', name: 'Customers', module: 'Masters', entity: 'Customer',
    description: 'Create or update customer masters. The code is the natural key.',
    onDuplicate: 'UPDATE', allOrNothing: false,
    fields: [
      { key: 'code', label: 'Customer code', type: 'STRING', required: true, isKey: true, maxLength: 20, hint: 'Unique. Used as the key for updates.' },
      { key: 'name', label: 'Name', type: 'STRING', required: true, maxLength: 120 },
      { key: 'gstin', label: 'GSTIN', type: 'STRING', required: false, maxLength: 15, hint: '15 characters' },
      { key: 'stateCode', label: 'State code', type: 'STRING', required: true, maxLength: 2, hint: 'Two digits; decides CGST/SGST against IGST' },
      { key: 'creditLimit', label: 'Credit limit', type: 'NUMBER', required: false, min: 0 },
      { key: 'creditDays', label: 'Credit days', type: 'NUMBER', required: false, min: 0, max: 180 },
      { key: 'channel', label: 'Channel', type: 'ENUM', required: true, options: ['DOMESTIC', 'EXPORT', 'OEM', 'RETAIL', 'ECOMMERCE'] },
      { key: 'isActive', label: 'Active', type: 'BOOLEAN', required: false },
    ],
    version: 1,
    sampleRow: { code: 'CUST-0142', name: 'Metro Retail Chain Pvt Ltd', gstin: '33AABCM1234F1Z5', stateCode: '33', creditLimit: '2500000', creditDays: '45', channel: 'RETAIL', isActive: 'yes' },
  },
  {
    uid: id('imp'), code: 'IMP-ITEM', name: 'Items', module: 'Masters', entity: 'Item',
    description: 'Create or update item masters. Nothing is written unless every row is valid.',
    onDuplicate: 'REJECT', allOrNothing: true,
    fields: [
      { key: 'code', label: 'Item code', type: 'STRING', required: true, isKey: true, maxLength: 30 },
      { key: 'name', label: 'Description', type: 'STRING', required: true, maxLength: 150 },
      { key: 'uom', label: 'Unit', type: 'ENUM', required: true, options: ['NOS', 'KG', 'MTR', 'LTR', 'SET', 'CAN', 'BOX'] },
      { key: 'itemType', label: 'Type', type: 'ENUM', required: true, options: ['RAW_MATERIAL', 'COMPONENT', 'FINISHED_GOOD', 'CONSUMABLE', 'SPARE', 'PACKING'] },
      { key: 'hsn', label: 'HSN', type: 'STRING', required: false, maxLength: 8 },
      { key: 'gstRate', label: 'GST %', type: 'NUMBER', required: false, min: 0, max: 28 },
      { key: 'reorderLevel', label: 'Reorder level', type: 'NUMBER', required: false, min: 0 },
    ],
    version: 1,
    sampleRow: { code: 'RM-COIL-304-050', name: 'SS 304 coil 0.50 mm', uom: 'KG', itemType: 'RAW_MATERIAL', hsn: '72193390', gstRate: '18', reorderLevel: '5000' },
  },
  {
    uid: id('imp'), code: 'IMP-OPENING-STOCK', name: 'Opening stock', module: 'Inventory', entity: 'StockBalance',
    description: 'Opening balances at go-live. Item and warehouse must already exist.',
    onDuplicate: 'REJECT', allOrNothing: true,
    fields: [
      { key: 'itemCode', label: 'Item', type: 'REFERENCE', required: true, isKey: true, referenceOf: 'Item' },
      { key: 'warehouse', label: 'Warehouse', type: 'REFERENCE', required: true, isKey: true, referenceOf: 'Warehouse' },
      { key: 'batchNo', label: 'Batch', type: 'STRING', required: false, isKey: true, maxLength: 30 },
      { key: 'qty', label: 'Quantity', type: 'NUMBER', required: true, min: 0 },
      { key: 'rate', label: 'Rate', type: 'NUMBER', required: true, min: 0 },
      { key: 'asOn', label: 'As on', type: 'DATE', required: true },
    ],
    version: 1,
    sampleRow: { itemCode: 'RM-COIL-304-050', warehouse: 'WH-RM', batchNo: 'H2406118', qty: '12400', rate: '198.50', asOn: '2026-04-01' },
  },
  {
    uid: id('imp'), code: 'IMP-EMPLOYEE', name: 'Employees', module: 'HR', entity: 'Employee',
    description: 'Employee master load. Existing codes are skipped rather than overwritten.',
    onDuplicate: 'SKIP', allOrNothing: false,
    fields: [
      { key: 'empCode', label: 'Employee code', type: 'STRING', required: true, isKey: true, maxLength: 12 },
      { key: 'name', label: 'Name', type: 'STRING', required: true, maxLength: 100 },
      { key: 'department', label: 'Department', type: 'REFERENCE', required: true, referenceOf: 'Department' },
      { key: 'designation', label: 'Designation', type: 'STRING', required: true, maxLength: 60 },
      { key: 'doj', label: 'Date of joining', type: 'DATE', required: true },
      { key: 'shift', label: 'Shift', type: 'ENUM', required: false, options: ['A', 'B', 'C', 'GENERAL'] },
    ],
    version: 1,
    sampleRow: { empCode: 'EMP-0412', name: 'R. Manikandan', department: 'Maintenance', designation: 'Senior Technician', doj: '2019-06-17', shift: 'A' },
  },
]

export const importRuns: ImportRun[] = [
  {
    uid: id('run'), docNo: 'IMP/26-27/0044', specCode: 'IMP-CUSTOMER', specName: 'Customers',
    fileName: 'customers-oct.csv', uploadedBy: 'P. Suresh', uploadedAt: t(52),
    rowCount: 148, validRows: 148, errorRows: 0, warningRows: 6, duplicateRows: 6,
    status: 'COMMITTED', issues: [], committedAt: t(51), rolledBackAt: null, version: 2,
  },
  {
    uid: id('run'), docNo: 'IMP/26-27/0045', specCode: 'IMP-OPENING-STOCK', specName: 'Opening stock',
    fileName: 'opening-stock-wh-rm.csv', uploadedBy: 'Store — Ravi', uploadedAt: t(9),
    rowCount: 62, validRows: 55, errorRows: 7, warningRows: 2, duplicateRows: 2,
    status: 'FAILED_VALIDATION',
    issues: [
      { rowNo: 12, field: 'itemCode', severity: 'ERROR', message: 'RM-COIL-304-045 does not exist in Item.' },
      { rowNo: 19, field: 'rate', severity: 'ERROR', message: 'Rate must be a number, not "n/a".' },
      { rowNo: 23, field: 'asOn', severity: 'ERROR', message: '2026-02-31 is not a real date.' },
      { rowNo: 31, field: null, severity: 'WARNING', message: 'Same Item + Warehouse + Batch as row 28.' },
    ],
    committedAt: null, rolledBackAt: null, version: 1,
  },
  {
    uid: id('run'), docNo: 'IMP/26-27/0041', specCode: 'IMP-ITEM', specName: 'Items',
    fileName: 'new-spares.csv', uploadedBy: 'R. Manikandan', uploadedAt: t(340),
    rowCount: 24, validRows: 24, errorRows: 0, warningRows: 0, duplicateRows: 0,
    status: 'ROLLED_BACK', issues: [],
    committedAt: t(339), rolledBackAt: t(336), version: 3,
  },
]

/* ═══════════════════════ Security policy ═══════════════════════ */

export const securityPolicy: SecurityPolicy = {
  uid: id('sec'),
  password: {
    minLength: 12,
    requireUpper: true,
    requireLower: true,
    requireDigit: true,
    requireSymbol: true,
    expiryDays: 90,
    historyCount: 5,
    lockoutThreshold: 5,
    lockoutMinutes: 30,
    disallowUserInfo: true,
    bannedWords: ['password', 'ssb', 'bottle', 'welcome', 'qwerty', '123456'],
  },
  session: {
    idleTimeoutMinutes: 30,
    absoluteTimeoutHours: 12,
    maxConcurrentSessions: 3,
    reauthForSensitive: true,
  },
  mfaRequiredFor: ['INTERNAL', 'SYSTEM'],
  mfaMethods: ['TOTP', 'SMS'],
  ipAllowList: [
    { cidr: '10.20.0.0/16', label: 'Chennai plant LAN', appliesTo: 'INTERNAL' },
    { cidr: '10.30.0.0/16', label: 'Corporate office', appliesTo: 'INTERNAL' },
    { cidr: '203.0.113.24/32', label: 'Managed VPN gateway', appliesTo: 'INTERNAL' },
  ],
  ipDenyList: [
    { cidr: '198.51.100.0/24', label: 'Blocked range', reason: 'Repeated credential-stuffing attempts in March.' },
  ],
  allowedChannels: ['WEB', 'MOBILE', 'PORTAL', 'API', 'KIOSK'],
  encryptionAtRest: 'AES-256',
  tlsMinimum: 'TLS 1.2',
  version: 4,
}

/* ═══════════════════════ Logs & monitoring ═══════════════════════ */

const log = (o: Partial<SystemLog> & Pick<SystemLog, 'level' | 'source' | 'origin' | 'message' | 'at'>): SystemLog => ({
  uid: id('log'), correlationId: `req-${Math.abs(o.message.length * 7919 + o.at.length).toString(16)}`,
  userName: null, durationMs: null, httpStatus: null, stackTrace: '', acknowledged: false, version: 1, ...o,
})

export const systemLogs: SystemLog[] = [
  // The recurring one — the same fault fourteen times, which is one problem.
  ...Array.from({ length: 14 }, (_, i) =>
    log({
      level: 'ERROR', source: 'INTEGRATION', origin: 'tally-sync',
      message: 'Tally connector: socket timeout after 30000 ms',
      at: t(2 + i * 6), durationMs: 30_000,
      stackTrace: 'SocketTimeoutException: connect timed out\n  at TallyGateway.post(TallyGateway.cs:118)\n  at SyncJob.RunAsync(SyncJob.cs:64)',
    }),
  ),
  log({ level: 'ERROR', source: 'API', origin: 'POST /api/v1/purchase-orders', message: 'Validation failed: supplier is not approved for this item category', at: t(3), httpStatus: 422, durationMs: 84, userName: 'psuresh' }),
  log({ level: 'ERROR', source: 'DATABASE', origin: 'stock_ledger', message: 'Deadlock detected and chosen as victim; transaction retried', at: t(11), durationMs: 2_140, stackTrace: 'SqlException 1205\n  at StockLedgerRepository.PostAsync(StockLedgerRepository.cs:212)' }),
  log({ level: 'FATAL', source: 'JOB', origin: 'mrp-run', message: 'MRP run aborted: circular BOM detected between FG-SS-750-BLK and SA-LID-750', at: t(26), durationMs: 184_000, stackTrace: 'InvalidOperationException: cycle in bill of material\n  at BomExploder.Explode(BomExploder.cs:96)' }),
  log({ level: 'WARN', source: 'AUTH', origin: 'login', message: 'Five failed login attempts; account locked for 30 minutes', at: t(5), userName: 'kravi', httpStatus: 423 }),
  log({ level: 'WARN', source: 'AUTH', origin: 'login', message: 'Five failed login attempts; account locked for 30 minutes', at: t(29), userName: 'operator3', httpStatus: 423 }),
  log({ level: 'WARN', source: 'API', origin: 'GET /api/v1/stock-positions', message: 'Rate limit reached for API key SUPPLIER-PORTAL-01', at: t(7), httpStatus: 429, userName: 'api:supplier-portal' }),
  log({ level: 'WARN', source: 'WORKFLOW', origin: 'escalation', message: 'Approval task PR/26-27/0311 escalated after 48 hours with no decision', at: t(4) }),
  log({ level: 'WARN', source: 'DATABASE', origin: 'connection-pool', message: 'Connection pool at 85% of maximum', at: t(14), durationMs: null }),
  log({ level: 'INFO', source: 'JOB', origin: 'nightly-backup', message: 'Full backup completed: 4.2 GB in 6 minutes 12 seconds', at: t(19), durationMs: 372_000 }),
  log({ level: 'INFO', source: 'JOB', origin: 'exchange-rate-update', message: 'Exchange rates refreshed for 6 currencies', at: t(20), durationMs: 1_840 }),
  log({ level: 'INFO', source: 'INTEGRATION', origin: 'whatsapp-queue', message: 'Dispatched 42 messages', at: t(6), durationMs: 8_200 }),
  log({ level: 'INFO', source: 'APPLICATION', origin: 'startup', message: 'Application started; 18 modules registered', at: t(72), durationMs: 4_100 }),
  log({ level: 'INFO', source: 'AUTH', origin: 'login', message: 'Sign-in succeeded', at: t(1), userName: 'vramesh', httpStatus: 200, durationMs: 210 }),
  log({ level: 'INFO', source: 'API', origin: 'POST /api/v1/goods-receipts', message: 'GRN posted', at: t(2), httpStatus: 201, durationMs: 412, userName: 'storeravi' }),
]

export const endpointMetrics: EndpointMetric[] = [
  { endpoint: '/api/v1/stock-positions', method: 'GET', calls: 18_420, errors: 12, p50Ms: 84, p95Ms: 412, p99Ms: 1_180, maxMs: 3_240 },
  { endpoint: '/api/v1/purchase-orders', method: 'GET', calls: 9_860, errors: 4, p50Ms: 62, p95Ms: 240, p99Ms: 610, maxMs: 1_420 },
  { endpoint: '/api/v1/purchase-orders', method: 'POST', calls: 1_240, errors: 38, p50Ms: 186, p95Ms: 640, p99Ms: 1_460, maxMs: 4_100 },
  { endpoint: '/api/v1/production-orders', method: 'GET', calls: 7_140, errors: 2, p50Ms: 71, p95Ms: 268, p99Ms: 720, maxMs: 1_980 },
  { endpoint: '/api/v1/items', method: 'GET', calls: 24_600, errors: 1, p50Ms: 38, p95Ms: 118, p99Ms: 284, maxMs: 900 },
  { endpoint: '/api/v1/reports/stock-valuation', method: 'GET', calls: 640, errors: 9, p50Ms: 1_840, p95Ms: 6_200, p99Ms: 11_400, maxMs: 18_600 },
  { endpoint: '/api/v1/goods-receipts', method: 'POST', calls: 880, errors: 6, p50Ms: 240, p95Ms: 780, p99Ms: 1_640, maxMs: 3_800 },
  { endpoint: '/api/v1/auth/token', method: 'POST', calls: 4_120, errors: 214, p50Ms: 142, p95Ms: 320, p99Ms: 640, maxMs: 1_100 },
]

export const healthChecks: HealthCheck[] = [
  { component: 'Primary database', kind: 'DATABASE', status: 'HEALTHY', latencyMs: 4, message: 'Responding normally. 42 of 200 connections in use.', checkedAt: t(0.05) },
  { component: 'Redis cache', kind: 'CACHE', status: 'HEALTHY', latencyMs: 1, message: '96.4% hit rate over the last hour.', checkedAt: t(0.05) },
  { component: 'Message queue', kind: 'QUEUE', status: 'DEGRADED', latencyMs: 340, message: '1,840 messages queued against a normal depth of under 200. The WhatsApp consumer is behind.', checkedAt: t(0.05) },
  { component: 'Document storage', kind: 'STORAGE', status: 'HEALTHY', latencyMs: 28, message: '68% of allocated capacity used.', checkedAt: t(0.05) },
  { component: 'Tally connector', kind: 'INTEGRATION', status: 'DOWN', latencyMs: 30_000, message: 'Socket timeout on every attempt for the last 84 hours. Ledger postings are queued, not lost.', checkedAt: t(0.05) },
  { component: 'WhatsApp Business API', kind: 'INTEGRATION', status: 'HEALTHY', latencyMs: 420, message: 'Delivering normally.', checkedAt: t(0.05) },
  { component: 'Background scheduler', kind: 'SCHEDULER', status: 'HEALTHY', latencyMs: 12, message: '14 jobs registered, 1 failed in the last 24 hours.', checkedAt: t(0.05) },
  { component: 'Payment gateway', kind: 'INTEGRATION', status: 'HEALTHY', latencyMs: 680, message: 'Responding.', checkedAt: t(0.05) },
]

/* ═══════════════════════ Trend for the monitoring screen ═══════════════════════ */

export const apiTrend = Array.from({ length: 24 }, (_, i) => {
  const hour = 23 - i
  const peak = hour >= 8 && hour <= 18
  return {
    hour: `${String(hour).padStart(2, '0')}:00`,
    calls: peak ? 1_800 + ((hour * 137) % 600) : 240 + ((hour * 53) % 180),
    errors: peak ? 4 + (hour % 7) : hour % 3,
    p95Ms: peak ? 380 + ((hour * 29) % 220) : 120 + ((hour * 11) % 60),
  }
}).reverse()
