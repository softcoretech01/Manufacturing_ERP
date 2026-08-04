import { useMemo, type ReactNode } from 'react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { ACCOUNT_TYPE_LABEL, VOUCHER_LABEL, money } from '@/lib/finFlow'
import {
  accounts as seedAccounts,
  actualCosts as seedActualCosts,
  bankAccounts as seedBankAccounts,
  bankStatementLines as seedStatement,
  budgetLines as seedBudgets,
  costCentres as seedCostCentres,
  fiscalPeriods as seedPeriods,
  fixedAssets as seedAssets,
  journals as seedJournals,
  partyDocuments as seedDocuments,
  partyPayments as seedPayments,
  profitCentres as seedProfitCentres,
  standardCostCards as seedCards,
  taxRates as seedTaxRates,
  tdsSections as seedTds,
} from '@/mock/finance'
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
  PartyDocument,
  PartyPayment,
  ProfitCentre,
  StandardCostCard,
  TaxRate,
  TdsSection,
} from '@/types/finance'

/**
 * One binding point for every finance screen. Twelve screens reading the same
 * journals means the dashboard, the trial balance and the ledger cannot
 * disagree about what has been posted.
 */
export function useFinanceData() {
  const accounts = useCollection<Account>('fin:accounts', useMemo(() => seedAccounts, []))
  const journals = useCollection<Journal>('fin:journals', useMemo(() => seedJournals, []))
  const documents = useCollection<PartyDocument>('fin:documents', useMemo(() => seedDocuments, []))
  const payments = useCollection<PartyPayment>('fin:payments', useMemo(() => seedPayments, []))
  const bankAccounts = useCollection<BankAccountRec>('fin:bankAccounts', useMemo(() => seedBankAccounts, []))
  const statement = useCollection<BankStatementLine>('fin:statement', useMemo(() => seedStatement, []))
  const costCentres = useCollection<CostCentre>('fin:costCentres', useMemo(() => seedCostCentres, []))
  const profitCentres = useCollection<ProfitCentre>('fin:profitCentres', useMemo(() => seedProfitCentres, []))
  const cards = useCollection<StandardCostCard>('fin:cards', useMemo(() => seedCards, []))
  const actualCosts = useCollection<ActualCostRecord>('fin:actualCosts', useMemo(() => seedActualCosts, []))
  const assets = useCollection<FixedAsset>('fin:assets', useMemo(() => seedAssets, []))
  const budgets = useCollection<BudgetLine>('fin:budgets', useMemo(() => seedBudgets, []))
  const periods = useCollection<FiscalPeriod>('fin:periods', useMemo(() => seedPeriods, []))
  const taxRates = useCollection<TaxRate>('fin:taxRates', useMemo(() => seedTaxRates, []))
  const tdsSections = useCollection<TdsSection>('fin:tds', useMemo(() => seedTds, []))

  return { accounts, journals, documents, payments, bankAccounts, statement, costCentres, profitCentres, cards, actualCosts, assets, budgets, periods, taxRates, tdsSections }
}

/* ─────────────────────────── Money ─────────────────────────── */

/**
 * Indian grouping with the sign shown by a bracket rather than a minus.
 * Accountants read `(1,240.00)` faster than `-1,240.00`, and it survives being
 * photocopied.
 */
export function inr(n: number | null | undefined, opts: { decimals?: number; blankZero?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const decimals = opts.decimals ?? 2
  if (opts.blankZero && Math.abs(n) < 0.005) return '—'
  const abs = Math.abs(money(n)).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return n < -0.005 ? `(${abs})` : abs
}

/** Compact Indian short form for tiles. */
export function inrCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} K`
  return `${sign}${abs.toFixed(0)}`
}

/** A figure coloured by sign, never by colour alone. */
export function Amount({ value, decimals = 2, blankZero, className }: { value: number; decimals?: number; blankZero?: boolean; className?: string }) {
  return (
    <span className={cn('tabular', value < -0.005 ? 'text-danger' : '', className)}>
      {inr(value, { decimals, blankZero })}
    </span>
  )
}

/* ─────────────────────────── Badges ─────────────────────────── */

const FIN_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  PENDING_APPROVAL: { tone: 'pending', label: 'Pending approval' },
  POSTED: { tone: 'success', label: 'Posted' },
  REVERSED: { tone: 'neutral', label: 'Reversed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  OPEN: { tone: 'progress', label: 'Open' },
  PART_PAID: { tone: 'warning', label: 'Part paid' },
  PAID: { tone: 'success', label: 'Paid' },
  WRITTEN_OFF: { tone: 'neutral', label: 'Written off' },
  BOUNCED: { tone: 'danger', label: 'Bounced' },
  SOFT_CLOSED: { tone: 'warning', label: 'Soft closed' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  ACTIVE: { tone: 'success', label: 'Active' },
  TRANSFERRED: { tone: 'progress', label: 'Transferred' },
  DISPOSED: { tone: 'neutral', label: 'Disposed' },
  SETTLED: { tone: 'success', label: 'Settled' },
}

export function FinStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const e = FIN_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return <Badge tone={e.tone} size={size}>{e.label}</Badge>
}

const TYPE_TONE: Record<AccountType, StatusTone> = {
  ASSET: 'brand', LIABILITY: 'warning', INCOME: 'success', EXPENSE: 'danger', EQUITY: 'progress',
}

export function AccountTypeBadge({ type }: { type: AccountType }) {
  return <Badge tone={TYPE_TONE[type]} size="sm" dot={false}>{ACCOUNT_TYPE_LABEL[type]}</Badge>
}

export function VoucherBadge({ type }: { type: string }) {
  const tone: Record<string, StatusTone> = {
    SALES: 'success', PURCHASE: 'warning', RECEIPT: 'brand', PAYMENT: 'danger',
    JOURNAL: 'neutral', CONTRA: 'progress', OPENING: 'progress', DEPRECIATION: 'neutral',
    PRODUCTION: 'progress', CREDIT_NOTE: 'neutral', DEBIT_NOTE: 'neutral', ACCRUAL: 'neutral',
  }
  return <Badge tone={tone[type] ?? 'neutral'} size="sm" dot={false}>{VOUCHER_LABEL[type] ?? type}</Badge>
}

/** Whether a reconciliation holds, stated plainly. */
export function ReconcileBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <Badge tone={ok ? 'success' : 'danger'} size="sm">
      {label ?? (ok ? 'Reconciles' : 'Out of balance')}
    </Badge>
  )
}

/** Favourable or adverse, the way a cost report reads it. */
export function VarianceChip({ value }: { value: number }) {
  if (Math.abs(value) < 0.005) return <span className="text-2xs text-fg-subtle">Nil</span>
  const fav = value < 0
  return (
    <span className={cn('text-2xs font-medium', fav ? 'text-success' : 'text-danger')}>
      {inr(Math.abs(value))} {fav ? 'fav' : 'adv'}
    </span>
  )
}

/* ─────────────────────────── Layout ─────────────────────────── */

export function DetailBlock({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</p>
        {actions}
      </div>
      {children}
    </div>
  )
}

/** Ageing bucket cell — coloured but always carrying the figure. */
export function BucketCell({ value, overdue }: { value: number; overdue?: boolean }) {
  if (Math.abs(value) < 0.005) return <span className="text-2xs text-fg-subtle">—</span>
  return <span className={cn('tabular text-xs', overdue ? 'text-danger' : 'text-fg-muted')}>{inr(value)}</span>
}

export function ChartTip({
  active, payload, label, prefix = '', suffix = '',
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string }[]
  label?: string | number
  prefix?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
      {label !== undefined && <p className="mb-1 text-2xs font-medium text-fg">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium tabular text-fg">{prefix}{typeof p.value === 'number' ? inrCompact(p.value) : p.value}{suffix}</span>
        </p>
      ))}
    </div>
  )
}
