/**
 * Finance, Cost Accounting & Taxation (Volume 11).
 *
 * Everything posts through one journal. A sales invoice, a supplier payment, a
 * depreciation run and a hand-written adjustment are the same record with a
 * different voucher type and a different source document — which is the only
 * way the trial balance can be relied on, because there is exactly one path
 * into the ledger and it is balanced by construction.
 */

/* ─────────────────────── Chart of accounts ─────────────────────── */

export type AccountType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY'

/** Which side an account naturally sits on. Derived, never stored per account. */
export const NORMAL_BALANCE: Record<AccountType, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  INCOME: 'CREDIT',
  EQUITY: 'CREDIT',
}

export interface Account {
  uid: string
  code: string
  name: string
  accountType: AccountType
  /** Sub-classification used to group the balance sheet and P&L. */
  category: string
  parentCode: string | null
  /** A group holds no postings; it exists to total its children. */
  isGroup: boolean
  /**
   * A control account whose balance must equal the sum of its subledger.
   * Receivables against the customer ledger, payables against the supplier one.
   */
  isControl: boolean
  controlOf: 'CUSTOMER' | 'SUPPLIER' | null
  requiresCostCentre: boolean
  /** Debit-positive. A credit-normal account carries this as a negative. */
  openingBalance: number
  currency: string
  isActive: boolean
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Journals ─────────────────────── */

export type VoucherType =
  | 'JOURNAL'
  | 'SALES'
  | 'PURCHASE'
  | 'RECEIPT'
  | 'PAYMENT'
  | 'CONTRA'
  | 'DEBIT_NOTE'
  | 'CREDIT_NOTE'
  | 'DEPRECIATION'
  | 'PRODUCTION'
  | 'ACCRUAL'
  | 'OPENING'

export type JournalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'POSTED' | 'REVERSED' | 'CANCELLED'

export interface JournalLine {
  uid: string
  accountCode: string
  accountName: string
  /** Both held as positive numbers; a line uses one side or the other. */
  debit: number
  credit: number
  costCentre: string
  profitCentre: string
  /** Subledger key — which customer or supplier this line belongs to. */
  partyType: 'CUSTOMER' | 'SUPPLIER' | null
  partyCode: string
  narration: string
}

export interface Journal {
  uid: string
  voucherNo: string
  voucherType: VoucherType
  date: string
  /** Fiscal period, YYYY-MM. Drives period locking. */
  period: string
  narration: string
  currency: string
  exchangeRate: number
  lines: JournalLine[]
  status: JournalStatus
  /** The operational document that generated this, when it was automatic. */
  sourceType: string
  sourceDocNo: string
  isAuto: boolean
  reversalOf: string | null
  reversedBy: string | null
  createdBy: string
  createdAt: string
  approvedBy: string | null
  postedAt: string | null
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Receivables & payables ─────────────────────── */

export type PartyDocType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'ADVANCE'
export type SettlementStatus = 'OPEN' | 'PART_PAID' | 'PAID' | 'WRITTEN_OFF' | 'CANCELLED'

export interface PartyDocument {
  uid: string
  docNo: string
  docType: PartyDocType
  partyType: 'CUSTOMER' | 'SUPPLIER'
  partyCode: string
  partyName: string
  /** State code decides whether GST splits into CGST+SGST or lands as IGST. */
  partyStateCode: string
  placeOfSupply: string
  date: string
  dueDate: string
  currency: string
  exchangeRate: number
  /** Value before tax. */
  taxableValue: number
  cgst: number
  sgst: number
  igst: number
  cess: number
  /** TDS or TCS withheld on this document. */
  tdsAmount: number
  tcsAmount: number
  roundOff: number
  grandTotal: number
  settledAmount: number
  status: SettlementStatus
  /** Sales order, GRN or dispatch note this came from. */
  sourceDocNo: string
  journalVoucherNo: string | null
  isReverseCharge: boolean
  hsnSummary: { hsn: string; description: string; taxableValue: number; ratePct: number }[]
  narration: string
  createdAt: string
  version: number
  deletedAt?: string | null
}

export type PaymentMode = 'CASH' | 'CHEQUE' | 'NEFT' | 'RTGS' | 'UPI' | 'CARD' | 'ADJUSTMENT'

/** One document a receipt or payment is applied against. */
export interface Allocation {
  uid: string
  docNo: string
  docDate: string
  outstandingBefore: number
  allocated: number
}

export interface PartyPayment {
  uid: string
  docNo: string
  direction: 'RECEIPT' | 'PAYMENT'
  partyType: 'CUSTOMER' | 'SUPPLIER'
  partyCode: string
  partyName: string
  date: string
  mode: PaymentMode
  instrumentNo: string
  instrumentDate: string
  bankAccountCode: string
  amount: number
  /** Amount matched to documents. The rest sits as an on-account advance. */
  allocatedAmount: number
  allocations: Allocation[]
  tdsDeducted: number
  status: 'DRAFT' | 'POSTED' | 'BOUNCED' | 'CANCELLED'
  journalVoucherNo: string | null
  narration: string
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Banking ─────────────────────── */

export interface BankAccountRec {
  uid: string
  code: string
  accountCode: string
  bankName: string
  accountNumber: string
  ifsc: string
  branch: string
  accountType: 'CURRENT' | 'CC' | 'OD' | 'SAVINGS'
  /** Sanctioned limit on a cash-credit or overdraft account. */
  limit: number
  openingBalance: number
  isActive: boolean
  version: number
  deletedAt?: string | null
}

export interface BankStatementLine {
  uid: string
  bankAccountCode: string
  date: string
  description: string
  reference: string
  /** Money into the account. */
  deposit: number
  withdrawal: number
  /** Running balance as the bank reports it. */
  balance: number
  /** Journal voucher this line has been matched to. Null while unreconciled. */
  matchedVoucherNo: string | null
  matchedAt: string | null
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Cost & profit centres ─────────────────────── */

export interface CostCentre {
  uid: string
  code: string
  name: string
  /** Production, service or administrative — decides how it is absorbed. */
  centreType: 'PRODUCTION' | 'SERVICE' | 'ADMIN' | 'SALES'
  plant: string
  manager: string
  /** Work centre this cost centre mirrors, where it is a production one. */
  workCentreCode: string | null
  isActive: boolean
  version: number
  deletedAt?: string | null
}

export interface ProfitCentre {
  uid: string
  code: string
  name: string
  channel: 'DOMESTIC' | 'EXPORT' | 'OEM' | 'RETAIL' | 'ECOMMERCE'
  manager: string
  isActive: boolean
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Costing ─────────────────────── */

/** What one unit was planned to cost, from the engineering roll-up. */
export interface StandardCostCard {
  uid: string
  productCode: string
  productName: string
  effectiveFrom: string
  material: number
  labour: number
  machine: number
  overhead: number
  packing: number
  total: number
  /** Standard input quantities, needed to compute a usage variance. */
  stdMaterialQty: number
  stdMaterialRate: number
  stdLabourHours: number
  stdLabourRate: number
  stdMachineHours: number
  stdMachineRate: number
  version: number
  deletedAt?: string | null
}

/** What a production order actually consumed. */
export interface ActualCostRecord {
  uid: string
  productionOrderNo: string
  productCode: string
  productName: string
  batchNo: string
  period: string
  /** Good output. Variances are measured against the standard for this. */
  outputQty: number
  scrapQty: number
  reworkQty: number
  actualMaterialQty: number
  actualMaterialRate: number
  actualLabourHours: number
  actualLabourRate: number
  actualMachineHours: number
  actualMachineRate: number
  actualOverhead: number
  actualPacking: number
  /** Quality cost carried by this order — inspection, rework and scrap. */
  qualityCost: number
  freightInward: number
  status: 'OPEN' | 'SETTLED'
  createdAt: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Fixed assets ─────────────────────── */

export type DepreciationMethod = 'SLM' | 'WDV'

export interface FixedAsset {
  uid: string
  code: string
  name: string
  category: string
  accountCode: string
  costCentre: string
  plant: string
  /** Links a production machine to its maintenance and costing records. */
  machineCode: string | null
  capitalisedOn: string
  cost: number
  salvageValue: number
  usefulLifeYears: number
  method: DepreciationMethod
  /** WDV rate, used when the method is written-down value. */
  wdvRatePct: number
  accumulatedDepreciation: number
  /** Period through which depreciation has been posted, YYYY-MM. */
  depreciatedUpto: string | null
  status: 'ACTIVE' | 'TRANSFERRED' | 'DISPOSED' | 'WRITTEN_OFF'
  disposedOn: string | null
  disposalValue: number
  insurancePolicyNo: string
  warrantyUntil: string | null
  amcVendor: string
  remarks: string
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Budgets ─────────────────────── */

export interface BudgetLine {
  uid: string
  fiscalYear: string
  period: string
  budgetType: 'REVENUE' | 'EXPENSE' | 'CAPITAL' | 'CASH_FLOW'
  level: 'COMPANY' | 'PLANT' | 'DEPARTMENT' | 'COST_CENTRE' | 'PROJECT'
  ownerCode: string
  ownerName: string
  accountCode: string
  accountName: string
  budgetAmount: number
  /** Raised but not yet invoiced — a purchase order against the budget. */
  committedAmount: number
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Taxation ─────────────────────── */

export interface TaxRate {
  uid: string
  code: string
  description: string
  hsn: string
  ratePct: number
  cessPct: number
  isActive: boolean
  version: number
  deletedAt?: string | null
}

export interface TdsSection {
  uid: string
  section: string
  description: string
  ratePct: number
  /** Annual threshold below which no deduction is made. */
  thresholdAmount: number
  isActive: boolean
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Period close ─────────────────────── */

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED'

export interface FiscalPeriod {
  uid: string
  period: string
  fiscalYear: string
  startDate: string
  endDate: string
  status: PeriodStatus
  /** Ch 19 checklist, each item with who signed it off. */
  checklist: { key: string; label: string; done: boolean; doneBy: string | null; doneAt: string | null }[]
  closedBy: string | null
  closedAt: string | null
  reopenedBy: string | null
  reopenReason: string
  version: number
  deletedAt?: string | null
}
