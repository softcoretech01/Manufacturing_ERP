/**
 * Finance arithmetic — posting, statements, costing, tax and depreciation.
 *
 *   Operational document ──► journal ──► general ledger ──► trial balance
 *                                                      ├──► profit & loss
 *                                                      └──► balance sheet
 *
 * The whole module rests on one property: every journal balances, so the trial
 * balance balances, so the balance sheet balances. That is not a hope — a
 * journal that does not balance cannot be posted, and the statements are
 * derived from postings rather than maintained alongside them. If the balance
 * sheet is ever out, a posting rule is wrong, and the check below will say so
 * rather than the difference quietly appearing in a suspense account.
 */

import type {
  Account,
  AccountType,
  ActualCostRecord,
  BudgetLine,
  FiscalPeriod,
  FixedAsset,
  Journal,
  JournalLine,
  PartyDocument,
  PartyPayment,
  StandardCostCard,
  TdsSection,
} from '@/types/finance'
import { NORMAL_BALANCE } from '@/types/finance'

/** Money is compared to the paisa, never exactly — floats do not cooperate. */
export const EPSILON = 0.005
export const money = (n: number) => Math.round(n * 100) / 100
export const isZero = (n: number) => Math.abs(n) < EPSILON

/* ═══════════════════════════ Journal integrity ═══════════════════════════ */

export interface JournalCheck {
  totalDebit: number
  totalCredit: number
  difference: number
  isBalanced: boolean
  problems: string[]
}

/**
 * Whether a journal can be posted.
 *
 * A line carrying both a debit and a credit is the commonest data-entry error
 * and it hides inside a journal that still totals correctly, so it is rejected
 * on its own rather than left to the totals to catch.
 */
export function checkJournal(
  journal: Pick<Journal, 'lines' | 'date' | 'period'>,
  accounts: Account[],
  periods: FiscalPeriod[] = [],
): JournalCheck {
  const problems: string[] = []
  const totalDebit = money(journal.lines.reduce((s, l) => s + (l.debit || 0), 0))
  const totalCredit = money(journal.lines.reduce((s, l) => s + (l.credit || 0), 0))
  const difference = money(totalDebit - totalCredit)

  if (journal.lines.length < 2) problems.push('A journal needs at least two lines — one debit and one credit.')
  if (!isZero(difference)) {
    problems.push(`Debits are ${totalDebit.toFixed(2)} and credits ${totalCredit.toFixed(2)}, out by ${Math.abs(difference).toFixed(2)}.`)
  }
  if (isZero(totalDebit) && isZero(totalCredit)) problems.push('The journal has no value.')

  for (const [i, l] of journal.lines.entries()) {
    const n = i + 1
    if (!l.accountCode) { problems.push(`Line ${n} has no account.`); continue }
    const acc = accounts.find((a) => a.code === l.accountCode && !a.deletedAt)
    if (!acc) { problems.push(`Line ${n}: account ${l.accountCode} is not in the chart of accounts.`); continue }
    if (acc.isGroup) problems.push(`Line ${n}: ${acc.code} is a group account and cannot take a posting.`)
    if (!acc.isActive) problems.push(`Line ${n}: ${acc.code} is inactive.`)
    if ((l.debit || 0) > 0 && (l.credit || 0) > 0) problems.push(`Line ${n} carries both a debit and a credit; use two lines.`)
    if ((l.debit || 0) < 0 || (l.credit || 0) < 0) problems.push(`Line ${n} has a negative amount; reverse the side instead.`)
    if (isZero(l.debit || 0) && isZero(l.credit || 0)) problems.push(`Line ${n} has no amount.`)
    if (acc.requiresCostCentre && !l.costCentre) problems.push(`Line ${n}: ${acc.code} requires a cost centre.`)
    if (acc.isControl && !l.partyCode) problems.push(`Line ${n}: ${acc.code} is a control account and needs a party — otherwise the subledger cannot reconcile to it.`)
  }

  const period = periods.find((p) => p.period === journal.period && !p.deletedAt)
  if (period && period.status === 'CLOSED') problems.push(`Period ${journal.period} is closed. Reopen it, or post to an open period.`)

  return { totalDebit, totalCredit, difference, isBalanced: isZero(difference), problems }
}

/** Journals that have hit the ledger. Drafts and reversals are not balances. */
export const isPosted = (j: Journal) => j.status === 'POSTED' && !j.deletedAt

/**
 * Builds the reversing journal for a posted one: the same lines with the sides
 * swapped. Reversal rather than deletion is what keeps the audit trail intact.
 */
export function buildReversal(journal: Journal, voucherNo: string, date: string, period: string): Journal {
  return {
    ...journal,
    uid: `${journal.uid}-rev`,
    voucherNo,
    date,
    period,
    narration: `Reversal of ${journal.voucherNo} — ${journal.narration}`,
    lines: journal.lines.map((l, i) => ({ ...l, uid: `${l.uid}-r${i}`, debit: l.credit, credit: l.debit })),
    status: 'POSTED',
    isAuto: true,
    reversalOf: journal.voucherNo,
    reversedBy: null,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
    version: 1,
  }
}

/* ═══════════════════════════ Ledger ═══════════════════════════ */

export interface LedgerEntry {
  voucherNo: string
  voucherType: string
  date: string
  period: string
  narration: string
  debit: number
  credit: number
  /** Balance after this entry, debit-positive. */
  runningBalance: number
  costCentre: string
  profitCentre: string
  partyCode: string
  sourceDocNo: string
}

/**
 * Every posting to one account, in date order, with a running balance.
 * Debit-positive throughout: a credit-normal account simply runs negative,
 * which keeps one sign convention across the whole module.
 */
export function accountLedger(accountCode: string, journals: Journal[], accounts: Account[], upto?: string): LedgerEntry[] {
  const acc = accounts.find((a) => a.code === accountCode)
  const opening = acc?.openingBalance ?? 0
  let running = opening

  return journals
    .filter(isPosted)
    .filter((j) => !upto || j.date <= upto)
    .flatMap((j) => j.lines.filter((l) => l.accountCode === accountCode).map((l) => ({ j, l })))
    .sort((a, b) => a.j.date.localeCompare(b.j.date) || a.j.voucherNo.localeCompare(b.j.voucherNo))
    .map(({ j, l }) => {
      running = money(running + (l.debit || 0) - (l.credit || 0))
      return {
        voucherNo: j.voucherNo,
        voucherType: j.voucherType,
        date: j.date,
        period: j.period,
        narration: l.narration || j.narration,
        debit: l.debit || 0,
        credit: l.credit || 0,
        runningBalance: running,
        costCentre: l.costCentre,
        profitCentre: l.profitCentre,
        partyCode: l.partyCode,
        sourceDocNo: j.sourceDocNo,
      }
    })
}

/** Closing balance of an account, debit-positive, including its opening. */
export function accountBalance(accountCode: string, journals: Journal[], accounts: Account[], upto?: string): number {
  const acc = accounts.find((a) => a.code === accountCode)
  const opening = acc?.openingBalance ?? 0
  const movement = journals
    .filter(isPosted)
    .filter((j) => !upto || j.date <= upto)
    .flatMap((j) => j.lines)
    .filter((l) => l.accountCode === accountCode)
    .reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
  return money(opening + movement)
}

/* ═══════════════════════════ Trial balance ═══════════════════════════ */

export interface TrialBalanceRow {
  accountCode: string
  accountName: string
  accountType: AccountType
  category: string
  opening: number
  debitMovement: number
  creditMovement: number
  closing: number
  /** Presentation columns — a balance sits in one or the other, never both. */
  debitBalance: number
  creditBalance: number
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  difference: number
  isBalanced: boolean
  asOf: string
}

export function trialBalance(accounts: Account[], journals: Journal[], upto?: string): TrialBalance {
  const posting = accounts.filter((a) => !a.isGroup && !a.deletedAt)
  const live = journals.filter(isPosted).filter((j) => !upto || j.date <= upto)

  const rows: TrialBalanceRow[] = posting.map((a) => {
    const lines = live.flatMap((j) => j.lines).filter((l) => l.accountCode === a.code)
    const debitMovement = money(lines.reduce((s, l) => s + (l.debit || 0), 0))
    const creditMovement = money(lines.reduce((s, l) => s + (l.credit || 0), 0))
    const closing = money(a.openingBalance + debitMovement - creditMovement)
    return {
      accountCode: a.code,
      accountName: a.name,
      accountType: a.accountType,
      category: a.category,
      opening: a.openingBalance,
      debitMovement,
      creditMovement,
      closing,
      debitBalance: closing > 0 ? closing : 0,
      creditBalance: closing < 0 ? -closing : 0,
    }
  })

  const withBalance = rows.filter((r) => !isZero(r.closing) || !isZero(r.debitMovement) || !isZero(r.creditMovement))
  const totalDebit = money(withBalance.reduce((s, r) => s + r.debitBalance, 0))
  const totalCredit = money(withBalance.reduce((s, r) => s + r.creditBalance, 0))

  return {
    rows: withBalance.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
    totalDebit,
    totalCredit,
    difference: money(totalDebit - totalCredit),
    isBalanced: isZero(money(totalDebit - totalCredit)),
    asOf: upto ?? 'all',
  }
}

/* ═══════════════════════════ Profit & loss ═══════════════════════════ */

export interface StatementGroup {
  category: string
  rows: { accountCode: string; accountName: string; amount: number }[]
  total: number
}

export interface ProfitAndLoss {
  income: StatementGroup[]
  expense: StatementGroup[]
  totalIncome: number
  totalExpense: number
  grossProfit: number
  /** Earnings before interest, tax, depreciation and amortisation. */
  ebitda: number
  depreciation: number
  netProfit: number
  from: string
  to: string
}

/** Categories treated as cost of goods sold when computing gross profit. */
const COGS_CATEGORIES = ['Raw Material', 'Direct Labour', 'Manufacturing Overhead', 'Packing', 'Freight Inward']

export function profitAndLoss(accounts: Account[], journals: Journal[], from: string, to: string): ProfitAndLoss {
  const live = journals.filter(isPosted).filter((j) => j.date >= from && j.date <= to)

  const build = (type: AccountType): StatementGroup[] => {
    const byCategory = new Map<string, StatementGroup>()
    for (const a of accounts.filter((x) => x.accountType === type && !x.isGroup && !x.deletedAt)) {
      const lines = live.flatMap((j) => j.lines).filter((l) => l.accountCode === a.code)
      // Income is credit-normal, so its P&L figure is credits less debits.
      const raw = lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
      const amount = money(NORMAL_BALANCE[type] === 'CREDIT' ? -raw : raw)
      if (isZero(amount)) continue
      const g = byCategory.get(a.category) ?? { category: a.category, rows: [], total: 0 }
      g.rows.push({ accountCode: a.code, accountName: a.name, amount })
      g.total = money(g.total + amount)
      byCategory.set(a.category, g)
    }
    return [...byCategory.values()].sort((x, y) => y.total - x.total)
  }

  const income = build('INCOME')
  const expense = build('EXPENSE')
  const totalIncome = money(income.reduce((s, g) => s + g.total, 0))
  const totalExpense = money(expense.reduce((s, g) => s + g.total, 0))
  const cogs = money(expense.filter((g) => COGS_CATEGORIES.includes(g.category)).reduce((s, g) => s + g.total, 0))
  const depreciation = money(expense.filter((g) => g.category === 'Depreciation').reduce((s, g) => s + g.total, 0))

  return {
    income,
    expense,
    totalIncome,
    totalExpense,
    grossProfit: money(totalIncome - cogs),
    ebitda: money(totalIncome - (totalExpense - depreciation)),
    depreciation,
    netProfit: money(totalIncome - totalExpense),
    from,
    to,
  }
}

/* ═══════════════════════════ Balance sheet ═══════════════════════════ */

export interface BalanceSheet {
  assets: StatementGroup[]
  liabilities: StatementGroup[]
  equity: StatementGroup[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  /** Profit for the period, closed into equity so the sheet balances. */
  retainedEarnings: number
  difference: number
  isBalanced: boolean
  asOf: string
}

/**
 * Assets = liabilities + equity, with the period's profit carried into equity.
 *
 * The identity is not asserted, it falls out: every journal balances, so the
 * sum of all debits equals the sum of all credits, and moving the income and
 * expense accounts into retained earnings just relabels part of that equality.
 * `isBalanced` is therefore a check on the posting rules, not on the arithmetic.
 */
export function balanceSheet(accounts: Account[], journals: Journal[], asOf: string, from = '0000-01-01'): BalanceSheet {
  const live = journals.filter(isPosted).filter((j) => j.date <= asOf)

  const build = (type: AccountType): StatementGroup[] => {
    const byCategory = new Map<string, StatementGroup>()
    for (const a of accounts.filter((x) => x.accountType === type && !x.isGroup && !x.deletedAt)) {
      const movement = live.flatMap((j) => j.lines).filter((l) => l.accountCode === a.code)
        .reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
      const raw = a.openingBalance + movement
      const amount = money(NORMAL_BALANCE[type] === 'CREDIT' ? -raw : raw)
      if (isZero(amount)) continue
      const g = byCategory.get(a.category) ?? { category: a.category, rows: [], total: 0 }
      g.rows.push({ accountCode: a.code, accountName: a.name, amount })
      g.total = money(g.total + amount)
      byCategory.set(a.category, g)
    }
    return [...byCategory.values()].sort((x, y) => y.total - x.total)
  }

  const assets = build('ASSET')
  const liabilities = build('LIABILITY')
  const equity = build('EQUITY')

  const pl = profitAndLoss(accounts, journals, from, asOf)
  const retainedEarnings = pl.netProfit

  const totalAssets = money(assets.reduce((s, g) => s + g.total, 0))
  const totalLiabilities = money(liabilities.reduce((s, g) => s + g.total, 0))
  const totalEquity = money(equity.reduce((s, g) => s + g.total, 0) + retainedEarnings)
  const difference = money(totalAssets - totalLiabilities - totalEquity)

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedEarnings,
    difference,
    isBalanced: isZero(difference),
    asOf,
  }
}

/* ═══════════════════════════ Ageing ═══════════════════════════ */

export const AGEING_BUCKETS = ['Not due', '0–30', '31–60', '61–90', '90+'] as const
export type AgeingBucket = (typeof AGEING_BUCKETS)[number]

export interface AgeingRow {
  partyCode: string
  partyName: string
  total: number
  buckets: Record<AgeingBucket, number>
  oldestDays: number
  documents: { docNo: string; date: string; dueDate: string; outstanding: number; daysOverdue: number; bucket: AgeingBucket }[]
}

export function bucketFor(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return 'Not due'
  if (daysOverdue <= 30) return '0–30'
  if (daysOverdue <= 60) return '31–60'
  if (daysOverdue <= 90) return '61–90'
  return '90+'
}

/**
 * Outstanding by party and age. Credit notes reduce the balance, which is why
 * they are netted here rather than listed as a separate positive figure.
 */
export function ageing(
  documents: PartyDocument[],
  partyType: 'CUSTOMER' | 'SUPPLIER',
  asOf: Date = new Date(),
): AgeingRow[] {
  const today = new Date(asOf).setHours(0, 0, 0, 0)
  const open = documents.filter(
    (d) => !d.deletedAt && d.partyType === partyType && d.status !== 'CANCELLED' && d.status !== 'WRITTEN_OFF',
  )

  const byParty = new Map<string, AgeingRow>()
  for (const d of open) {
    const outstanding = outstandingOf(d)
    if (isZero(outstanding)) continue

    const daysOverdue = Math.floor((today - new Date(d.dueDate).setHours(0, 0, 0, 0)) / 86_400_000)
    const bucket = bucketFor(daysOverdue)

    const row = byParty.get(d.partyCode) ?? {
      partyCode: d.partyCode,
      partyName: d.partyName,
      total: 0,
      buckets: { 'Not due': 0, '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 },
      oldestDays: 0,
      documents: [],
    }
    row.total = money(row.total + outstanding)
    row.buckets[bucket] = money(row.buckets[bucket] + outstanding)
    row.oldestDays = Math.max(row.oldestDays, daysOverdue)
    row.documents.push({ docNo: d.docNo, date: d.date, dueDate: d.dueDate, outstanding, daysOverdue, bucket })
    byParty.set(d.partyCode, row)
  }

  return [...byParty.values()].sort((a, b) => b.total - a.total)
}

/**
 * Ch 24 — the control account must equal the subledger it controls.
 * Any gap means a document posted without its party, or a journal touched the
 * control account directly.
 */
export interface SubledgerCheck {
  controlAccount: string
  controlBalance: number
  subledgerTotal: number
  difference: number
  reconciles: boolean
}

export function reconcileSubledger(
  controlAccountCode: string,
  partyType: 'CUSTOMER' | 'SUPPLIER',
  accounts: Account[],
  journals: Journal[],
  documents: PartyDocument[],
): SubledgerCheck {
  const controlBalance = accountBalance(controlAccountCode, journals, accounts)
  const rows = ageing(documents, partyType)
  const subledgerTotal = money(rows.reduce((s, r) => s + r.total, 0))
  // Payables are credit-normal, so the control account runs negative against a
  // positive subledger — compare magnitudes on the natural side.
  const normalised = partyType === 'SUPPLIER' ? money(-controlBalance) : controlBalance
  const difference = money(normalised - subledgerTotal)
  return { controlAccount: controlAccountCode, controlBalance, subledgerTotal, difference, reconciles: isZero(difference) }
}

/* ═══════════════════════════ GST ═══════════════════════════ */

export interface GstSplit {
  taxableValue: number
  ratePct: number
  cgst: number
  sgst: number
  igst: number
  cess: number
  total: number
  isInterState: boolean
}

/**
 * Splits tax by place of supply. Within the state it halves into central and
 * state GST; across a state line the whole rate lands as integrated GST. Get
 * this wrong and the return is wrong, not just the presentation — the three
 * heads are settled separately.
 */
export function splitGst(taxableValue: number, ratePct: number, supplierStateCode: string, placeOfSupplyCode: string, cessPct = 0): GstSplit {
  const isInterState = supplierStateCode !== placeOfSupplyCode
  const tax = money((taxableValue * ratePct) / 100)
  const cess = money((taxableValue * cessPct) / 100)
  const half = money(tax / 2)
  return {
    taxableValue: money(taxableValue),
    ratePct,
    cgst: isInterState ? 0 : half,
    // The second half carries any rounding, so the two always sum to the tax.
    sgst: isInterState ? 0 : money(tax - half),
    igst: isInterState ? tax : 0,
    cess,
    total: money(tax + cess),
    isInterState,
  }
}

export interface GstReturnSummary {
  period: string
  outward: { taxableValue: number; cgst: number; sgst: number; igst: number; cess: number; count: number }
  inward: { taxableValue: number; cgst: number; sgst: number; igst: number; cess: number; count: number }
  reverseCharge: { taxableValue: number; igst: number; count: number }
  /** Output tax less input credit, by head. Negative means credit carried forward. */
  netCgst: number
  netSgst: number
  netIgst: number
  netCess: number
  netPayable: number
  creditCarriedForward: number
}

/**
 * GSTR-3B in the shape that matters: what was collected, what can be claimed,
 * and what has to be paid. Set off head by head — integrated credit may cover
 * the others, but central credit can never pay a state liability.
 */
export function gstReturn(documents: PartyDocument[], period: string): GstReturnSummary {
  const inPeriod = documents.filter((d) => !d.deletedAt && d.status !== 'CANCELLED' && d.date.slice(0, 7) === period)
  const sign = (d: PartyDocument) => documentSign(d)

  const sum = (rows: PartyDocument[]) => ({
    taxableValue: money(rows.reduce((s, d) => s + sign(d) * d.taxableValue, 0)),
    cgst: money(rows.reduce((s, d) => s + sign(d) * d.cgst, 0)),
    sgst: money(rows.reduce((s, d) => s + sign(d) * d.sgst, 0)),
    igst: money(rows.reduce((s, d) => s + sign(d) * d.igst, 0)),
    cess: money(rows.reduce((s, d) => s + sign(d) * d.cess, 0)),
    count: rows.length,
  })

  const outwardRows = inPeriod.filter((d) => d.partyType === 'CUSTOMER')
  // Reverse-charge purchases create a liability, so they are not ordinary credit.
  const inwardRows = inPeriod.filter((d) => d.partyType === 'SUPPLIER' && !d.isReverseCharge)
  const rcmRows = inPeriod.filter((d) => d.partyType === 'SUPPLIER' && d.isReverseCharge)

  const outward = sum(outwardRows)
  const inward = sum(inwardRows)
  const rcm = sum(rcmRows)

  const netCgst = money(outward.cgst - inward.cgst)
  const netSgst = money(outward.sgst - inward.sgst)
  // Reverse charge is payable in cash and claimable as credit in the same
  // period, so it nets out here but must still appear on the return.
  const netIgst = money(outward.igst - inward.igst + rcm.igst - rcm.igst)
  const netCess = money(outward.cess - inward.cess)

  const heads = [netCgst, netSgst, netIgst, netCess]
  const payable = money(heads.filter((h) => h > 0).reduce((s, h) => s + h, 0))
  const credit = money(-heads.filter((h) => h < 0).reduce((s, h) => s + h, 0))

  return {
    period,
    outward,
    inward,
    reverseCharge: { taxableValue: rcm.taxableValue, igst: rcm.igst, count: rcm.count },
    netCgst,
    netSgst,
    netIgst,
    netCess,
    netPayable: payable,
    creditCarriedForward: credit,
  }
}

/* ═══════════════════════════ TDS ═══════════════════════════ */

export interface TdsComputation {
  section: string
  ratePct: number
  thresholdAmount: number
  cumulativeBefore: number
  cumulativeAfter: number
  thresholdCrossed: boolean
  taxableBase: number
  tdsAmount: number
  note: string
}

/**
 * Deduction is on the whole cumulative amount once the annual threshold is
 * crossed, not just on the excess — so the invoice that crosses it carries the
 * catch-up for everything paid earlier in the year.
 */
export function computeTds(sectionCode: string, invoiceAmount: number, cumulativePaidThisYear: number, sections: TdsSection[]): TdsComputation | null {
  const s = sections.find((x) => x.section === sectionCode && x.isActive && !x.deletedAt)
  if (!s) return null

  const before = cumulativePaidThisYear
  const after = money(before + invoiceAmount)
  const crossed = after > s.thresholdAmount

  if (!crossed) {
    return {
      section: s.section, ratePct: s.ratePct, thresholdAmount: s.thresholdAmount,
      cumulativeBefore: before, cumulativeAfter: after, thresholdCrossed: false,
      taxableBase: 0, tdsAmount: 0,
      note: `Cumulative ${after.toFixed(2)} is under the ${s.thresholdAmount.toLocaleString('en-IN')} threshold, so nothing is deducted.`,
    }
  }

  // Already over before this invoice: deduct on this invoice alone.
  // Crossing on this invoice: deduct on everything to date.
  const base = before > s.thresholdAmount ? invoiceAmount : after
  return {
    section: s.section, ratePct: s.ratePct, thresholdAmount: s.thresholdAmount,
    cumulativeBefore: before, cumulativeAfter: after, thresholdCrossed: true,
    taxableBase: money(base), tdsAmount: money((base * s.ratePct) / 100),
    note: before > s.thresholdAmount
      ? `Already past the threshold, so ${s.ratePct}% applies to this invoice.`
      : `This invoice crosses the ${s.thresholdAmount.toLocaleString('en-IN')} threshold, so ${s.ratePct}% applies to the full ${base.toFixed(2)} paid this year.`,
  }
}

/* ═══════════════════════════ Standard vs actual costing ═══════════════════════════ */

export interface VarianceLine {
  label: string
  standard: number
  actual: number
  /** Favourable is negative — costing less than standard. */
  variance: number
  isFavourable: boolean
  formula: string
}

export interface CostVariance {
  productionOrderNo: string
  productCode: string
  outputQty: number
  /** Standard for the actual output, built from the card's own components. */
  standardCost: number
  /** The card's headline total for the same output. */
  publishedStandard: number
  /** Gap between the two. Non-zero means the cost card needs republishing. */
  cardDrift: number
  actualCost: number
  totalVariance: number
  materialPrice: VarianceLine
  materialUsage: VarianceLine
  labourRate: VarianceLine
  labourEfficiency: VarianceLine
  machineRate: VarianceLine
  machineEfficiency: VarianceLine
  overhead: VarianceLine
  yieldVariance: VarianceLine
  /** The eight variances must add up to the total. This says whether they do. */
  reconciles: boolean
  reconciliationGap: number
  lines: VarianceLine[]
}

const vline = (label: string, standard: number, actual: number, formula: string): VarianceLine => {
  const variance = money(actual - standard)
  return { label, standard: money(standard), actual: money(actual), variance, isFavourable: variance < 0, formula }
}

/**
 * Ch 13. Splits the gap between what a batch should have cost and what it did.
 *
 * The split is only worth anything if it is exhaustive, so the function checks
 * that the parts add back to the whole. Price and usage on material, rate and
 * efficiency on labour and machine, then overhead and yield — anything left
 * over is a modelling error and is reported as a gap rather than buried.
 */
export function costVariance(actual: ActualCostRecord, card: StandardCostCard): CostVariance {
  const output = actual.outputQty
  const attempted = actual.outputQty + actual.scrapQty

  /* Material — standard quantity is what the output should have needed. */
  const stdQty = money(card.stdMaterialQty * output)
  const actQty = actual.actualMaterialQty
  const sp = card.stdMaterialRate
  const ap = actual.actualMaterialRate

  const materialPrice = vline('Material price', money(actQty * sp), money(actQty * ap), '(actual rate − standard rate) × actual quantity')
  const materialUsage = vline('Material usage', money(stdQty * sp), money(actQty * sp), '(actual quantity − standard quantity for output) × standard rate')

  /* Labour */
  const stdHours = money(card.stdLabourHours * output)
  const labourRate = vline('Labour rate', money(actual.actualLabourHours * card.stdLabourRate), money(actual.actualLabourHours * actual.actualLabourRate), '(actual rate − standard rate) × actual hours')
  const labourEfficiency = vline('Labour efficiency', money(stdHours * card.stdLabourRate), money(actual.actualLabourHours * card.stdLabourRate), '(actual hours − standard hours for output) × standard rate')

  /* Machine */
  const stdMachineHours = money(card.stdMachineHours * output)
  const machineRate = vline('Machine rate', money(actual.actualMachineHours * card.stdMachineRate), money(actual.actualMachineHours * actual.actualMachineRate), '(actual rate − standard rate) × actual hours')
  const machineEfficiency = vline('Machine utilisation', money(stdMachineHours * card.stdMachineRate), money(actual.actualMachineHours * card.stdMachineRate), '(actual hours − standard hours for output) × standard rate')

  /* Overhead and packing absorbed against the standard for actual output. */
  const stdOverhead = money((card.overhead + card.packing) * output)
  const overhead = vline('Overhead & packing', stdOverhead, money(actual.actualOverhead + actual.actualPacking), 'actual overhead absorbed − standard overhead for output')

  /*
   * Yield — material lost in the pieces that were scrapped. Costed at standard
   * so it does not double-count the price variance already measured above.
   */
  const yieldStd = 0
  const yieldActual = money(actual.scrapQty * card.stdMaterialQty * sp)
  const yieldVariance = vline('Yield / scrap', yieldStd, yieldActual, 'scrapped units × standard material per unit × standard rate')

  /*
   * The standard to measure against is built from the same components the
   * variances decompose, not from the card's headline total. Those two should
   * agree, and where they do not the card needs republishing — but a variance
   * analysis that does not add up is worse than useless, so the decomposition
   * is made exact and the drift is reported separately.
   */
  const standardPerUnit = money(
    card.stdMaterialQty * card.stdMaterialRate +
      card.stdLabourHours * card.stdLabourRate +
      card.stdMachineHours * card.stdMachineRate +
      card.overhead +
      card.packing,
  )
  const standardCost = money(standardPerUnit * output)
  const publishedStandard = money(card.total * output)
  const cardDrift = money(publishedStandard - standardCost)

  const actualCost = money(
    actQty * ap +
      actual.actualLabourHours * actual.actualLabourRate +
      actual.actualMachineHours * actual.actualMachineRate +
      actual.actualOverhead +
      actual.actualPacking +
      yieldActual,
  )
  const totalVariance = money(actualCost - standardCost)

  const lines = [materialPrice, materialUsage, labourRate, labourEfficiency, machineRate, machineEfficiency, overhead, yieldVariance]
  const summed = money(lines.reduce((s, l) => s + l.variance, 0))
  const gap = money(totalVariance - summed)

  void attempted
  return {
    productionOrderNo: actual.productionOrderNo,
    productCode: actual.productCode,
    outputQty: output,
    standardCost,
    publishedStandard,
    cardDrift,
    actualCost,
    totalVariance,
    materialPrice,
    materialUsage,
    labourRate,
    labourEfficiency,
    machineRate,
    machineEfficiency,
    overhead,
    yieldVariance,
    reconciles: isZero(gap),
    reconciliationGap: gap,
    lines,
  }
}

/** Cost per unit produced, split the way Ch 25 asks for. */
export function unitCost(actual: ActualCostRecord) {
  const q = Math.max(1, actual.outputQty)
  const material = money(actual.actualMaterialQty * actual.actualMaterialRate)
  const labour = money(actual.actualLabourHours * actual.actualLabourRate)
  const machine = money(actual.actualMachineHours * actual.actualMachineRate)
  const total = money(material + labour + machine + actual.actualOverhead + actual.actualPacking + actual.qualityCost + actual.freightInward)
  return {
    material: money(material / q),
    labour: money(labour / q),
    machine: money(machine / q),
    overhead: money(actual.actualOverhead / q),
    packing: money(actual.actualPacking / q),
    quality: money(actual.qualityCost / q),
    freight: money(actual.freightInward / q),
    total: money(total / q),
    batchTotal: total,
  }
}

/* ═══════════════════════════ Depreciation ═══════════════════════════ */

export interface DepreciationRun {
  assetCode: string
  assetName: string
  method: string
  openingWdv: number
  /** Charge for the period being run. */
  charge: number
  closingWdv: number
  accumulatedAfter: number
  /** True once the asset has depreciated down to its salvage value. */
  fullyDepreciated: boolean
  note: string
}

/**
 * One period's charge. Straight line spreads the depreciable amount evenly;
 * written-down value takes a fixed percentage of what is left, so it never
 * quite reaches zero and is floored at the salvage value.
 */
export function depreciateForPeriod(asset: FixedAsset, period: string, daysInPeriod = 30): DepreciationRun {
  const openingWdv = money(asset.cost - asset.accumulatedDepreciation)
  const floor = asset.salvageValue
  const base = { assetCode: asset.code, assetName: asset.name, method: asset.method, openingWdv }

  if (asset.status !== 'ACTIVE') {
    return { ...base, charge: 0, closingWdv: openingWdv, accumulatedAfter: asset.accumulatedDepreciation, fullyDepreciated: false, note: `Asset is ${asset.status.toLowerCase()}; no charge.` }
  }
  if (openingWdv <= floor + EPSILON) {
    return { ...base, charge: 0, closingWdv: openingWdv, accumulatedAfter: asset.accumulatedDepreciation, fullyDepreciated: true, note: 'Already written down to the salvage value.' }
  }
  // An asset capitalised mid-period is charged only for the days it was held.
  const capitalised = new Date(asset.capitalisedOn)
  const periodStart = new Date(`${period}-01`)
  const periodEnd = new Date(new Date(periodStart).setMonth(periodStart.getMonth() + 1) - 86_400_000)
  if (capitalised > periodEnd) {
    return { ...base, charge: 0, closingWdv: openingWdv, accumulatedAfter: asset.accumulatedDepreciation, fullyDepreciated: false, note: `Capitalised after ${period}; nothing to charge.` }
  }
  const heldDays = capitalised > periodStart
    ? Math.max(0, Math.round((periodEnd.getTime() - capitalised.getTime()) / 86_400_000) + 1)
    : daysInPeriod
  const proRata = Math.min(1, heldDays / daysInPeriod)

  let charge: number
  if (asset.method === 'SLM') {
    const annual = (asset.cost - asset.salvageValue) / Math.max(1, asset.usefulLifeYears)
    charge = money((annual / 12) * proRata)
  } else {
    const annual = (openingWdv * asset.wdvRatePct) / 100
    charge = money((annual / 12) * proRata)
  }

  // Never depreciate below the salvage value.
  const maxCharge = money(openingWdv - floor)
  const capped = Math.min(charge, maxCharge)

  return {
    ...base,
    charge: capped,
    closingWdv: money(openingWdv - capped),
    accumulatedAfter: money(asset.accumulatedDepreciation + capped),
    fullyDepreciated: isZero(money(openingWdv - capped - floor)),
    note: proRata < 1
      ? `Pro-rated for ${heldDays} of ${daysInPeriod} days from capitalisation.`
      : asset.method === 'SLM'
        ? `Straight line over ${asset.usefulLifeYears} years.`
        : `Written-down value at ${asset.wdvRatePct}% a year.`,
  }
}

/* ═══════════════════════════ Budgets ═══════════════════════════ */

export interface BudgetStatus {
  line: BudgetLine
  actual: number
  committed: number
  available: number
  utilisationPct: number
  isOverspent: boolean
  isAtRisk: boolean
}

/**
 * Budget against actual and committed. Committed spend counts — a purchase
 * order raised is money gone, and a budget that only watches invoices reports
 * headroom that does not exist.
 */
export function budgetStatus(lines: BudgetLine[], accounts: Account[], journals: Journal[]): BudgetStatus[] {
  return lines
    .filter((l) => !l.deletedAt)
    .map((line) => {
      const actual = money(
        journals
          .filter(isPosted)
          .filter((j) => j.period === line.period)
          .flatMap((j) => j.lines)
          .filter((l) => l.accountCode === line.accountCode && (!line.ownerCode || l.costCentre === line.ownerCode || line.level === 'COMPANY'))
          .reduce((s, l) => {
            const acc = accounts.find((a) => a.code === l.accountCode)
            const raw = (l.debit || 0) - (l.credit || 0)
            // Revenue budgets are credit-normal; expense budgets debit-normal.
            return s + (acc && NORMAL_BALANCE[acc.accountType] === 'CREDIT' ? -raw : raw)
          }, 0),
      )
      const committed = line.committedAmount
      const available = money(line.budgetAmount - actual - committed)
      const utilisationPct = line.budgetAmount > 0 ? money(((actual + committed) / line.budgetAmount) * 100) : 0
      return {
        line,
        actual,
        committed,
        available,
        utilisationPct,
        isOverspent: available < -EPSILON,
        isAtRisk: utilisationPct >= 90 && available >= -EPSILON,
      }
    })
}

/* ═══════════════════════════ Bank reconciliation ═══════════════════════════ */

export interface ReconciliationSummary {
  bankAccountCode: string
  /** Closing balance per the bank statement. */
  bankBalance: number
  /** Closing balance per the ledger. */
  bookBalance: number
  /** Posted in the books but not yet on the statement. */
  unpresented: number
  /** On the statement but not yet in the books. */
  unrecorded: number
  difference: number
  reconciles: boolean
  unmatchedStatementLines: number
}

/**
 * Bank balance and book balance rarely agree, and the reconciliation is the
 * explanation of the gap rather than a demand that it be zero. What must be
 * zero is the residual once timing differences are accounted for.
 */
export function reconcileBank(
  bankAccountCode: string,
  ledgerAccountCode: string,
  statementLines: { deposit: number; withdrawal: number; balance: number; matchedVoucherNo: string | null; date: string; deletedAt?: string | null; bankAccountCode: string }[],
  accounts: Account[],
  journals: Journal[],
): ReconciliationSummary {
  const lines = statementLines.filter((l) => !l.deletedAt && l.bankAccountCode === bankAccountCode).sort((a, b) => a.date.localeCompare(b.date))
  const bankBalance = lines.length ? money(lines[lines.length - 1].balance) : 0
  const bookBalance = accountBalance(ledgerAccountCode, journals, accounts)

  const matchedVouchers = new Set(lines.map((l) => l.matchedVoucherNo).filter(Boolean) as string[])
  const unpresented = money(
    journals
      .filter(isPosted)
      .filter((j) => !matchedVouchers.has(j.voucherNo))
      .flatMap((j) => j.lines.filter((l) => l.accountCode === ledgerAccountCode))
      .reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0),
  )
  const unrecorded = money(lines.filter((l) => !l.matchedVoucherNo).reduce((s, l) => s + l.deposit - l.withdrawal, 0))

  // Book balance less what the bank has not seen, against the bank's balance
  // less what we have not recorded.
  const difference = money(bookBalance - unpresented - (bankBalance - unrecorded))

  return {
    bankAccountCode,
    bankBalance,
    bookBalance,
    unpresented,
    unrecorded,
    difference,
    reconciles: isZero(difference),
    unmatchedStatementLines: lines.filter((l) => !l.matchedVoucherNo).length,
  }
}

/* ═══════════════════════════ Period close ═══════════════════════════ */

export const CLOSE_CHECKLIST: { key: string; label: string }[] = [
  { key: 'grn', label: 'Every GRN has a supplier invoice or an accrual' },
  { key: 'production', label: 'Production orders for the period are settled' },
  { key: 'wip', label: 'Work in progress valued and agreed to the shop floor' },
  { key: 'bank', label: 'Bank reconciliation complete for every account' },
  { key: 'inventory', label: 'Inventory valued and agreed to the stock ledger' },
  { key: 'depreciation', label: 'Depreciation posted for the period' },
  { key: 'accruals', label: 'Accruals and provisions posted' },
  { key: 'tax', label: 'GST and TDS entries posted and returns reconciled' },
  { key: 'journals', label: 'No journals left unposted' },
]

export interface CloseReadiness {
  period: string
  checklistDone: number
  checklistTotal: number
  blockers: string[]
  warnings: string[]
  canSoftClose: boolean
  canHardClose: boolean
}

/**
 * What stands between a period and its close. A soft close stops new postings
 * but can be undone; a hard close needs the ledger to actually balance and
 * every checklist item signed.
 */
export function closeReadiness(
  period: FiscalPeriod,
  accounts: Account[],
  journals: Journal[],
  documents: PartyDocument[],
): CloseReadiness {
  const blockers: string[] = []
  const warnings: string[] = []

  const unposted = journals.filter((j) => !j.deletedAt && j.period === period.period && (j.status === 'DRAFT' || j.status === 'PENDING_APPROVAL'))
  if (unposted.length) blockers.push(`${unposted.length} journal${unposted.length === 1 ? ' in' : 's in'} ${period.period} ${unposted.length === 1 ? 'is' : 'are'} still unposted.`)

  const tb = trialBalance(accounts, journals, period.endDate)
  if (!tb.isBalanced) blockers.push(`The trial balance is out by ${Math.abs(tb.difference).toFixed(2)} at ${period.endDate}.`)

  const bs = balanceSheet(accounts, journals, period.endDate)
  if (!bs.isBalanced) blockers.push(`The balance sheet does not balance — assets differ from liabilities and equity by ${Math.abs(bs.difference).toFixed(2)}.`)

  for (const control of accounts.filter((a) => a.isControl && !a.deletedAt)) {
    const check = reconcileSubledger(control.code, control.controlOf === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER', accounts, journals, documents)
    if (!check.reconciles) {
      blockers.push(`${control.code} ${control.name} is out against its subledger by ${Math.abs(check.difference).toFixed(2)}.`)
    }
  }

  const undone = period.checklist.filter((c) => !c.done)
  if (undone.length) warnings.push(`${undone.length} checklist item${undone.length === 1 ? '' : 's'} not signed off.`)

  return {
    period: period.period,
    checklistDone: period.checklist.filter((c) => c.done).length,
    checklistTotal: period.checklist.length,
    blockers,
    warnings,
    canSoftClose: unposted.length === 0,
    canHardClose: blockers.length === 0 && undone.length === 0,
  }
}

/* ═══════════════════════════ Labels ═══════════════════════════ */

export const VOUCHER_LABEL: Record<string, string> = {
  JOURNAL: 'Journal', SALES: 'Sales', PURCHASE: 'Purchase', RECEIPT: 'Receipt', PAYMENT: 'Payment',
  CONTRA: 'Contra', DEBIT_NOTE: 'Debit note', CREDIT_NOTE: 'Credit note', DEPRECIATION: 'Depreciation',
  PRODUCTION: 'Production', ACCRUAL: 'Accrual', OPENING: 'Opening',
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASSET: 'Asset', LIABILITY: 'Liability', INCOME: 'Income', EXPENSE: 'Expense', EQUITY: 'Equity',
}

/**
 * Which way a document moves the party balance.
 *
 * A credit note on a customer reduces what they owe us; a debit note on a
 * supplier reduces what we owe them. Treating "credit note" as the only
 * reducing document silently doubles a supplier debit note in the ageing, and
 * the control account stops agreeing with the subledger.
 */
export function documentSign(d: Pick<PartyDocument, 'docType' | 'partyType'>): 1 | -1 {
  if (d.partyType === 'CUSTOMER') return d.docType === 'CREDIT_NOTE' ? -1 : 1
  return d.docType === 'DEBIT_NOTE' ? -1 : 1
}

/** Outstanding on one party document, signed the way it moves the balance. */
export function outstandingOf(d: PartyDocument): number {
  return money(documentSign(d) * (d.grandTotal - d.settledAmount))
}

/** Unapplied money sitting on a receipt or payment. */
export function unappliedOf(p: PartyPayment): number {
  return money(p.amount - p.allocatedAmount)
}
