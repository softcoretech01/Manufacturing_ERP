/**
 * Finance seed data.
 *
 * The journals are generated from the documents rather than written alongside
 * them. That is deliberate: a hand-written seed where the ledger and the
 * subledger are typed separately will disagree the moment either changes, and
 * the one property this module cannot afford to lose is that receivables in
 * the ledger equal receivables in the customer ledger.
 *
 * Opening position is a single OPENING journal rather than per-account opening
 * balances, so there is exactly one mechanism and the trial balance balances by
 * construction.
 */

import { daysAgo, daysAhead } from './data'
import { money, splitGst } from '@/lib/finFlow'
import { CLOSE_CHECKLIST } from '@/lib/finFlow'
import type {
  Account,
  AccountType,
  ActualCostRecord,
  BankAccountRec,
  BankStatementLine,
  BudgetLine,
  CostCentre,
  FiscalPeriod,
  FixedAsset,
  Journal,
  JournalLine,
  PartyDocument,
  PartyPayment,
  ProfitCentre,
  StandardCostCard,
  TaxRate,
  TdsSection,
} from '@/types/finance'

const d = (n: number) => daysAgo(n).slice(0, 10)
const ahead = (n: number) => daysAhead(n).slice(0, 10)
const periodOf = (date: string) => date.slice(0, 7)

/** Our own state. Anything else is inter-state and attracts IGST. */
export const HOME_STATE = '33' // Tamil Nadu

/* ═══════════════════════════ Chart of accounts ═══════════════════════════ */

let accSeq = 0
const acc = (
  code: string,
  name: string,
  accountType: AccountType,
  category: string,
  o: Partial<Account> = {},
): Account => ({
  uid: `fac-${String(++accSeq).padStart(3, '0')}`,
  code,
  name,
  accountType,
  category,
  parentCode: null,
  isGroup: false,
  isControl: false,
  controlOf: null,
  requiresCostCentre: false,
  openingBalance: 0,
  currency: 'INR',
  isActive: true,
  remarks: '',
  version: 1,
  ...o,
})

export const accounts: Account[] = [
  /* ── Assets ─────────────────────────────────────────────────────── */
  acc('1000', 'Assets', 'ASSET', 'Assets', { isGroup: true }),
  acc('1100', 'Cash in hand', 'ASSET', 'Cash & Bank', { parentCode: '1000' }),
  acc('1110', 'HDFC Bank — Current 0012', 'ASSET', 'Cash & Bank', { parentCode: '1000' }),
  acc('1120', 'ICICI Bank — Cash credit 4471', 'ASSET', 'Cash & Bank', { parentCode: '1000' }),
  acc('1200', 'Trade receivables', 'ASSET', 'Receivables', { parentCode: '1000', isControl: true, controlOf: 'CUSTOMER' }),
  acc('1210', 'Advances to suppliers', 'ASSET', 'Advances', { parentCode: '1000' }),
  acc('1300', 'Raw material inventory', 'ASSET', 'Inventory', { parentCode: '1000' }),
  acc('1310', 'Work in progress', 'ASSET', 'Inventory', { parentCode: '1000' }),
  acc('1320', 'Finished goods inventory', 'ASSET', 'Inventory', { parentCode: '1000' }),
  acc('1330', 'Packing material inventory', 'ASSET', 'Inventory', { parentCode: '1000' }),
  acc('1400', 'GST input credit — CGST', 'ASSET', 'Tax Credits', { parentCode: '1000' }),
  acc('1410', 'GST input credit — SGST', 'ASSET', 'Tax Credits', { parentCode: '1000' }),
  acc('1420', 'GST input credit — IGST', 'ASSET', 'Tax Credits', { parentCode: '1000' }),
  acc('1500', 'Plant & machinery', 'ASSET', 'Fixed Assets', { parentCode: '1000' }),
  acc('1510', 'Factory building', 'ASSET', 'Fixed Assets', { parentCode: '1000' }),
  acc('1520', 'Tools & dies', 'ASSET', 'Fixed Assets', { parentCode: '1000' }),
  acc('1530', 'Office equipment', 'ASSET', 'Fixed Assets', { parentCode: '1000' }),
  acc('1590', 'Accumulated depreciation', 'ASSET', 'Fixed Assets', { parentCode: '1000', remarks: 'Contra asset — carries a credit balance.' }),
  acc('1600', 'Security deposits', 'ASSET', 'Deposits', { parentCode: '1000' }),

  /* ── Liabilities ────────────────────────────────────────────────── */
  acc('2000', 'Liabilities', 'LIABILITY', 'Liabilities', { isGroup: true }),
  acc('2100', 'Trade payables', 'LIABILITY', 'Payables', { parentCode: '2000', isControl: true, controlOf: 'SUPPLIER' }),
  acc('2110', 'Customer advances', 'LIABILITY', 'Payables', { parentCode: '2000' }),
  acc('2200', 'GST output tax — CGST', 'LIABILITY', 'Statutory Dues', { parentCode: '2000' }),
  acc('2210', 'GST output tax — SGST', 'LIABILITY', 'Statutory Dues', { parentCode: '2000' }),
  acc('2220', 'GST output tax — IGST', 'LIABILITY', 'Statutory Dues', { parentCode: '2000' }),
  acc('2230', 'TDS payable', 'LIABILITY', 'Statutory Dues', { parentCode: '2000' }),
  acc('2240', 'TCS payable', 'LIABILITY', 'Statutory Dues', { parentCode: '2000' }),
  acc('2300', 'Accrued expenses', 'LIABILITY', 'Accruals', { parentCode: '2000' }),
  acc('2310', 'Salaries payable', 'LIABILITY', 'Accruals', { parentCode: '2000' }),
  acc('2400', 'Term loan — HDFC', 'LIABILITY', 'Loans', { parentCode: '2000' }),

  /* ── Equity ─────────────────────────────────────────────────────── */
  acc('3000', 'Equity', 'EQUITY', 'Equity', { isGroup: true }),
  acc('3100', 'Share capital', 'EQUITY', 'Capital', { parentCode: '3000' }),
  acc('3200', 'Reserves & surplus', 'EQUITY', 'Reserves', { parentCode: '3000' }),

  /* ── Income ─────────────────────────────────────────────────────── */
  acc('4000', 'Income', 'INCOME', 'Income', { isGroup: true }),
  acc('4100', 'Domestic sales', 'INCOME', 'Revenue', { parentCode: '4000', requiresCostCentre: false }),
  acc('4110', 'Export sales', 'INCOME', 'Revenue', { parentCode: '4000' }),
  acc('4120', 'OEM sales', 'INCOME', 'Revenue', { parentCode: '4000' }),
  acc('4200', 'Scrap sales', 'INCOME', 'Other Income', { parentCode: '4000' }),
  acc('4300', 'Other income', 'INCOME', 'Other Income', { parentCode: '4000' }),

  /* ── Expenses ───────────────────────────────────────────────────── */
  acc('5000', 'Expenses', 'EXPENSE', 'Expenses', { isGroup: true }),
  acc('5100', 'Raw material consumed', 'EXPENSE', 'Raw Material', { parentCode: '5000', requiresCostCentre: true }),
  acc('5110', 'Packing material consumed', 'EXPENSE', 'Packing', { parentCode: '5000', requiresCostCentre: true }),
  acc('5120', 'Consumables & stores', 'EXPENSE', 'Raw Material', { parentCode: '5000', requiresCostCentre: true }),
  acc('5130', 'Freight inward', 'EXPENSE', 'Freight Inward', { parentCode: '5000' }),
  acc('5200', 'Direct wages', 'EXPENSE', 'Direct Labour', { parentCode: '5000', requiresCostCentre: true }),
  acc('5210', 'Salaries & benefits', 'EXPENSE', 'Employee Cost', { parentCode: '5000', requiresCostCentre: true }),
  acc('5300', 'Power & fuel', 'EXPENSE', 'Manufacturing Overhead', { parentCode: '5000', requiresCostCentre: true }),
  acc('5310', 'Repairs & maintenance', 'EXPENSE', 'Manufacturing Overhead', { parentCode: '5000', requiresCostCentre: true }),
  acc('5320', 'Factory rent', 'EXPENSE', 'Manufacturing Overhead', { parentCode: '5000' }),
  acc('5330', 'Quality & inspection', 'EXPENSE', 'Manufacturing Overhead', { parentCode: '5000', requiresCostCentre: true }),
  acc('5340', 'Scrap & rework cost', 'EXPENSE', 'Manufacturing Overhead', { parentCode: '5000', requiresCostCentre: true }),
  acc('5400', 'Freight outward', 'EXPENSE', 'Selling & Distribution', { parentCode: '5000' }),
  acc('5410', 'Marketing & promotion', 'EXPENSE', 'Selling & Distribution', { parentCode: '5000' }),
  acc('5420', 'Export charges', 'EXPENSE', 'Selling & Distribution', { parentCode: '5000' }),
  acc('5500', 'Administration', 'EXPENSE', 'Administration', { parentCode: '5000' }),
  acc('5510', 'Professional fees', 'EXPENSE', 'Administration', { parentCode: '5000' }),
  acc('5520', 'Insurance', 'EXPENSE', 'Administration', { parentCode: '5000' }),
  acc('5600', 'Depreciation', 'EXPENSE', 'Depreciation', { parentCode: '5000' }),
  acc('5700', 'Interest & bank charges', 'EXPENSE', 'Finance Cost', { parentCode: '5000' }),
]

/* ═══════════════════════════ Cost & profit centres ═══════════════════════════ */

let ccSeq = 0
const cc = (code: string, name: string, centreType: CostCentre['centreType'], workCentreCode: string | null, manager: string): CostCentre => ({
  uid: `fcc-${String(++ccSeq).padStart(2, '0')}`, code, name, centreType, plant: 'Chennai — Unit 1', manager, workCentreCode, isActive: true, version: 1,
})

export const costCentres: CostCentre[] = [
  cc('CC-CUT', 'Coil cutting', 'PRODUCTION', 'WC-01', 'S. Balaji'),
  cc('CC-DRAW', 'Deep drawing', 'PRODUCTION', 'WC-02', 'S. Balaji'),
  cc('CC-NECK', 'Neck forming', 'PRODUCTION', 'WC-03', 'S. Balaji'),
  cc('CC-WELD', 'Welding', 'PRODUCTION', 'WC-04', 'S. Balaji'),
  cc('CC-VAC', 'Vacuum chamber', 'PRODUCTION', 'WC-05', 'S. Balaji'),
  cc('CC-TEST', 'Leak testing', 'SERVICE', 'WC-06', 'S. Meena'),
  cc('CC-COAT', 'Powder coating', 'PRODUCTION', 'WC-07', 'S. Balaji'),
  cc('CC-PRINT', 'Printing & marking', 'PRODUCTION', 'WC-08', 'S. Balaji'),
  cc('CC-PACK', 'Packing', 'PRODUCTION', 'WC-09', 'K. Ravi'),
  cc('CC-ASSY', 'Assembly', 'PRODUCTION', 'WC-10', 'S. Balaji'),
  cc('CC-QA', 'Quality assurance', 'SERVICE', null, 'S. Meena'),
  cc('CC-STORE', 'Warehouse & stores', 'SERVICE', null, 'K. Ravi'),
  cc('CC-SALES', 'Sales & marketing', 'SALES', null, 'Priya Menon'),
  cc('CC-ADMIN', 'Administration', 'ADMIN', null, 'K. Raman'),
]

let pcSeq = 0
const pc = (code: string, name: string, channel: ProfitCentre['channel'], manager: string): ProfitCentre => ({
  uid: `fpc-${String(++pcSeq).padStart(2, '0')}`, code, name, channel, manager, isActive: true, version: 1,
})

export const profitCentres: ProfitCentre[] = [
  pc('PC-DOM', 'Domestic sales', 'DOMESTIC', 'Priya Menon'),
  pc('PC-EXP', 'Export sales', 'EXPORT', 'Priya Menon'),
  pc('PC-OEM', 'OEM business', 'OEM', 'Vignesh Kumar'),
  pc('PC-RET', 'Retail', 'RETAIL', 'Vignesh Kumar'),
  pc('PC-ECOM', 'E-commerce', 'ECOMMERCE', 'Vignesh Kumar'),
]

/* ═══════════════════════════ Tax masters ═══════════════════════════ */

export const taxRates: TaxRate[] = [
  { uid: 'tax-01', code: 'GST18-BOTTLE', description: 'Vacuum flasks and vessels', hsn: '96170011', ratePct: 18, cessPct: 0, isActive: true, version: 1 },
  { uid: 'tax-02', code: 'GST18-STEEL', description: 'Stainless steel flat products', hsn: '72193390', ratePct: 18, cessPct: 0, isActive: true, version: 1 },
  { uid: 'tax-03', code: 'GST18-COMP', description: 'Components and parts', hsn: '96170019', ratePct: 18, cessPct: 0, isActive: true, version: 1 },
  { uid: 'tax-04', code: 'GST12-CARTON', description: 'Corrugated cartons', hsn: '48191010', ratePct: 12, cessPct: 0, isActive: true, version: 1 },
  { uid: 'tax-05', code: 'GST18-SERVICE', description: 'Job work and services', hsn: '998873', ratePct: 18, cessPct: 0, isActive: true, version: 1 },
  { uid: 'tax-06', code: 'GST05-FREIGHT', description: 'Goods transport agency', hsn: '996511', ratePct: 5, cessPct: 0, isActive: true, version: 1 },
  { uid: 'tax-07', code: 'GST00-EXPORT', description: 'Export under LUT, zero rated', hsn: '96170011', ratePct: 0, cessPct: 0, isActive: true, version: 1 },
]

export const tdsSections: TdsSection[] = [
  { uid: 'tds-01', section: '194C', description: 'Payment to contractors', ratePct: 2, thresholdAmount: 100_000, isActive: true, version: 1 },
  { uid: 'tds-02', section: '194J', description: 'Professional or technical services', ratePct: 10, thresholdAmount: 30_000, isActive: true, version: 1 },
  { uid: 'tds-03', section: '194Q', description: 'Purchase of goods above 50 lakh', ratePct: 0.1, thresholdAmount: 5_000_000, isActive: true, version: 1 },
  { uid: 'tds-04', section: '194I', description: 'Rent of plant, machinery or building', ratePct: 10, thresholdAmount: 240_000, isActive: true, version: 1 },
  { uid: 'tds-05', section: '194H', description: 'Commission or brokerage', ratePct: 5, thresholdAmount: 15_000, isActive: true, version: 1 },
]

/* ═══════════════════════════ Banking ═══════════════════════════ */

export const bankAccounts: BankAccountRec[] = [
  { uid: 'fba-01', code: 'BANK-HDFC', accountCode: '1110', bankName: 'HDFC Bank', accountNumber: '50200012340012', ifsc: 'HDFC0000123', branch: 'Ambattur, Chennai', accountType: 'CURRENT', limit: 0, openingBalance: 0, isActive: true, version: 1 },
  { uid: 'fba-02', code: 'BANK-ICICI', accountCode: '1120', bankName: 'ICICI Bank', accountNumber: '004705004471', ifsc: 'ICIC0000047', branch: 'Guindy, Chennai', accountType: 'CC', limit: 15_000_000, openingBalance: 0, isActive: true, version: 1 },
  { uid: 'fba-03', code: 'CASH', accountCode: '1100', bankName: 'Cash in hand', accountNumber: '—', ifsc: '—', branch: 'Factory', accountType: 'CURRENT', limit: 0, openingBalance: 0, isActive: true, version: 1 },
]

/* ═══════════════════════════ Documents ═══════════════════════════ */

let docSeq = 0

/** Builds a party document with its tax split derived, never typed. */
const doc = (
  docNo: string,
  docType: PartyDocument['docType'],
  partyType: PartyDocument['partyType'],
  partyCode: string,
  partyName: string,
  stateCode: string,
  taxableValue: number,
  ratePct: number,
  daysBack: number,
  creditDays: number,
  o: Partial<PartyDocument> & { hsn?: string; description?: string } = {},
): PartyDocument => {
  const date = d(daysBack)
  const split = splitGst(taxableValue, ratePct, HOME_STATE, stateCode)
  const tds = o.tdsAmount ?? 0
  const tcs = o.tcsAmount ?? 0
  // Under reverse charge the supplier does not charge the tax — we pay it to
  // the government ourselves — so it is recorded for the return but is not
  // part of what is owed to them.
  const billedTax = o.isReverseCharge ? 0 : split.cgst + split.sgst + split.igst + split.cess
  const raw = taxableValue + billedTax + tcs
  const rounded = Math.round(raw)
  const { hsn, description, ...rest } = o
  return {
    uid: `fdoc-${String(++docSeq).padStart(3, '0')}`,
    docNo,
    docType,
    partyType,
    partyCode,
    partyName,
    partyStateCode: stateCode,
    placeOfSupply: stateCode,
    date,
    dueDate: ahead(creditDays - daysBack),
    currency: 'INR',
    exchangeRate: 1,
    taxableValue: money(taxableValue),
    cgst: split.cgst,
    sgst: split.sgst,
    igst: split.igst,
    cess: split.cess,
    tdsAmount: tds,
    tcsAmount: tcs,
    roundOff: money(rounded - raw),
    grandTotal: money(rounded),
    settledAmount: 0,
    status: 'OPEN',
    sourceDocNo: '',
    journalVoucherNo: null,
    isReverseCharge: false,
    hsnSummary: [{ hsn: hsn ?? '96170011', description: description ?? 'Vacuum flask', taxableValue: money(taxableValue), ratePct }],
    narration: '',
    createdAt: daysAgo(daysBack),
    version: 1,
    ...rest,
  }
}

export const partyDocuments: PartyDocument[] = [
  /* ── Customer invoices ────────────────────────────────────────────── */
  doc('SI/26-27/01882', 'INVOICE', 'CUSTOMER', 'CUS-00001', 'Metro Retail Chain Pvt Ltd', '33', 431_520, 18, 21, 45, { sourceDocNo: 'SO/26-27/00512', narration: '480 units of FG-SS-750-BLK at 899.' }),
  doc('SI/26-27/01901', 'INVOICE', 'CUSTOMER', 'CUS-00004', 'Bharat E-commerce Ventures', '06', 1_078_800, 18, 6, 30, { sourceDocNo: 'SO/26-27/00518', narration: '1,200 units OEM pack. Inter-state — IGST.' }),
  doc('SI/26-27/01914', 'INVOICE', 'CUSTOMER', 'CUS-00211', 'Nordwind Handels GmbH', '99', 5_394_000, 0, 3, 60, { sourceDocNo: 'EXP/26-27/00044', narration: 'Export under LUT, zero rated. 6,000 units.', hsn: '96170011' }),
  doc('SI/26-27/01860', 'INVOICE', 'CUSTOMER', 'CUS-00188', 'Trek Outdoors India', '29', 1_214_100, 18, 52, 30, { sourceDocNo: 'SO/26-27/00498', narration: '900 units of FG-SS-1000-STL. Overdue.' }),
  doc('SI/26-27/01845', 'INVOICE', 'CUSTOMER', 'CUS-00001', 'Metro Retail Chain Pvt Ltd', '33', 269_700, 18, 96, 45, { sourceDocNo: 'SO/26-27/00470', narration: '300 units. Long overdue — on the collection list.' }),
  doc('SI/26-27/01925', 'INVOICE', 'CUSTOMER', 'CUS-00004', 'Bharat E-commerce Ventures', '06', 359_600, 18, 1, 30, { sourceDocNo: 'CS/26-27/00121', narration: '400 units call-off.' }),
  doc('CN/26-27/00042', 'CREDIT_NOTE', 'CUSTOMER', 'CUS-00001', 'Metro Retail Chain Pvt Ltd', '33', 30_566, 18, 5, 45, { sourceDocNo: 'CMP/26-27/0031', narration: '34 dented units credited against complaint CMP/26-27/0031.' }),

  /* ── Supplier invoices ────────────────────────────────────────────── */
  doc('PI/26-27/00784', 'INVOICE', 'SUPPLIER', 'SUP-00001', 'Jindal Stainless Limited', '06', 2_929_400, 18, 18, 30, { sourceDocNo: 'GRN/P1/2627/00317', narration: '12,000 kg SS 304 coil. Inter-state — IGST credit.', hsn: '72193390', description: 'SS 304 coil' }),
  doc('PI/26-27/00791', 'INVOICE', 'SUPPLIER', 'SUP-00005', 'Perfect Polymers Private Limited', '33', 1_176_000, 18, 12, 45, { sourceDocNo: 'GRN/P1/2627/00325', narration: '30,000 screw caps.', hsn: '96170019', description: 'Screw cap assembly' }),
  doc('PI/26-27/00798', 'INVOICE', 'SUPPLIER', 'SUP-00004', 'Sri Venkateswara Packaging Industries', '33', 284_000, 12, 8, 30, { sourceDocNo: 'GRN/P1/2627/00328', narration: 'Cartons and gift boxes.', hsn: '48191010', description: 'Corrugated carton' }),
  doc('PI/26-27/00802', 'INVOICE', 'SUPPLIER', 'SUP-00003', 'Coatmaster Powder Coatings LLP', '33', 187_200, 18, 4, 30, { sourceDocNo: 'GRN/P1/2627/00331', narration: '600 kg powder coating.', hsn: '32089029', description: 'Powder coating' }),
  doc('PI/26-27/00760', 'INVOICE', 'SUPPLIER', 'SUP-00002', 'Chennai Steel Traders', '33', 692_000, 18, 40, 30, { sourceDocNo: 'GRN/P1/2627/00302', narration: 'SS 304 coil. Overdue.', hsn: '72193390', description: 'SS 304 coil' }),
  doc('PI/26-27/00806', 'INVOICE', 'SUPPLIER', 'SUP-00114', 'Sundaram Transport Services', '33', 148_000, 5, 6, 15, {
    isReverseCharge: true,
    sourceDocNo: 'FRT/26-27/00219',
    narration: 'Goods transport agency — tax payable under reverse charge.',
    hsn: '996511',
    description: 'Road freight',
  }),
  doc('PI/26-27/00810', 'INVOICE', 'SUPPLIER', 'SUP-00118', 'Ramanujam & Associates', '33', 240_000, 18, 9, 30, {
    tdsAmount: 24_000,
    narration: 'Statutory audit fees. TDS deducted under 194J at 10%.',
    hsn: '998873',
    description: 'Professional services',
  }),
  doc('DN/26-27/00018', 'DEBIT_NOTE', 'SUPPLIER', 'SUP-00002', 'Chennai Steel Traders', '33', 84_000, 18, 9, 30, {
    sourceDocNo: 'NCR/26-27/0021',
    narration: 'Debit note for the rejected under-thickness coil and inbound freight.',
    hsn: '72193390',
    description: 'SS 304 coil — rejected',
  }),
]

/* ═══════════════════════════ Receipts & payments ═══════════════════════════ */

let paySeq = 0
const pay = (
  docNo: string,
  direction: PartyPayment['direction'],
  partyCode: string,
  partyName: string,
  daysBack: number,
  mode: PartyPayment['mode'],
  bankAccountCode: string,
  allocations: { docNo: string; allocated: number }[],
  o: Partial<PartyPayment> = {},
): PartyPayment => {
  const allocated = money(allocations.reduce((s, a) => s + a.allocated, 0))
  const tds = o.tdsDeducted ?? 0
  return {
    uid: `fpay-${String(++paySeq).padStart(2, '0')}`,
    docNo,
    direction,
    partyType: direction === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER',
    partyCode,
    partyName,
    date: d(daysBack),
    mode,
    instrumentNo: mode === 'CHEQUE' ? `00${400 + paySeq}` : `UTR${900000 + paySeq * 137}`,
    instrumentDate: d(daysBack),
    bankAccountCode,
    amount: money(allocated - tds),
    allocatedAmount: allocated,
    allocations: allocations.map((a, i) => {
      const target = partyDocuments.find((x) => x.docNo === a.docNo)
      return {
        uid: `alloc-${paySeq}-${i}`,
        docNo: a.docNo,
        docDate: target?.date ?? d(daysBack),
        outstandingBefore: target?.grandTotal ?? a.allocated,
        allocated: money(a.allocated),
      }
    }),
    tdsDeducted: tds,
    status: 'POSTED',
    journalVoucherNo: null,
    narration: '',
    createdAt: daysAgo(daysBack),
    version: 1,
    ...o,
  }
}

export const partyPayments: PartyPayment[] = [
  pay('RCT/26-27/00551', 'RECEIPT', 'CUS-00001', 'Metro Retail Chain Pvt Ltd', 8, 'NEFT', 'BANK-HDFC', [{ docNo: 'SI/26-27/01882', allocated: 300_000 }], { narration: 'Part payment against SI/26-27/01882.' }),
  pay('RCT/26-27/00556', 'RECEIPT', 'CUS-00188', 'Trek Outdoors India', 4, 'RTGS', 'BANK-HDFC', [{ docNo: 'SI/26-27/01860', allocated: 700_000 }], { narration: 'Part settlement of the overdue balance.' }),
  pay('RCT/26-27/00560', 'RECEIPT', 'CUS-00004', 'Bharat E-commerce Ventures', 2, 'NEFT', 'BANK-HDFC', [{ docNo: 'SI/26-27/01901', allocated: 1_272_984 }], { narration: 'Full settlement of SI/26-27/01901.' }),
  pay('PMT/26-27/00412', 'PAYMENT', 'SUP-00001', 'Jindal Stainless Limited', 5, 'RTGS', 'BANK-HDFC', [{ docNo: 'PI/26-27/00784', allocated: 2_000_000 }], { narration: 'Part payment on account.' }),
  pay('PMT/26-27/00418', 'PAYMENT', 'SUP-00004', 'Sri Venkateswara Packaging Industries', 3, 'NEFT', 'BANK-HDFC', [{ docNo: 'PI/26-27/00798', allocated: 318_080 }], { narration: 'Full settlement.' }),
  pay('PMT/26-27/00421', 'PAYMENT', 'SUP-00118', 'Ramanujam & Associates', 2, 'NEFT', 'BANK-HDFC', [{ docNo: 'PI/26-27/00810', allocated: 283_200 }], {
    tdsDeducted: 24_000,
    narration: 'Audit fees net of TDS under 194J.',
  }),
]

/* ═══════════════════════════ Journal generation ═══════════════════════════ */

let vSeq = 0
const nextVoucher = (prefix: string) => `${prefix}/26-27/${String(++vSeq).padStart(5, '0')}`

let jlSeq = 0
const jl = (accountCode: string, debit: number, credit: number, o: Partial<JournalLine> = {}): JournalLine => {
  const account = accounts.find((a) => a.code === accountCode)
  return {
    uid: `fjl-${++jlSeq}`,
    accountCode,
    accountName: account?.name ?? accountCode,
    debit: money(debit),
    credit: money(credit),
    costCentre: '',
    profitCentre: '',
    partyType: null,
    partyCode: '',
    narration: '',
    ...o,
  }
}

const journal = (
  voucherType: Journal['voucherType'],
  date: string,
  narration: string,
  lines: JournalLine[],
  o: Partial<Journal> = {},
): Journal => ({
  uid: `fj-${String(vSeq + 1).padStart(3, '0')}`,
  voucherNo: nextVoucher(voucherType === 'SALES' ? 'SV' : voucherType === 'PURCHASE' ? 'PV' : voucherType === 'RECEIPT' ? 'RV' : voucherType === 'PAYMENT' ? 'BP' : 'JV'),
  voucherType,
  date,
  period: periodOf(date),
  narration,
  currency: 'INR',
  exchangeRate: 1,
  lines,
  status: 'POSTED',
  sourceType: '',
  sourceDocNo: '',
  isAuto: true,
  reversalOf: null,
  reversedBy: null,
  createdBy: 'K. Raman',
  createdAt: daysAgo(0),
  approvedBy: 'K. Raman',
  postedAt: daysAgo(0),
  version: 1,
  ...o,
})

const generated: Journal[] = []

/* ── Opening position. One journal, balanced. ─────────────────────── */
const OPENING_DATE = d(120)
generated.push(
  journal('OPENING', OPENING_DATE, 'Opening balances brought forward', [
    jl('1100', 240_000, 0, { narration: 'Cash in hand' }),
    jl('1110', 8_400_000, 0, { narration: 'HDFC current account' }),
    jl('1120', 2_100_000, 0, { narration: 'ICICI cash credit' }),
    jl('1300', 24_180_000, 0, { narration: 'Raw material' }),
    jl('1310', 8_940_000, 0, { narration: 'Work in progress' }),
    jl('1320', 41_620_000, 0, { narration: 'Finished goods' }),
    jl('1330', 3_210_000, 0, { narration: 'Packing material' }),
    jl('1500', 62_400_000, 0, { narration: 'Plant & machinery at cost' }),
    jl('1510', 48_000_000, 0, { narration: 'Factory building at cost' }),
    jl('1520', 9_800_000, 0, { narration: 'Tools & dies at cost' }),
    jl('1530', 3_600_000, 0, { narration: 'Office equipment at cost' }),
    jl('1600', 1_850_000, 0, { narration: 'Security deposits' }),
    jl('1590', 0, 31_640_000, { narration: 'Accumulated depreciation' }),
    jl('2400', 0, 42_000_000, { narration: 'Term loan' }),
    jl('3100', 0, 60_000_000, { narration: 'Share capital' }),
    jl('3200', 0, 80_700_000, { narration: 'Reserves & surplus' }),
  ], { voucherNo: 'OB/26-27/00001', narration: 'Opening balances brought forward as at ' + OPENING_DATE, isAuto: false, createdBy: 'K. Raman' }),
)

/* ── One journal per party document. ──────────────────────────────── */
const REVENUE_ACCOUNT: Record<string, string> = {
  'CUS-00001': '4100', 'CUS-00004': '4120', 'CUS-00211': '4110', 'CUS-00188': '4100',
}
const PROFIT_CENTRE: Record<string, string> = {
  'CUS-00001': 'PC-RET', 'CUS-00004': 'PC-ECOM', 'CUS-00211': 'PC-EXP', 'CUS-00188': 'PC-DOM',
}
const PURCHASE_ACCOUNT: Record<string, string> = {
  'SUP-00001': '1300', 'SUP-00002': '1300', 'SUP-00003': '1300', 'SUP-00004': '1330',
  'SUP-00005': '1300', 'SUP-00114': '5130', 'SUP-00118': '5510',
}

for (const doc0 of partyDocuments) {
  const lines: JournalLine[] = []
  const isSale = doc0.partyType === 'CUSTOMER'
  const isCredit = doc0.docType === 'CREDIT_NOTE'
  const isDebitNote = doc0.docType === 'DEBIT_NOTE'

  if (isSale) {
    const revenue = REVENUE_ACCOUNT[doc0.partyCode] ?? '4100'
    const pcCode = PROFIT_CENTRE[doc0.partyCode] ?? 'PC-DOM'
    if (isCredit) {
      // A credit note reverses the sale: revenue down, receivable down.
      lines.push(jl(revenue, doc0.taxableValue, 0, { profitCentre: pcCode, narration: 'Sales return' }))
      if (doc0.cgst) lines.push(jl('2200', doc0.cgst, 0))
      if (doc0.sgst) lines.push(jl('2210', doc0.sgst, 0))
      if (doc0.igst) lines.push(jl('2220', doc0.igst, 0))
      // Credit note: the raw value is on the debit side, so a positive
      // round-off needs another debit, not a credit.
      if (doc0.roundOff) lines.push(doc0.roundOff > 0 ? jl('5500', doc0.roundOff, 0, { narration: 'Round off' }) : jl('4300', 0, -doc0.roundOff, { narration: 'Round off' }))
      lines.push(jl('1200', 0, doc0.grandTotal, { partyType: 'CUSTOMER', partyCode: doc0.partyCode, narration: doc0.partyName }))
    } else {
      lines.push(jl('1200', doc0.grandTotal, 0, { partyType: 'CUSTOMER', partyCode: doc0.partyCode, narration: doc0.partyName }))
      lines.push(jl(revenue, 0, doc0.taxableValue, { profitCentre: pcCode }))
      if (doc0.cgst) lines.push(jl('2200', 0, doc0.cgst))
      if (doc0.sgst) lines.push(jl('2210', 0, doc0.sgst))
      if (doc0.igst) lines.push(jl('2220', 0, doc0.igst))
      if (doc0.tcsAmount) lines.push(jl('2240', 0, doc0.tcsAmount))
      if (doc0.roundOff) lines.push(doc0.roundOff > 0 ? jl('4300', 0, doc0.roundOff, { narration: 'Round off' }) : jl('5500', -doc0.roundOff, 0, { narration: 'Round off' }))
    }
  } else {
    const expense = PURCHASE_ACCOUNT[doc0.partyCode] ?? '5500'
    const needsCc = accounts.find((a) => a.code === expense)?.requiresCostCentre
    const ccCode = needsCc ? 'CC-STORE' : ''
    if (isDebitNote) {
      // A debit note on a supplier reduces both the payable and the purchase.
      lines.push(jl('2100', doc0.grandTotal, 0, { partyType: 'SUPPLIER', partyCode: doc0.partyCode, narration: doc0.partyName }))
      lines.push(jl(expense, 0, doc0.taxableValue, { costCentre: ccCode }))
      if (doc0.cgst) lines.push(jl('1400', 0, doc0.cgst))
      if (doc0.sgst) lines.push(jl('1410', 0, doc0.sgst))
      if (doc0.igst) lines.push(jl('1420', 0, doc0.igst))
      // Debit note: the rounded figure is the debit, so a positive round-off
      // needs another credit.
      if (doc0.roundOff) lines.push(doc0.roundOff > 0 ? jl('4300', 0, doc0.roundOff, { narration: 'Round off' }) : jl('5500', -doc0.roundOff, 0, { narration: 'Round off' }))
    } else {
      lines.push(jl(expense, doc0.taxableValue, 0, { costCentre: ccCode }))
      if (doc0.isReverseCharge) {
        // Reverse charge: tax is our liability and our credit at the same time.
        if (doc0.cgst) { lines.push(jl('1400', doc0.cgst, 0)); lines.push(jl('2200', 0, doc0.cgst)) }
        if (doc0.sgst) { lines.push(jl('1410', doc0.sgst, 0)); lines.push(jl('2210', 0, doc0.sgst)) }
        if (doc0.igst) { lines.push(jl('1420', doc0.igst, 0)); lines.push(jl('2220', 0, doc0.igst)) }
      } else {
        if (doc0.cgst) lines.push(jl('1400', doc0.cgst, 0))
        if (doc0.sgst) lines.push(jl('1410', doc0.sgst, 0))
        if (doc0.igst) lines.push(jl('1420', doc0.igst, 0))
      }
      if (doc0.roundOff) lines.push(doc0.roundOff > 0 ? jl('5500', doc0.roundOff, 0, { narration: 'Round off' }) : jl('4300', 0, -doc0.roundOff, { narration: 'Round off' }))
      lines.push(jl('2100', 0, doc0.grandTotal, { partyType: 'SUPPLIER', partyCode: doc0.partyCode, narration: doc0.partyName }))
      void 0
    }
  }

  const v = journal(
    isSale ? (isCredit ? 'CREDIT_NOTE' : 'SALES') : isDebitNote ? 'DEBIT_NOTE' : 'PURCHASE',
    doc0.date,
    `${doc0.docNo} — ${doc0.partyName}`,
    lines,
    { sourceType: doc0.docType, sourceDocNo: doc0.docNo, createdAt: doc0.createdAt, postedAt: doc0.createdAt },
  )
  doc0.journalVoucherNo = v.voucherNo
  generated.push(v)
}

/* ── One journal per receipt or payment, and settle the documents. ── */
const BANK_ACCOUNT: Record<string, string> = { 'BANK-HDFC': '1110', 'BANK-ICICI': '1120', CASH: '1100' }

for (const p of partyPayments) {
  const bank = BANK_ACCOUNT[p.bankAccountCode] ?? '1110'
  const lines: JournalLine[] = []

  if (p.direction === 'RECEIPT') {
    lines.push(jl(bank, p.amount, 0, { narration: `${p.mode} ${p.instrumentNo}` }))
    lines.push(jl('1200', 0, p.allocatedAmount, { partyType: 'CUSTOMER', partyCode: p.partyCode, narration: p.partyName }))
    if (p.tdsDeducted) lines.push(jl('2230', p.tdsDeducted, 0, { narration: 'TDS deducted by the customer' }))
  } else {
    lines.push(jl('2100', p.allocatedAmount, 0, { partyType: 'SUPPLIER', partyCode: p.partyCode, narration: p.partyName }))
    lines.push(jl(bank, 0, p.amount, { narration: `${p.mode} ${p.instrumentNo}` }))
    if (p.tdsDeducted) lines.push(jl('2230', 0, p.tdsDeducted, { narration: 'TDS withheld under 194J' }))
  }

  const v = journal(p.direction === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT', p.date, `${p.docNo} — ${p.partyName}`, lines, {
    sourceType: p.direction,
    sourceDocNo: p.docNo,
    createdAt: p.createdAt,
    postedAt: p.createdAt,
  })
  p.journalVoucherNo = v.voucherNo
  generated.push(v)

  // Settle what the payment was applied to, so the subledger agrees.
  for (const a of p.allocations) {
    const target = partyDocuments.find((x) => x.docNo === a.docNo)
    if (!target) continue
    target.settledAmount = money(target.settledAmount + a.allocated)
    target.status = target.settledAmount >= target.grandTotal - 0.005 ? 'PAID' : 'PART_PAID'
  }
}

/* ── Operational journals: production, expenses, depreciation. ────── */
generated.push(
  journal('PRODUCTION', d(9), 'PRD/26-27/0126 — material issued to work in progress', [
    jl('1310', 1_236_000, 0, { costCentre: 'CC-DRAW', narration: 'Material to WIP' }),
    jl('1300', 0, 1_236_000, { narration: 'Raw material consumed' }),
  ], { sourceType: 'PRODUCTION_ORDER', sourceDocNo: 'PRD/26-27/0126' }),

  journal('PRODUCTION', d(9), 'PRD/26-27/0126 — conversion cost absorbed', [
    jl('1310', 386_400, 0, { costCentre: 'CC-ASSY', narration: 'Conversion absorbed into WIP' }),
    jl('5200', 0, 148_000, { costCentre: 'CC-ASSY', narration: 'Direct wages' }),
    jl('5300', 0, 164_400, { costCentre: 'CC-COAT', narration: 'Power & fuel' }),
    jl('5310', 0, 74_000, { costCentre: 'CC-DRAW', narration: 'Repairs & maintenance' }),
  ], { sourceType: 'PRODUCTION_ORDER', sourceDocNo: 'PRD/26-27/0126' }),

  journal('PRODUCTION', d(9), 'PRD/26-27/0126 — 2,982 units received into finished goods', [
    jl('1320', 1_596_120, 0, { narration: 'Finished goods at standard' }),
    jl('1310', 0, 1_596_120, { narration: 'WIP relieved' }),
  ], { sourceType: 'PRODUCTION_ORDER', sourceDocNo: 'PRD/26-27/0126' }),

  journal('JOURNAL', d(9), 'PRD/26-27/0126 — scrap and rework charged to the period', [
    jl('5340', 26_280, 0, { costCentre: 'CC-QA', narration: '18 units scrapped at standard' }),
    jl('1310', 0, 26_280, { narration: 'WIP relieved of scrap' }),
  ], { sourceType: 'PRODUCTION_ORDER', sourceDocNo: 'PRD/26-27/0126', isAuto: false }),

  journal('JOURNAL', d(15), 'Salaries and wages for the month', [
    jl('5200', 1_480_000, 0, { costCentre: 'CC-ASSY', narration: 'Direct wages — shop floor' }),
    jl('5210', 2_360_000, 0, { costCentre: 'CC-ADMIN', narration: 'Salaries & benefits' }),
    jl('2310', 0, 3_840_000, { narration: 'Salaries payable' }),
  ], { isAuto: false, createdBy: 'K. Raman' }),

  journal('JOURNAL', d(14), 'Power, fuel and maintenance for the month', [
    jl('5300', 964_000, 0, { costCentre: 'CC-COAT', narration: 'TANGEDCO electricity' }),
    jl('5310', 318_000, 0, { costCentre: 'CC-DRAW', narration: 'Machine maintenance' }),
    jl('5330', 142_000, 0, { costCentre: 'CC-QA', narration: 'Quality and inspection' }),
    jl('2300', 0, 1_424_000, { narration: 'Accrued utilities and maintenance' }),
  ], { isAuto: false }),

  journal('PAYMENT', d(12), 'Salaries paid for the month', [
    jl('2310', 3_840_000, 0, { narration: 'Salaries payable cleared' }),
    jl('1110', 0, 3_840_000, { narration: 'HDFC NEFT batch' }),
  ]),

  journal('JOURNAL', d(7), 'Factory rent and insurance accrued', [
    jl('5320', 850_000, 0, { narration: 'Factory rent' }),
    jl('5520', 122_000, 0, { narration: 'Insurance' }),
    jl('2300', 0, 972_000, { narration: 'Accrued expenses' }),
  ], { isAuto: false }),

  journal('PAYMENT', d(6), 'Outward freight and export charges', [
    jl('5400', 268_000, 0, { narration: 'Freight outward' }),
    jl('5420', 412_000, 0, { narration: 'Export charges — Nordwind shipment' }),
    jl('1110', 0, 680_000, { narration: 'HDFC NEFT' }),
  ]),

  journal('JOURNAL', d(3), 'Scrap sale to Chennai Metal Recyclers', [
    jl('1100', 96_760, 0, { narration: 'Cash received' }),
    jl('4200', 0, 82_000, { narration: 'Scrap sales' }),
    jl('2200', 0, 7_380, { narration: 'CGST on scrap' }),
    jl('2210', 0, 7_380, { narration: 'SGST on scrap' }),
  ], { isAuto: false }),

  journal('PAYMENT', d(4), 'Interest on term loan and bank charges', [
    jl('5700', 348_000, 0, { narration: 'Interest on term loan' }),
    jl('1110', 0, 348_000, { narration: 'HDFC debit' }),
  ]),

  journal('CONTRA', d(10), 'Cash drawn from HDFC for petty expenses', [
    jl('1100', 150_000, 0, { narration: 'Cash in hand' }),
    jl('1110', 0, 150_000, { narration: 'HDFC withdrawal' }),
  ]),

  journal('DEPRECIATION', d(1), 'Depreciation for the period', [
    jl('5600', 1_284_167, 0, { narration: 'Depreciation charge' }),
    jl('1590', 0, 1_284_167, { narration: 'Accumulated depreciation' }),
  ], { sourceType: 'DEPRECIATION_RUN', sourceDocNo: `DEP/${periodOf(d(1))}` }),
)

/* ── One unposted journal, so the period close has something to catch. ── */
generated.push(
  journal('JOURNAL', d(2), 'Provision for warranty claims — awaiting approval', [
    jl('5340', 240_000, 0, { costCentre: 'CC-QA', narration: 'Warranty provision' }),
    jl('2300', 0, 240_000, { narration: 'Provision' }),
  ], { status: 'PENDING_APPROVAL', isAuto: false, approvedBy: null, postedAt: null, createdBy: 'S. Meena' }),
)

export const journals: Journal[] = generated

/* ═══════════════════════════ Bank statement ═══════════════════════════ */

/**
 * A statement with two deliberate timing differences: one cheque issued but not
 * presented, and one bank charge the books have not picked up. That is what a
 * reconciliation exists to explain.
 */
const hdfcJournals = journals.filter((j) => j.status === 'POSTED' && j.lines.some((l) => l.accountCode === '1110'))
let stmtSeq = 0
let runningBalance = 0

const statementFromJournals: BankStatementLine[] = hdfcJournals
  .slice()
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((j) => {
    const line = j.lines.find((l) => l.accountCode === '1110')!
    const deposit = line.debit || 0
    const withdrawal = line.credit || 0
    runningBalance = money(runningBalance + deposit - withdrawal)
    return {
      uid: `bsl-${String(++stmtSeq).padStart(3, '0')}`,
      bankAccountCode: 'BANK-HDFC',
      date: j.date,
      description: j.narration.slice(0, 70),
      reference: j.voucherNo,
      deposit: money(deposit),
      withdrawal: money(withdrawal),
      balance: runningBalance,
      matchedVoucherNo: j.voucherNo,
      matchedAt: daysAgo(1),
      version: 1,
    }
  })

// A bank charge the books have not recorded yet.
runningBalance = money(runningBalance - 4_720)
statementFromJournals.push({
  uid: `bsl-${String(++stmtSeq).padStart(3, '0')}`,
  bankAccountCode: 'BANK-HDFC',
  date: d(1),
  description: 'Quarterly account maintenance and NEFT charges',
  reference: 'CHG/2607/0041',
  deposit: 0,
  withdrawal: 4_720,
  balance: runningBalance,
  matchedVoucherNo: null,
  matchedAt: null,
  version: 1,
})

export const bankStatementLines: BankStatementLine[] = statementFromJournals

/* ═══════════════════════════ Costing ═══════════════════════════ */

export const standardCostCards: StandardCostCard[] = [
  {
    uid: 'scc-01', productCode: 'FG-SS-750-BLK', productName: 'Vacuum Flask 750 ml — Matte Black',
    effectiveFrom: d(60), material: 122.47, labour: 12.43, machine: 21.48, overhead: 24.4, packing: 20.02, total: 200.8,
    stdMaterialQty: 1, stdMaterialRate: 122.47, stdLabourHours: 0.05, stdLabourRate: 248.6, stdMachineHours: 0.04, stdMachineRate: 537,
    version: 1,
  },
  {
    uid: 'scc-02', productCode: 'FG-SS-1000-STL', productName: 'Vacuum Flask 1000 ml — Brushed Steel',
    effectiveFrom: d(60), material: 230.95, labour: 12.57, machine: 23.12, overhead: 24.35, packing: 20.67, total: 311.66,
    stdMaterialQty: 1, stdMaterialRate: 230.95, stdLabourHours: 0.05, stdLabourRate: 251.4, stdMachineHours: 0.04, stdMachineRate: 578,
    version: 1,
  },
  {
    uid: 'scc-03', productCode: 'SF-BODY-750', productName: 'Bottle Body Shell — 750 ml',
    effectiveFrom: d(60), material: 78.15, labour: 4.54, machine: 15.98, overhead: 5.6, packing: 0, total: 104.27,
    stdMaterialQty: 1, stdMaterialRate: 78.15, stdLabourHours: 0.02, stdLabourRate: 227, stdMachineHours: 0.02, stdMachineRate: 799,
    version: 1,
  },
]

export const actualCosts: ActualCostRecord[] = [
  {
    uid: 'acr-01', productionOrderNo: 'PRD/26-27/0126', productCode: 'FG-SS-750-BLK', productName: 'Vacuum Flask 750 ml — Matte Black',
    batchNo: 'FG-2606-D21', period: periodOf(d(9)), outputQty: 2_982, scrapQty: 18, reworkQty: 0,
    actualMaterialQty: 3_012, actualMaterialRate: 124.8,
    actualLabourHours: 128, actualLabourRate: 296,
    actualMachineHours: 121, actualMachineRate: 534,
    actualOverhead: 76_400, actualPacking: 59_680, qualityCost: 18_400, freightInward: 12_200,
    status: 'SETTLED', createdAt: daysAgo(9), version: 1,
  },
  {
    uid: 'acr-02', productionOrderNo: 'PRD/26-27/0128', productCode: 'FG-SS-750-BLK', productName: 'Vacuum Flask 750 ml — Matte Black',
    batchNo: 'FG-2607-A08', period: periodOf(d(2)), outputQty: 1_138, scrapQty: 62, reworkQty: 1_138,
    actualMaterialQty: 1_240, actualMaterialRate: 126.4,
    actualLabourHours: 62, actualLabourRate: 308,
    actualMachineHours: 58, actualMachineRate: 545,
    actualOverhead: 34_800, actualPacking: 22_900, qualityCost: 96_512, freightInward: 4_800,
    status: 'OPEN', createdAt: daysAgo(2), version: 1,
  },
  {
    uid: 'acr-03', productionOrderNo: 'PRD/26-27/0129', productCode: 'SF-BODY-750', productName: 'Bottle Body Shell — 750 ml',
    batchNo: 'WIP-2607-B12', period: periodOf(d(1)), outputQty: 5_976, scrapQty: 24, reworkQty: 5_976,
    actualMaterialQty: 6_040, actualMaterialRate: 77.4,
    actualLabourHours: 112, actualLabourRate: 248,
    actualMachineHours: 109, actualMachineRate: 902,
    actualOverhead: 34_600, actualPacking: 0, qualityCost: 2_496, freightInward: 0,
    status: 'OPEN', createdAt: daysAgo(1), version: 1,
  },
]

/* ═══════════════════════════ Fixed assets ═══════════════════════════ */

let faSeq = 0
const asset = (
  code: string, name: string, category: string, accountCode: string, costCentre: string,
  cost: number, lifeYears: number, method: FixedAsset['method'], wdvRate: number,
  capitalisedDaysAgo: number, accumulated: number, o: Partial<FixedAsset> = {},
): FixedAsset => ({
  uid: `ffa-${String(++faSeq).padStart(2, '0')}`,
  code, name, category, accountCode, costCentre, plant: 'Chennai — Unit 1',
  machineCode: o.machineCode ?? null,
  capitalisedOn: d(capitalisedDaysAgo),
  cost, salvageValue: money(cost * 0.05), usefulLifeYears: lifeYears, method, wdvRatePct: wdvRate,
  accumulatedDepreciation: accumulated, depreciatedUpto: periodOf(d(30)),
  status: 'ACTIVE', disposedOn: null, disposalValue: 0,
  insurancePolicyNo: `POL/2026/${1000 + faSeq}`, warrantyUntil: null, amcVendor: '', remarks: '',
  version: 1,
  ...o,
})

export const fixedAssets: FixedAsset[] = [
  asset('AST/00901', 'Coil Slitting Line', 'Plant & Machinery', '1500', 'CC-CUT', 8_400_000, 15, 'SLM', 0, 1200, 2_128_000, { machineCode: 'MC-0001' }),
  asset('AST/00902', 'Hydraulic Deep Draw Press 400T', 'Plant & Machinery', '1500', 'CC-DRAW', 18_600_000, 15, 'SLM', 0, 1200, 4_712_000, { machineCode: 'MC-0002' }),
  asset('AST/00903', 'Neck Forming & Thread Rolling Machine', 'Plant & Machinery', '1500', 'CC-NECK', 6_200_000, 15, 'SLM', 0, 1200, 1_570_667, { machineCode: 'MC-0003' }),
  asset('AST/00904', 'Bottom Welding Station (TIG)', 'Plant & Machinery', '1500', 'CC-WELD', 4_800_000, 15, 'SLM', 0, 1200, 1_216_000, { machineCode: 'MC-0004' }),
  asset('AST/00905', 'Vacuum Sealing Chamber', 'Plant & Machinery', '1500', 'CC-VAC', 14_200_000, 15, 'SLM', 0, 1000, 2_997_778, { machineCode: 'MC-0005' }),
  asset('AST/00907', 'Powder Coating Booth & Cure Oven', 'Plant & Machinery', '1500', 'CC-COAT', 9_600_000, 15, 'SLM', 0, 1200, 2_432_000, { machineCode: 'MC-0007' }),
  asset('AST/00908', 'Fibre Laser Marking Unit', 'Plant & Machinery', '1500', 'CC-PRINT', 3_400_000, 13, 'WDV', 18.1, 900, 1_192_400, { machineCode: 'MC-0008' }),
  asset('AST/01201', 'Deep Draw Die — 750 ml Body', 'Tools & Dies', '1520', 'CC-DRAW', 480_000, 5, 'SLM', 0, 900, 218_880),
  asset('AST/01202', 'Deep Draw Die — 1000 ml Body', 'Tools & Dies', '1520', 'CC-DRAW', 512_000, 5, 'SLM', 0, 400, 103_787),
  asset('AST/00101', 'Factory building — Unit 1', 'Building', '1510', 'CC-ADMIN', 48_000_000, 30, 'SLM', 0, 2400, 9_120_000),
  asset('AST/00501', 'Office IT equipment', 'Office Equipment', '1530', 'CC-ADMIN', 3_600_000, 6, 'WDV', 31.23, 700, 1_684_000),
  asset('AST/00909', 'Automatic Carton Sealer', 'Plant & Machinery', '1500', 'CC-PACK', 1_800_000, 15, 'SLM', 0, 20, 0, {
    machineCode: 'MC-0009',
    remarks: 'Capitalised part way through the period — the first charge is pro-rated.',
  }),
]

/* ═══════════════════════════ Budgets ═══════════════════════════ */

const thisPeriod = periodOf(d(0))
let bSeq = 0
const budget = (
  accountCode: string, ownerCode: string, ownerName: string, budgetType: BudgetLine['budgetType'],
  level: BudgetLine['level'], amount: number, committed = 0,
): BudgetLine => {
  const a = accounts.find((x) => x.code === accountCode)
  return {
    uid: `fbl-${String(++bSeq).padStart(2, '0')}`,
    fiscalYear: '2026-27', period: thisPeriod, budgetType, level, ownerCode, ownerName,
    accountCode, accountName: a?.name ?? accountCode, budgetAmount: amount, committedAmount: committed, version: 1,
  }
}

export const budgetLines: BudgetLine[] = [
  budget('4100', '', 'Company', 'REVENUE', 'COMPANY', 12_000_000),
  budget('4110', '', 'Company', 'REVENUE', 'COMPANY', 6_000_000),
  budget('4120', '', 'Company', 'REVENUE', 'COMPANY', 2_000_000),
  budget('5100', 'CC-STORE', 'Warehouse & stores', 'EXPENSE', 'COST_CENTRE', 5_500_000, 640_000),
  budget('5110', 'CC-PACK', 'Packing', 'EXPENSE', 'COST_CENTRE', 400_000, 48_000),
  budget('5200', 'CC-ASSY', 'Assembly', 'EXPENSE', 'COST_CENTRE', 260_000, 0),
  budget('5210', 'CC-ADMIN', 'Administration', 'EXPENSE', 'COST_CENTRE', 3_600_000, 0),
  budget('5300', 'CC-COAT', 'Powder coating', 'EXPENSE', 'COST_CENTRE', 180_000, 24_000),
  budget('5310', 'CC-DRAW', 'Deep drawing', 'EXPENSE', 'COST_CENTRE', 90_000, 32_000),
  budget('5320', '', 'Company', 'EXPENSE', 'COMPANY', 900_000),
  budget('5400', '', 'Company', 'EXPENSE', 'COMPANY', 320_000, 60_000),
  budget('5420', '', 'Company', 'EXPENSE', 'COMPANY', 300_000),
  budget('5510', '', 'Company', 'EXPENSE', 'COMPANY', 180_000),
  budget('5700', '', 'Company', 'EXPENSE', 'COMPANY', 400_000),
  budget('1500', '', 'Company', 'CAPITAL', 'COMPANY', 4_000_000, 1_800_000),
]

/* ═══════════════════════════ Fiscal periods ═══════════════════════════ */

const periodRow = (offsetMonths: number, status: FiscalPeriod['status']): FiscalPeriod => {
  const base = new Date()
  base.setMonth(base.getMonth() + offsetMonths, 1)
  const period = base.toISOString().slice(0, 7)
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  const allDone = status === 'CLOSED'
  return {
    uid: `ffp-${period}`,
    period,
    fiscalYear: '2026-27',
    startDate: `${period}-01`,
    endDate: end.toISOString().slice(0, 10),
    status,
    checklist: CLOSE_CHECKLIST.map((c) => ({
      key: c.key,
      label: c.label,
      done: allDone,
      doneBy: allDone ? 'K. Raman' : null,
      doneAt: allDone ? d(30) : null,
    })),
    closedBy: allDone ? 'K. Raman' : null,
    closedAt: allDone ? d(28) : null,
    reopenedBy: null,
    reopenReason: '',
    version: 1,
  }
}

export const fiscalPeriods: FiscalPeriod[] = [
  periodRow(-3, 'CLOSED'),
  periodRow(-2, 'CLOSED'),
  periodRow(-1, 'SOFT_CLOSED'),
  periodRow(0, 'OPEN'),
  periodRow(1, 'OPEN'),
]

/* ═══════════════════════════ Dashboard trend ═══════════════════════════ */

export const financeTrend = [
  { month: 'Feb', revenue: 9_820_000, expense: 8_140_000, profit: 1_680_000, cashIn: 9_100_000, cashOut: 8_600_000 },
  { month: 'Mar', revenue: 11_400_000, expense: 9_260_000, profit: 2_140_000, cashIn: 10_800_000, cashOut: 9_400_000 },
  { month: 'Apr', revenue: 10_260_000, expense: 8_980_000, profit: 1_280_000, cashIn: 9_900_000, cashOut: 9_700_000 },
  { month: 'May', revenue: 12_640_000, expense: 10_120_000, profit: 2_520_000, cashIn: 11_600_000, cashOut: 10_100_000 },
  { month: 'Jun', revenue: 13_180_000, expense: 10_640_000, profit: 2_540_000, cashIn: 12_400_000, cashOut: 10_900_000 },
  { month: 'Jul', revenue: 14_020_000, expense: 11_880_000, profit: 2_140_000, cashIn: 12_100_000, cashOut: 11_600_000 },
]
